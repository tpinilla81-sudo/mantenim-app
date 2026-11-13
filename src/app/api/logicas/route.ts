import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/logicas — lista todas las reglas de cálculo de revisiones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const soloActivas = searchParams.get('activas') === 'true'

    const where = soloActivas ? { activa: true } : {}

    const logicas = await db.logica.findMany({
      where,
      orderBy: [{ prioridad: 'asc' }, { nombre: 'asc' }],
    })

    return NextResponse.json({ data: logicas, total: logicas.length })
  } catch (err) {
    console.error('GET /api/logicas error:', err)
    return NextResponse.json(
      { error: 'Error al obtener lógicas', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// POST /api/logicas — crea una nueva regla
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validación mínima
    if (!body.nombre || typeof body.nombre !== 'string' || !body.nombre.trim()) {
      return NextResponse.json(
        { error: 'El campo "nombre" es obligatorio' },
        { status: 400 }
      )
    }
    if (!body.tipoRevision || !['POR_HORAS', 'POR_CONTRATO'].includes(body.tipoRevision)) {
      return NextResponse.json(
        { error: 'tipoRevision debe ser "POR_HORAS" o "POR_CONTRATO"' },
        { status: 400 }
      )
    }
    if (body.tipoRevision === 'POR_HORAS' && !body.umbralHoras) {
      return NextResponse.json(
        { error: 'Para POR_HORAS debe indicarse umbralHoras (ej. 500)' },
        { status: 400 }
      )
    }
    if (body.tipoRevision === 'POR_CONTRATO' && !body.periodicidadMeses && !body.revisionesAnual) {
      return NextResponse.json(
        { error: 'Para POR_CONTRATO debe indicarse periodicidadMeses o revisionesAnual' },
        { status: 400 }
      )
    }

    // Normalizar campos vacíos a null
    const data = {
      nombre: body.nombre.trim(),
      descripcion: body.descripcion?.trim() || null,
      tipoEquipo: body.tipoEquipo?.trim() || null,
      esMaquinaPropia: body.esMaquinaPropia?.trim() || null,
      tipoRevision: body.tipoRevision,
      umbralHoras: body.umbralHoras ? Number(body.umbralHoras) : null,
      periodicidadMeses: body.periodicidadMeses ? Number(body.periodicidadMeses) : null,
      revisionesAnual: body.revisionesAnual ? Number(body.revisionesAnual) : null,
      nivel: body.nivel?.trim() || null,
      servicio: body.servicio?.trim() || null,
      formula: body.formula?.trim() || null,
      activa: body.activa !== false,
      prioridad: body.prioridad ? Number(body.prioridad) : 100,
    }

    const logica = await db.logica.create({ data })

    return NextResponse.json(logica, { status: 201 })
  } catch (err) {
    console.error('POST /api/logicas error:', err)
    // Prisma error de unicidad
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Ya existe una lógica con ese nombre' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Error al crear lógica', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
