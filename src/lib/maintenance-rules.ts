export interface MaintenanceRuleConfig {
  horasPorRevisionEstandar: number;
  horasPorRevisionPorModelo: Record<string, number>;
  mesesRevisionesContratoEstandar: number;
}

export const defaultMaintenanceConfig: MaintenanceRuleConfig = {
  horasPorRevisionEstandar: 1000,
  horasPorRevisionPorModelo: {},
  mesesRevisionesContratoEstandar: 12,
};

export function getActiveMaintenanceConfig(): MaintenanceRuleConfig {
  if (typeof window === 'undefined') return defaultMaintenanceConfig;
  try {
    const saved = localStorage.getItem('mantenim_custom_rules');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error cargando reglas personalizadas', e);
  }
  return defaultMaintenanceConfig;
}

export function calcularProximaRevisionContrato(ultimaFecha: Date | null, numRevisionesAnuales: number = 1): string {
  const baseDate = ultimaFecha && !isNaN(ultimaFecha.getTime()) ? new Date(ultimaFecha) : new Date();
  const revisiones = numRevisionesAnuales > 0 ? numRevisionesAnuales : 1;
  const mesesIncremento = Math.round(12 / revisiones);
  baseDate.setMonth(baseDate.getMonth() + mesesIncremento);
  return baseDate.toISOString().slice(0, 10);
}

/**
 * LÓGICA DE MÁQUINAS PROPIAS:
 * Calcula el ritmo de trabajo anual/diario en base al histórico de horas y determina 
 * la fecha exacta de la siguiente revisión a partir de la última realizada.
 */
export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const config = getActiveMaintenanceConfig();
  
  // 1. Obtener intervalo de horas para revisión (ej: 1000h o regla específica del modelo)
  const intervaloHoras = config.horasPorRevisionPorModelo[modelo] || config.horasPorRevisionEstandar;
  
  // 2. Calcular el siguiente hito de horas (ej: si está en 1.850h y toca cada 1.000h, el hito es 2.000h)
  const proximoHitoHoras = Math.ceil((horasTotalesActuales + 1) / intervaloHoras) * intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasTotalesActuales;

  // 3. Calcular el ritmo de trabajo real (horas al día) usando el histórico de la máquina
  let horasAlDia = 4; // Valor por defecto prudencial (~1.400 horas al año)
  
  if (historicoPedidos && historicoPedidos.length >= 2) {
    // Ordenar histórico cronológicamente
    const sorted = [...historicoPedidos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const primerRegistro = sorted[0];
    const ultimoRegistro = sorted[sorted.length - 1];
    
    const diffDias = (ultimoRegistro.fecha.getTime() - primerRegistro.fecha.getTime()) / (1000 * 60 * 60 * 24);
    const diffHoras = ultimoRegistro.horas - primerRegistro.horas;
    
    if (diffDias > 10 && diffHoras > 0) {
      // Ritmo real de horas trabajadas por día
      horasAlDia = diffHoras / diffDias;
    }
  }

  // 4. Calcular los días que faltan para alcanzar el hito de horas
  const diasRestantes = horasAlDia > 0 ? Math.round(horasRestantes / horasAlDia) : 365;

  // 5. Partir de la fecha de la última revisión real (o fecha actual si no consta) y sumar los días calculados
  const fechaBase = ultimaFechaRevision && !isNaN(ultimaFechaRevision.getTime()) ? new Date(ultimaFechaRevision) : new Date();
  fechaBase.setDate(fechaBase.getDate() + Math.max(diasRestantes, 1));

  return fechaBase.toISOString().slice(0, 10);
}
