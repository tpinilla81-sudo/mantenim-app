import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// POST /api/equipos/[id]/toggle-revision
// Alterna el tipo de revisión entre POR_HORAS y POR_CONTRATO
// Recalcula la próxima revisión automáticamente
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const equipo = await db.equipo.findUnique({
      where: { id },
      include: {
        contratos: {
          include: {
            contrato: {
              select: { id: true, numero: true, periodicidadMeses: true, fechaInicio: true, codGrupoContrato: true },
            },
          },
          take: 1,
        },
      },
    })

    if (!equipo) {
      return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    }

    const nuevoTipo = equipo.tipoRevision === 'POR_CONTRATO' ? 'POR_HORAS' : 'POR_CONTRATO'

    // Recalcular próxima revisión según el nuevo tipo
    let proximaRevisionHoras: number | null = null
    let proximaRevisionFecha: Date | null = null
    let umbralHorasActual: number | null = null
    let nivel: string | null = null

    if (nuevoTipo === 'POR_CONTRATO') {
      // Para POR_CONTRATO: usar periodicidad del contrato vinculado (o 12 meses por defecto)
      const contrato = equipo.contratos[0]?.contrato
      const periodicidad = contrato?.periodicidadMeses || 12
      const base = equipo.ultimaRevision || contrato?.fechaInicio || new Date()
      proximaRevisionFecha = new Date(base)
      proximaRevisionFecha.setMonth(proximaRevisionFecha.getMonth() + periodicidad)
      nivel = 'CONTRATO'
    } else {
      // Para POR_HORAS: umbral FIJO de 500h (sin niveles)
      const UMBRAL = 1000
      const proximaHoras = Math.ceil((equipo.horasUso + 1) / UMBRAL) * UMBRAL
      if (proximaHoras > equipo.horasUso) {
        proximaRevisionHoras = proximaHoras
        umbralHorasActual = UMBRAL
        nivel = 'REVISION_500H'
        proximaRevisionFecha = new Date()
        proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + 30)
      }
    }

    // Actualizar equipo
    // Marcar tipoRevisionManual=true para que futuras sincronizaciones no lo sobreescriban
    const equipoActualizado = await db.equipo.update({
      where: { id },
      data: {
        tipoRevision: nuevoTipo,
        tipoRevisionManual: true,
        umbralHorasActual,
        proximaRevisionHoras,
        proximaRevisionFecha,
      },
      include: { cliente: true },
    })

    // Borrar revisiones PROGRAMADAS previas y crear la nueva
    await db.revisionProgramada.deleteMany({
      where: { equipoId: id, estado: 'PROGRAMADA' },
    })
    if (proximaRevisionFecha) {
      await db.revisionProgramada.create({
        data: {
          equipoId: id,
          tipo: nuevoTipo,
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
      nuevoTipo,
      proximaRevisionHoras,
      proximaRevisionFecha,
      nivel,
    })
  } catch (error) {
    console.error('POST /api/equipos/[id]/toggle-revision error:', error)
    return NextResponse.json(
      { error: 'Error al alternar tipo de revisión' },
      { status: 500 }
    )
  }
}
