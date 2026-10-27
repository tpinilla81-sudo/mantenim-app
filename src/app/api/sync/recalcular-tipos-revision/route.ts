import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/sync/recalcular-tipos-revision
// Recorre todos los equipos, usa su contratoActivoId (CMI##/##### del Excel 2)
// y busca en la tabla Contrato el número transformado (CM##/#####) para
// determinar el Cód. grupo contrato y, por tanto, el tipo de revisión.
//
// Reglas:
//   contratoActivoId = "CMI##/#####" → buscar "CM##/#####"
//   contratoActivoId = "CMIB/#####" → buscar "CMB/#####"
//   contratoActivoId = "CAI##/#####" → buscar "CA##/#####" (no suele cruzar con M1/M2)
//
//   Si el contrato existe y su codGrupoContrato = M1, M2, M3, etc. → POR_CONTRATO
//   Si no existe o su codGrupoContrato no es M# → POR_HORAS

function transformarContratoInterno(numero: string): string {
  // CMI## → CM##
  // CMIB/##### → CMB/#####
  // CAI## → CA## (poco probable que cruce)
  const upper = numero.toUpperCase()
  if (upper.startsWith('CMI')) return 'CM' + upper.slice(3)
  if (upper.startsWith('CMIB')) return 'CMB' + upper.slice(4)
  if (upper.startsWith('CAI')) return 'CA' + upper.slice(3)
  return upper // sin transformación
}

// Regex para detectar grupos de contrato POR_CONTRATO (calendar-based maintenance)
// Incluye: M1, M2, M3... (mantenimiento preventivo) + FSCR + FSSR (tipos específicos)
const GRUPO_POR_CONTRATO_PATTERN = /^(M\d+|FSCR|FSSR)$/i

interface RecalcResult {
  totalEquipos: number
  actualizados: number
  marcadosPorContrato: number
  marcadosPorHoras: number
  revisionesRecalculadas: number
  errores: string[]
}

function calcularProximaRevision(
  horasActuales: number,
  tipoRevision: 'POR_HORAS' | 'POR_CONTRATO',
  periodicidadMeses: number,
  ultimaRevision: Date | null,
  fechaInicioContrato: Date | null,
  revisionesContratadasAnual?: number | null,
  // Para máquinas propias (POR_HORAS):
  umbralHorasConfigurado?: number | null, // 500 o 1000
  horasAnualesEstimadas?: number | null, // tasa de uso/año
) {
  if (tipoRevision === 'POR_CONTRATO') {
    // Si el usuario ha puesto manualmente el nº de revisiones contratadas al año,
    // usar esa como periodicidad (12/N meses)
    let periodicidadFinal = periodicidadMeses
    if (revisionesContratadasAnual && revisionesContratadasAnual > 0) {
      periodicidadFinal = Math.round(12 / revisionesContratadasAnual)
    }
    const base = ultimaRevision || fechaInicioContrato || new Date()
    const proximaFecha = new Date(base)
    proximaFecha.setMonth(proximaFecha.getMonth() + periodicidadFinal)
    return {
      tipoRevision,
      proximaFecha,
      proximaHoras: null as number | null,
      umbralActual: null as number | null,
      nivel: 'CONTRATO' as string | null,
    }
  }

  // POR_HORAS: máquinas propias con umbral configurable (default 500)
  const UMBRAL = umbralHorasConfigurado && umbralHorasConfigurado > 0 ? umbralHorasConfigurado : 1000
  const proximaHoras = Math.ceil((horasActuales + 1) / UMBRAL) * UMBRAL
  if (proximaHoras <= horasActuales) {
    return { tipoRevision, proximaFecha: null, proximaHoras: null, umbralActual: null, nivel: null }
  }

  // Cálculo de fecha estimada:
  // Si tenemos tasa de uso (horasAnualesEstimadas), calcular cuándo se alcanzará el umbral
  // horasRestantes = proximaHoras - horasActuales
  // diasRestantes = (horasRestantes / horasAnualesEstimadas) * 365
  // proximaFecha = hoy + diasRestantes
  let proximaFecha: Date
  if (horasAnualesEstimadas && horasAnualesEstimadas > 0) {
    const horasRestantes = proximaHoras - horasActuales
    const diasRestantes = Math.ceil((horasRestantes / horasAnualesEstimadas) * 365)
    proximaFecha = new Date()
    proximaFecha.setDate(proximaFecha.getDate() + diasRestantes)
  } else {
    // Fallback: hoy + 30 días (no sabemos tasa de uso)
    proximaFecha = new Date()
    proximaFecha.setDate(proximaFecha.getDate() + 30)
  }

  return {
    tipoRevision,
    proximaFecha,
    proximaHoras,
    umbralActual: UMBRAL,
    nivel: UMBRAL === 1000 ? 'REVISION_1000H' as string | null : 'REVISION_500H' as string | null,
  }
}

