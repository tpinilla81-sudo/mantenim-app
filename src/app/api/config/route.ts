import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/config
// Devuelve todas las configuraciones globales como un objeto key-value.
// Si una key no existe, devuelve su valor por defecto.
export async function GET() {
  try {
    const configs = await db.appConfig.findMany()
    const map: Record<string, string> = {}
    for (const c of configs) {
      map[c.key] = c.value
    }

    // Defaults si no existen
    const defaults: Record<string, string> = {
      syncReminderInterval: 'mes', // semana | bisemana | mes | nunca
    }

    const result: Record<string, string> = { ...defaults, ...map }

    return NextResponse.json(result)
  } catch (err) {
    console.error('GET /api/config error:', err)
    return NextResponse.json(
      { error: 'Error al obtener configuración', detail: (err as Error).message },
      { status: 500 }
    )
  }
}

// PUT /api/config
// Actualiza una configuración. Body: { key: string, value: string }
// Hace upsert (crea si no existe, actualiza si existe).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Falta "key"' }, { status: 400 })
    }
    if (value == null || typeof value !== 'string') {
      return NextResponse.json({ error: 'Falta "value" (string)' }, { status: 400 })
    }

    const config = await db.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })

    return NextResponse.json(config)
  } catch (err) {
    console.error('PUT /api/config error:', err)
    return NextResponse.json(
      { error: 'Error al guardar configuración', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
