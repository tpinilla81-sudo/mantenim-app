import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ============================================================
// Mapeo de cabeceras del Excel de Business Central
// ============================================================
const HEADER_MAP: Record<string, string> = {
  'Nº Contrato': 'numeroContrato',
  'Estado': 'estado',
  'Descripción': 'descripcion',
  'Factura-a Nº cliente': 'codCliente',
  'Fact. a-Nombre': 'nombreCliente',
  'Cód. dirección envío cliente': 'ubicacion',
  'Cód. vendedor': 'codVendedor',
  'Fecha inicial': 'fechaInicio',
  'Fecha caducidad': 'fechaFin',
  'Últ. fecha factura': 'ultimaFactura',
  'Siguiente fecha factura': 'proximaFactura',
  'Importe por periodo': 'importePeriodo',
  'Periodo actualiz. precio': 'periodoPrecio',
  'Código Delegacion': 'codDelegacion',
  'Cód. grupo contrato': 'codGrupoContrato',
  'Nº cliente': 'codCliente2',
  'E-mail de destino Facturas/Abonos': 'emailCliente',
}

function mapEstadoBC(estado: string | undefined): string {
  if (!estado) return 'DESCONOCIDO'
  const e = estado.trim().toLowerCase()
  if (e === 'firmado' || e === 'en proceso') return 'ACTIVO'
  if (e === 'cancelado') return 'CANCELADO'
  if (e === 'caducado' || e === 'vencido') return 'VENCIDO'
  if (e === 'suspendido') return 'SUSPENDIDO'
  return 'ACTIVO'
}

function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number') {
    if (v > 30000 && v < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + v * 86400 * 1000)
    }
    return null
  }
  const s = String(v).trim()
  if (s === '') return null
  const parsed = new Date(s)
  return isNaN(parsed.getTime()) ? null : parsed
}

interface ParsedRow {
  numeroContrato: string | null
  estado: string | null
  descripcion: string | null
  codCliente: string | null
  nombreCliente: string | null
  ubicacion: string | null
  codVendedor: string | null
  fechaInicio: Date | null
  fechaFin: Date | null
  ultimaFactura: Date | null
  proximaFactura: Date | null
  importePeriodo: number | null
  periodoPrecio: string | null
  codDelegacion: string | null
  codGrupoContrato: string | null
  emailCliente: string | null
}

interface SyncResult {
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  rowsFailed: number
  clientesNuevos: number
  contratosNuevos: number
  contratosActualizados: number
  errores: string[]
}

