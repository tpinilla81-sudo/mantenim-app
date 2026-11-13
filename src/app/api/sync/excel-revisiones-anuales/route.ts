import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// POST /api/sync/excel-revisiones-anuales
//
// Importa el Excel 5: mapa de Nº producto de servicio → Nº contrato →
// Nº de revisiones anuales contratadas.
//
// Formato (cabeceras flexibles, case-insensitive):
//   - Nº producto servicio | Nº prod. servicio | Nº Producto | Producto servicio
//   - Nº contrato | N Contrato | Contrato
//   - Nº revisiones anuales | Revisiones anuales | Revisiones/año | Rev anuales
//
// Por cada fila:
//   1. Busca el equipo por codigoProductoBC = numeroProductoServicio
//   2. Si lo encuentra:
//      - actualiza contratoActivoId = numeroContrato
//      - actualiza revisionesContratadasAnual = numeroRevisionesAnuales
//   3. Si no lo encuentra: lo cuenta como "no encontrado"
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
          if (typeof val === 'number') return String(val)
          return String(val).trim()
        }
      }
      return ''
    }

    // Cargar equipos con codigoProductoBC en memoria
    const equipos = await db.equipo.findMany({
      where: { codigoProductoBC: { not: null } },
      select: { id: true, codigoProductoBC: true, contratoActivoId: true, revisionesContratadasAnual: true },
    })
    const equipoPorProducto = new Map<string, { id: string; contratoActivoId: string | null; revisionesContratadasAnual: number | null }>()
    for (const eq of equipos) {
      if (eq.codigoProductoBC) {
        equipoPorProducto.set(eq.codigoProductoBC.trim(), eq)
      }
    }

    let procesadas = 0
    let equiposActualizados = 0
    let noEncontrados = 0
    const noEncontradosList: { fila: number; producto: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const producto = pick(row, [
        'Nº producto servicio',
        'Nº prod servicio',
        'Nº producto de servicio',
        'N producto servicio',
        'Producto servicio',
        'Nº Producto',
      ])
      const contrato = pick(row, [
        'Nº contrato',
        'N Contrato',
        'Numero contrato',
        'Contrato',
      ])
      const revAnualesStr = pick(row, [
        'Nº revisiones anuales',
        'Revisiones anuales',
        'Revisiones/año',
        'Rev anuales',
        'N revisiones anuales',
        'Revisiones anuales contratadas',
      ])
      const revAnuales = revAnualesStr ? Number(revAnualesStr.replace(/[^\d.-]/g, '')) : null

      if (!producto) {
        noEncontrados++
        if (noEncontradosList.length < 50) {
          noEncontradosList.push({ fila: i + 2, producto: '(vacío)' })
        }
        continue
      }

      const eq = equipoPorProducto.get(producto)
      if (!eq) {
        noEncontrados++
        if (noEncontradosList.length < 50) {
          noEncontradosList.push({ fila: i + 2, producto })
        }
        continue
      }

      procesadas++
      const updateData: Record<string, unknown> = {}
      if (contrato && eq.contratoActivoId !== contrato) {
        updateData.contratoActivoId = contrato
      }
      if (revAnuales != null && !isNaN(revAnuales) && revAnuales > 0) {
        if (eq.revisionesContratadasAnual !== revAnuales) {
          updateData.revisionesContratadasAnual = Math.floor(revAnuales)
        }
      }

      if (Object.keys(updateData).length > 0) {
        await db.equipo.update({ where: { id: eq.id }, data: updateData as any })
        equiposActualizados++
      }
    }

    return NextResponse.json({
      ok: true,
      rowsTotal: rows.length,
      procesadas,
      equiposActualizados,
      noEncontrados,
      noEncontradosList: noEncontradosList.slice(0, 50),
    })
  } catch (err) {
    console.error('POST /api/sync/excel-revisiones-anuales error:', err)
    return NextResponse.json(
      { error: 'Error al importar Excel de revisiones anuales', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
