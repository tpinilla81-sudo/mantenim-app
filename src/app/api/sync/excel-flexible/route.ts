import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

function normalizeHeader(h: string): string {
  return h.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'number' && v > 30000 && v < 60000) return new Date(Date.UTC(1899, 11, 30) + v * 86400 * 1000)
  const p = new Date(String(v).trim())
  return isNaN(p.getTime()) ? null : p
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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
      return NextResponse.json({ error: 'Debe ser .xlsx o .xls' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return NextResponse.json({ error: 'Sin hojas' }, { status: 400 })

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })
    if (!rows.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 })

    const headers = Object.keys(rows[0])
    const headerMap = new Map<string, string>()
    headers.forEach(h => headerMap.set(normalizeHeader(h), h))

    const getVal = (row: Record<string, unknown>, ...names: string[]): string => {
      for (const n of names) {
        const orig = headerMap.get(normalizeHeader(n))
        if (orig && row[orig] !== null && row[orig] !== undefined && String(row[orig]).trim()) {
          return String(row[orig]).trim()
        }
      }
      return ''
    }

    if (dryRun) {
      const detected: Array<{ header: string; field: string }> = []
      const checks = [
        { names: ['Nº', 'Nº prod. servicio'], field: 'Nº (clave)' },
        { names: ['Descripción'], field: 'Descripción' },
        { names: ['Siguiente Fecha Mantenimiento'], field: 'Siguiente Fecha Mant.' },
        { names: ['Nº Serie'], field: 'Nº Serie' },
        { names: ['Modelo'], field: 'Modelo' },
        { names: ['Es propio'], field: 'Es propio' },
        { names: ['Nº cliente Propietario'], field: 'Nº cliente Propietario' },
        { names: ['Nombre Cliente Propietario'], field: 'Nombre Cliente' },
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
            const h = headerMap.get(normalizeHeader(n))!
            if (!detected.find(d => d.header === h)) detected.push({ header: h, field: c.field })
            break
          }
        }
      }
      return NextResponse.json({ success: true, dryRun: true, rowsTotal: rows.length, columnsDetected: detected })
    }

    // ============================================================
    // BULK PROCESSING
    // ============================================================

    // 1. Load existing equipos (just codes)
    const existingEquipos = await db.equipo.findMany({
      where: { codigoProductoBC: { not: null } },
      select: { codigoProductoBC: true },
    })
    const existingCodigos = new Set(existingEquipos.map(e => e.codigoProductoBC))

    // 2. Load existing clientes
    const existingClientes = await db.cliente.findMany({
      where: { codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true },
    })
    const clienteMap = new Map<string, string>()
    existingClientes.forEach(c => { if (c.codigoExterno) clienteMap.set(c.codigoExterno, c.id) })

    // 3. Process rows: collect new clientes and new equipos
    const newClientesMap = new Map<string, { nombre: string; nif: string; codigoExterno: string; zona: string | null }>()
    const newEquipos: Array<Record<string, unknown>> = []
    let rowsSkipped = 0
    const usedSeries = new Set<string>()

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const codigo = getVal(row, 'Nº', 'Nº prod. servicio', 'Nº producto')
      if (!codigo) { rowsSkipped++; continue }
      if (existingCodigos.has(codigo)) { rowsSkipped++; continue }

      const desc = getVal(row, 'Descripción') || codigo
      let serie = getVal(row, 'Nº Serie') || `${codigo}-S`
      // Ensure unique serie
      let serieFinal = serie
      let serieSuffix = 0
      while (usedSeries.has(serieFinal)) {
        serieSuffix++
        serieFinal = `${serie}-${serieSuffix}`
      }
      usedSeries.add(serieFinal)

      const modelo = getVal(row, 'Modelo') || desc
      const horas = parseNum(getVal(row, 'Nº de horas')) || 0
      const esPropioRaw = getVal(row, 'Es propio').toUpperCase()
      const esPropia = ['SI', 'SÍ', 'TRUE', '1', 'YES'].includes(esPropioRaw)

      const clienteCod = getVal(row, 'Nº cliente Propietario', 'Nº cliente')
      const clienteNombre = getVal(row, 'Nombre Cliente Propietario', 'Nombre Cliente', 'Nombre')

      const ubicacion = getVal(row, 'Nombre Cliente Ubicación', 'Ubicación') || null
      const proxRev = parseDate(getVal(row, 'Siguiente Fecha Mantenimiento'))

      const contratoInterno = getVal(row, 'Nº Contrato Interno Mantenimiento en Vigor') || null
      const contratoMant = getVal(row, 'Nº Contrato Servicio Mantenimiento en Vigor') || null
      const contratoAlq = getVal(row, 'Nº Contrato Servicio Alquiler en Vigor') || null
      const codServicio = getVal(row, 'Código de Servicio') || null
      const numClienteProp = clienteCod || null
      const nombreClienteUbic = getVal(row, 'Nombre Cliente Ubicación') || null
      const numClienteUbic = getVal(row, 'Nº cliente ubicación') || null
      const codDirEnvio = getVal(row, 'Cód. dirección envío cliente ubicación') || null
      const numSucursal = getVal(row, 'Nº Sucursal') || null

      // Register new cliente
      if (clienteCod && !clienteMap.has(clienteCod) && !newClientesMap.has(clienteCod)) {
        newClientesMap.set(clienteCod, {
          nombre: clienteNombre || clienteCod,
          nif: `BC-${clienteCod}`,
          codigoExterno: clienteCod,
          zona: codDirEnvio || numSucursal || null,
        })
      }

      newEquipos.push({
        codigo,
        tipo: 'DESCONOCIDO',
        marca: '—',
        modelo,
        numeroSerie: serieFinal,
        horasUso: horas,
        clienteId: null,
        codigoProductoBC: codigo,
        esMaquinaPropia: esPropia,
        ubicacion,
        ultimaRevision: null,
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
    }

    // 4. Create clientes in bulk
    let clientesCreados = 0
    if (newClientesMap.size > 0) {
      const clienteArr = Array.from(newClientesMap.values())
      for (let i = 0; i < clienteArr.length; i += 500) {
        try {
          await db.cliente.createMany({ data: clienteArr.slice(i, i + 500), skipDuplicates: true })
        } catch (e) { /* ignore duplicates */ }
      }
      clientesCreados = clienteArr.length
      // Reload to get IDs
      const newCl = await db.cliente.findMany({
        where: { codigoExterno: { in: Array.from(newClientesMap.keys()) } },
        select: { id: true, codigoExterno: true },
      })
      newCl.forEach(c => { if (c.codigoExterno) clienteMap.set(c.codigoExterno, c.id) })
    }

    // 5. Get or create fallback cliente
    let fallbackId: string
    const fb = await db.cliente.findFirst({ where: { nif: 'BC-SIN-CLIENTE' }, select: { id: true } })
    if (fb) {
      fallbackId = fb.id
    } else {
      const nuevo = await db.cliente.create({ data: { nombre: 'Sin cliente asignado', nif: 'BC-SIN-CLIENTE', estado: 'ACTIVO' } })
      fallbackId = nuevo.id
    }

    // 6. Assign clienteId to each equipo + clean nulls
    for (const eq of newEquipos) {
      const cod = eq.numClientePropietario as string
      const found = cod && clienteMap.has(cod) ? clienteMap.get(cod) : null
      eq.clienteId = found || fallbackId
      // Ensure no nulls in required fields
      eq.clienteId = eq.clienteId as string
    }

    // 7. Create equipos in bulk
    let equiposCreados = 0
    const errores: string[] = []
    for (let i = 0; i < newEquipos.length; i += 500) {
      const batch = newEquipos.slice(i, i + 500)
      try {
        await db.equipo.createMany({ data: batch as any, skipDuplicates: true })
        equiposCreados += batch.length
      } catch (e) {
        const msg = String(e).substring(0, 200)
        errores.push(`Lote ${i}: ${msg}`)
      }
    }

    // 8. Create revisions for new equipos
    let revisionesCreadas = 0
    if (equiposCreados > 0) {
      const created = await db.equipo.findMany({
        where: { codigoProductoBC: { in: newEquipos.map(e => e.codigo) } },
        select: { id: true, tipoRevision: true, horasUso: true, proximaRevisionFecha: true, esMaquinaPropia: true },
      })

      const revs: Array<Record<string, unknown>> = []
      for (const eq of created) {
        let fecha: Date
        let nivel: string | null = null
        let horasObj: number | null = null

        if (eq.proximaRevisionFecha) {
          fecha = eq.proximaRevisionFecha
          nivel = 'CONTRATO'
        } else if (eq.tipoRevision === 'POR_HORAS') {
          horasObj = Math.ceil((eq.horasUso + 1) / 1000) * 1000
          nivel = 'REVISION_1000H'
          fecha = new Date()
          fecha.setDate(fecha.getDate() + 30)
        } else {
          fecha = new Date()
          fecha.setMonth(fecha.getMonth() + 12)
          nivel = 'CONTRATO'
        }

        revs.push({
          equipoId: eq.id,
          tipo: eq.tipoRevision,
          nivel,
          horasObjetivo: horasObj,
          fechaProgramada: fecha,
          estado: 'PROGRAMADA',
        })

        // Update equipo with calc
        if (!eq.proximaRevisionFecha) {
          await db.equipo.update({
            where: { id: eq.id },
            data: { proximaRevisionFecha: fecha, proximaRevisionHoras: horasObj, umbralHorasActual: horasObj ? 1000 : null },
          }).catch(() => {})
        }
      }

      for (let i = 0; i < revs.length; i += 500) {
        try {
          await db.revisionProgramada.createMany({ data: revs.slice(i, i + 500), skipDuplicates: true })
          revisionesCreadas += Math.min(500, revs.length - i)
        } catch (e) {
          errores.push(`Rev lote ${i}: ${String(e).substring(0, 100)}`)
        }
      }
    }

    await db.syncLog.create({
      data: {
        fileName, fileSize,
        rowsTotal: rows.length,
        rowsCreated: equiposCreados,
        rowsSkipped,
        rowsFailed: 0,
        clientesNuevos: clientesCreados,
        duracionMs: Date.now() - startTime,
        status: errores.length > 0 ? 'PARCIAL' : 'OK',
        syncType: 'EXCEL_BC_FLEXIBLE',
        errores: errores.length > 0 ? JSON.stringify(errores.slice(0, 10)) : null,
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      duration: Date.now() - startTime,
      rowsTotal: rows.length,
      rowsCreated: equiposCreados,
      rowsSkipped,
      equiposCreados,
      clientesCreados,
      revisionesRecalculadas: revisionesCreadas,
      errores: errores.slice(0, 5),
      status: errores.length > 0 ? 'PARCIAL' : 'OK',
    })
  } catch (error) {
    console.error('POST /api/sync/excel-flexible error:', error)
    return NextResponse.json(
      { error: 'Error al procesar Excel', detail: String(error).substring(0, 500) },
      { status: 500 }
    )
  }
}
