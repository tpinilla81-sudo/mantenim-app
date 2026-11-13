import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// POST /api/sync/excel-lineas-contrato
// Importa un Excel con el formato "Lista Líneas de Contrato" de Business Central.
// Cabeceras reconocidas (case-insensitive, con normalización de espacios):
//   - Estado contrato | Estado Contrato
//   - Nº Contrato | N Contrato | Numero Contrato
//   - Nº cliente | N cliente | Numero cliente
//   - Nombre Cliente
//   - Ship-to Code | Ship To Code | Ship-to Code
//   - Cód. grupo contrato | Cod grupo contrato | Cód grupo contrato
//   - Contract Starting Date | Fecha inicio contrato
//   - Contract Ending Date | Fecha fin contrato
//   - Nº línea | N línea | Numero línea
//   - Nº prod. servicio | N prod servicio | Numero producto servicio
//   - Descripción | Descripcion
//   - Nº Serie | N Serie | Numero Serie
//   - Fecha inicial
//   - Periodo servicio
//   - Siguiente fecha serv. planif. | Siguiente fecha servicio
//
// Comportamiento: upsert por (numeroContrato, numeroLinea). Si el Excel se
// re-importa, los registros existentes se actualizan en vez de duplicarse.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const replaceAll = formData.get('replaceAll') === 'true'

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo Excel' }, { status: 400 })
    }

    const fileName = file.name
    if (!fileName.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx o .xls' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El Excel no tiene filas' }, { status: 400 })
    }

    // Construir mapa de cabeceras normalizado
    const normalizeKey = (s: string) =>
      s.toString().toLowerCase().replace(/\s+/g, ' ').replace(/[º.\u00ba]/g, '').trim()

    const sample = rows[0]
    const headersMap: Record<string, string> = {}
    for (const key of Object.keys(sample)) {
      headersMap[normalizeKey(key)] = key
    }

    // Helper para leer una celda buscando variantes de cabecera
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

    // Helper para parsear fechas: acepta Date (xlsx cellDates), string ISO,
    // DD/MM/YYYY, MM/DD/YYYY, o timestamp numérico (fecha serial Excel).
    const parseDate = (s: string | Date | number | null | undefined): Date | null => {
      if (!s || s === '*' || s === '-' || s === '') return null
      if (s instanceof Date) return isNaN(s.getTime()) ? null : s
      // ISO yyyy-mm-dd o yyyy/m/d
      let m = String(s).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        if (!isNaN(d.getTime())) return d
      }
      // DD/MM/YYYY
      m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
        if (!isNaN(d.getTime())) return d
      }
      // Fallback a Date.parse
      const t = Date.parse(String(s))
      if (!isNaN(t)) return new Date(t)
      return null
    }

    // Mapa número de cliente → clienteId (carga única)
    const clientesPorNif = new Map<string, string>()
    // Mapa número de serie → equipoId
    const equiposPorSerie = new Map<string, string>()

    // Si replaceAll, borrar todo antes de importar
    if (replaceAll) {
      await db.lineaContrato.deleteMany({})
    }

    let creadas = 0
    let actualizadas = 0
    let saltadas = 0
    let conEquipoMatch = 0
    let conClienteMatch = 0
    const errores: string[] = []
    const gruposDetectados = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const numeroContrato = pick(row, ['Nº Contrato', 'N Contrato', 'Numero Contrato', 'Nº contrato'])
      const numeroLinea = pick(row, ['Nº línea', 'N línea', 'Numero línea', 'Nº linea', 'N linea'])

      if (!numeroContrato || !numeroLinea) {
        saltadas++
        if (errores.length < 20) {
          errores.push(`Fila ${i + 2}: sin Nº Contrato o Nº línea`)
        }
        continue
      }

      const numeroSerie = pick(row, ['Nº Serie', 'N Serie', 'Numero Serie', 'Nº serie'])
      const numeroCliente = pick(row, ['Nº cliente', 'N cliente', 'Numero cliente'])
      const codGrupo = pick(row, [
        'Cód. grupo contrato',
        'Cod grupo contrato',
        'Cód grupo contrato',
        'Cod. grupo contrato',
        'Grupo contrato',
      ])
      if (codGrupo) gruposDetectados.add(codGrupo)

      // Match con Equipo por serie (lazy lookup con caché)
      let equipoId: string | null = null
      if (numeroSerie) {
        if (equiposPorSerie.has(numeroSerie)) {
          equipoId = equiposPorSerie.get(numeroSerie) || null
        } else {
          const eq = await db.equipo.findUnique({ where: { numeroSerie } })
          if (eq) {
            equipoId = eq.id
            conEquipoMatch++
          }
          equiposPorSerie.set(numeroSerie, equipoId || '')
        }
      }

      // Match con Cliente por NIF/número
      let clienteId: string | null = null
      if (numeroCliente) {
        if (clientesPorNif.has(numeroCliente)) {
          clienteId = clientesPorNif.get(numeroCliente) || null
        } else {
          const cli = await db.cliente.findFirst({ where: { nif: numeroCliente } })
          if (cli) {
            clienteId = cli.id
            conClienteMatch++
          }
          clientesPorNif.set(numeroCliente, clienteId || '')
        }
      }

      const data = {
        estadoContrato: pick(row, ['Estado contrato', 'Estado Contrato']) || 'Firmado',
        numeroContrato,
        numeroCliente: numeroCliente || null,
        clienteId,
        nombreCliente: pick(row, ['Nombre Cliente', 'Nombre cliente']) || null,
        shipToCode: pick(row, ['Ship-to Code', 'Ship To Code', 'Shipto Code']) || null,
        codGrupoContrato: codGrupo || null,
        fechaInicioContrato: parseDate(pick(row, ['Contract Starting Date', 'Fecha inicio contrato'])),
        fechaFinContrato: parseDate(pick(row, ['Contract Ending Date', 'Fecha fin contrato'])),
        numeroLinea,
        numeroProductoServicio: pick(row, [
          'Nº prod. servicio',
          'N prod servicio',
          'Numero producto servicio',
          'Nº producto servicio',
        ]) || null,
        descripcion: pick(row, ['Descripción', 'Descripcion']) || null,
        numeroSerie: numeroSerie || null,
        equipoId,
        fechaInicial: parseDate(pick(row, ['Fecha inicial'])),
        periodoServicio: pick(row, ['Periodo servicio', 'Período servicio']) || null,
        siguienteFechaServicio: parseDate(
          pick(row, [
            'Siguiente fecha serv. planif.',
            'Siguiente fecha serv planif',
            'Siguiente fecha servicio',
            'Siguiente fecha serv. planif',
          ])
        ),
      }

      try {
        const existente = await db.lineaContrato.findUnique({
          where: {
            numeroContrato_numeroLinea: {
              numeroContrato: data.numeroContrato,
              numeroLinea: data.numeroLinea,
            },
          },
        })
        if (existente) {
          await db.lineaContrato.update({
            where: { id: existente.id },
            data,
          })
          actualizadas++
        } else {
          await db.lineaContrato.create({ data })
          creadas++
        }
      } catch (err) {
        saltadas++
        if (errores.length < 20) {
          errores.push(`Fila ${i + 2} (${numeroContrato}/${numeroLinea}): ${(err as Error).message}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      rowsTotal: rows.length,
      creadas,
      actualizadas,
      saltadas,
      conEquipoMatch,
      conClienteMatch,
      gruposDetectados: Array.from(gruposDetectados),
      errores: errores.slice(0, 20),
    })
  } catch (err) {
    console.error('POST /api/sync/excel-lineas-contrato error:', err)
    return NextResponse.json(
      { error: 'Error al importar Excel', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
