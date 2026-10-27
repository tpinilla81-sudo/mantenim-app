import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// Regex: M1, M2, M3... + FSCR + FSSR (todos POR_CONTRATO)
const GRUPO_POR_CONTRATO_PATTERN = /^(M\d+|FSCR|FSSR)$/i

// POST /api/equipos/[id]/recalc-revision
// Recalcula la próxima revisión de un equipo individual (sin cambiar el tipo).
// Útil cuando se actualiza revisionesContratadasAnual manualmente.
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const equipo = await db.equipo.findUnique({
      where: { id },
      include: {
        contratos: {
          include: {
            contrato: {
              select: { id: true, numero: true, codGrupoContrato: true, periodicidadMeses: true, fechaInicio: true },
            },
          },
          take: 1,
        },
      },
    })

    if (!equipo) {
      return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    }

    // Determinar tipo actual (preservar tipoRevisionManual si true)
    const contrato = equipo.contratos[0]?.contrato
    const grupo = contrato?.codGrupoContrato?.toUpperCase()
    const esPorContrato = grupo ? GRUPO_POR_CONTRATO_PATTERN.test(grupo) : false
    const tipoRevision: 'POR_HORAS' | 'POR_CONTRATO' =
      equipo.tipoRevisionManual
        ? (equipo.tipoRevision as 'POR_HORAS' | 'POR_CONTRATO')
        : esPorContrato ? 'POR_CONTRATO' : 'POR_HORAS'

    // Determinar periodicidad
    let periodicidad = contrato?.periodicidadMeses || 12
    if (tipoRevision === 'POR_CONTRATO' && equipo.revisionesContratadasAnual && equipo.revisionesContratadasAnual > 0) {
      periodicidad = Math.round(12 / equipo.revisionesContratadasAnual)
    }

    // Calcular próxima revisión
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
      // POR_HORAS: umbral configurable (500 o 1000) — para máquinas propias
      const UMBRAL = equipo.umbralHorasActual && equipo.umbralHorasActual > 0 ? equipo.umbralHorasActual : 1000
      const prox = Math.ceil((equipo.horasUso + 1) / UMBRAL) * UMBRAL
      if (prox > equipo.horasUso) {
        proximaRevisionHoras = prox
        umbralHorasActual = UMBRAL
        nivel = UMBRAL === 1000 ? 'REVISION_1000H' : 'REVISION_500H'
        // Si tenemos tasa de uso (horasAnualesEstimadas), calcular fecha estimada real
        if (equipo.horasAnualesEstimadas && equipo.horasAnualesEstimadas > 0) {
          const horasRestantes = prox - equipo.horasUso
          const diasRestantes = Math.ceil((horasRestantes / equipo.horasAnualesEstimadas) * 365)
          proximaRevisionFecha = new Date()
          proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + diasRestantes)
        } else {
          // Fallback: hoy + 30 días
          proximaRevisionFecha = new Date()
          proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + 30)
        }
      }
    }

    // Actualizar equipo
    const equipoActualizado = await db.equipo.update({
      where: { id },
      data: {
        tipoRevision,
        umbralHorasActual,
        proximaRevisionHoras,
        proximaRevisionFecha,
      },
    })

    // Borrar revisiones PROGRAMADAS previas y crear nueva
    await db.revisionProgramada.deleteMany({
      where: { equipoId: id, estado: 'PROGRAMADA' },
    })
    if (proximaRevisionFecha) {
      await db.revisionProgramada.create({
        data: {
          equipoId: id,
          tipo: tipoRevision,
          nivel,
          horasObjetivo: proximaRevisionHoras,
          fechaProgramada: proximaRevisionFecha,
          estado: 'PROGRAMADA',
        },
      })
    }

    return NextResponse.json({
      success: true,
      equipo: equipoActualizado,
      tipoRevision,
      periodicidadMeses: periodicidad,
      proximaRevisionHoras,
      proximaRevisionFecha,
      nivel,
    })
  } catch (error) {
    console.error('POST /api/equipos/[id]/recalc-revision error:', error)
    return NextResponse.json(
      { error: 'Error al recalcular revisión' },
      { status: 500 }
    )
  }
}
