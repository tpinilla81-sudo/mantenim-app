import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/sync — Estado actual de la sincronización
export async function GET() {
  try {
    const ultimoSync = await db.syncLog.findFirst({
      orderBy: { fecha: 'desc' },
    })

    const totalSyncs = await db.syncLog.count()
    const totalClientes = await db.cliente.count()
    const totalContratos = await db.contrato.count()
    const contratosActivos = await db.contrato.count({ where: { estado: 'ACTIVO' } })
    const contratosVencidos = await db.contrato.count({ where: { estado: 'VENCIDO' } })

    // Calcular días desde el último sync
    let diasDesdeUltimoSync: number | null = null
    let syncCaducado = false
    if (ultimoSync) {
      const ahora = new Date()
      const diff = ahora.getTime() - ultimoSync.fecha.getTime()
      diasDesdeUltimoSync = Math.floor(diff / (1000 * 60 * 60 * 24))
      syncCaducado = diasDesdeUltimoSync >= 30
    }

    return NextResponse.json({
      ultimoSync: ultimoSync
        ? {
            id: ultimoSync.id,
            fecha: ultimoSync.fecha,
            fileName: ultimoSync.fileName,
            fileSize: ultimoSync.fileSize,
            rowsTotal: ultimoSync.rowsTotal,
            rowsCreated: ultimoSync.rowsCreated,
            rowsUpdated: ultimoSync.rowsUpdated,
            rowsSkipped: ultimoSync.rowsSkipped,
            rowsFailed: ultimoSync.rowsFailed,
            clientesNuevos: ultimoSync.clientesNuevos,
            contratosNuevos: ultimoSync.contratosNuevos,
            contratosActualizados: ultimoSync.contratosActualizados,
            status: ultimoSync.status,
            duracionMs: ultimoSync.duracionMs,
            syncType: ultimoSync.syncType,
          }
        : null,
      diasDesdeUltimoSync,
      syncCaducado,
      umbralCaducidadDias: 30,
      totalSyncs,
      totalClientes,
      totalContratos,
      contratosActivos,
      contratosVencidos,
    })
  } catch (error) {
    console.error('GET /api/sync error:', error)
    return NextResponse.json(
      { error: 'Error al obtener estado de sincronización' },
      { status: 500 }
    )
  }
}
