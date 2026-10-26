import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// ============================================================
// Mapeo de cabeceras: reconoce sinónimos comunes en español
// (case-insensitive, sin acentos ni espacios extra)
// ============================================================
function normalizeHeader(h: string): string {
  return h.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim()
}

interface ColumnRule {
  field: string // campo interno a actualizar
  entity: 'equipo' | 'cliente' | 'contrato'
  headers: string[] // sinónimos reconocidos (ya normalizados)
  parse: (val: unknown) => unknown
}

const COLUMN_RULES: ColumnRule[] = [
  // === CLAVES DE IDENTIFICACIÓN ===
  {
    field: '__KEY_PRODUCTO__',
    entity: 'equipo',
    headers: ['Nº PROD. SERVICIO', 'NO. PROD. SERVICIO', 'Nº PRODUCTO', 'NO. PRODUCTO', 'Nº PRODUCTO SERVICIO', 'PRODUCTO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: '__KEY_CLIENTE__',
    entity: 'cliente',
    headers: ['Nº CLIENTE', 'NO. CLIENTE', 'NUM CLIENTE', 'Nº FACTURA-A Nº CLIENTE', 'FACTURA-A Nº CLIENTE', 'CLIENTE'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: '__KEY_CONTRATO__',
    entity: 'contrato',
    headers: ['Nº CONTRATO', 'NO. CONTRATO', 'NUM CONTRATO', 'CONTRATO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: '__KEY_SERIE__',
    entity: 'equipo',
    headers: ['Nº SERIE', 'NO. SERIE', 'NUM SERIE', 'SERIE'],
    parse: (v) => String(v || '').trim(),
  },

  // === EQUIPO: campos actualizables ===
  {
    field: 'ultimaRevision',
    entity: 'equipo',
    headers: ['ULTIMA REVISION', 'ULT. REVISION', 'ULT REVISION', 'FECHA ULTIMA REVISION', 'FECHA ULT REVISION', 'ULTIMA REVISION FECHA'],
    parse: parseDate,
  },
  {
    field: 'horasUso',
    entity: 'equipo',
    headers: ['HORAS ACTUALES', 'HORAS', 'Nº HORAS SALIDA', 'NO. HORAS SALIDA', 'HORAS DE USO', 'HORAS USADAS', 'CONTADOR HORAS'],
    parse: parseNum,
  },
  {
    field: 'marca',
    entity: 'equipo',
    headers: ['MARCA'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'modelo',
    entity: 'equipo',
    headers: ['MODELO', 'DESCRIPCION LINEA CONTRATO', 'DESCRIPCION LINEA', 'DESC. LINEA'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'numeroSerie',
    entity: 'equipo',
    headers: ['Nº SERIE', 'NO. SERIE', 'SERIE FISICA'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'anioFabricacion',
    entity: 'equipo',
    headers: ['AÑO FABRICACION', 'ANO FABRICACION', 'AÑO', 'ANO', 'FECHA FABRICACION'],
    parse: parseNum,
  },
  {
    field: 'ubicacion',
    entity: 'equipo',
    headers: ['UBICACION', 'COD. DIRECCION ENVIO CLIENTE', 'CODIGO DIRECCION ENVIO CLIENTE', 'DIRECCION ENVIO'],
    parse: (v) => String(v || '').trim(),
  },

  // === CLIENTE: campos actualizables ===
  {
    field: 'nombre',
    entity: 'cliente',
    headers: ['FACT. A-NOMBRE', 'FACT A-NOMBRE', 'NOMBRE CLIENTE', 'NOMBRE', 'RAZON SOCIAL'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'nif',
    entity: 'cliente',
    headers: ['NIF', 'CIF', 'NIF/CIF'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'email',
    entity: 'cliente',
    headers: ['EMAIL', 'E-MAIL', 'CORREO', 'EMAIL DESTINO FACTURAS/ABONOS'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'telefono',
    entity: 'cliente',
    headers: ['TELEFONO', 'TEL', 'TELEFONO CLIENTE'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'direccion',
    entity: 'cliente',
    headers: ['DIRECCION', 'DIRECCION FISCAL', 'DOMICILIO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'ciudad',
    entity: 'cliente',
    headers: ['CIUDAD', 'POBLACION', 'LOCALIDAD'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'codigoPostal',
    entity: 'cliente',
    headers: ['CODIGO POSTAL', 'CP', 'COD. POSTAL', 'COD POSTAL'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'contactoNombre',
    entity: 'cliente',
    headers: ['CONTACTO', 'PERSONA CONTACTO', 'NOMBRE CONTACTO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'contactoTelefono',
    entity: 'cliente',
    headers: ['TELEFONO CONTACTO', 'TEL CONTACTO', 'MOVIL CONTACTO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'contactoEmail',
    entity: 'cliente',
    headers: ['EMAIL CONTACTO', 'CORREO CONTACTO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'zona',
    entity: 'cliente',
    headers: ['ZONA', 'DELEGACION', 'CODIGO DELEGACION', 'SUCURSAL', 'SEDE'],
    parse: (v) => String(v || '').trim(),
  },

  // === CONTRATO: campos actualizables ===
  {
    field: 'codGrupoContrato',
    entity: 'contrato',
    headers: ['COD. GRUPO CONTRATO', 'CODIGO GRUPO CONTRATO', 'GRUPO CONTRATO', 'TIPO CONTRATO', 'GRUPO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'estado',
    entity: 'contrato',
    headers: ['ESTADO'],
    parse: (v) => String(v || '').trim(),
  },
  {
    field: 'fechaInicio',
    entity: 'contrato',
    headers: ['FECHA INICIAL', 'FECHA INICIO', 'INICIO'],
    parse: parseDate,
  },
  {
    field: 'fechaFin',
    entity: 'contrato',
    headers: ['FECHA CADUCIDAD', 'FECHA FIN', 'FECHA VENCIMIENTO', 'CADUCIDAD'],
    parse: parseDate,
  },
  {
    field: 'precioAnual',
    entity: 'contrato',
    headers: ['IMPORTE POR PERIODO', 'IMPORTE ANUAL', 'PRECIO ANUAL', 'PRECIO'],
    parse: parseNum,
  },
  {
    field: 'periodicidadMeses',
    entity: 'contrato',
    headers: ['PERIODICIDAD', 'PERIODICIDAD MESES', 'CADENCIA'],
    parse: (v) => {
      const s = String(v || '').trim().toLowerCase()
      if (s.endsWith('y') || s === '1y' || s === 'anual') return 12
      if (s.endsWith('m')) {
        const n = parseInt(s.replace('m', ''), 10)
        return isNaN(n) ? null : n
      }
      const n = parseNum(v)
      return n
    },
  },
]

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number') {
    // Excel serial date
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

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// ============================================================
// Lógica de cálculo de próxima revisión
// ============================================================
const M_PATTERN = /^M\d+$/i

function calcularProximaRevision(
  horasActuales: number,
  tipoRevision: 'POR_HORAS' | 'POR_CONTRATO',
  periodicidadMeses: number,
  ultimaRevision: Date | null,
  fechaInicioContrato: Date | null,
) {
  if (tipoRevision === 'POR_CONTRATO') {
    const base = ultimaRevision || fechaInicioContrato || new Date()
    const proximaFecha = new Date(base)
    proximaFecha.setMonth(proximaFecha.getMonth() + periodicidadMeses)
    return {
      tipoRevision,
      proximaFecha,
      proximaHoras: null as number | null,
      umbralActual: null as number | null,
      nivel: 'CONTRATO' as string | null,
    }
  }

  // POR_HORAS: 500h fijo
  const UMBRAL = 500
  const proximaHoras = Math.ceil((horasActuales + 1) / UMBRAL) * UMBRAL
  if (proximaHoras <= horasActuales) {
    return { tipoRevision, proximaFecha: null, proximaHoras: null, umbralActual: null, nivel: null }
  }
  const proximaFecha = new Date()
  proximaFecha.setDate(proximaFecha.getDate() + 30)
  return {
    tipoRevision,
    proximaFecha,
    proximaHoras,
    umbralActual: UMBRAL,
    nivel: 'REVISION_500H' as string | null,
  }
}

interface SyncResult {
  rowsTotal: number
  rowsUpdated: number
  rowsSkipped: number
  rowsFailed: number
  columnsDetected: Array<{ header: string; field: string; entity: string }>
  fieldsUpdated: Record<string, number>
  errores: string[]
}

// POST /api/sync/excel-flexible
// Acepta cualquier Excel de BC y actualiza por Nº producto/cliente los campos que reconozca.
// Modo incremental SIEMPRE: preserva datos manuales (notas, revisiones COMPLETADAS, tipoRevision si fue manual).
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let fileName = 'desconocido.xlsx'
  let fileSize = 0

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const dryRun = formData.get('dryRun') === 'true' // solo detectar columnas, no actualizar

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

    // Detectar columnas: mapear cada cabecera del Excel a una regla
    const headers = Object.keys(rows[0])
    const detectedColumns: Array<{ header: string; field: string; entity: string }> = []
    const headerToRule = new Map<string, ColumnRule>()

    for (const header of headers) {
      const normalized = normalizeHeader(header)
      const rule = COLUMN_RULES.find((r) => r.headers.includes(normalized))
      if (rule) {
        headerToRule.set(header, rule)
        detectedColumns.push({
          header,
          field: rule.field,
          entity: rule.entity,
        })
      }
    }

    // Si es dry-run, devolver solo las columnas detectadas
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        fileName,
        fileSize,
        rowsTotal: rows.length,
        columnsDetected: detectedColumns,
        columnsNotDetected: headers.filter((h) => !headerToRule.has(h)),
      })
    }

    const result: SyncResult = {
      rowsTotal: rows.length,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsFailed: 0,
      columnsDetected: detectedColumns,
      fieldsUpdated: {},
      errores: [],
    }

    // Pre-cargar caches para lookup rápido
    // Equipos por codigoProductoBC
    const equiposCache = new Map<string, string>() // codigoProductoBC → equipoId
    const allEquipos = await db.equipo.findMany({
      where: { codigoProductoBC: { not: null } },
      select: { id: true, codigoProductoBC: true, numeroSerie: true, tipoRevision: true, tipoRevisionManual: true, ultimaRevision: true, horasUso: true, clienteId: true },
    })
    for (const e of allEquipos) {
      if (e.codigoProductoBC) equiposCache.set(e.codigoProductoBC, e.id)
    }
    // Equipos por numeroSerie (fallback)
    const equiposBySerie = new Map<string, string>()
    for (const e of allEquipos) {
      if (e.numeroSerie) equiposBySerie.set(e.numeroSerie, e.id)
    }

    // Clientes por codigoExterno
    const clientesCache = new Map<string, string>() // codigoExterno → clienteId
    const allClientes = await db.cliente.findMany({
      where: { codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true },
    })
    for (const c of allClientes) {
      if (c.codigoExterno) clientesCache.set(c.codigoExterno, c.id)
    }

    // Contratos por numero
    const contratosCache = new Map<string, string>()
    const allContratos = await db.contrato.findMany({
      select: { id: true, numero: true, clienteId: true },
    })
    for (const c of allContratos) {
      if (c.numero) contratosCache.set(c.numero.toUpperCase(), c.id)
    }
    // También indexar contratos por numero transformado CMI→CM
    for (const c of allContratos) {
      if (!c.numero) continue
      const upper = c.numero.toUpperCase()
      if (upper.startsWith('CMI')) {
        const transformed = 'CM' + upper.slice(3)
        if (!contratosCache.has(transformed)) contratosCache.set(transformed, c.id)
      }
      if (upper.startsWith('CMIB')) {
        const transformed = 'CMB' + upper.slice(4)
        if (!contratosCache.has(transformed)) contratosCache.set(transformed, c.id)
      }
    }

    // Equipos que requieren recálculo de próxima revisión
    const equiposParaRecalc = new Set<string>()

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]
      try {
        // Identificar la clave
        let equipoId: string | null = null
        let clienteId: string | null = null
        let contratoId: string | null = null

        for (const [header, rule] of headerToRule.entries()) {
          if (rule.field === '__KEY_PRODUCTO__') {
            const val = rule.parse(row[header]) as string | null
            if (val) {
              equipoId = equiposCache.get(val) || null
            }
          } else if (rule.field === '__KEY_SERIE__') {
            const val = rule.parse(row[header]) as string | null
            if (val && !equipoId) {
              equipoId = equiposBySerie.get(val) || null
            }
          } else if (rule.field === '__KEY_CLIENTE__') {
            const val = rule.parse(row[header]) as string | null
            if (val) {
              clienteId = clientesCache.get(val) || null
            }
          } else if (rule.field === '__KEY_CONTRATO__') {
            const val = (rule.parse(row[header]) as string | null)?.toUpperCase()
            if (val) {
              contratoId = contratosCache.get(val) || null
            }
          }
        }

        // Si encontramos equipo pero no cliente, derivar cliente del equipo
        if (equipoId && !clienteId) {
          const eq = allEquipos.find((e) => e.id === equipoId)
          if (eq?.clienteId) clienteId = eq.clienteId
        }
        // Si encontramos contrato pero no cliente, derivar cliente del contrato
        if (contratoId && !clienteId) {
          const c = allContratos.find((c) => c.id === contratoId)
          if (c?.clienteId) clienteId = c.clienteId
        }

        if (!equipoId && !clienteId && !contratoId) {
          result.rowsSkipped++
          continue
        }

        // Procesar actualizaciones por entidad
        const equipoUpdates: Record<string, unknown> = {}
        const clienteUpdates: Record<string, unknown> = {}
        const contratoUpdates: Record<string, unknown> = {}

        for (const [header, rule] of headerToRule.entries()) {
          // Skip claves
          if (rule.field.startsWith('__KEY_')) continue

          const val = rule.parse(row[header])
          if (val === null || val === undefined || val === '') continue

          // Asignar al entity correcto
          if (rule.entity === 'equipo' && equipoId) {
            equipoUpdates[rule.field] = val
          } else if (rule.entity === 'cliente' && clienteId) {
            clienteUpdates[rule.field] = val
          } else if (rule.entity === 'contrato' && contratoId) {
            contratoUpdates[rule.field] = val
          }
        }

        // ============================================================
        // Reglas de preservación de datos manuales
        // ============================================================

        // Para equipo: preservar horasUso si el valor nuevo es menor (las horas solo suben)
        if (equipoId && 'horasUso' in equipoUpdates) {
          const eq = allEquipos.find((e) => e.id === equipoId)
          if (eq) {
            const newHoras = Number(equipoUpdates.horasUso)
            if (Number.isFinite(newHoras) && newHoras < eq.horasUso) {
              // No bajar las horas, mantener las actuales
              delete equipoUpdates.horasUso
            } else if (Number.isFinite(newHoras) && newHoras > eq.horasUso) {
              // Subió: necesitamos recalcular
              equiposParaRecalc.add(equipoId)
            }
          }
        }

        // Para equipo: si ultimaRevision se actualiza, recalcular próxima
        if (equipoId && 'ultimaRevision' in equipoUpdates) {
          equiposParaRecalc.add(equipoId)
        }

        // Aplicar updates
        let updatedSomething = false
        if (equipoId && Object.keys(equipoUpdates).length > 0) {
          await db.equipo.update({
            where: { id: equipoId },
            data: equipoUpdates,
          })
          for (const k of Object.keys(equipoUpdates)) {
            result.fieldsUpdated[`equipo.${k}`] = (result.fieldsUpdated[`equipo.${k}`] || 0) + 1
          }
          updatedSomething = true
        }
        if (clienteId && Object.keys(clienteUpdates).length > 0) {
          await db.cliente.update({
            where: { id: clienteId },
            data: clienteUpdates,
          })
          for (const k of Object.keys(clienteUpdates)) {
            result.fieldsUpdated[`cliente.${k}`] = (result.fieldsUpdated[`cliente.${k}`] || 0) + 1
          }
          updatedSomething = true
        }
        if (contratoId && Object.keys(contratoUpdates).length > 0) {
          await db.contrato.update({
            where: { id: contratoId },
            data: contratoUpdates,
          })
          for (const k of Object.keys(contratoUpdates)) {
            result.fieldsUpdated[`contrato.${k}`] = (result.fieldsUpdated[`contrato.${k}`] || 0) + 1
          }
          updatedSomething = true
        }

        if (updatedSomething) {
          result.rowsUpdated++
        } else {
          result.rowsSkipped++
        }
      } catch (err) {
        result.rowsFailed++
        if (result.errores.length < 50) {
          result.errores.push(`Fila ${rowIdx + 2}: ${String(err).slice(0, 200)}`)
        }
      }
    }

    // ============================================================
    // Recalcular próxima revisión para equipos afectados
    // ============================================================
    let revisionesRecalculadas = 0
    if (equiposParaRecalc.size > 0) {
      // Pre-cargar contratos por equipoId para periodicidad
      const contratosEquipos = await db.contratoEquipo.findMany({
        where: { equipoId: { in: Array.from(equiposParaRecalc) } },
        include: { contrato: { select: { periodicidadMeses: true, fechaInicio: true, codGrupoContrato: true } } },
      })
      const contratoPorEquipo = new Map<string, { periodicidad: number; fechaInicio: Date | null; grupo: string | null }>()
      for (const ce of contratosEquipos) {
        if (!contratoPorEquipo.has(ce.equipoId)) {
          contratoPorEquipo.set(ce.equipoId, {
            periodicidad: ce.contrato.periodicidadMeses || 12,
            fechaInicio: ce.contrato.fechaInicio,
            grupo: ce.contrato.codGrupoContrato,
          })
        }
      }

      for (const equipoId of equiposParaRecalc) {
        try {
          const equipo = await db.equipo.findUnique({
            where: { id: equipoId },
            select: {
              id: true,
              horasUso: true,
              ultimaRevision: true,
              tipoRevision: true,
              tipoRevisionManual: true,
            },
          })
          if (!equipo) continue

          // Determinar tipo de revisión SIEMPRE (sin respetar tipoRevisionManual en este flujo,
          // porque el usuario está forzando una actualización desde BC)
          const contratoInfo = contratoPorEquipo.get(equipoId)
          const grupo = contratoInfo?.grupo?.toUpperCase()
          const esM1M2 = grupo ? M_PATTERN.test(grupo) : false
          const tipoRevision: 'POR_HORAS' | 'POR_CONTRATO' =
            equipo.tipoRevisionManual ? (equipo.tipoRevision as 'POR_HORAS' | 'POR_CONTRATO')
            : esM1M2 ? 'POR_CONTRATO' : 'POR_HORAS'
          const periodicidad = contratoInfo?.periodicidad || 12

          const calc = calcularProximaRevision(
            equipo.horasUso,
            tipoRevision,
            periodicidad,
            equipo.ultimaRevision,
            contratoInfo?.fechaInicio || null,
          )

          await db.equipo.update({
            where: { id: equipoId },
            data: {
              tipoRevision: equipo.tipoRevisionManual ? equipo.tipoRevision : tipoRevision,
              umbralHorasActual: calc.umbralActual,
              proximaRevisionHoras: calc.proximaHoras,
              proximaRevisionFecha: calc.proximaFecha,
            },
          })

          // Borrar revisiones PROGRAMADAS previas y crear nueva
          await db.revisionProgramada.deleteMany({
            where: { equipoId, estado: 'PROGRAMADA' },
          })
          if (calc.proximaFecha) {
            await db.revisionProgramada.create({
              data: {
                equipoId,
                tipo: tipoRevision,
                nivel: calc.nivel,
                horasObjetivo: calc.proximaHoras,
                fechaProgramada: calc.proximaFecha,
                estado: 'PROGRAMADA',
              },
            })
            revisionesRecalculadas++
          }
        } catch (err) {
          if (result.errores.length < 50) {
            result.errores.push(`Recalc equipo ${equipoId}: ${String(err).slice(0, 200)}`)
          }
        }
      }
    }

    // Crear entrada en SyncLog
    await db.syncLog.create({
      data: {
        fileName,
        fileSize,
        rowsTotal: result.rowsTotal,
        rowsCreated: 0,
        rowsUpdated: result.rowsUpdated,
        rowsSkipped: result.rowsSkipped,
        rowsFailed: result.rowsFailed,
        clientesNuevos: 0,
        contratosNuevos: 0,
        contratosActualizados: result.fieldsUpdated['contrato.codGrupoContrato'] || 0,
        duracionMs: Date.now() - startTime,
        status: result.rowsFailed === 0 ? 'OK' : result.rowsUpdated > 0 ? 'PARCIAL' : 'ERROR',
        syncType: 'EXCEL_BC_FLEXIBLE',
        errores: result.errores.length > 0 ? JSON.stringify(result.errores.slice(0, 50)) : null,
      },
    })

    return NextResponse.json({
      success: true,
      fileName,
      fileSize,
      duration: Date.now() - startTime,
      columnsDetected: detectedColumns,
      ...result,
      revisionesRecalculadas,
      status: result.rowsFailed === 0 ? 'OK' : result.rowsUpdated > 0 ? 'PARCIAL' : 'ERROR',
    })
  } catch (error) {
    console.error('POST /api/sync/excel-flexible error:', error)
    try {
      await db.syncLog.create({
        data: {
          fileName,
          fileSize,
          rowsTotal: 0,
          status: 'ERROR',
          syncType: 'EXCEL_BC_FLEXIBLE',
          errores: JSON.stringify([String(error)]),
          duracionMs: Date.now() - startTime,
        },
      })
    } catch (logErr) {
      console.error('No se pudo registrar SyncLog:', logErr)
    }
    return NextResponse.json(
      { error: 'Error al procesar el Excel flexible', detail: String(error) },
      { status: 500 }
    )
  }
}
