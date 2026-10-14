import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET /api/clientes/[id]
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: {
        equipos: {
          orderBy: { codigo: 'asc' },
        },
        contratos: {
          orderBy: { fechaFin: 'desc' },
        },
      },
    })
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    return NextResponse.json(cliente)
  } catch (error) {
    console.error('GET /api/clientes/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener cliente' }, { status: 500 })
  }
}

// PUT /api/clientes/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      nombre, nif, email, telefono, direccion, ciudad, codigoPostal,
      contactoNombre, contactoEmail, contactoTelefono, estado, notas,
    } = body

    const cliente = await db.cliente.update({
      where: { id },
      data: {
        nombre,
        nif,
        email: email || null,
        telefono: telefono || null,
        direccion: direccion || null,
        ciudad: ciudad || null,
        codigoPostal: codigoPostal || null,
        contactoNombre: contactoNombre || null,
        contactoEmail: contactoEmail || null,
        contactoTelefono: contactoTelefono || null,
        estado: estado || 'ACTIVO',
        notas: notas || null,
      },
    })
    return NextResponse.json(cliente)
  } catch (error) {
    console.error('PUT /api/clientes/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 })
  }
}

// DELETE /api/clientes/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.cliente.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/clientes/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 })
  }
}
