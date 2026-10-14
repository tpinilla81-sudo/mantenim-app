import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/contratos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const estado = searchParams.get('estado')
    const clienteId = searchParams.get('clienteId')

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { numero: { contains: q } },
        { cliente: { nombre: { contains: q } } },
      ]
    }
    if (estado && estado !== 'TODOS') where.estado = estado
    if (clienteId) where.clienteId = clienteId

    const contratos = await db.contrato.findMany({
      where,
      orderBy: { fechaFin: 'desc' },
      include: {
        cliente: true,
        equipos: { include: { equipo: true } },
        _count: { select: { ordenesTrabajo: true } },
      },
    })
    return NextResponse.json(contratos)
  } catch (error) {
    console.error('GET /api/contratos error:', error)
    return NextResponse.json({ error: 'Error al obtener contratos' }, { status: 500 })
  }
}

// POST /api/contratos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      numero, clienteId, fechaInicio, fechaFin, tipoMantenimiento,
      periodicidadMeses, precioAnual, precioVisita, estado,
      fechaProxMantenimiento, condiciones, equipoIds,
    } = body

    if (!numero || !clienteId || !fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const contrato = await db.contrato.create({
      data: {
        numero,
        clienteId,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        tipoMantenimiento: tipoMantenimiento || 'PREVENTIVO',
        periodicidadMeses: Number(periodicidadMeses) || 3,
        precioAnual: Number(precioAnual) || 0,
        precioVisita: precioVisita ? Number(precioVisita) : null,
        estado: estado || 'ACTIVO',
        fechaProxMantenimiento: fechaProxMantenimiento ? new Date(fechaProxMantenimiento) : null,
        condiciones: condiciones || null,
        equipos: equipoIds?.length
          ? { create: equipoIds.map((eid: string) => ({ equipoId: eid })) }
          : undefined,
      },
      include: {
        cliente: true,
        equipos: { include: { equipo: true } },
      },
    })
    return NextResponse.json(contrato, { status: 201 })
  } catch (error) {
    console.error('POST /api/contratos error:', error)
    return NextResponse.json({ error: 'Error al crear contrato' }, { status: 500 })
  }
}
