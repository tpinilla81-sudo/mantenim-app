import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// POST /api/sync/excel-ultimas-revisiones
//
// Importa un Excel con el histórico de revisiones realizadas para actualizar
// los campos ultimaRevision / ultimoMantenimientoHoras de cada equipo y
// recalcular la próxima revisión.
//
// Formato del Excel (cabeceras flexibles, case-insensitive):
//   - Nº Serie | N Serie | Numero Serie | Serie       (requerido)
//   - Fecha última revisión | Fecha ultima revision | Fecha revision | Fecha
//     (requerido — DD/MM/YYYY, MM/DD/YYYY, ISO, o serial Excel)
//   - Horas | Horas última revisión | Horas revision | Horas uso  (opcional, numérico)
//   - Tipo servicio | Tipo | Servicio | Nivel                        (opcional, M1/M2/FSCR/FSSR/500H/1000H)
//   - Notas | Observaciones                                          (opcional)
//
// Por cada fila:
//   1. Busca el equipo por numeroSerie (case-insensitive exacto).
//   2. Si lo encuentra:
//      - actualiza ultimaRevision = fecha
//      - actualiza ultimoMantenimientoHoras = horas (si se proporciona)
//      - opcional: si horas > equipo.horasUso, también actualiza horasUso
//      - crea una RevisionProgramada con estado=COMPLETADA, fechaRealizada=fecha
//        (si no existe ya una completada en esa fecha para ese equipo)
//      - dispara recalc-revision para que se calcule la próxima
//   3. Si no lo encuentra: lo cuenta como "no encontrado" y lo lista en errores
//
// El recalc-revision individual hace una llamada interna (sin HTTP) reusando
// la lógica del motor de lógicas cuando es posible. Para simplicidad y
// robustez, aquí llamamos al endpoint existente /api/equipos/[id]/recalc-revision
// vía fetch interno.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo Excel' }, { status: 400 })
    }

    const fileName = file.name
    if (!fileName.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx o .xls' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El Excel no tiene filas' }, { status: 400 })
    }

    const normalizeKey = (s: string) =>
      s.toString().toLowerCase().replace(/\s+/g, ' ').replace(/[º.\u00ba]/g, '').trim()

    const sample = rows[0]
    const headersMap: Record<string, string> = {}
    for (const key of Object.keys(sample)) {
      headersMap[normalizeKey(key)] = key
    }

    const pick = (row: Record<string, unknown>, variants: string[]): string => {
      for (const v of variants) {
        const k = headersMap[normalizeKey(v)]
        if (k && row[k] != null) {
          const val = row[k]
          if (val instanceof Date) return val.toISOString().slice(0, 10)
          if (typeof val === 'number') return String(val)
          return String(val).trim()
        }
      }
      return ''
    }

    const parseDate = (s: string | Date | number | null | undefined): Date | null => {
      if (!s || s === '*' || s === '-' || s === '') return null
      if (s instanceof Date) return isNaN(s.getTime()) ? null : s
      let m = String(s).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        if (!isNaN(d.getTime())) return d
      }
      m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
        if (!isNaN(d.getTime())) return d
      }
      const t = Date.parse(String(s))
      if (!isNaN(t)) return new Date(t)
      return null
    }

    const parseNum = (s: string): number | null => {
      if (!s) return null
      const n = Number(s.replace(/[^\d.-]/g, ''))
      return isNaN(n) ? null : Math.max(0, Math.floor(n))
    }

    // Cargar equipos en memoria para lookup rápido por numeroSerie
    // (asumimos <20000 equipos; memoria ~10MB)
    const todosEquipos = await db.equipo.findMany({
      select: { id: true, numeroSerie: true, horasUso: true, ultimaRevision: true },
    })
    const equipoPorSerie = new Map<string, { id: string; horasUso: number; ultimaRevision: Date | null }>()
    for (const eq of todosEquipos) {
      if (eq.numeroSerie) equipoPorSerie.set(eq.numeroSerie, eq)
    }

    let procesadas = 0
    let equiposActualizados = 0
    let revisionesCompletadasCreadas = 0
    let noEncontrados = 0
    let recalcLanzado = 0
    const errores: string[] = []
    const noEncontradosList: { fila: number; serie: string; fecha: string }[] = []

    // URL base para fetch interno al endpoint de recalc.
    // En Vercel, request.url apunta al dominio correcto.
    const baseUrl = new URL(request.url).origin

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const serie = pick(row, [
        'Nº Serie',
        'N Serie',
        'Numero Serie',
        'Nº serie',
        'Serie',
        'N Serial',
      ])
      const fechaStr = pick(row, [
        'Fecha última revisión',
        'Fecha ultima revision',
        'Fecha revision',
        'Fecha',
        'Ultima revision',
        'Última revisión',
        'Fecha última revisión realizada',
      ])
      const horasStr = pick(row, [
        'Horas',
        'Horas última revisión',
        'Horas ultima revision',
        'Horas revision',
        'Horas uso',
        'Horas realizadas',
      ])
      const tipoServicio = pick(row, [
        'Tipo servicio',
        'Tipo',
        'Servicio',
        'Nivel',
        'Tipo revisión',
        'Tipo de servicio',
      ])
      const notas = pick(row, ['Notas', 'Observaciones', 'Observacion'])

      if (!serie || !fechaStr) {
        noEncontrados++
        if (errores.length < 20) {
          errores.push(`Fila ${i + 2}: sin Nº Serie o sin Fecha`)
        }
        continue
      }

      const fecha = parseDate(fechaStr)
      if (!fecha) {
        noEncontrados++
        if (errores.length < 20) {
          errores.push(`Fila ${i + 2}: fecha inválida "${fechaStr}" (serie ${serie})`)
        }
        continue
      }

      const eq = equipoPorSerie.get(serie)
      if (!eq) {
        noEncontrados++
        noEncontradosList.push({ fila: i + 2, serie, fecha: fecha.toISOString().slice(0, 10) })
        continue
      }

      procesadas++
      const horas = parseNum(horasStr)

      // Actualizar equipo
      const updateData: Record<string, unknown> = {
        ultimaRevision: fecha,
      }
      if (horas != null) {
        updateData.ultimoMantenimientoHoras = horas
        // Si las horas reportadas son mayores que las actuales, también
        // actualizamos horasUso (la revisión se hizo con ese contador)
        if (horas > eq.horasUso) {
          updateData.horasUso = horas
        }
      }

      await db.equipo.update({
        where: { id: eq.id },
        data: updateData as any,
      })
      equiposActualizados++

      // Crear RevisionProgramada COMPLETADA si no existe ya una en esa fecha
      const existente = await db.revisionProgramada.findFirst({
        where: {
          equipoId: eq.id,
          estado: 'COMPLETADA',
          fechaRealizada: fecha,
        },
      })
      if (!existente) {
        await db.revisionProgramada.create({
          data: {
            equipoId: eq.id,
            tipo: 'POR_HORAS', // se ajustará en el recalc de la próxima
            nivel: tipoServicio || null,
            fechaProgramada: fecha,
            fechaRealizada: fecha,
            estado: 'COMPLETADA',
            notas: notas || null,
          },
        })
        revisionesCompletadasCreadas++
      }

      // Disparar recalc-revision vía fetch interno (sin await bloqueante para
      // no ralentizar demasiado; pero queremos contar los éxitos)
      try {
        const recalcRes = await fetch(`${baseUrl}/api/equipos/${eq.id}/recalc-revision`, {
          method: 'POST',
        })
        if (recalcRes.ok) recalcLanzado++
      } catch {
        // No falla todo si un recalc individual falla
      }
    }

    return NextResponse.json({
      ok: true,
      rowsTotal: rows.length,
      procesadas,
      equiposActualizados,
      revisionesCompletadasCreadas,
      noEncontrados,
      recalcLanzado,
      errores: errores.slice(0, 20),
      noEncontradosList: noEncontradosList.slice(0, 50),
    })
  } catch (err) {
    console.error('POST /api/sync/excel-ultimas-revisiones error:', err)
    return NextResponse.json(
      { error: 'Error al importar Excel de revisiones', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