export async function POST() {
  const startTime = Date.now()
  try {
    const result: RecalcResult = {
      totalEquipos: 0,
      actualizados: 0,
      marcadosPorContrato: 0,
      marcadosPorHoras: 0,
      revisionesRecalculadas: 0,
      errores: [],
    }

    // Cargar todos los contratos en memoria para lookup rápido por "numero"
    const contratos = await db.contrato.findMany({
      select: {
        id: true,
        numero: true,
        codGrupoContrato: true,
        periodicidadMeses: true,
        fechaInicio: true,
        clienteId: true,
      },
    })
    const contratosByNumero = new Map<string, typeof contratos[number]>()
    for (const c of contratos) {
      if (c.numero) {
        contratosByNumero.set(c.numero.toUpperCase(), c)
      }
    }

    // Cargar todos los equipos con su contratoActivoId
    // Respetar tipoRevisionManual: si está marcado, no sobreescribir el tipo
    const equipos = await db.equipo.findMany({
      select: {
        id: true,
        codigo: true,
        horasUso: true,
        ultimaRevision: true,
        contratoActivoId: true,
        tipoRevision: true,
        tipoRevisionManual: true,
        revisionesContratadasAnual: true,
        esMaquinaPropia: true,
        horasAnualesEstimadas: true,
        umbralHorasActual: true,
      },
      take: 10000,
    })
    result.totalEquipos = equipos.length

    // Procesar en lotes para no saturar
    for (const eq of equipos) {
      try {
        const contratoActivoId = eq.contratoActivoId?.trim().toUpperCase()
        let nuevoTipo: 'POR_HORAS' | 'POR_CONTRATO' = 'POR_HORAS'
        let contratoEncontrado = null as typeof contratos[number] | null
        let periodicidad = 12

        if (contratoActivoId) {
          const variantes = [
            contratoActivoId,
            transformarContratoInterno(contratoActivoId),
          ]
          for (const v of variantes) {
            const encontrado = contratosByNumero.get(v)
            if (encontrado) {
              contratoEncontrado = encontrado
              break
            }
          }
          if (contratoEncontrado?.codGrupoContrato) {
            const grupo = contratoEncontrado.codGrupoContrato.toUpperCase()
            // Aplica para M1, M2, M3... + FSCR + FSSR
            if (GRUPO_POR_CONTRATO_PATTERN.test(grupo)) {
              nuevoTipo = 'POR_CONTRATO'
              periodicidad = contratoEncontrado.periodicidadMeses || 12
            }
          }
        }

        // ============================================================
        // Si el equipo tiene tipoRevisionManual=true, NO sobreescribir el tipo
        // (el usuario lo cambió manualmente y queremos respetarlo)
        // ============================================================
        if (eq.tipoRevisionManual) {
          nuevoTipo = eq.tipoRevision as 'POR_HORAS' | 'POR_CONTRATO'
          // Pero SI podemos vincular al contrato si lo encontramos
          if (contratoEncontrado?.clienteId) {
            await db.equipo.update({
              where: { id: eq.id },
              data: { clienteId: contratoEncontrado.clienteId },
            })
          }
          if (contratoEncontrado) {
            const vinculoExistente = await db.contratoEquipo.findUnique({
              where: {
                contratoId_equipoId: { contratoId: contratoEncontrado.id, equipoId: eq.id },
              },
              select: { id: true },
            })
            if (!vinculoExistente) {
              await db.contratoEquipo.create({
                data: { contratoId: contratoEncontrado.id, equipoId: eq.id },
              })
            }
          }
          // Recalcular próxima revisión con el tipo PRESERVADO
          const calcManual = calcularProximaRevision(
            eq.horasUso,
            nuevoTipo,
            periodicidad,
            eq.ultimaRevision,
            contratoEncontrado?.fechaInicio || null,
            eq.revisionesContratadasAnual,
            eq.umbralHorasActual,
            eq.horasAnualesEstimadas,
          )
          await db.equipo.update({
            where: { id: eq.id },
            data: {
              proximaRevisionHoras: calcManual.proximaHoras,
              proximaRevisionFecha: calcManual.proximaFecha,
              umbralHorasActual: calcManual.umbralActual,
            },
          })
          if (nuevoTipo === 'POR_CONTRATO') result.marcadosPorContrato++
          else result.marcadosPorHoras++
          continue
        }

        if (nuevoTipo === 'POR_CONTRATO') result.marcadosPorContrato++
        else result.marcadosPorHoras++

        // Calcular próxima revisión
        const calc = calcularProximaRevision(
          eq.horasUso,
          nuevoTipo,
          periodicidad,
          eq.ultimaRevision,
          contratoEncontrado?.fechaInicio || null,
          eq.revisionesContratadasAnual,
          eq.umbralHorasActual,
          eq.horasAnualesEstimadas,
        )

        // Actualizar equipo
        await db.equipo.update({
          where: { id: eq.id },
          data: {
            tipoRevision: calc.tipoRevision,
            umbralHorasActual: calc.umbralActual,
            proximaRevisionHoras: calc.proximaHoras,
            proximaRevisionFecha: calc.proximaFecha,
            ...(contratoEncontrado?.clienteId ? { clienteId: contratoEncontrado.clienteId } : {}),
          },
        })
        result.actualizados++

        // Borrar revisiones PROGRAMADAS previas y crear nueva
        await db.revisionProgramada.deleteMany({
          where: { equipoId: eq.id, estado: 'PROGRAMADA' },
        })
        if (calc.proximaFecha) {
          await db.revisionProgramada.create({
            data: {
              equipoId: eq.id,
              tipo: calc.tipoRevision,
              nivel: calc.nivel,
              horasObjetivo: calc.proximaHoras,
              fechaProgramada: calc.proximaFecha,
              estado: 'PROGRAMADA',
            },
          })
          result.revisionesRecalculadas++
        }

        // Vincular equipo al contrato (relación N:M) si encontramos contrato
        if (contratoEncontrado) {
          const vinculoExistente = await db.contratoEquipo.findUnique({
            where: {
              contratoId_equipoId: { contratoId: contratoEncontrado.id, equipoId: eq.id },
            },
            select: { id: true },
          })
          if (!vinculoExistente) {
            await db.contratoEquipo.create({
              data: { contratoId: contratoEncontrado.id, equipoId: eq.id },
            })
          }
        }
      } catch (err) {
        if (result.errores.length < 50) {
          result.errores.push(`Equipo ${eq.codigo}: ${String(err)}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      duration: Date.now() - startTime,
      ...result,
    })
  } catch (error) {
    console.error('POST /api/sync/recalcular-tipos-revision error:', error)
    return NextResponse.json(
      { error: 'Error al recalcular tipos de revisión', detail: String(error) },
      { status: 500 }
    )
  }
}
