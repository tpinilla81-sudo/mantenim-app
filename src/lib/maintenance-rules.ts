export interface MaintenanceRuleConfig {
  horasPorRevisionEstandar: number;
  horasPorRevisionPorModelo: Record<string, number>;
  mesesRevisionesContratoEstandar: number;
}

export const maintenanceConfig: MaintenanceRuleConfig = {
  horasPorRevisionEstandar: 1000, // Intervalo estándar en horas para máquinas propias
  horasPorRevisionPorModelo: {
    // Aquí puedes añadir excepciones por modelo si alguna máquina requiere un intervalo distinto, ej: 'H 20 39X': 500
  },
  mesesRevisionesContratoEstandar: 12,
};

/**
 * Calcula la próxima fecha de revisión para un equipo con contrato
 * @param ultimaFecha - Fecha de la última revisión realizada
 * @param numRevisionesAnuales - Cantidad de revisiones pactadas al año (ej: 1, 2, 4)
 */
export function calcularProximaRevisionContrato(ultimaFecha: Date | null, numRevisionesAnuales: number = 1): string {
  const baseDate = ultimaFecha && !isNaN(ultimaFecha.getTime()) ? new Date(ultimaFecha) : new Date();
  
  // Si se especifican revisiones anuales, calculamos el intervalo exacto en meses
  const revisiones = numRevisionesAnuales > 0 ? numRevisionesAnuales : 1;
  const mesesIncremento = Math.round(12 / revisiones);
  
  baseDate.setMonth(baseDate.getMonth() + mesesIncremento);
  return baseDate.toISOString().slice(0, 10);
}

/**
 * Calcula la próxima fecha de revisión para una máquina propia en función de sus horas y uso
 */
export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const intervaloHoras = maintenanceConfig.horasPorRevisionPorModelo[modelo] || maintenanceConfig.horasPorRevisionEstandar;
  
  // Siguiente hito de horas al que tocará revisión (ej: múltiplo de 1000)
  const proximoHitoHoras = Math.ceil((horasTotalesActuales + 1) / intervaloHoras) * intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasTotalesActuales;

  // Calcular ritmo medio de uso diario (horas/día) basándonos en el histórico de pedidos registrados
  let horasAlDia = 3; // Valor por defecto prudencial
  if (historicoPedidos && historicoPedidos.length >= 2) {
    const sorted = [...historicoPedidos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const diffDias = (sorted[sorted.length - 1].fecha.getTime() - sorted[0].fecha.getTime()) / (1000 * 60 * 60 * 24);
    const diffHoras = sorted[sorted.length - 1].horas - sorted[0].horas;
    
    if (diffDias > 15 && diffHoras > 0) {
      horasAlDia = diffHoras / diffDias;
    }
  }

  // Días estimados hasta llegar al hito de horas
  const diasRestantes = horasAlDia > 0 ? Math.round(horasRestantes / horasAlDia) : 365;
  
  const fechaPartida = ultimaFechaRevision && !isNaN(ultimaFechaRevision.getTime()) ? new Date(ultimaFechaRevision) : new Date();
  fechaPartida.setDate(fechaPartida.getDate() + Math.max(diasRestantes, 15));

  return fechaPartida.toISOString().slice(0, 10);
}
