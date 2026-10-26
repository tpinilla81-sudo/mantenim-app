import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/hoy — Trabajo del día: lo que toca hoy + lo más vencido + equipos cerca de umbral
// Query params:
//   ?zona=A10  → filtra por zona del cliente (S2, A10, B100, etc.)
//   ?incluir7d=true → incluye también las programadas en los próximos 7 días
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const zona = searchParams.get('zona') // S2, A10, B100, etc.
    const incluir7d = searchParams.get('incluir7d') !== 'false' // default true

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)
    const en7dias = new Date(hoy)
    en7dias.setDate(en7dias.getDate() + 7)

    // Filtro de zona: se aplica a través del equipo.cliente
    const clienteWhere = zona && zona !== 'TODAS' ? { zona } : {}

    // Marcar como VENCIDAS todas las PROGRAMADAS con fecha pasada (bulk)
    await db.revisionProgramada.updateMany({
      where: { estado: 'PROGRAMADA', fechaProgramada: { lt: hoy } },
      data: { estado: 'VENCIDA' },
    })

    // 1. Revisiones que tocan HOY (programadas para hoy)
    const revisionesHoy = await db.revisionProgramada.findMany({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: hoy, lt: manana },
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 100,
      include: {
        equipo: { include: { cliente: true } },
      },
    })

    // 2. OTs programadas para HOY
    const otsHoy = await db.ordenTrabajo.findMany({
      where: {
        fechaProgramada: { gte: hoy, lt: manana },
        estado: { in: ['PROGRAMADA', 'EN_PROCESO'] },
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 100,
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
      },
    })

    // 3. Las 10 revisiones vencidas MÁS antiguas (top prioridad)
    const vencidasTop = await db.revisionProgramada.findMany({
      where: {
        estado: 'VENCIDA',
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 10,
      include: {
        equipo: { include: { cliente: true } },
      },
    })

    // 4. Próximos 7 días (revisiones programadas en la semana)
    const proximos7dias = incluir7d ? await db.revisionProgramada.findMany({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: manana, lte: en7dias },
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 50,
      include: {
        equipo: { include: { cliente: true } },
      },
    }) : []

    // 5. Equipos POR_HORAS cerca de umbral (a ≤ 50h de su próxima revisión)
    const equiposCercaUmbralRaw = await db.equipo.findMany({
      where: {
        esHistorico: false,
        tipoRevision: 'POR_HORAS',
        proximaRevisionHoras: { not: null },
        cliente: clienteWhere,
      },
      orderBy: { proximaRevisionHoras: 'asc' },
      take: 200,
      include: { cliente: true },
    })
    const equiposCercaUmbral = equiposCercaUmbralRaw
      .filter((e) => {
        if (e.proximaRevisionHoras == null) return false
        const diferencia = e.proximaRevisionHoras - e.horasUso
        return diferencia <= 50 && diferencia > 0
      })
      .slice(0, 15)

    // 6. Stats rápidas para el resumen superior
    const totalRevisionesHoy = revisionesHoy.length
    const totalOtsHoy = otsHoy.length
    const totalVencidas = await db.revisionProgramada.count({
      where: {
        estado: 'VENCIDA',
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
    })
    const totalProgramadas7dias = await db.revisionProgramada.count({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: hoy, lte: en7dias },
        equipo: { cliente: clienteWhere, esHistorico: false },
      },
    })
    const totalEquiposCercaUmbral = equiposCercaUmbral.length

    return NextResponse.json({
      fecha: hoy.toISOString(),
      zonaFiltrada: zona || 'TODAS',
      resumen: {
        revisionesHoy: totalRevisionesHoy,
        otsHoy: totalOtsHoy,
        vencidas: totalVencidas,
        proximos7dias: totalProgramadas7dias,
        equiposCercaUmbral: totalEquiposCercaUmbral,
      },
      revisionesHoy,
      otsHoy,
      vencidasTop,
      proximos7dias,
      equiposCercaUmbral,
    })
  } catch (error) {
    console.error('GET /api/hoy error:', error)
    return NextResponse.json(
      { error: 'Error al obtener datos del día' },
      { status: 500 }
    )
  }
}