// POST /api/sync/excel — Sube un Excel de Contratos de servicio de BC (versión optimizada)
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let fileName = 'desconocido.xlsx'
  let fileSize = 0

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const syncType = (formData.get('syncType') as string) || 'EXCEL_BC'
    const reemplazoTotal = formData.get('reemplazoTotal') === 'true'

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No se ha recibido ningún archivo' },
        { status: 400 }
      )
    }

    fileName = file.name
    fileSize = file.size

    if (!fileName.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json(
        { error: 'El archivo debe ser .xlsx o .xls' },
        { status: 400 }
      )
    }

    // Leer el archivo como buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Parsear con SheetJS
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      return NextResponse.json({ error: 'El Excel no tiene hojas' }, { status: 400 })
    }

    // Convertir a JSON
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true,
    })

    if (!rows.length) {
      return NextResponse.json({ error: 'El Excel no tiene filas de datos' }, { status: 400 })
    }

    // Validar cabeceras mínimas
    const requiredHeaders = ['Nº Contrato', 'Estado']
    const firstRow = rows[0]
    const missing = requiredHeaders.filter((h) => !(h in firstRow))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `El Excel no tiene las columnas requeridas: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Mapear filas a nuestro formato
    const parsedRows: ParsedRow[] = rows.map((r) => {
      const mapped: Partial<ParsedRow> = {}
      for (const [excelHeader, internalKey] of Object.entries(HEADER_MAP)) {
        if (excelHeader in r) {
          ;(mapped as Record<string, unknown>)[internalKey] = r[excelHeader]
        }
      }
      if (!mapped.codCliente && 'codCliente2' in mapped) {
        mapped.codCliente = mapped.codCliente2
      }
      return mapped as ParsedRow
    })

    const result: SyncResult = {
      rowsTotal: parsedRows.length,
      rowsCreated: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsFailed: 0,
      clientesNuevos: 0,
      contratosNuevos: 0,
      contratosActualizados: 0,
      errores: [],
    }

    // ============================================================
    // 1. Limpiar la base de datos si reemplazo total
    // ============================================================
    if (reemplazoTotal) {
      await db.$transaction([
        db.ordenTrabajo.deleteMany(),
        db.contratoEquipo.deleteMany(),
        db.contrato.deleteMany(),
        db.equipo.deleteMany(),
        db.cliente.deleteMany(),
      ])
    }

    // ============================================================
    // 2. Filtrar filas válidas y construir mapa de clientes únicos
    // ============================================================
    interface FilaValida {
      numeroContrato: string
      estado: string
      descripcion: string | null
      codCliente: string | null
      nombreCliente: string | null
      ubicacion: string | null
      codVendedor: string | null
      fechaInicio: Date
      fechaFin: Date
      ultimaFactura: Date | null
      proximaFactura: Date | null
      importePeriodo: number | null
      periodoPrecio: string | null
      codDelegacion: string | null
      codGrupoContrato: string | null
      emailCliente: string | null
    }

    const filasValidas: FilaValida[] = []
    const clientesMap = new Map<string, { nombre: string; email: string | null; ciudad: string | null }>()

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i]
      // Saltar filas sin número de contrato o sin estado (filas plantilla)
      if (!row.numeroContrato || row.numeroContrato.trim() === '') {
        result.rowsSkipped++
        continue
      }
      if (!row.estado || row.estado.trim() === '') {
        result.rowsSkipped++
        continue
      }

      const fechaInicio = row.fechaInicio || new Date()
      const fechaFinRaw = row.fechaFin
      let fechaFin: Date
      if (fechaFinRaw && fechaFinRaw > fechaInicio) {
        fechaFin = fechaFinRaw
      } else {
        fechaFin = new Date(fechaInicio.getFullYear() + 1, fechaInicio.getMonth(), fechaInicio.getDate())
      }

      const fila: FilaValida = {
        numeroContrato: row.numeroContrato.trim(),
        estado: row.estado.trim(),
        descripcion: cleanStr(row.descripcion),
        codCliente: cleanStr(row.codCliente),
        nombreCliente: cleanStr(row.nombreCliente),
        ubicacion: cleanStr(row.ubicacion),
        codVendedor: cleanStr(row.codVendedor),
        fechaInicio,
        fechaFin,
        ultimaFactura: toDate(row.ultimaFactura),
        proximaFactura: toDate(row.proximaFactura),
        importePeriodo: toNum(row.importePeriodo),
        periodoPrecio: cleanStr(row.periodoPrecio),
        codDelegacion: cleanStr(row.codDelegacion),
        codGrupoContrato: cleanStr(row.codGrupoContrato),
        emailCliente: cleanStr(row.emailCliente),
      }

      filasValidas.push(fila)

      // Indexar cliente único
      if (fila.codCliente && fila.nombreCliente) {
        if (!clientesMap.has(fila.codCliente)) {
          clientesMap.set(fila.codCliente, {
            nombre: fila.nombreCliente,
            email: fila.emailCliente,
            ciudad: fila.ubicacion,
          })
        }
      }
    }

    // ============================================================
    // 3. Crear clientes en bulk (createMany)
    // ============================================================
    // Pre-cargar IDs existentes (cuando no es reemplazo total)
    const existingClientes = new Map<string, string>()
    if (!reemplazoTotal && clientesMap.size > 0) {
      const encontrados = await db.cliente.findMany({
        where: { codigoExterno: { in: Array.from(clientesMap.keys()) } },
        select: { id: true, codigoExterno: true },
      })
      for (const c of encontrados) {
        if (c.codigoExterno) existingClientes.set(c.codigoExterno, c.id)
      }
    }

    const clientesParaCrear: Array<{
      nombre: string
      nif: string
      codigoExterno: string
      email: string | null
      ciudad: string | null
      estado: string
      notas: string
    }> = []

    for (const [codCliente, data] of clientesMap.entries()) {
      if (!reemplazoTotal && existingClientes.has(codCliente)) continue
      clientesParaCrear.push({
        nombre: data.nombre,
        nif: `BC-${codCliente}`,
        codigoExterno: codCliente,
        email: data.email,
        ciudad: data.ciudad,
        estado: 'ACTIVO',
        notas: 'Importado desde Business Central',
      })
    }

    if (clientesParaCrear.length > 0) {
      // SQLite no devuelve IDs con createMany, así que lo hacemos en lotes pequeños
      // para no bloquear el event loop
      const LOTE = 200
      for (let i = 0; i < clientesParaCrear.length; i += LOTE) {
        await db.cliente.createMany({
          data: clientesParaCrear.slice(i, i + LOTE),
        })
        result.clientesNuevos += Math.min(LOTE, clientesParaCrear.length - i)
      }
    }

    // Recargar todos los clientes con sus IDs (después del createMany)
    const allClientes = await db.cliente.findMany({
      where: { codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true },
    })
    for (const c of allClientes) {
      if (c.codigoExterno) existingClientes.set(c.codigoExterno, c.id)
    }

    // ============================================================
    // 4. Pre-cargar contratos existentes (cuando no es reemplazo total)
    // ============================================================
    const existingContratos = new Map<string, string>()
    if (!reemplazoTotal) {
      const nums = filasValidas.map((f) => f.numeroContrato)
      const encontrados = await db.contrato.findMany({
        where: { numero: { in: nums } },
        select: { id: true, numero: true },
      })
      for (const c of encontrados) {
        existingContratos.set(c.numero, c.id)
      }
    }

    // ============================================================
    // 5. Construir arrays de contratos a crear y a actualizar
    // ============================================================
    const contratosParaCrear: Array<{
      numero: string
      clienteId: string
      fechaInicio: Date
      fechaFin: Date
      tipoMantenimiento: string
      periodicidadMeses: number
      precioAnual: number
      estado: string
      condiciones: string | null
      descripcionBC: string | null
      codVendedor: string | null
      codDelegacion: string | null
      codGrupoContrato: string | null
      codPeriodoPrecio: string | null
      ubicacionEquipo: string | null
      ultimaFactura: Date | null
      proximaFactura: Date | null
      importePorPeriodo: number | null
    }> = []

    const contratosParaActualizar: Array<{ id: string; data: typeof contratosParaCrear[number] }> = []

    for (const fila of filasValidas) {
      const clienteId = fila.codCliente ? existingClientes.get(fila.codCliente) : null
      if (!clienteId) {
        if (result.errores.length < 50) {
          result.errores.push(
            `Contrato ${fila.numeroContrato}: sin cliente válido (${fila.codCliente || 'null'})`
          )
        }
        result.rowsFailed++
        continue
      }

      const estadoApp = mapEstadoBC(fila.estado)
      const dataContrato = {
        numero: fila.numeroContrato,
        clienteId,
        fechaInicio: fila.fechaInicio,
        fechaFin: fila.fechaFin,
        tipoMantenimiento: 'MIXTO',
        periodicidadMeses: 12,
        precioAnual: fila.importePeriodo || 0,
        estado: estadoApp,
        condiciones: fila.descripcion,
        descripcionBC: fila.descripcion,
        codVendedor: fila.codVendedor,
        codDelegacion: fila.codDelegacion,
        codGrupoContrato: fila.codGrupoContrato,
        codPeriodoPrecio: fila.periodoPrecio,
        ubicacionEquipo: fila.ubicacion,
        ultimaFactura: fila.ultimaFactura,
        proximaFactura: fila.proximaFactura,
        importePorPeriodo: fila.importePeriodo,
      }

      const existingId = existingContratos.get(fila.numeroContrato)
      if (existingId) {
        contratosParaActualizar.push({ id: existingId, data: dataContrato })
      } else {
        contratosParaCrear.push(dataContrato)
      }
    }

    // ============================================================
    // 6. Crear contratos nuevos en bulk
    // ============================================================
    if (contratosParaCrear.length > 0) {
      const LOTE = 200
      for (let i = 0; i < contratosParaCrear.length; i += LOTE) {
        await db.contrato.createMany({
          data: contratosParaCrear.slice(i, i + LOTE),
        })
        result.contratosNuevos += Math.min(LOTE, contratosParaCrear.length - i)
        result.rowsCreated += Math.min(LOTE, contratosParaCrear.length - i)
      }
    }

    // ============================================================
    // 7. Actualizar contratos existentes en lotes pequeños
    // ============================================================
    if (contratosParaActualizar.length > 0) {
      for (const item of contratosParaActualizar) {
        try {
          const { numero: _n, ...updateData } = item.data
          await db.contrato.update({
            where: { id: item.id },
            data: updateData,
          })
          result.contratosActualizados++
          result.rowsUpdated++
        } catch (err) {
          result.rowsFailed++
          const msg = err instanceof Error ? err.message : String(err)
          if (result.errores.length < 50) {
            result.errores.push(`Contrato ${item.data.numero}: ${msg}`)
          }
        }
      }
    }

    // Calcular estado final
    const status =
      result.rowsFailed === 0
        ? 'OK'
        : result.rowsCreated + result.rowsUpdated > 0
          ? 'PARCIAL'
          : 'ERROR'

    // Crear entrada en SyncLog
    await db.syncLog.create({
      data: {
        fileName,
        fileSize,
        rowsTotal: result.rowsTotal,
        rowsCreated: result.rowsCreated,
        rowsUpdated: result.rowsUpdated,
        rowsSkipped: result.rowsSkipped,
        rowsFailed: result.rowsFailed,
        clientesNuevos: result.clientesNuevos,
        contratosNuevos: result.contratosNuevos,
        contratosActualizados: result.contratosActualizados,
        duracionMs: Date.now() - startTime,
        status,
        errores: result.errores.length > 0
          ? JSON.stringify(result.errores.slice(0, 50))
          : null,
        syncType,
      },
    })

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      duration: Date.now() - startTime,
      ...result,
      status,
      totalClientes: result.clientesNuevos,
      totalContratos: result.contratosNuevos + result.contratosActualizados,
    })
  } catch (error) {
    console.error('POST /api/sync/excel error:', error)
    try {
      await db.syncLog.create({
        data: {
          fileName,
          fileSize,
          rowsTotal: 0,
          status: 'ERROR',
          syncType: 'EXCEL_BC',
          errores: JSON.stringify([String(error)]),
          duracionMs: Date.now() - startTime,
        },
      })
    } catch (logErr) {
      console.error('No se pudo registrar SyncLog de error:', logErr)
    }
    return NextResponse.json(
      { error: 'Error al procesar el Excel', detail: String(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/sync — Borrar todos los datos
export async function DELETE() {
  try {
    const result = await db.$transaction([
      db.ordenTrabajo.deleteMany(),
      db.contratoEquipo.deleteMany(),
      db.contrato.deleteMany(),
      db.equipo.deleteMany(),
      db.cliente.deleteMany(),
    ])
    return NextResponse.json({
      success: true,
      deleted: {
        ordenesTrabajo: result[0].count,
        contratoEquipos: result[1].count,
        contratos: result[2].count,
        equipos: result[3].count,
        clientes: result[4].count,
      },
    })
  } catch (error) {
    console.error('DELETE /api/sync error:', error)
    return NextResponse.json({ error: 'Error al borrar datos' }, { status: 500 })
  }
}
