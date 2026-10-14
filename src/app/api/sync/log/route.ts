import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/sync/log — Historial de sincronizaciones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get('limit') || '20'), 100)

    const logs = await db.syncLog.findMany({
      orderBy: { fecha: 'desc' },
      take: limit,
    })

    return NextResponse.json(logs)
  } catch (error) {
    console.error('GET /api/sync/log error:', error)
    return NextResponse.json(
      { error: 'Error al obtener historial' },
      { status: 500 }
    )
  }
}
