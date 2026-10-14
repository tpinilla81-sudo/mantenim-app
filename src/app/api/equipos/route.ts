import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/equipos — listado con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const tipo = searchParams.get('tipo')
    const estado = searchParams.get('estado')
    const clienteId = searchParams.get('clienteId')
    const tipoRevision = searchParams.get('tipoRevision')
    const limit = Math.min(Number(searchParams.get('limit') || '200'), 500)
    const offset = Math.max(Number(searchParams.get('offset') || '0'), 0)

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { codigo: { contains: q } },
        { marca: { contains: q } },
        { modelo: { contains: q } },
        { numeroSerie: { contains: q } },
        { ubicacion: { contains: q } },
        { codigoProductoBC: { contains: q } },
      ]
    }
    if (tipo && tipo !== 'TODOS') where.tipo = tipo
    if (estado && estado !== 'TODOS') where.estado = estado
    if (clienteId) where.clienteId = clienteId
    if (tipoRevision && tipoRevision !== 'TODOS') where.tipoRevision = tipoRevision

    const [equipos, total] = await Promise.all([
      db.equipo.findMany({
        where,
        orderBy: { codigo: 'asc' },
        include: { cliente: true },
        take: limit,
        skip: offset,
      }),
      db.equipo.count({ where }),
    ])
    return NextResponse.json({ data: equipos, total, limit, offset })
  } catch (error) {
    console.error('GET /api/equipos error:', error)
    return NextResponse.json({ error: 'Error al obtener equipos' }, { status: 500 })
  }
}

// POST /api/equipos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      codigo, tipo, marca, modelo, numeroSerie, anioFabricacion,
      ubicacion, fechaInstalacion, estado, horasUso, ultimaRevision,
      notas, clienteId,
    } = body

    if (!codigo || !tipo || !marca || !modelo || !numeroSerie || !clienteId) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const equipo = await db.equipo.create({
      data: {
        codigo,
        tipo,
        marca,
        modelo,
        numeroSerie,
        anioFabricacion: anioFabricacion ? Number(anioFabricacion) : null,
        ubicacion: ubicacion || null,
        fechaInstalacion: fechaInstalacion ? new Date(fechaInstalacion) : null,
        estado: estado || 'OPERATIVO',
        horasUso: Number(horasUso) || 0,
        ultimaRevision: ultimaRevision ? new Date(ultimaRevision) : null,
        notas: notas || null,
        clienteId,
      },
      include: { cliente: true },
    })
    return NextResponse.json(equipo, { status: 201 })
  } catch (error) {
    console.error('POST /api/equipos error:', error)
    return NextResponse.json({ error: 'Error al crear equipo' }, { status: 500 })
  }
}
