import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ============================================================
// Mapeo de cabeceras del Excel de "Líneas de Contratos de Servicio Internos"
// ============================================================
const HEADER_MAP: Record<string, string> = {
  'Nº Contrato': 'numeroContrato',
  'Nº prod. servicio': 'codProducto',
  'Descripción contrato': 'descContrato',
  'Nº Serie': 'numSerie',
  'Descripción línea contrato': 'descLinea',
  'Nº Horas Contratadas': 'horasContratadas',
  'Nº Horas salida': 'horasSalida',
  'Fecha inicial': 'fechaInicio',
  'Fecha caducidad': 'fechaFin',
}

interface ParsedRow {
  numeroContrato: string | null
  codProducto: string | null
  descContrato: string | null
  numSerie: string | null
  descLinea: string | null
  horasContratadas: number | null
  horasSalida: number | null
  fechaInicio: Date | null
  fechaFin: Date | null
}

// Regex para extraer referencias a contratos CAC/CM/CNT del Excel 1
const CAC_PATTERN = /\b(CAC|CM\d?|CNT-)\s*\/?\s*(\d{2,4})\s*\/\s*(\d{3,6})\b/i

// Regex para detectar grupos de contrato M1, M2, M3... (calendar-based maintenance)
const M_PATTERN = /^M\d+$/i

// Marcas conocidas (en minúsculas para matching case-insensitive)
const MARCAS_CONOCIDAS = [
  'LIEBHERR', 'COMANSA', 'TADANO', 'KONECRANES', 'KONE CRANES',
  'TOYOTA', 'LINDE', 'HYSTER', 'STILL', 'KION', 'KYB',
  'OM PIMESPO', 'PIMESPO', 'JUNGHEINRICH', 'MANITOWOC', 'POTAIN',
  'FM GRUPPE', 'FM', 'HYUNDAI', 'JCB', 'CAT', 'CATERPILLAR',
  'DOOSAN', 'KOMATSU', 'HANGCHA', 'EP', 'BT', 'RICHI',
  'GH', 'GIMALEZ', 'ZARELLI', 'CALDERERIA', 'SANY',
]

function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
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

// Extrae referencia a contrato CAC/CM/CNT de la descripción del contrato
function extraerCACRef(desc: string | null): string | null {
  if (!desc) return null
  const match = desc.match(CAC_PATTERN)
  if (!match) return null
  // Normalizar: "CAC 25/000019" → "CAC25/000019"
  const prefix = match[1].toUpperCase().replace(/\s/g, '')
  const num1 = match[2]
  const num2 = match[3]
  return `${prefix}${num1}/${num2}`
}

// Extraer marca del texto de descripción
function extraerMarca(desc: string | null): string {
  if (!desc) return '—'
  const upper = desc.toUpperCase()
  for (const marca of MARCAS_CONOCIDAS) {
    if (upper.includes(marca)) return marca.charAt(0) + marca.slice(1).toLowerCase()
  }
  return '—'
}

// Extraer modelo de la "Descripción línea contrato" o de la descripción del contrato
function extraerModelo(descLinea: string | null, descContrato: string | null): string {
  // Priorizar la descripción de la línea (más limpia, ej. "H-25 D", "E16 - 386", "V08 02")
  const clean = (descLinea || '').trim().replace(/\s+/g, ' ')
  if (clean && clean.length <= 30) return clean
  // Si no, extraer la primera parte de la descripción del contrato (antes del nombre del cliente)
  const desc = (descContrato || '').trim()
  if (!desc) return '—'
  const parts = desc.split(/\s{2,}/)
  return parts[0] || desc.substring(0, 30)
}

