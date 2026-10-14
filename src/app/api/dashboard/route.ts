import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/dashboard — KPIs globales
export async function GET() {
  try {
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59)
    const en30Dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 30)
    const en60Dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 60)

    const [
      totalClientes,
      totalEquipos,
      totalContratos,
      totalTecnicos,
      totalOrdenes,
      ordenesPendientes,
      ordenesCompletadasMes,
      contratosPorVencer,
      equiposPorEstado,
      ordenesPorTipo,
      ordenesPorEstado,
      ingresosMes,
    ] = await Promise.all([
      db.cliente.count({ where: { estado: 'ACTIVO' } }),
      db.equipo.count(),
      db.contrato.count({ where: { estado: 'ACTIVO' } }),
      db.tecnico.count({ where: { estado: 'ACTIVO' } }),
      db.ordenTrabajo.count(),
      db.ordenTrabajo.count({
        where: {
          estado: { in: ['PROGRAMADA', 'EN_PROCESO'] },
          fechaProgramada: { lte: en30Dias },
        },
      }),
      db.ordenTrabajo.count({
        where: {
          estado: 'COMPLETADA',
          fechaRealizada: { gte: inicioMes, lte: finMes },
        },
      }),
      db.contrato.findMany({
        where: {
          estado: 'ACTIVO',
          fechaFin: { gte: hoy, lte: en60Dias },
        },
        include: { cliente: true },
        orderBy: { fechaFin: 'asc' },
      }),
      db.equipo.groupBy({
        by: ['estado'],
        _count: true,
      }),
      db.ordenTrabajo.groupBy({
        by: ['tipo'],
        _count: true,
      }),
      db.ordenTrabajo.groupBy({
        by: ['estado'],
        _count: true,
      }),
      db.ordenTrabajo.aggregate({
        _sum: { importe: true },
        where: {
          estado: 'COMPLETADA',
          fechaRealizada: { gte: inicioMes, lte: finMes },
        },
      }),
    ])

    // Mantenimientos próximos (próximos 30 días)
    const mantenimientosProximos = await db.ordenTrabajo.findMany({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: hoy, lte: en30Dias },
      },
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 10,
    })

    return NextResponse.json({
      kpis: {
        totalClientes,
        totalEquipos,
        totalContratos,
        totalTecnicos,
        totalOrdenes,
        ordenesPendientes,
        ordenesCompletadasMes,
        ingresosMes: ingresosMes._sum.importe || 0,
      },
      contratosPorVencer,
      mantenimientosProximos,
      distribucionEquipos: equiposPorEstado,
      distribucionOrdenesTipo: ordenesPorTipo,
      distribucionOrdenesEstado: ordenesPorEstado,
    })
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 })
  }
}
