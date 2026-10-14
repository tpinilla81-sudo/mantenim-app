import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/ordenes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const estado = searchParams.get('estado')
    const tipo = searchParams.get('tipo')
    const tecnicoId = searchParams.get('tecnicoId')
    const equipoId = searchParams.get('equipoId')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { numero: { contains: q } },
        { descripcion: { contains: q } },
      ]
    }
    if (estado && estado !== 'TODOS') where.estado = estado
    if (tipo && tipo !== 'TODOS') where.tipo = tipo
    if (tecnicoId) where.tecnicoId = tecnicoId
    if (equipoId) where.equipoId = equipoId
    if (desde || hasta) {
      where.fechaProgramada = {}
      if (desde) (where.fechaProgramada as Record<string, unknown>).gte = new Date(desde)
      if (hasta) (where.fechaProgramada as Record<string, unknown>).lte = new Date(hasta)
    }

    const ordenes = await db.ordenTrabajo.findMany({
      where,
      orderBy: { fechaProgramada: 'asc' },
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
        contrato: true,
      },
    })
    return NextResponse.json(ordenes)
  } catch (error) {
    console.error('GET /api/ordenes error:', error)
    return NextResponse.json({ error: 'Error al obtener órdenes' }, { status: 500 })
  }
}

// POST /api/ordenes — crear OT
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      numero, equipoId, contratoId, tecnicoId, tipo, estado, prioridad,
      descripcion, observaciones, fechaProgramada, fechaRealizada,
      horasTrabajadas, importe,
    } = body

    if (!numero || !equipoId || !fechaProgramada || !descripcion) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const orden = await db.ordenTrabajo.create({
      data: {
        numero,
        equipoId,
        contratoId: contratoId || null,
        tecnicoId: tecnicoId || null,
        tipo: tipo || 'PREVENTIVO',
        estado: estado || 'PROGRAMADA',
        prioridad: prioridad || 'MEDIA',
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
    return NextResponse.json(orden, { status: 201 })
  } catch (error) {
    console.error('POST /api/ordenes error:', error)
    return NextResponse.json({ error: 'Error al crear orden' }, { status: 500 })
  }
}
