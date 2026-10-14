import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/tecnicos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const estado = searchParams.get('estado')

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { apellidos: { contains: q } },
        { especialidad: { contains: q } },
      ]
    }
    if (estado && estado !== 'TODOS') where.estado = estado

    const tecnicos = await db.tecnico.findMany({
      where,
      orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
      include: { _count: { select: { ordenesTrabajo: true } } },
    })
    return NextResponse.json(tecnicos)
  } catch (error) {
    console.error('GET /api/tecnicos error:', error)
    return NextResponse.json({ error: 'Error al obtener técnicos' }, { status: 500 })
  }
}

// POST /api/tecnicos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nombre, apellidos, dni, especialidad, email, telefono, estado } = body
    if (!nombre || !apellidos) {
      return NextResponse.json({ error: 'Nombre y apellidos son obligatorios' }, { status: 400 })
    }
    const tecnico = await db.tecnico.create({
      data: {
        nombre,
        apellidos,
        dni: dni || null,
        especialidad: especialidad || null,
        email: email || null,
        telefono: telefono || null,
        estado: estado || 'ACTIVO',
      },
    })
    return NextResponse.json(tecnico, { status: 201 })
  } catch (error) {
    console.error('POST /api/tecnicos error:', error)
    return NextResponse.json({ error: 'Error al crear técnico' }, { status: 500 })
  }
}
