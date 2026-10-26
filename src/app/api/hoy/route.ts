import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/hoy — Trabajo del día: lo que toca hoy + lo más vencido + equipos cerca de umbral
export async function GET() {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)
    const en7dias = new Date(hoy)
    en7dias.setDate(en7dias.getDate() + 7)

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
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 50,
      include: {
        equipo: { include: { cliente: true } },
      },
    })

    // 2. OTs programadas para HOY
    const otsHoy = await db.ordenTrabajo.findMany({
      where: {
        fechaProgramada: { gte: hoy, lt: manana },
        estado: { in: ['PROGRAMADA', 'EN_PROCESO'] },
      },
      orderBy: { fechaProgramada: 'asc' },
      take: 50,
      include: {
        equipo: { include: { cliente: true } },
        tecnico: true,
      },
    })

    // 3. Las 10 revisiones vencidas MÁS antiguas (top prioridad)
    const vencidasTop = await db.revisionProgramada.findMany({
      where: { estado: 'VENCIDA' },
      orderBy: { fechaProgramada: 'asc' },
      take: 10,
      include: {
        equipo: { include: { cliente: true } },
      },
    })

    // 4. Equipos POR_HORAS cerca de umbral (a ≤ 50h de su próxima revisión)
    const equiposCercaUmbralRaw = await db.equipo.findMany({
      where: {
        esHistorico: false,
        tipoRevision: 'POR_HORAS',
        proximaRevisionHoras: { not: null },
      },
      orderBy: { proximaRevisionHoras: 'asc' },
      take: 200,
      include: { cliente: true },
    })
    // Filtrar los que están a <= 50h del umbral
    const equiposCercaUmbral = equiposCercaUmbralRaw
      .filter((e) => {
        if (e.proximaRevisionHoras == null) return false
        const diferencia = e.proximaRevisionHoras - e.horasUso
        return diferencia <= 50 && diferencia > 0
      })
      .slice(0, 15)

    // 5. Stats rápidas para el resumen superior
    const totalRevisionesHoy = revisionesHoy.length
    const totalOtsHoy = otsHoy.length
    const totalVencidas = await db.revisionProgramada.count({ where: { estado: 'VENCIDA' } })
    const totalProgramadas7dias = await db.revisionProgramada.count({
      where: {
        estado: 'PROGRAMADA',
        fechaProgramada: { gte: hoy, lte: en7dias },
      },
    })
    const totalEquiposCercaUmbral = equiposCercaUmbral.length

    return NextResponse.json({
      fecha: hoy.toISOString(),
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