// Detectar tipo de máquina por el prefijo del modelo
function inferirTipo(modelo: string): string {
  if (!modelo) return 'DESCONOCIDO'
  const m = modelo.toUpperCase()
  // Grúa torre: prefijo H o T con números (Liebherr H / Comansa LCC)
  if (/^H-?\d/i.test(m) || /^LCC/i.test(m) || /^TL/i.test(m)) return 'GRUA_TORRE'
  // Grúa móvil: prefijo LTM, GR, GM
  if (/^(LTM|GR|GM|RT)/i.test(m)) return 'GRUA_MOVIL'
  // Grúa puente: prefijo PBP, MD, GH
  if (/^(PBP|MD|GH|PE|PBP)/i.test(m) || /PUENTE/i.test(m)) return 'GRUA_PUENTE'
  // Montacargas: prefijo E, V, R con números (electric) o TG, FG (gas)
  if (/^(E|V|R)\s*-?\d/i.test(m) || /MONTACARG/i.test(m)) return 'MONTACARGAS_ELECTRICO'
  if (/^(TG|FG|FD|H\d|HD)/i.test(m)) return 'MONTACARGAS_COMBUSTION'
  return 'DESCONOCIDO'
}

interface ImportResult {
  rowsTotal: number
  equiposCreados: number
  equiposActualizados: number
  filasSaltadas: number
  filasConCruceCAC: number
  sinCruceCAC: number
  m1M2Count: number
  porHorasCount: number
  revisionesCreadas: number
  errores: string[]
}

// ============================================================
// Lógica: calcular próxima revisión para un equipo
// ============================================================
interface NextRevisionResult {
  tipoRevision: 'POR_HORAS' | 'POR_CONTRATO'
  umbralActual?: number | null
  proximaHoras?: number | null
  proximaFecha?: Date | null
  nivel?: string | null
}

function calcularProximaRevision(
  horasActuales: number,
  tipoRevision: 'POR_HORAS' | 'POR_CONTRATO',
  periodicidadMeses: number,
  ultimoMantenimientoHoras: number | null,
  ultimaRevisionFecha: Date | null,
  fechaInicioContrato: Date | null,
): NextRevisionResult {
  if (tipoRevision === 'POR_CONTRATO') {
    // Calendar-based: próxima fecha = última revisión + periodicidad
    const base = ultimaRevisionFecha || fechaInicioContrato || new Date()
    const proximaFecha = new Date(base)
    proximaFecha.setMonth(proximaFecha.getMonth() + periodicidadMeses)
    return {
      tipoRevision: 'POR_CONTRATO',
      proximaFecha,
      nivel: 'CONTRATO',
    }
  }

  // POR_HORAS: usar umbrales 250 / 500 / 1000
  // Encontrar el siguiente umbral múltiplo por encima de las horas actuales
  const UMBRALES = [250, 500, 1000]
  // El "umbral actual" es el primer umbral tal que horasActuales < umbralSiguiente
  // Ej: si horasActuales = 3091, el siguiente umbral de 250 es 3250 (13 * 250)
  const proximo250 = Math.ceil((horasActuales + 1) / 250) * 250
  const proximo500 = Math.ceil((horasActuales + 1) / 500) * 500
  const proximo1000 = Math.ceil((horasActuales + 1) / 1000) * 1000

  // Determinar el umbral más próximo (el menor avance)
  const candidatos = [
    { horas: proximo250, umbral: 250, nivel: 'PEQUENA' },
    { horas: proximo500, umbral: 500, nivel: 'MEDIA' },
    { horas: proximo1000, umbral: 1000, nivel: 'GRANDE' },
  ].filter((c) => c.horas > horasActuales)

  // Ordenar por proximidad (cuántas horas faltan)
  candidatos.sort((a, b) => (a.horas - horasActuales) - (b.horas - horasActuales))

  const proximo = candidatos[0]
  if (!proximo) {
    return { tipoRevision: 'POR_HORAS' }
  }

  // Estimación de fecha: si tenemos último mantenimiento y horas desde entonces
  // (no tenemos tasa de uso, dejamos fechaProgramada = hoy + 30 días como estimación)
  const fechaEstimada = new Date()
  fechaEstimada.setDate(fechaEstimada.getDate() + 30)

  return {
    tipoRevision: 'POR_HORAS',
    umbralActual: proximo.umbral,
    proximaHoras: proximo.horas,
    proximaFecha: fechaEstimada,
    nivel: proximo.nivel,
  }
}

