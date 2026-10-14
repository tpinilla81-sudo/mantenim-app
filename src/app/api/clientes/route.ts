import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/clientes — listado con búsqueda opcional y paginación
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const estado = searchParams.get('estado')
    const limit = Math.min(Number(searchParams.get('limit') || '200'), 500)
    const offset = Math.max(Number(searchParams.get('offset') || '0'), 0)

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { nif: { contains: q } },
        { ciudad: { contains: q } },
        { contactoNombre: { contains: q } },
      ]
    }
    if (estado && estado !== 'TODOS') where.estado = estado

    const [clientes, total] = await Promise.all([
      db.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: {
          _count: {
            select: { equipos: true, contratos: true },
          },
        },
        take: limit,
        skip: offset,
      }),
      db.cliente.count({ where }),
    ])
    return NextResponse.json({ data: clientes, total, limit, offset })
  } catch (error) {
    console.error('GET /api/clientes error:', error)
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
  }
}

// POST /api/clientes — crear nuevo cliente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      nombre, nif, email, telefono, direccion, ciudad, codigoPostal,
      contactoNombre, contactoEmail, contactoTelefono, estado, notas,
    } = body

    if (!nombre || !nif) {
      return NextResponse.json({ error: 'Nombre y NIF son obligatorios' }, { status: 400 })
    }

    const cliente = await db.cliente.create({
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
    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    console.error('POST /api/clientes error:', error)
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
  }
}
