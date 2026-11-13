import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/sync/estado-rutina
//
// Devuelve el estado de cada paso de la rutina de sincronización.
// Para cada paso, comprueba si hay datos en la tabla correspondiente
// y devuelve: completado (bool), count, fecha última actualización.
//
// Pasos:
//   1. Excel 1 · Contratos            → db.contrato.count()
//   2. Excel 2 · Equipos              → db.equipo.count()
//   3. Excel 3 · Líneas contrato      → db.lineaContrato.count()
//   4. Excel 4 · Últimas revisiones   → equipos con ultimaRevision != null
//   5. Excel 5 · Histórico revisiones → RevisionProgramada COMPLETADA
//   6. Recalcular revisiones          → RevisionProgramada PROGRAMADA
export async function GET() {
  try {
    // Conteos simultáneos
    const [
      contratosCount,
      equiposCount,
      lineasCount,
      equiposConUltimaRev,
      revisionesCompletadas,
      revisionesProgramadas,
    ] = await Promise.all([
      db.contrato.count(),
      db.equipo.count(),
      db.lineaContrato.count(),
      db.equipo.count({ where: { ultimaRevision: { not: null } } }),
      db.revisionProgramada.count({ where: { estado: 'COMPLETADA' } }),
      db.revisionProgramada.count({ where: { estado: 'PROGRAMADA' } }),
    ])

    // Fechas de última actualización (la más reciente de cada tabla)
    const [ultimoContrato, ultimoEquipo, ultimaLinea, ultimaRevCompletada, ultimaRevProgramada] =
      await Promise.all([
        db.contrato.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
        db.equipo.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
        db.lineaContrato.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
        db.revisionProgramada.findFirst({
          where: { estado: 'COMPLETADA' },
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
        titulo: 'Excel 1 · Contratos',
        descripcion: 'Contratos de servicio con grupo (M1/M2, ALQLARGO...)',
        excelType: 'contratos' as const,
        completado: contratosCount > 0,
        count: contratosCount,
        fechaUltima: ultimoContrato?.updatedAt || null,
      },
      {
        id: 'excel2',
        num: 2,
        titulo: 'Excel 2 · Equipos',
        descripcion: 'Vínculo contrato ↔ máquina con horas',
        excelType: 'equipos' as const,
        completado: equiposCount > 0,
        count: equiposCount,
        fechaUltima: ultimoEquipo?.updatedAt || null,
      },
      {
        id: 'excel3',
        num: 3,
        titulo: 'Excel 3 · Líneas contrato',
        descripcion: '15 columnas del Excel BC (solo firmados)',
        excelType: 'lineas' as const,
        completado: lineasCount > 0,
        count: lineasCount,
        fechaUltima: ultimaLinea?.updatedAt || null,
      },
      {
        id: 'excel4',
        num: 4,
        titulo: 'Excel 4 · Últimas revisiones',
        descripcion: 'Fecha última revisión por equipo (pedidos completados)',
        excelType: 'revisiones' as const,
        completado: equiposConUltimaRev > 0,
        count: equiposConUltimaRev,
        fechaUltima: ultimoEquipo?.updatedAt || null,
      },
      {
        id: 'excel5',
        num: 5,
        titulo: 'Excel 5 · Histórico revisiones',
        descripcion: 'Histórico de pedidos de servicio (3 años)',
        excelType: 'revisiones' as const,
        completado: revisionesCompletadas > 0,
        count: revisionesCompletadas,
        fechaUltima: ultimaRevCompletada?.updatedAt || null,
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
