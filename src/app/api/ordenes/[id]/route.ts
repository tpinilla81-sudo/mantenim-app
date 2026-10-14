import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const orden = await db.ordenTrabajo.findUnique({
      where: { id },
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
        contrato: true,
      },
    })
    if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    return NextResponse.json(orden)
  } catch (error) {
    console.error('GET /api/ordenes/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener orden' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      numero, equipoId, contratoId, tecnicoId, tipo, estado, prioridad,
      descripcion, observaciones, fechaProgramada, fechaRealizada,
      horasTrabajadas, importe,
    } = body

    const orden = await db.ordenTrabajo.update({
      where: { id },
      data: {
        numero,
        equipoId,
        contratoId: contratoId || null,
        tecnicoId: tecnicoId || null,
        tipo,
        estado,
        prioridad,
        descripcion,
        observaciones: observaciones || null,
        fechaProgramada: new Date(fechaProgramada),
        fechaRealizada: fechaRealizada ? new Date(fechaRealizada) : null,
        horasTrabajadas: horasTrabajadas ? Number(horasTrabajadas) : null,
        importe: importe ? Number(importe) : null,
      },
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
        contrato: true,
      },
    })
    return NextResponse.json(orden)
  } catch (error) {
    console.error('PUT /api/ordenes/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar orden' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.ordenTrabajo.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/ordenes/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar orden' }, { status: 500 })
  }
}
