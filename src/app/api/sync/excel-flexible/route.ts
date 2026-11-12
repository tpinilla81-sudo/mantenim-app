import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ============================================================
// Mapeo de cabeceras (igual que antes)
// ============================================================
function normalizeHeader(h: string): string {
  return h.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number') {
    if (v > 30000 && v < 60000) return new Date(Date.UTC(1899, 11, 30) + v * 86400 * 1000)
    return null
  }
  const parsed = new Date(String(v).trim())
  return isNaN(parsed.getTime()) ? null : parsed
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const M_PATTERN = /^M\d+$/i

// POST /api/sync/excel-flexible — VERSIÓN BULK: procesa 9000+ filas rápido
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let fileName = 'desconocido.xlsx'
  let fileSize = 0

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const dryRun = formData.get('dryRun') === 'true'

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se ha recibido ningún archivo' }, { status: 400 })
    }

    fileName = file.name
    fileSize = file.size

    if (!fileName.match(/\.(xlsx|xls)$/i)) {
      return NextResponse.json({ error: 'El archivo debe ser .xlsx o .xls' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return NextResponse.json({ error: 'El Excel no tiene hojas' }, { status: 400 })

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })
    if (!rows.length) return NextResponse.json({ error: 'El Excel no tiene filas' }, { status: 400 })

    // Detectar columnas por nombre (normalizado)
    const headers = Object.keys(rows[0])
    const normHeaders = headers.map(h => normalizeHeader(h))

    // Mapa de nombre normalizado → header original
    const headerMap = new Map<string, string>()
    headers.forEach((h, i) => headerMap.set(normHeaders[i], h))

    // Función helper para obtener el valor de una columna
    const getVal = (row: Record<string, unknown>, ...names: string[]): unknown => {
      for (const n of names) {
        const norm = normalizeHeader(n)
        const orig = headerMap.get(norm)
        if (orig && row[orig] !== null && row[orig] !== undefined && row[orig] !== '') {
          return row[orig]
        }
      }
      return null
    }

    if (dryRun) {
      // Devolver qué columnas se reconocen
      const detected: Array<{ header: string; field: string }> = []
      const checks: Array<{ names: string[]; field: string }> = [
        { names: ['Nº', 'Nº prod. servicio', 'Nº producto'], field: 'Nº (clave equipo)' },
        { names: ['Descripción'], field: 'Descripción' },
        { names: ['Siguiente Fecha Mantenimiento'], field: 'Siguiente Fecha Mantenimiento' },
        { names: ['Nº Serie'], field: 'Nº Serie' },
        { names: ['Modelo'], field: 'Modelo' },
        { names: ['Es propio'], field: 'Es propio' },
        { names: ['Nº cliente Propietario'], field: 'Nº cliente Propietario' },
        { names: ['Nombre Cliente Propietario'], field: 'Nombre Cliente Propietario' },
        { names: ['Nombre Cliente Ubicación'], field: 'Nombre Cliente Ubicación' },
        { names: ['Nº cliente ubicación'], field: 'Nº cliente ubicación' },
        { names: ['Cód. dirección envío cliente ubicación'], field: 'Cód. dirección envío' },
        { names: ['Nº de horas'], field: 'Nº de horas' },
        { names: ['Nº Sucursal'], field: 'Nº Sucursal' },
        { names: ['Código de Servicio'], field: 'Código de Servicio' },
        { names: ['Nº Contrato Servicio Alquiler en Vigor'], field: 'Contrato Alquiler' },
        { names: ['Nº Contrato Servicio Mantenimiento en Vigor'], field: 'Contrato Mantenimiento' },
        { names: ['Nº Contrato Interno Mantenimiento en Vigor'], field: 'Contrato Interno' },
      ]
      for (const c of checks) {
        for (const n of c.names) {
          if (headerMap.has(normalizeHeader(n))) {
            detected.push({ header: headerMap.get(normalizeHeader(n))!, field: c.field })
            break
          }
        }
      }
      return NextResponse.json({
        success: true,
        dryRun: true,
        rowsTotal: rows.length,
        columnsDetected: detected,
      })
    }

    // ============================================================
    // PROCESAMIENTO BULK
    // ============================================================

    // 1. Cargar equipos existentes (solo codigoProductoBC)
    const existingEquipos = await db.equipo.findMany({
      where: { codigoProductoBC: { not: null } },
      select: { id: true, codigoProductoBC: true },
    })
    const existingCodigos = new Set(existingEquipos.map(e => e.codigoProductoBC))

    // 2. Cargar clientes existentes
    const existingClientes = await db.cliente.findMany({
      where: { codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true },
    })
    const existingClienteMap = new Map<string, string>()
    existingClientes.forEach(c => { if (c.codigoExterno) existingClienteMap.set(c.codigoExterno, c.id) })

    // 3. Procesar filas: separar nuevas de existentes
    const clientesParaCrear: Map<string, { nombre: string; nif: string; codigoExterno: string; zona?: string }> = new Map()
    const equiposParaCrear: Array<{
      codigo: string
      tipo: string
      marca: string
      modelo: string
      numeroSerie: string
      horasUso: number
      clienteId: string | null
      codigoProductoBC: string
      esMaquinaPropia: boolean
      ubicacion: string | null
      ultimaRevision: Date | null
      proximaRevisionFecha: Date | null
      contratoActivoId: string | null
      codigoServicio: string | null
      numClientePropietario: string | null
      nombreClienteUbicacion: string | null
      numClienteUbicacion: string | null
      codDireccionEnvio: string | null
      numSucursal: string | null
      contratoAlquilerVigor: string | null
      contratoMantenimVigor: string | null
      estado: string
      tipoRevision: string
    }> = []

    let rowsSkipped = 0
    let rowsCreated = 0

    for (const row of rows) {
      // Obtener clave del equipo (Nº)
      const codigo = String(getVal(row, 'Nº', 'Nº prod. servicio', 'Nº producto') || '').trim()
      if (!codigo) { rowsSkipped++; continue }

      // Si el equipo ya existe, saltarlo (modo solo-nuevos)
      if (existingCodigos.has(codigo)) { rowsSkipped++; continue }

      // Recoger todos los campos
      const descripcion = String(getVal(row, 'Descripción') || codigo).trim()
      const serie = String(getVal(row, 'Nº Serie') || codigo).trim()
      const modelo = String(getVal(row, 'Modelo') || descripcion).trim()
      const horasRaw = parseNum(getVal(row, 'Nº de horas', 'Nº de horas'))
      const horas = horasRaw || 0
      const esPropioRaw = String(getVal(row, 'Es propio') || '').trim().toUpperCase()
      const esPropia = esPropioRaw === 'SI' || esPropioRaw === 'SÍ' || esPropioRaw === 'TRUE' || esPropioRaw === '1'

      const clienteCod = String(getVal(row, 'Nº cliente Propietario', 'Nº cliente') || '').trim()
      const clienteNombre = String(getVal(row, 'Nombre Cliente Propietario', 'Nombre Cliente', 'Nombre') || '').trim()

      const ubicacion = String(getVal(row, 'Nombre Cliente Ubicación', 'Ubicación') || '').trim() || null
      const ultRev = parseDate(getVal(row, 'Siguiente Fecha Mantenimiento', 'Fecha última revisión', 'Fecha registro'))
      const proxRev = parseDate(getVal(row, 'Siguiente Fecha Mantenimiento'))

      const contratoInterno = String(getVal(row, 'Nº Contrato Interno Mantenimiento en Vigor') || '').trim() || null
      const contratoMant = String(getVal(row, 'Nº Contrato Servicio Mantenimiento en Vigor') || '').trim() || null
      const contratoAlq = String(getVal(row, 'Nº Contrato Servicio Alquiler en Vigor') || '').trim() || null
      const codServicio = String(getVal(row, 'Código de Servicio') || '').trim() || null
      const numClienteProp = String(getVal(row, 'Nº cliente Propietario') || '').trim() || null
      const nombreClienteUbic = String(getVal(row, 'Nombre Cliente Ubicación') || '').trim() || null
      const numClienteUbic = String(getVal(row, 'Nº cliente ubicación') || '').trim() || null
      const codDirEnvio = String(getVal(row, 'Cód. dirección envío cliente ubicación') || '').trim() || null
      const numSucursal = String(getVal(row, 'Nº Sucursal') || '').trim() || null

      // Registrar cliente para crear (si no existe)
      if (clienteCod && !existingClienteMap.has(clienteCod) && !clientesParaCrear.has(clienteCod)) {
        clientesParaCrear.set(clienteCod, {
          nombre: clienteNombre || clienteCod,
          nif: `BC-${clienteCod}`,
          codigoExterno: clienteCod,
          zona: codDirEnvio || numSucursal || undefined,
        })
      }

      // Añadir equipo a la lista de creación
      equiposParaCrear.push({
        codigo,
        tipo: 'DESCONOCIDO',
        marca: '—',
        modelo,
        numeroSerie: serie + '-' + Date.now().toString(36).slice(-4), // evitar duplicados
        horasUso: horas,
        clienteId: null, // se asignará después de crear clientes
        codigoProductoBC: codigo,
        esMaquinaPropia: esPropia,
        ubicacion,
        ultimaRevision: ultRev,
        proximaRevisionFecha: proxRev,
        contratoActivoId: contratoInterno,
        codigoServicio: codServicio,
        numClientePropietario: numClienteProp,
        nombreClienteUbicacion: nombreClienteUbic,
        numClienteUbicacion: numClienteUbic,
        codDireccionEnvio: codDirEnvio,
        numSucursal: numSucursal,
        contratoAlquilerVigor: contratoAlq,
        contratoMantenimVigor: contratoMant,
        estado: 'OPERATIVO',
        tipoRevision: esPropia ? 'POR_HORAS' : 'POR_CONTRATO',
      })
      rowsCreated++
    }

    // 4. Crear clientes en bloque (createMany)
    let clientesCreados = 0
    if (clientesParaCrear.size > 0) {
      const clienteArray = Array.from(clientesParaCrear.values())
      // createMany en lotes de 500
      for (let i = 0; i < clienteArray.length; i += 500) {
        await db.cliente.createMany({ data: clienteArray.slice(i, i + 500) })
      }
      clientesCreados = clienteArray.length

      // Recargar clientes para obtener los IDs
      const newClientes = await db.cliente.findMany({
        where: { codigoExterno: { in: Array.from(clientesParaCrear.keys()) } },
        select: { id: true, codigoExterno: true },
      })
      newClientes.forEach(c => { if (c.codigoExterno) existingClienteMap.set(c.codigoExterno, c.id) })
    }

    // 5. Asignar clienteId a cada equipo
    // Obtener o crear cliente fallback
    let fallbackClienteId: string | null = null
    for (const eq of equiposParaCrear) {
      const cod = eq.numClientePropietario
      if (cod && existingClienteMap.has(cod)) {
        eq.clienteId = existingClienteMap.get(cod)!
      } else {
        if (!fallbackClienteId) {
          const fb = await db.cliente.findFirst({
            where: { nif: 'BC-SIN-CLIENTE' },
            select: { id: true },
          })
          if (fb) {
            fallbackClienteId = fb.id
          } else {
            const nuevo = await db.cliente.create({
              data: { nombre: 'Sin cliente asignado', nif: 'BC-SIN-CLIENTE', estado: 'ACTIVO' },
            })
            fallbackClienteId = nuevo.id
          }
        }
        eq.clienteId = fallbackClienteId
      }
    }

    // 6. Crear equipos en bloque (createMany)
    let equiposCreadosCount = 0
    if (equiposParaCrear.length > 0) {
      for (let i = 0; i < equiposParaCrear.length; i += 500) {
        await db.equipo.createMany({ data: equiposParaCrear.slice(i, i + 500) })
        equiposCreadosCount += Math.min(500, equiposParaCrear.length - i)
      }
    }

    // 7. Crear revisiones para los equipos nuevos (en bloque)
    let revisionesCreadas = 0
    if (equiposCreadosCount > 0) {
      const newEquipos = await db.equipo.findMany({
        where: { codigoProductoBC: { in: equiposParaCrear.map(e => e.codigo) } },
        select: { id: true, codigoProductoBC: true, tipoRevision: true, horasUso: true, ultimaRevision: true, proximaRevisionFecha: true, esMaquinaPropia: true },
      })

      const revisionesParaCrear: Array<{
        equipoId: string
        tipo: string
        nivel: string | null
        horasObjetivo: number | null
        fechaProgramada: Date
        estado: string
      }> = []

      for (const eq of newEquipos) {
        let fechaProg: Date
        let nivel: string | null = null
        let horasObj: number | null = null

        if (eq.proximaRevisionFecha) {
          fechaProg = eq.proximaRevisionFecha
          nivel = 'CONTRATO'
        } else if (eq.tipoRevision === 'POR_HORAS') {
          const UMBRAL = 1000
          horasObj = Math.ceil((eq.horasUso + 1) / UMBRAL) * UMBRAL
          nivel = 'REVISION_1000H'
          fechaProg = new Date()
          fechaProg.setDate(fechaProg.getDate() + 30)
        } else {
          fechaProg = new Date()
          fechaProg.setMonth(fechaProg.getMonth() + 12)
          nivel = 'CONTRATO'
        }

        revisionesParaCrear.push({
          equipoId: eq.id,
          tipo: eq.tipoRevision,
          nivel,
          horasObjetivo: horasObj,
          fechaProgramada: fechaProg,
          estado: 'PROGRAMADA',
        })
      }

      if (revisionesParaCrear.length > 0) {
        for (let i = 0; i < revisionesParaCrear.length; i += 500) {
          await db.revisionProgramada.createMany({ data: revisionesParaCrear.slice(i, i + 500) })
        }
        revisionesCreadas = revisionesParaCrear.length
      }

      // Actualizar proximaRevisionFecha en los equipos que no la tenían
      for (const eq of newEquipos) {
        if (!eq.proximaRevisionFecha) {
          const rev = revisionesParaCrear.find(r => r.equipoId === eq.id)
          if (rev) {
            await db.equipo.update({
              where: { id: eq.id },
              data: {
                proximaRevisionFecha: rev.fechaProgramada,
                proximaRevisionHoras: rev.horasObjetivo,
                umbralHorasActual: rev.nivel === 'REVISION_1000H' ? 1000 : null,
              },
            })
          }
        }
      }
    }

    // 8. SyncLog
    await db.syncLog.create({
      data: {
        fileName,
        fileSize,
        rowsTotal: rows.length,
        rowsCreated: equiposCreadosCount,
        rowsUpdated: 0,
        rowsSkipped,
        rowsFailed: 0,
        clientesNuevos: clientesCreados,
        contratosNuevos: 0,
        contratosActualizados: 0,
        duracionMs: Date.now() - startTime,
        status: 'OK',
        syncType: 'EXCEL_BC_FLEXIBLE',
      },
    })

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      duration: Date.now() - startTime,
      rowsTotal: rows.length,
      rowsCreated,
      rowsSkipped,
      rowsFailed: 0,
      equiposCreados: equiposCreadosCount,
      clientesCreados,
      revisionesRecalculadas: revisionesCreadas,
      columnsDetected: [],
      fieldsUpdated: {},
      errores: [],
      status: 'OK',
    })
  } catch (error) {
    console.error('POST /api/sync/excel-flexible error:', error)
    return NextResponse.json(
      { error: 'Error al procesar el Excel', detail: String(error).substring(0, 300) },
      { status: 500 }
    )
  }
}
