export interface MaintenanceRuleConfig {
  horasPorRevisionEstandar: number;
  horasPorRevisionPorModelo: Record<string, number>;
  mesesRevisionesContratoEstandar: number;
}

export const maintenanceConfig: MaintenanceRuleConfig = {
  horasPorRevisionEstandar: 1000, // Aquí puedes cambiar 1000 por 500 u otro valor cuando lo necesites
  horasPorRevisionPorModelo: {},
  mesesRevisionesContratoEstandar: 12,
};

export function calcularProximaRevisionContrato(ultimaFecha: Date | null, numRevisionesAnuales: number = 1): string {
  const baseDate = ultimaFecha && !isNaN(ultimaFecha.getTime()) ? new Date(ultimaFecha) : new Date();
  const mesesIncremento = Math.round(12 / (numRevisionesAnuales || 1));
  baseDate.setMonth(baseDate.getMonth() + mesesIncremento);
  return baseDate.toISOString().slice(0, 10);
}

export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const intervaloHoras = maintenanceConfig.horasPorRevisionPorModelo[modelo] || maintenanceConfig.horasPorRevisionEstandar;
  const proximoHitoHoras = Math.ceil((horasTotalesActuales + 1) / intervaloHoras) * intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasTotalesActuales;

  let horasAlDia = 3; // Ritmo estimado (~1000h al año)
  if (historicoPedidos.length >= 2) {
    const sorted = [...historicoPedidos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const diffDias = (sorted[sorted.length - 1].fecha.getTime() - sorted[0].fecha.getTime()) / (1000 * 60 * 60 * 24);
    const diffHoras = sorted[sorted.length - 1].horas - sorted[0].horas;
    if (diffDias > 30 && diffHoras > 0) {
      horasAlDia = diffHoras / diffDias;
    }
  }

  const diasRestantes = horasAlDia > 0 ? Math.round(horasRestantes / horasAlDia) : 365;
  const fechaPartida = ultimaFechaRevision && !isNaN(ultimaFechaRevision.getTime()) ? new Date(ultimaFechaRevision) : new Date();
  fechaPartida.setDate(fechaPartida.getDate() + Math.max(diasRestantes, 30));

  return fechaPartida.toISOString().slice(0, 10);
}
