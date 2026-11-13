import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/sync/estado-rutina
//
// Devuelve el estado de cada paso de la rutina de sincronización.
// Para cada paso, comprueba si hay datos en la tabla correspondiente
// y devuelve: completado (bool), count, fecha última actualización.
//
// Pasos (5 Excels + 1 recalc = 6 total):
//   1. Productos de servicio (en servicio)  → db.equipo.count()
//   2. Lista línea de contrato (firmados)   → db.lineaContrato.count()
//   3. Pedidos de servicio (terminados)     → equipos con ultimaRevision != null
//   4. Histórico pedidos (3 años)           → RevisionProgramada COMPLETADA
//   5. Nº producto + contrato + rev/año    → equipos con revisionesContratadasAnual != null
//   6. Recalcular revisiones                → RevisionProgramada PROGRAMADA
export async function GET() {
  try {
    const [
      equiposCount,
      lineasCount,
      equiposConUltimaRev,
      revisionesCompletadas,
      equiposConRevAnual,
      revisionesProgramadas,
    ] = await Promise.all([
      db.equipo.count(),
      db.lineaContrato.count(),
      db.equipo.count({ where: { ultimaRevision: { not: null } } }),
      db.revisionProgramada.count({ where: { estado: 'COMPLETADA' } }),
      db.equipo.count({ where: { revisionesContratadasAnual: { not: null } } }),
      db.revisionProgramada.count({ where: { estado: 'PROGRAMADA' } }),
    ])

    const [ultimoEquipo, ultimaLinea, ultimaRevCompletada, ultimoEquipoRevAnual, ultimaRevProgramada] =
      await Promise.all([
        db.equipo.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
        db.lineaContrato.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
        db.revisionProgramada.findFirst({
          where: { estado: 'COMPLETADA' },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.equipo.findFirst({
          where: { revisionesContratadasAnual: { not: null } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.revisionProgramada.findFirst({
          where: { estado: 'PROGRAMADA' },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ])

    const pasos = [
      {
        id: 'excel1',
        num: 1,
        titulo: 'Productos de servicio (en servicio)',
        descripcion: 'Lista de máquinas/productos de BC activos',
        excelType: 'productos' as const,
        completado: equiposCount > 0,
        count: equiposCount,
        fechaUltima: ultimoEquipo?.updatedAt || null,
      },
      {
        id: 'excel2',
        num: 2,
        titulo: 'Lista línea de contrato (firmados)',
        descripcion: '15 columnas del Excel BC — solo contratos firmados',
        excelType: 'lineas' as const,
        completado: lineasCount > 0,
        count: lineasCount,
        fechaUltima: ultimaLinea?.updatedAt || null,
      },
      {
        id: 'excel3',
        num: 3,
        titulo: 'Pedidos de servicio (terminados)',
        descripcion: 'Última revisión por producto — pedidos completados',
        excelType: 'pedidos' as const,
        completado: equiposConUltimaRev > 0,
        count: equiposConUltimaRev,
        fechaUltima: ultimoEquipo?.updatedAt || null,
      },
      {
        id: 'excel4',
        num: 4,
        titulo: 'Histórico pedidos (3 años)',
        descripcion: 'Histórico de revisiones de los últimos 3 años',
        excelType: 'historico' as const,
        completado: revisionesCompletadas > 0,
        count: revisionesCompletadas,
        fechaUltima: ultimaRevCompletada?.updatedAt || null,
      },
      {
        id: 'excel5',
        num: 5,
        titulo: 'Nº producto + contrato + rev/año',
        descripcion: 'Mapa producto → contrato → revisiones anuales',
        excelType: 'revanuales' as const,
        completado: equiposConRevAnual > 0,
        count: equiposConRevAnual,
        fechaUltima: ultimoEquipoRevAnual?.updatedAt || null,
      },
      {
        id: 'recalc',
        num: 6,
        titulo: 'Recalcular revisiones',
        descripcion: 'Aplicar Lógicas → reprogramar próximas revisiones',
        excelType: null,
        completado: revisionesProgramadas > 0,
        count: revisionesProgramadas,
        fechaUltima: ultimaRevProgramada?.updatedAt || null,
        esRecalc: true,
      },
    ]

    const completados = pasos.filter((p) => p.completado).length
    const siguientePendiente = pasos.find((p) => !p.completado)

    return NextResponse.json({
      pasos,
      totalPasos: pasos.length,
      pasosCompletados: completados,
      siguientePendiente: siguientePendiente?.id || null,
      progreso: Math.round((completados / pasos.length) * 100),
    })
  } catch (err) {
    console.error('GET /api/sync/estado-rutina error:', err)
    return NextResponse.json(
      { error: 'Error al obtener estado de rutina', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
