import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/equipos/all — Borra TODOS los equipos y datos relacionados
export async function DELETE() {
  try {
    const result = await db.$transaction([
      db.revisionProgramada.deleteMany(),
      db.ordenTrabajo.deleteMany(),
      db.contratoEquipo.deleteMany(),
      db.equipo.deleteMany(),
    ])
    return NextResponse.json({
      success: true,
      deleted: {
        revisiones: result[0].count,
        ordenes: result[1].count,
        vinculos: result[2].count,
        equipos: result[3].count,
      },
    })
  } catch (error) {
    console.error('DELETE /api/equipos/all error:', error)
    return NextResponse.json({ error: 'Error al borrar equipos' }, { status: 500 })
  }
}
