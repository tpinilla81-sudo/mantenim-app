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

/**
 * LÓGICA DE EQUIPOS CONTRATADOS:
 * Toma la última fecha real de revisión del equipo y le suma los meses correspondientes 
 * según el número de revisiones anuales estipuladas.
 */
export function calcularProximaRevisionContrato(
  ultimaFecha: Date | null, 
  numRevisionesAnuales: number = 1
): string {
  // Si la última fecha existe y es válida, partimos de ella. Si no, usamos la fecha actual como fallback.
  const baseDate = ultimaFecha && !isNaN(ultimaFecha.getTime()) ? new Date(ultimaFecha) : new Date();
  
  const revisiones = numRevisionesAnuales > 0 ? numRevisionesAnuales : 1;
  const mesesIncremento = Math.round(12 / revisiones);
  
  baseDate.setMonth(baseDate.getMonth() + mesesIncremento);
  return baseDate.toISOString().slice(0, 10);
}

/**
 * LÓGICA DE MÁQUINAS PROPIAS POR HORAS:
 * Calcula el siguiente hito exacto en horas (1000, 2000, 3000...) según el rendimiento anual real.
 */
export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const config = getActiveMaintenanceConfig();
  
  const intervaloHoras = config.horasPorRevisionPorModelo[modelo] || config.horasPorRevisionEstandar;
  const proximoHitoHoras = Math.floor(horasTotalesActuales / intervaloHoras) * intervaloHoras + intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasTotalesActuales;

  let horasAlAno = 1200; 
  let fechaUltimoRegistro = new Date();

  if (historicoPedidos && historicoPedidos.length >= 2) {
    const sorted = [...historicoPedidos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const primerRegistro = sorted[0];
    const ultimoRegistro = sorted[sorted.length - 1];
    
    fechaUltimoRegistro = new Date(ultimoRegistro.fecha);

    const diffDias = (ultimoRegistro.fecha.getTime() - primerRegistro.fecha.getTime()) / (1000 * 60 * 60 * 24);
    const diffHoras = ultimoRegistro.horas - primerRegistro.horas;
    
    if (diffDias > 5 && diffHoras > 0) {
      const horasPorDia = diffHoras / diffDias;
      horasAlAno = horasPorDia * 365;
    }
  } else if (historicoPedidos && historicoPedidos.length === 1) {
    fechaUltimoRegistro = new Date(historicoPedidos[0].fecha);
  }

  const diasRestantes = horasAlAno > 0 ? Math.round((horasRestantes / horasAlAno) * 365) : 365;
  const fechaBase = !isNaN(fechaUltimoRegistro.getTime()) ? new Date(fechaUltimoRegistro) : (ultimaFechaRevision || new Date());
  fechaBase.setDate(fechaBase.getDate() + Math.max(diasRestantes, 1));

  return fechaBase.toISOString().slice(0, 10);
}
