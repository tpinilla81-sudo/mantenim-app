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
 * LÓGICA DE MÁQUINAS PROPIAS POR HORAS:
 * 1. Calcula el siguiente hito exacto de revisión (1000, 2000, 3000, etc.).
 * 2. Determina el ritmo de horas anuales de la máquina según su histórico más fiable.
 * 3. Calcula cuántos días faltan para alcanzar el hito y los proyecta desde el último registro.
 */
export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const config = getActiveMaintenanceConfig();
  
  // 1. Intervalo de horas para revisión (ej: 1000h o excepción del modelo)
  const intervaloHoras = config.horasPorRevisionPorModelo[modelo] || config.horasPorRevisionEstandar;
  
  // 2. Siguiente hito exacto en horas (ej: si lleva 1.250h, el hito exacto es 2.000h)
  const proximoHitoHoras = Math.floor(horasTotalesActuales / intervaloHoras) * intervaloHoras + intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasTotalesActuales;

  // 3. Calcular las horas que hace al año basándonos en el histórico de pedidos (registro más fiable)
  let horasAlAno = 1200; // Valor por defecto prudencial si no hay suficiente histórico
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
      horasAlAno = horasPorDia * 365; // Proyección anual exacta de horas
    }
  } else if (historicoPedidos && historicoPedidos.length === 1) {
    fechaUltimoRegistro = new Date(historicoPedidos[0].fecha);
  }

  // 4. Calcular los días exactos que faltan para llegar a las horas del hito
  const diasRestantes = horasAlAno > 0 ? Math.round((horasRestantes / horasAlAno) * 365) : 365;

  // 5. Partir de la fecha del último registro fiable (o de la última revisión si no hay histórico) y sumar los días
  const fechaBase = !isNaN(fechaUltimoRegistro.getTime()) ? new Date(fechaUltimoRegistro) : (ultimaFechaRevision || new Date());
  fechaBase.setDate(fechaBase.getDate() + Math.max(diasRestantes, 1));

  return fechaBase.toISOString().slice(0, 10);
}