// POST /api/sync/excel-equipos — Sube el Excel 2 "Líneas de Contratos de Servicio Internos"
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let fileName = 'desconocido.xlsx'
  let fileSize = 0

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const syncType = (formData.get('syncType') as string) || 'EXCEL_BC_EQUIPOS'

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

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      return NextResponse.json({ error: 'El Excel no tiene hojas' }, { status: 400 })
    }

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true,
    })

    if (!rows.length) {
      return NextResponse.json({ error: 'El Excel no tiene filas' }, { status: 400 })
    }

    // Mapear filas
    const parsedRows: ParsedRow[] = rows.map((r) => {
      const mapped: Partial<ParsedRow> = {}
      for (const [excelHeader, internalKey] of Object.entries(HEADER_MAP)) {
        if (excelHeader in r) {
          ;(mapped as Record<string, unknown>)[internalKey] = r[excelHeader]
        }
      }
      return mapped as ParsedRow
    })

    const result: ImportResult = {
      rowsTotal: parsedRows.length,
      equiposCreados: 0,
      equiposActualizados: 0,
      filasSaltadas: 0,
      filasConCruceCAC: 0,
      sinCruceCAC: 0,
      m1M2Count: 0,
      porHorasCount: 0,
      revisionesCreadas: 0,
      errores: [],
    }

    // Agrupar por codProducto para quedarnos con la fila más reciente de cada equipo
    const equiposMap = new Map<string, ParsedRow>()
    for (const row of parsedRows) {
      if (!row.codProducto || row.codProducto.trim() === '') {
        result.filasSaltadas++
        continue
      }
      const cod = row.codProducto.trim()
      const existing = equiposMap.get(cod)
      if (!existing) {
        equiposMap.set(cod, row)
      } else {
        // Quedarnos con la fila de fecha más reciente
        const existingDate = existing.fechaInicio || new Date(0)
        const newDate = row.fechaInicio || new Date(0)
        if (newDate >= existingDate) {
          equiposMap.set(cod, row)
        }
      }
    }

    // Pre-cargar contratos CAC de la base de datos para hacer el cruce rápido
    const contratosCAC = await db.contrato.findMany({
      select: {
        id: true,
        numero: true,
        clienteId: true,
        codGrupoContrato: true,
        periodicidadMeses: true,
        fechaInicio: true,
      },
    })
    const contratosByNumero = new Map<string, typeof contratosCAC[number]>()
    for (const c of contratosCAC) {
      if (c.numero) contratosByNumero.set(c.numero.toUpperCase(), c)
    }
    // También indexar por número normalizado (sin espacios, etc.)
    for (const c of contratosCAC) {
      if (!c.numero) continue
      const normalized = c.numero.toUpperCase().replace(/\s+/g, '')
      contratosByNumero.set(normalized, c)
    }

    // Limpiar equipos anteriores (si el usuario quiere reemplazo total)
    const reemplazoTotal = formData.get('reemplazoTotal') !== 'false' // default true
    if (reemplazoTotal) {
      await db.$transaction([
        db.revisionProgramada.deleteMany(),
        db.ordenTrabajo.deleteMany(),
        db.contratoEquipo.deleteMany(),
        db.equipo.deleteMany(),
      ])
    }

    // Procesar cada equipo único
    const equiposParaCrear: Array<{
      codigo: string
      tipo: string
      marca: string
      modelo: string
      numeroSerie: string
      ubicacion: string | null
      estado: string
      horasUso: number
      notas: string | null
      clienteId: string
      codigoProductoBC: string
      contratoActivoId: string | null
      tipoRevision: string
      umbralHorasActual: number | null
      proximaRevisionHoras: number | null
      proximaRevisionFecha: Date | null
    }> = []

    // Necesitamos un cliente por defecto para equipos sin cruce CAC
    // (los crearemos como "clientes genéricos BC-XXX" basándonos en el texto del cliente en descripción)
    const clientesByCodExterno = new Map<string, string>()
    const clientesExistentes = await db.cliente.findMany({
      where: { codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true, nombre: true },
    })
    for (const c of clientesExistentes) {
      if (c.codigoExterno) clientesByCodExterno.set(c.codigoExterno, c.id)
    }

    // Cliente fallback para equipos sin info de cliente (lo creamos al final si hace falta)
    let fallbackClienteId: string | null = null
    const getFallbackCliente = async (): Promise<string> => {
      if (fallbackClienteId) return fallbackClienteId
      const nuevo = await db.cliente.create({
        data: {
          nombre: 'Equipos sin cliente asignado',
          nif: 'BC-SIN-CLIENTE',
          estado: 'ACTIVO',
          notas: 'Cliente genérico para equipos importados sin cliente identificable',
        },
      })
      fallbackClienteId = nuevo.id
      return fallbackClienteId
    }

    for (const [codProducto, row] of equiposMap.entries()) {
      try {
        // 1. Extraer CAC## de la descripción
        const cacRef = extraerCACRef(row.descContrato)
        const contrato = cacRef ? contratosByNumero.get(cacRef.toUpperCase()) : null
        if (cacRef && contrato) {
          result.filasConCruceCAC++
        } else if (cacRef) {
          // Tenemos CACRef pero no encontramos el contrato en BD
          // (puede que el contrato esté con otro formato de número)
        }

        // 2. Determinar tipo de revisión basado en M1/M2
        const codGrupoContrato = contrato?.codGrupoContrato || null
        const esM1M2 = codGrupoContrato ? M_PATTERN.test(codGrupoContrato) : false
        const tipoRevision: 'POR_HORAS' | 'POR_CONTRATO' = esM1M2 ? 'POR_CONTRATO' : 'POR_HORAS'
        if (esM1M2) result.m1M2Count++
        else result.porHorasCount++

        // 3. Determinar cliente
        let clienteId = contrato?.clienteId || null
        if (!clienteId) {
          // Buscar el código de cliente BC en la descripción (ej. "430000126")
          // y usar el cliente existente si coincide con codigoExterno
          // Si no, usar el fallback
          clienteId = await getFallbackCliente()
        }

        // 4. Datos del equipo
        const modelo = extraerModelo(row.descLinea, row.descContrato)
        const marca = extraerMarca(row.descContrato)
        const tipo = inferirTipo(modelo)
        const horasUso = row.horasSalida || 0
        const numeroSerie = row.numSerie || codProducto // fallback al código de producto si no hay serie
        const ubicacion = cleanStr(row.descContrato) // mientras tanto, usamos la descripción

        // 5. Calcular próxima revisión
        const periodicidadMeses = contrato?.periodicidadMeses || 12
        const proximaRevision = calcularProximaRevision(
          horasUso,
          tipoRevision,
          periodicidadMeses,
          null, // últimoMantenimientoHoras (no lo sabemos al importar)
          null, // ultimaRevisionFecha (no lo sabemos)
          row.fechaInicio || contrato?.fechaInicio || null,
        )

        // Verificar que el número de serie no esté ya en uso
        // (en SQLite, si falla la restricción única lo capturamos en el catch)

        const dataEquipo = {
          codigo: codProducto,
          tipo,
          marca,
          modelo,
          numeroSerie,
          ubicacion,
          estado: 'OPERATIVO',
          horasUso,
          notas: `Importado de BC. Contrato interno: ${row.numeroContrato || '—'}`,
          clienteId,
          codigoProductoBC: codProducto,
          contratoActivoId: row.numeroContrato || null,
          tipoRevision: proximaRevision.tipoRevision,
          umbralHorasActual: proximaRevision.umbralActual ?? null,
          proximaRevisionHoras: proximaRevision.proximaHoras ?? null,
          proximaRevisionFecha: proximaRevision.proximaFecha ?? null,
        }

        // Buscar si ya existe un equipo con ese códigoProductoBC
        const existente = await db.equipo.findUnique({
          where: { codigoProductoBC: codProducto },
          select: { id: true },
        })

        if (existente) {
          await db.equipo.update({
            where: { id: existente.id },
            data: dataEquipo,
          })
          result.equiposActualizados++
        } else {
          // Verificar que el numeroSerie no esté ya en uso
          const existentePorSerie = await db.equipo.findUnique({
            where: { numeroSerie },
            select: { id: true },
          })
          if (existentePorSerie) {
            // Si la serie ya existe pero con otro código, actualizar
            await db.equipo.update({
              where: { id: existentePorSerie.id },
              data: dataEquipo,
            })
            result.equiposActualizados++
          } else {
            try {
              await db.equipo.create({ data: dataEquipo })
              result.equiposCreados++
            } catch (createErr) {
              // Si falla la restricción única (poco probable ya que verificamos antes)
              result.errores.push(`Equipo ${codProducto}: ${String(createErr)}`)
            }
          }
        }

        // 6. Crear la entrada de revisión programada
        if (proximaRevision.proximaFecha) {
          // Recuperar el equipo recién creado/actualizado
          const equipoActualizado = existente
            ? await db.equipo.findUnique({ where: { id: existente.id }, select: { id: true } })
            : await db.equipo.findUnique({ where: { codigoProductoBC: codProducto }, select: { id: true } })
          if (equipoActualizado) {
            // Eliminar revisiones programadas anteriores PROGRAMADAS para este equipo
            await db.revisionProgramada.deleteMany({
              where: { equipoId: equipoActualizado.id, estado: 'PROGRAMADA' },
            })
            await db.revisionProgramada.create({
              data: {
                equipoId: equipoActualizado.id,
                tipo: proximaRevision.tipoRevision,
                nivel: proximaRevision.nivel || null,
                horasObjetivo: proximaRevision.proximaHoras || null,
                fechaProgramada: proximaRevision.proximaFecha,
                estado: 'PROGRAMADA',
              },
            })
            result.revisionesCreadas++
          }
        }

        // 7. Vincular el equipo al contrato CAC (relación N:M)
        if (contrato) {
          const equipoParaVinculo = existente
            ? await db.equipo.findUnique({ where: { id: existente.id }, select: { id: true } })
            : await db.equipo.findUnique({ where: { codigoProductoBC: codProducto }, select: { id: true } })
          if (equipoParaVinculo) {
            // Verificar si ya existe la relación
            const vinculoExistente = await db.contratoEquipo.findUnique({
              where: {
                contratoId_equipoId: { contratoId: contrato.id, equipoId: equipoParaVinculo.id },
              },
              select: { id: true },
            })
            if (!vinculoExistente) {
              await db.contratoEquipo.create({
                data: { contratoId: contrato.id, equipoId: equipoParaVinculo.id },
              })
            }
          }
        }
        } catch (err) {
          if (result.errores.length < 50) {
            result.errores.push(`Equipo ${codProducto}: ${String(err)}`)
          }
        }
    }

    // Crear entrada en SyncLog
    await db.syncLog.create({
      data: {
        fileName,
        fileSize,
        rowsTotal: result.rowsTotal,
        rowsCreated: result.equiposCreados,
        rowsUpdated: result.equiposActualizados,
        rowsSkipped: result.filasSaltadas,
        rowsFailed: 0,
        clientesNuevos: 0,
        contratosNuevos: 0,
        contratosActualizados: 0,
        duracionMs: Date.now() - startTime,
        status: 'OK',
        syncType,
        errores: result.errores.length > 0
          ? JSON.stringify(result.errores.slice(0, 50))
          : null,
      },
    })

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      duration: Date.now() - startTime,
      ...result,
      status: 'OK',
    })
  } catch (error) {
    console.error('POST /api/sync/excel-equipos error:', error)
    try {
      await db.syncLog.create({
        data: {
          fileName,
          fileSize,
          rowsTotal: 0,
          status: 'ERROR',
          syncType: 'EXCEL_BC_EQUIPOS',
          errores: JSON.stringify([String(error)]),
          duracionMs: Date.now() - startTime,
        },
      })
    } catch (logErr) {
      console.error('No se pudo registrar SyncLog de error:', logErr)
    }
    return NextResponse.json(
      { error: 'Error al procesar el Excel de equipos', detail: String(error) },
      { status: 500 }
    )
  }
}
