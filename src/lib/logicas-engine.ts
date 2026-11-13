// Motor de cálculo de próximas revisiones basado en la tabla Logica.
//
// Cada lógica es una regla con criterios (tipoEquipo, esMaquinaPropia) y
// configuración de cálculo (tipoRevision, umbralHoras, periodicidadMeses,
// revisionesAnual, nivel, servicio). El motor:
//   1. Carga todas las lógicas activas ordenadas por prioridad ascendente.
//   2. Encuentra la primera que coincida con el equipo.
//   3. Calcula la próxima revisión según su configuración.
//
// Si no hay lógica aplicable, devuelve null para que el llamador haga fallback.

import { db } from '@/lib/db'

export interface LogicaAplicable {
  id: string
  nombre: string
  tipoEquipo: string | null
  esMaquinaPropia: string | null
  tipoRevision: string
  umbralHoras: number | null
  periodicidadMeses: number | null
  revisionesAnual: number | null
  nivel: string | null
  servicio: string | null
  formula: string | null
  prioridad: number
}

export interface EquipoInput {
  id: string
  tipo: string
  esMaquinaPropia: boolean
  horasUso: number
  horasAnualesEstimadas: number | null
  ultimaRevision: Date | null
  revisionesContratadasAnual: number | null
  umbralHorasActual: number | null
}

export interface ResultadoCalculo {
  logicaAplicada: LogicaAplicable | null
  tipoRevision: 'POR_HORAS' | 'POR_CONTRATO'
  proximaRevisionFecha: Date | null
  proximaRevisionHoras: number | null
  umbralHorasActual: number | null
  nivel: string | null
  periodicidadMeses: number | null
  // Texto humano explicando qué se aplicó
  explicacion: string
}

// Carga las lógicas activas ordenadas por prioridad.
// Se llama por petición; el set es pequeño (<100 reglas típicamente).
export async function cargarLogicasActivas(): Promise<LogicaAplicable[]> {
  const logicas = await db.logica.findMany({
    where: { activa: true },
    orderBy: [{ prioridad: 'asc' }, { nombre: 'asc' }],
  })
  return logicas.map((l) => ({
    id: l.id,
    nombre: l.nombre,
    tipoEquipo: l.tipoEquipo,
    esMaquinaPropia: l.esMaquinaPropia,
    tipoRevision: l.tipoRevision,
    umbralHoras: l.umbralHoras,
    periodicidadMeses: l.periodicidadMeses,
    revisionesAnual: l.revisionesAnual,
    nivel: l.nivel,
    servicio: l.servicio,
    formula: l.formula,
    prioridad: l.prioridad,
  }))
}

// Encuentra la primera lógica activa que coincida con el equipo.
// Criterios de match (todos opcional, null/undefined = comodín):
//   - tipoEquipo: debe ser exactamente igual al eq.tipo
//   - esMaquinaPropia: 'SI' si el equipo es propia, 'NO' si no
export function encontrarLogicaAplicable(
  logicas: LogicaAplicable[],
  eq: { tipo: string; esMaquinaPropia: boolean }
): LogicaAplicable | null {
  for (const l of logicas) {
    if (l.tipoEquipo && l.tipoEquipo !== eq.tipo) continue
    if (l.esMaquinaPropia) {
      const want = eq.esMaquinaPropia ? 'SI' : 'NO'
      if (l.esMaquinaPropia !== want) continue
    }
    return l // primera que coincide gana
  }
  return null
}

