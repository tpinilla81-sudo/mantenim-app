import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/lineas-contrato
// Lista todas las líneas de contrato con filtros opcionales.
// Parámetros soportados:
//   ?grupo=ALQCORTO     — filtra por Cód. grupo contrato
//   ?cliente=430000002  — filtra por Nº cliente
//   ?serie=H2X350M03733 — filtra por Nº serie
//   ?q=texto            — búsqueda libre en descripción / número contrato / serie
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grupo = searchParams.get('grupo')
    const cliente = searchParams.get('cliente')
    const serie = searchParams.get('serie')
    const q = searchParams.get('q')?.trim()
    const limit = Math.min(Number(searchParams.get('limit') || '20000'), 50000)

    const where: Record<string, unknown> = {}
    if (grupo) where.codGrupoContrato = grupo
    if (cliente) where.numeroCliente = cliente
    if (serie) where.numeroSerie = { contains: serie }
    if (q) {
      where.OR = [
        { descripcion: { contains: q } },
        { numeroContrato: { contains: q } },
        { numeroSerie: { contains: q } },
        { nombreCliente: { contains: q } },
      ]
    }

    const lineas = await db.lineaContrato.findMany({
      where,
      orderBy: [
        { numeroContrato: 'asc' },
        { numeroLinea: 'asc' },
      ],
      take: limit,
    })

    return NextResponse.json({ data: lineas, total: lineas.length })
  } catch (err) {
    console.error('GET /api/lineas-contrato error:', err)
    return NextResponse.json(
      { error: 'Error al obtener líneas de contrato', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// POST /api/lineas-contrato
// Crea una línea de contrato individual.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.numeroContrato || !body.numeroLinea) {
      return NextResponse.json(
        { error: 'numeroContrato y numeroLinea son obligatorios' },
        { status: 400 }
      )
    }

    // Buscar match con Equipo por numeroSerie
    let equipoId: string | null = null
    if (body.numeroSerie) {
      const eq = await db.equipo.findUnique({ where: { numeroSerie: String(body.numeroSerie).trim() } })
      if (eq) equipoId = eq.id
    }
    // Buscar match con Cliente por numeroCliente
    let clienteId: string | null = null
    if (body.numeroCliente) {
      const cli = await db.cliente.findFirst({ where: { nif: String(body.numeroCliente).trim() } })
      if (cli) clienteId = cli.id
    }

    const data = {
      estadoContrato: body.estadoContrato || 'Firmado',
      numeroContrato: String(body.numeroContrato).trim(),
      numeroCliente: body.numeroCliente?.toString().trim() || null,
      clienteId,
      nombreCliente: body.nombreCliente?.trim() || null,
      shipToCode: body.shipToCode?.trim() || null,
      codGrupoContrato: body.codGrupoContrato?.trim() || null,
      fechaInicioContrato: body.fechaInicioContrato ? new Date(body.fechaInicioContrato) : null,
      fechaFinContrato: body.fechaFinContrato ? new Date(body.fechaFinContrato) : null,
      numeroLinea: String(body.numeroLinea).trim(),
      numeroProductoServicio: body.numeroProductoServicio?.toString().trim() || null,
      descripcion: body.descripcion?.trim() || null,
      numeroSerie: body.numeroSerie?.trim() || null,
      equipoId,
      fechaInicial: body.fechaInicial ? new Date(body.fechaInicial) : null,
      periodoServicio: body.periodoServicio?.trim() || null,
      siguienteFechaServicio: body.siguienteFechaServicio ? new Date(body.siguienteFechaServicio) : null,
    }

    // Upsert por (numeroContrato, numeroLinea)
    const linea = await db.lineaContrato.upsert({
      where: {
        numeroContrato_numeroLinea: {
          numeroContrato: data.numeroContrato,
          numeroLinea: data.numeroLinea,
        },
      },
      create: data,
      update: data,
    })

    return NextResponse.json(linea, { status: 201 })
  } catch (err) {
    console.error('POST /api/lineas-contrato error:', err)
    return NextResponse.json(
      { error: 'Error al crear línea de contrato', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// DELETE /api/lineas-contrato
// Borra TODAS las líneas de contrato. Útil para re-importar limpio.
export async function DELETE() {
  try {
    const result = await db.lineaContrato.deleteMany({})
    return NextResponse.json({ ok: true, deleted: result.count })
  } catch (err) {
    console.error('DELETE /api/lineas-contrato error:', err)
    return NextResponse.json(
      { error: 'Error al vaciar líneas de contrato', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
