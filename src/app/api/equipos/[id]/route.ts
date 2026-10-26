import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const equipo = await db.equipo.findUnique({
      where: { id },
      include: {
        cliente: true,
        contratos: { include: { contrato: true } },
        ordenesTrabajo: {
          orderBy: { fechaProgramada: 'desc' },
          take: 20,
          include: { tecnico: true },
        },
      },
    })
    if (!equipo) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    return NextResponse.json(equipo)
  } catch (error) {
    console.error('GET /api/equipos/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener equipo' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      codigo, tipo, marca, modelo, numeroSerie, anioFabricacion,
      ubicacion, fechaInstalacion, estado, horasUso, ultimaRevision,
      notas, clienteId, revisionesContratadasAnual,
    } = body

    const equipo = await db.equipo.update({
      where: { id },
      data: {
        codigo,
        tipo,
        marca,
        modelo,
        numeroSerie,
        anioFabricacion: anioFabricacion ? Number(anioFabricacion) : null,
        ubicacion: ubicacion || null,
        fechaInstalacion: fechaInstalacion ? new Date(fechaInstalacion) : null,
        estado,
        horasUso: Number(horasUso) || 0,
        ultimaRevision: ultimaRevision ? new Date(ultimaRevision) : null,
        notas: notas || null,
        clienteId,
        // Campo manual: nº de revisiones contratadas al año (null si vacío)
        revisionesContratadasAnual: revisionesContratadasAnual
          ? Number(revisionesContratadasAnual)
          : null,
        // Nuevos campos para distinguir máquinas propias vs del cliente
        esMaquinaPropia: body.esMaquinaPropia === true || body.esMaquinaPropia === 'true',
        horasAnualesEstimadas: body.horasAnualesEstimadas
          ? Number(body.horasAnualesEstimadas)
          : null,
        // Umbral de revisión para máquinas propias (500 o 1000)
        umbralHorasActual: body.umbralHorasActual
          ? Number(body.umbralHorasActual)
          : null,
      },
      include: { cliente: true },
    })
    return NextResponse.json(equipo)
  } catch (error) {
    console.error('PUT /api/equipos/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar equipo' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await db.equipo.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/equipos/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar equipo' }, { status: 500 })
  }
}