// Calcula la próxima revisión según la lógica aplicable y los datos del equipo.
// Si la lógica es POR_CONTRATO y el equipo tiene `revisionesContratadasAnual`,
// se usa para derivar la periodicidad (periodicidad = 12 / N).
// Si no, se usa periodicidadMeses de la lógica (default 12).
export function calcularProximaRevision(
  logica: LogicaAplicable,
  eq: EquipoInput,
  fechaInicioContrato: Date | null
): ResultadoCalculo {
  let periodicidadMeses: number | null = null
  let proximaRevisionFecha: Date | null = null
  let proximaRevisionHoras: number | null = null
  let umbralHorasActual: number | null = null
  let nivel: string | null = logica.nivel

  if (logica.tipoRevision === 'POR_CONTRATO') {
    // Periodicidad: preferir revisionesAnual del equipo (más específico);
    // si no, usar revisionesAnual de la lógica; si no, periodicidadMeses; default 12.
    const revAnual = eq.revisionesContratadasAnual || logica.revisionesAnual
    if (revAnual && revAnual > 0) {
      periodicidadMeses = 12 / revAnual
    } else if (logica.periodicidadMeses) {
      periodicidadMeses = logica.periodicidadMeses
    } else {
      periodicidadMeses = 12
    }
    const base = eq.ultimaRevision || fechaInicioContrato || new Date()
    proximaRevisionFecha = new Date(base)
    // Redondear meses para evitar fracciones raras (ej: 4 rev/año → 3 meses exactos)
    proximaRevisionFecha.setMonth(
      proximaRevisionFecha.getMonth() + Math.max(1, Math.round(periodicidadMeses))
    )
    nivel = nivel || 'CONTRATO'
  } else {
    // POR_HORAS
    const UMBRAL =
      logica.umbralHoras && logica.umbralHoras > 0
        ? logica.umbralHoras
        : eq.umbralHorasActual && eq.umbralHorasActual > 0
          ? eq.umbralHorasActual
          : 500
    const prox = Math.ceil((eq.horasUso + 1) / UMBRAL) * UMBRAL
    if (prox > eq.horasUso) {
      proximaRevisionHoras = prox
      umbralHorasActual = UMBRAL
      nivel = nivel || (UMBRAL === 1000 ? 'REVISION_1000H' : 'REVISION_500H')
      if (eq.horasAnualesEstimadas && eq.horasAnualesEstimadas > 0) {
        const horasRestantes = prox - eq.horasUso
        const diasRestantes = Math.ceil((horasRestantes / eq.horasAnualesEstimadas) * 365)
        proximaRevisionFecha = new Date()
        proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + diasRestantes)
      } else {
        // Fallback: hoy + 30 días
        proximaRevisionFecha = new Date()
        proximaRevisionFecha.setDate(proximaRevisionFecha.getDate() + 30)
      }
    }
  }

  const tipoRevision = logica.tipoRevision as 'POR_HORAS' | 'POR_CONTRATO'

  // Explicación legible
  let explicacion: string
  if (logica.tipoRevision === 'POR_CONTRATO') {
    const revAnual = eq.revisionesContratadasAnual || logica.revisionesAnual
    if (revAnual) {
      const meses = 12 / revAnual
      explicacion = `Aplicada lógica "${logica.nombre}" (prioridad ${logica.prioridad}): POR_CONTRATO con ${revAnual} revisiones/año (cada ${meses % 1 === 0 ? meses : meses.toFixed(1)} meses) desde ${eq.ultimaRevision ? 'última revisión' : 'fecha inicio contrato'}.`
    } else {
      explicacion = `Aplicada lógica "${logica.nombre}" (prioridad ${logica.prioridad}): POR_CONTRATO cada ${periodicidadMeses} meses desde ${eq.ultimaRevision ? 'última revisión' : 'fecha inicio contrato'}.`
    }
  } else {
    explicacion = `Aplicada lógica "${logica.nombre}" (prioridad ${logica.prioridad}): POR_HORAS con umbral ${umbralHorasActual}h (próxima a ${proximaRevisionHoras?.toLocaleString('es-ES')}h).`
  }

  return {
    logicaAplicada: logica,
    tipoRevision,
    proximaRevisionFecha,
    proximaRevisionHoras,
    umbralHorasActual,
    nivel,
    periodicidadMeses,
    explicacion,
  }
}

// Versión de simulación (no escribe en DB, no requiere equipo real).
// Útil para el simulador de la vista LogicasView.
export function simularDesdeLogica(
  logica: LogicaAplicable,
  input: {
    horas: number
    horasAnuales: number
    ultimaRevisionISO: string | null
    revisionesContratadasAnual: number | null
    umbralHorasActual: number | null
  }
): ResultadoCalculo {
  const eq: EquipoInput = {
    id: '__sim__',
    tipo: '__sim__',
    esMaquinaPropia: false,
    horasUso: input.horas,
    horasAnualesEstimadas: input.horasAnuales || null,
    ultimaRevision: input.ultimaRevisionISO ? new Date(input.ultimaRevisionISO) : null,
    revisionesContratadasAnual: input.revisionesContratadasAnual,
    umbralHorasActual: input.umbralHorasActual,
  }
  return calcularProximaRevision(logica, eq, null)
}
