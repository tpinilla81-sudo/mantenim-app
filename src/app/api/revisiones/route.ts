import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/revisiones — Lista de revisiones programadas (próximas y vencidas)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado') // PROGRAMADA | VENCIDA | COMPLETADA | TODAS
    const dias = Number(searchParams.get('dias') || '60') // próximos N días
    const limite = Math.min(Number(searchParams.get('limit') || '200'), 500)

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const limiteFecha = new Date(hoy)
    limiteFecha.setDate(limiteFecha.getDate() + dias)

    // Marcar TODAS las PROGRAMADAS con fecha pasada como VENCIDAS (en bulk)
    // Esto cubre las revisiones con fechas antiguas que no se marcaron antes
    await db.revisionProgramada.updateMany({
      where: { estado: 'PROGRAMADA', fechaProgramada: { lt: hoy } },
      data: { estado: 'VENCIDA' },
    })

    // Filtro de estado
    const whereEstado = estado && estado !== 'TODAS' ? { estado } : {}
    // Filtro de fecha: si es PROGRAMADA, mostrar las que tocan en próximos N días O ya vencidas
    const where: Record<string, unknown> = { ...whereEstado }
    if (!estado || estado === 'TODAS' || estado === 'PROGRAMADA') {
      where.OR = [
        { estado: 'VENCIDA' },
        { estado: 'PROGRAMADA', fechaProgramada: { lte: limiteFecha } },
      ]
    }

    const revisiones = await db.revisionProgramada.findMany({
      where,
      orderBy: { fechaProgramada: 'asc' },
      take: limite,
      include: {
        equipo: {
          include: { cliente: true },
        },
      },
    })

    // Estadísticas para el dashboard
    const totalProgramadas = await db.revisionProgramada.count({
      where: { estado: 'PROGRAMADA' },
    })
    const totalVencidas = await db.revisionProgramada.count({
      where: { estado: 'VENCIDA' },
    })
    const totalCompletadas = await db.revisionProgramada.count({
      where: { estado: 'COMPLETADA' },
    })
    const enProximosDias = await db.revisionProgramada.count({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: hoy, lte: limiteFecha },
      },
    })

    return NextResponse.json({
      data: revisiones,
      stats: {
        totalProgramadas,
        totalVencidas,
        totalCompletadas,
        enProximosDias,
        dias,
      },
    })
  } catch (error) {
    console.error('GET /api/revisiones error:', error)
    return NextResponse.json(
      { error: 'Error al obtener revisiones' },
      { status: 500 }
    )
  }
}
