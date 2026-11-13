import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface Params {
  params: Promise<{ id: string }>
}

// GET /api/logicas/[id] — detalle de una lógica
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const logica = await db.logica.findUnique({ where: { id } })
    if (!logica) {
      return NextResponse.json({ error: 'Lógica no encontrada' }, { status: 404 })
    }
    return NextResponse.json(logica)
  } catch (err) {
    console.error('GET /api/logicas/[id] error:', err)
    return NextResponse.json(
      { error: 'Error al obtener lógica', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// PUT /api/logicas/[id] — actualiza una lógica
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verificar existencia
    const existente = await db.logica.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json({ error: 'Lógica no encontrada' }, { status: 404 })
    }

    // Construir objeto de actualización solo con campos presentes
    const data: Record<string, unknown> = {}
    if (body.nombre !== undefined) data.nombre = String(body.nombre).trim()
    if (body.descripcion !== undefined) data.descripcion = body.descripcion?.trim() || null
    if (body.tipoEquipo !== undefined) data.tipoEquipo = body.tipoEquipo?.trim() || null
    if (body.esMaquinaPropia !== undefined) data.esMaquinaPropia = body.esMaquinaPropia?.trim() || null
    if (body.tipoRevision !== undefined) {
      if (!['POR_HORAS', 'POR_CONTRATO'].includes(body.tipoRevision)) {
        return NextResponse.json(
          { error: 'tipoRevision debe ser "POR_HORAS" o "POR_CONTRATO"' },
          { status: 400 }
        )
      }
      data.tipoRevision = body.tipoRevision
    }
    if (body.umbralHoras !== undefined) data.umbralHoras = body.umbralHoras ? Number(body.umbralHoras) : null
    if (body.periodicidadMeses !== undefined) data.periodicidadMeses = body.periodicidadMeses ? Number(body.periodicidadMeses) : null
    if (body.revisionesAnual !== undefined) data.revisionesAnual = body.revisionesAnual ? Number(body.revisionesAnual) : null
    if (body.nivel !== undefined) data.nivel = body.nivel?.trim() || null
    if (body.servicio !== undefined) data.servicio = body.servicio?.trim() || null
    if (body.formula !== undefined) data.formula = body.formula?.trim() || null
    if (body.activa !== undefined) data.activa = Boolean(body.activa)
    if (body.prioridad !== undefined) data.prioridad = Number(body.prioridad)

    const logica = await db.logica.update({ where: { id }, data })
    return NextResponse.json(logica)
  } catch (err) {
    console.error('PUT /api/logicas/[id] error:', err)
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Ya existe una lógica con ese nombre' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Error al actualizar lógica', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// DELETE /api/logicas/[id] — elimina una lógica
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existente = await db.logica.findUnique({ where: { id } })
    if (!existente) {
      return NextResponse.json({ error: 'Lógica no encontrada' }, { status: 404 })
    }
    await db.logica.delete({ where: { id } })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('DELETE /api/logicas/[id] error:', err)
    return NextResponse.json(
      { error: 'Error al eliminar lógica', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
