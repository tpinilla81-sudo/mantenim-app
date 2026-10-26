import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/revisiones/[id] — Actualiza el estado de una revisión programada
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { estado, fechaRealizada } = body

    if (!estado) {
      return NextResponse.json(
        { error: 'Falta el estado' },
        { status: 400 }
      )
    }

    const revision = await db.revisionProgramada.update({
      where: { id },
      data: {
        estado,
        fechaRealizada: fechaRealizada ? new Date(fechaRealizada) : estado === 'COMPLETADA' ? new Date() : null,
      },
      include: {
        equipo: {
          select: { id: true, codigo: true, horasUso: true, ultimaRevision: true },
        },
      },
    })

    // Si se marca como completada, actualizar el equipo:
    // - ultimaRevision = fechaRealizada
    // - Recalcular próxima revisión (siguiente umbral o siguiente periodo)
    if (estado === 'COMPLETADA') {
      const equipo = revision.equipo
      const nuevaUltimaRev = revision.fechaRealizada || new Date()

      // Calcular próxima revisión según tipo
      let proximaRevisionHoras: number | null = null
      let proximaRevisionFecha: Date | null = null
      let umbralHorasActual: number | null = null
      let nivel: string | null = null

      if (revision.tipo === 'POR_HORAS') {
        // Para POR_HORAS: umbral FIJO de 500h
        const UMBRAL = 500
        const proximaHoras = Math.ceil((equipo.horasUso + 1) / UMBRAL) * UMBRAL
        if (proximaHoras > equipo.horasUso) {
          proximaRevisionHoras = proximaHoras
          umbralHorasActual = UMBRAL
          nivel = 'REVISION_500H'
          proximaRevisionFecha = new Date()
          proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + 30)
        }
      } else {
        // Para POR_CONTRATO: sumar periodicidad
        const contrato = await db.contratoEquipo.findFirst({
          where: { equipoId: equipo.id },
          include: { contrato: { select: { periodicidadMeses: true } } },
        })
        const periodicidad = contrato?.contrato?.periodicidadMeses || 12
        proximaRevisionFecha = new Date(nuevaUltimaRev)
        proximaRevisionFecha.setMonth(proximaRevisionFecha.getMonth() + periodicidad)
        nivel = 'CONTRATO'
      }

      await db.equipo.update({
        where: { id: equipo.id },
        data: {
          ultimaRevision: nuevaUltimaRev,
          ultimoMantenimientoHoras: equipo.horasUso,
          proximaRevisionHoras,
          proximaRevisionFecha,
          umbralHorasActual,
        },
      })

      // Crear la próxima revisión programada
      if (proximaRevisionFecha) {
        await db.revisionProgramada.create({
          data: {
            equipoId: equipo.id,
            tipo: revision.tipo,
            nivel,
            horasObjetivo: proximaRevisionHoras,
            fechaProgramada: proximaRevisionFecha,
            estado: 'PROGRAMADA',
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      revision,
    })
  } catch (error) {
    console.error('PATCH /api/revisiones/[id] error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar revisión' },
      { status: 500 }
    )
  }
}

// DELETE /api/revisiones/[id] — Elimina una revisión
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.revisionProgramada.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/revisiones/[id] error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar revisión' },
      { status: 500 }
    )
  }
}
