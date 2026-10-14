import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const contrato = await db.contrato.findUnique({
      where: { id },
      include: {
        cliente: true,
        equipos: { include: { equipo: { include: { cliente: true } } } },
        ordenesTrabajo: {
          orderBy: { fechaProgramada: 'desc' },
          include: { equipo: true, tecnico: true },
        },
      },
    })
    if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
    return NextResponse.json(contrato)
  } catch (error) {
    console.error('GET /api/contratos/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener contrato' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      numero, clienteId, fechaInicio, fechaFin, tipoMantenimiento,
      periodicidadMeses, precioAnual, precioVisita, estado,
      fechaProxMantenimiento, condiciones, equipoIds,
    } = body

    // Reemplazar equipos asociados
    if (equipoIds !== undefined) {
      await db.contratoEquipo.deleteMany({ where: { contratoId: id } })
      if (equipoIds.length > 0) {
        await db.contratoEquipo.createMany({
          data: equipoIds.map((eid: string) => ({ contratoId: id, equipoId: eid })),
        })
      }
    }

    const contrato = await db.contrato.update({
      where: { id },
      data: {
        numero,
        clienteId,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        tipoMantenimiento,
        periodicidadMeses: Number(periodicidadMeses) || 3,
        precioAnual: Number(precioAnual) || 0,
        precioVisita: precioVisita ? Number(precioVisita) : null,
        estado,
        fechaProxMantenimiento: fechaProxMantenimiento ? new Date(fechaProxMantenimiento) : null,
        condiciones: condiciones || null,
      },
      include: {
        cliente: true,
        equipos: { include: { equipo: true } },
      },
    })
    return NextResponse.json(contrato)
  } catch (error) {
    console.error('PUT /api/contratos/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar contrato' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.contrato.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/contratos/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar contrato' }, { status: 500 })
  }
}
