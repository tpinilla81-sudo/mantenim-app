import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/logicas/seed
// Crea un conjunto de reglas por defecto si no existen ya.
// Idempotente: solo crea las que faltan (match por nombre único).
//
// Reglas por defecto:
//   1. Máquina cliente con contrato (M1/M2/FSCR/FSSR) → POR_CONTRATO trimestral
//      (es la del ejemplo del usuario: "no propia + tiene contrato → programar
//      según N° mantenimientos contratados + última revisión")
//   2. Máquina propia (sin contrato) → POR_HORAS cada 500h
//   3. Máquina propia de revisión mayor → POR_HORAS cada 1000h
//   4. Cualquier máquina cliente sin contrato específico → POR_CONTRATO anual
export async function POST() {
  try {
    const seeds = [
      {
        nombre: 'Máquina cliente con contrato — programar por revisiones contratadas',
        descripcion:
          'Si el equipo NO es propio (es del cliente) y tiene contrato de mantenimiento (M1/M2/FSCR/FSSR), la próxima revisión se calcula a partir del número de revisiones contratadas al año y de la fecha de la última revisión realizada.',
        tipoEquipo: null,
        esMaquinaPropia: 'NO',
        tipoRevision: 'POR_CONTRATO',
        periodicidadMeses: 3,
        revisionesAnual: 4,
        nivel: 'CONTRATO',
        servicio: null,
        formula: 'próxima = última revisión + (12 / revisionesContratadasAnual) meses',
        activa: true,
        prioridad: 10,
      },
      {
        nombre: 'Máquina propia — revisión cada 500 horas',
        descripcion:
          'Para equipos propios (sin contrato de mantenimiento con cliente), revisión preventiva estándar cada 500 horas de uso. La fecha estimada se calcula con horasAnualesEstimadas.',
        tipoEquipo: null,
        esMaquinaPropia: 'SI',
        tipoRevision: 'POR_HORAS',
        umbralHoras: 500,
        periodicidadMeses: null,
        revisionesAnual: null,
        nivel: 'MEDIA',
        servicio: null,
        formula: 'próxima = ceil(horasUso / 500) * 500; fecha estimada con horasAnualesEstimadas',
        activa: true,
        prioridad: 20,
      },
      {
        nombre: 'Máquina propia — revisión mayor cada 1000 horas',
        descripcion:
          'Para equipos propios que solo requieren revisión mayor (no mantenimiento estándar cada 500h). Aplicar cuando el equipo tenga umbralHorasActual = 1000.',
        tipoEquipo: null,
        esMaquinaPropia: 'SI',
        tipoRevision: 'POR_HORAS',
        umbralHoras: 1000,
        periodicidadMeses: null,
        revisionesAnual: null,
        nivel: 'GRANDE',
        servicio: null,
        formula: 'próxima = ceil(horasUso / 1000) * 1000; revisión mayor',
        activa: true,
        prioridad: 30,
      },
      {
        nombre: 'Máquina cliente sin contrato específico — anual por defecto',
        descripcion:
          'Fallback para máquinas cliente cuyo contrato no especifica grupo (sin M1/M2/FSCR/FSSR). Revisión anual por defecto.',
        tipoEquipo: null,
        esMaquinaPropia: 'NO',
        tipoRevision: 'POR_CONTRATO',
        periodicidadMeses: 12,
        revisionesAnual: 1,
        nivel: 'CONTRATO',
        servicio: null,
        formula: 'próxima = última revisión + 12 meses',
        activa: true,
        prioridad: 100,
      },
    ]

    const creadas: string[] = []
    const saltadas: string[] = []

    for (const seed of seeds) {
      const existente = await db.logica.findUnique({
        where: { nombre: seed.nombre },
      })
      if (existente) {
        saltadas.push(seed.nombre)
        continue
      }
      await db.logica.create({ data: seed })
      creadas.push(seed.nombre)
    }

    return NextResponse.json({
      ok: true,
      creadas: creadas.length,
      saltadas: saltadas.length,
      detalle: { creadas, saltadas },
    })
  } catch (error) {
    console.error('POST /api/logicas/seed error:', error)
    return NextResponse.json(
      { error: 'Error al crear lógicas por defecto', detail: (error as Error).message },
      { status: 500 }
    )
  }
}
