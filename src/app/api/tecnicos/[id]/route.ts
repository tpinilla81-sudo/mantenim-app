import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const tecnico = await db.tecnico.findUnique({
      where: { id },
      include: {
        ordenesTrabajo: {
          orderBy: { fechaProgramada: 'desc' },
          take: 20,
          include: { equipo: true },
        },
      },
    })
    if (!tecnico) return NextResponse.json({ error: 'Técnico no encontrado' }, { status: 404 })
    return NextResponse.json(tecnico)
  } catch (error) {
    console.error('GET /api/tecnicos/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener técnico' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nombre, apellidos, dni, especialidad, email, telefono, estado } = body
    const tecnico = await db.tecnico.update({
      where: { id },
      data: {
        nombre,
        apellidos,
        dni: dni || null,
        especialidad: especialidad || null,
        email: email || null,
        telefono: telefono || null,
        estado,
      },
    })
    return NextResponse.json(tecnico)
  } catch (error) {
    console.error('PUT /api/tecnicos/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar técnico' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.tecnico.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/tecnicos/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar técnico' }, { status: 500 })
  }
}
