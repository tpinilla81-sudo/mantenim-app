import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  cargarLogicasActivas,
  encontrarLogicaAplicable,
  calcularProximaRevision,
} from '@/lib/logicas-engine'

type Params = { params: Promise<{ id: string }> }

// Regex: M1, M2, M3... + FSCR + FSSR (todos POR_CONTRATO) — fallback legacy
const GRUPO_POR_CONTRATO_PATTERN = /^(M\d+|FSCR|FSSR)$/i

// POST /api/equipos/[id]/recalc-revision
// Recalcula la próxima revisión de un equipo individual.
//
// Estrategia:
//   1. Carga las lógicas activas y encuentra la aplicable al equipo.
//   2. Si hay lógica aplicable → calcula con el motor (configuración centralizada).
//   3. Si NO hay lógica aplicable → fallback al comportamiento legacy
//      (codGrupoContrato del contrato).
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const equipo = await db.equipo.findUnique({
      where: { id },
      include: {
        contratos: {
          include: {
            contrato: {
              select: {
                id: true,
                numero: true,
                codGrupoContrato: true,
                periodicidadMeses: true,
                fechaInicio: true,
              },
            },
          },
          take: 1,
        },
      },
    })

    if (!equipo) {
      return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    }

    const contrato = equipo.contratos[0]?.contrato

    // === PASO 1: intentar con lógica aplicable ===
    const logicas = await cargarLogicasActivas()
    const logica = encontrarLogicaAplicable(logicas, {
      tipo: equipo.tipo,
      esMaquinaPropia: equipo.esMaquinaPropia,
    })

    let resultado: ReturnType<typeof calcularProximaRevision> | null = null
    let usarLogica = false

    if (logica) {
      resultado = calcularProximaRevision(
        logica,
        {
          id: equipo.id,
          tipo: equipo.tipo,
          esMaquinaPropia: equipo.esMaquinaPropia,
          horasUso: equipo.horasUso,
          horasAnualesEstimadas: equipo.horasAnualesEstimadas,
          ultimaRevision: equipo.ultimaRevision,
          revisionesContratadasAnual: equipo.revisionesContratadasAnual,
          umbralHorasActual: equipo.umbralHorasActual,
        },
        contrato?.fechaInicio || null
      )
      usarLogica = true
    } else {
      // === PASO 2: fallback legacy ===
      const grupo = contrato?.codGrupoContrato?.toUpperCase()
      const esPorContrato = grupo ? GRUPO_POR_CONTRATO_PATTERN.test(grupo) : false
      const tipoRevision: 'POR_HORAS' | 'POR_CONTRATO' =
        equipo.tipoRevisionManual
          ? (equipo.tipoRevision as 'POR_HORAS' | 'POR_CONTRATO')
          : esPorContrato
            ? 'POR_CONTRATO'
            : 'POR_HORAS'

      let periodicidad = contrato?.periodicidadMeses || 12
      if (
        tipoRevision === 'POR_CONTRATO' &&
        equipo.revisionesContratadasAnual &&
        equipo.revisionesContratadasAnual > 0
      ) {
        periodicidad = Math.round(12 / equipo.revisionesContratadasAnual)
      }

      let proximaRevisionFecha: Date | null = null
      let proximaRevisionHoras: number | null = null
      let umbralHorasActual: number | null = null
      let nivel: string | null = null

      if (tipoRevision === 'POR_CONTRATO') {
        const base = equipo.ultimaRevision || contrato?.fechaInicio || new Date()
        proximaRevisionFecha = new Date(base)
        proximaRevisionFecha.setMonth(proximaRevisionFecha.getMonth() + periodicidad)
        nivel = 'CONTRATO'
      } else {
        const UMBRAL =
          equipo.umbralHorasActual && equipo.umbralHorasActual > 0 ? equipo.umbralHorasActual : 1000
        const prox = Math.ceil((equipo.horasUso + 1) / UMBRAL) * UMBRAL
        if (prox > equipo.horasUso) {
          proximaRevisionHoras = prox
          umbralHorasActual = UMBRAL
          nivel = UMBRAL === 1000 ? 'REVISION_1000H' : 'REVISION_500H'
          if (equipo.horasAnualesEstimadas && equipo.horasAnualesEstimadas > 0) {
            const horasRestantes = prox - equipo.horasUso
            const diasRestantes = Math.ceil((horasRestantes / equipo.horasAnualesEstimadas) * 365)
            proximaRevisionFecha = new Date()
            proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + diasRestantes)
          } else {
            proximaRevisionFecha = new Date()
            proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + 30)
          }
        }
      }

      resultado = {
        logicaAplicada: null,
        tipoRevision,
        proximaRevisionFecha,
        proximaRevisionHoras,
        umbralHorasActual,
        nivel,
        periodicidadMeses: periodicidad,
        explicacion: `Sin lógica aplicable en la tabla Logica. Fallback: revisión ${tipoRevision === 'POR_CONTRATO' ? 'POR_CONTRATO' : 'POR_HORAS'} basada en codGrupoContrato del contrato (${grupo || 'sin grupo'}) y campos del equipo.`,
      }
    }

    // === Persistir cambios ===
    const equipoActualizado = await db.equipo.update({
      where: { id },
      data: {
        tipoRevision: resultado.tipoRevision,
        umbralHorasActual: resultado.umbralHorasActual,
        proximaRevisionHoras: resultado.proximaRevisionHoras,
        proximaRevisionFecha: resultado.proximaRevisionFecha,
      },
    })

    // Borrar revisiones PROGRAMADAS previas y crear nueva
    await db.revisionProgramada.deleteMany({
      where: { equipoId: id, estado: 'PROGRAMADA' },
    })
    if (resultado.proximaRevisionFecha) {
      await db.revisionProgramada.create({
        data: {
          equipoId: id,
          tipo: resultado.tipoRevision,
          nivel: resultado.nivel,
          horasObjetivo: resultado.proximaRevisionHoras,
          fechaProgramada: resultado.proximaRevisionFecha,
          estado: 'PROGRAMADA',
        },
      })
    }

    return NextResponse.json({
      success: true,
      equipo: equipoActualizado,
      logicaAplicada: usarLogica
        ? {
            id: resultado.logicaAplicada?.id,
            nombre: resultado.logicaAplicada?.nombre,
            prioridad: resultado.logicaAplicada?.prioridad,
          }
        : null,
      tipoRevision: resultado.tipoRevision,
      periodicidadMeses: resultado.periodicidadMeses,
      proximaRevisionHoras: resultado.proximaRevisionHoras,
      proximaRevisionFecha: resultado.proximaRevisionFecha,
      nivel: resultado.nivel,
      explicacion: resultado.explicacion,
    })
  } catch (error) {
    console.error('POST /api/equipos/[id]/recalc-revision error:', error)
    return NextResponse.json(
      { error: 'Error al recalcular revisión' },
      { status: 500 }
    )
  }
}
