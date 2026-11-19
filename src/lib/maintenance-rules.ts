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
      return {
        ...defaultMaintenanceConfig,
        ...JSON.parse(saved),
      };
    }
  } catch (e) {
    console.error('Error cargando reglas personalizadas', e);
  }
  return defaultMaintenanceConfig;
}

export function formatDateToEuropean(date: Date): string {
  if (!date || isNaN(date.getTime())) return 'Pendiente';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function parseEuropeanDateString(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'Pendiente') return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const year = Number(parts[2]);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

export function isDateOverdue(dateStr: string): boolean {
  const parsed = parseEuropeanDateString(dateStr);
  if (!parsed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}

/**
 * LÓGICA DE EQUIPOS CONTRATADOS:
 * Calcula la próxima fecha en base a la última revisión realizada y las revisiones anuales pactadas.
 * Si ya se han cubierto las revisiones previstas para el año en curso, ajusta al siguiente ciclo anual.
 */
export function calcularProximaRevisionContrato(
  ultimaFecha: Date | null,
  numRevisionesAnuales: number = 1,
  revisionesRealizadasEnAno: number = 0
): string {
  const config = getActiveMaintenanceConfig();
  if (!ultimaFecha || isNaN(ultimaFecha.getTime())) {
    return 'Pendiente';
  }

  const totalAnuales =
    numRevisionesAnuales > 0
      ? numRevisionesAnuales
      : Math.max(1, Math.round(12 / (config.mesesRevisionesContratoEstandar || 12)));

  const mesesIntervalo = Math.max(1, Math.round(12 / totalAnuales));
  const nextDate = new Date(ultimaFecha.getTime());

  // Si ya se han hecho todas o más revisiones de las previstas este año, saltamos al siguiente periodo
  const pendientesEnCiclo = Math.max(1, totalAnuales - revisionesRealizadasEnAno);
  const mesesASumar = revisionesRealizadasEnAno >= totalAnuales ? 12 : mesesIntervalo * (pendientesEnCiclo === totalAnuales ? 1 : 1);

  nextDate.setMonth(nextDate.getMonth() + mesesASumar);
  return formatDateToEuropean(nextDate);
}

/**
 * LÓGICA DE MÁQUINAS PROPIAS:
 * 1. Calcula el siguiente hito exacto (1000, 2000, 3000... o intervalo configurado).
 * 2. Calcula las horas anuales según el histórico más fiable.
 * 3. Proyecta la fecha desde el último registro fiable según las horas restantes.
 */
export function calcularProximaRevisionPropia(
  ultimaFechaRevision: Date | null,
  horasTotalesActuales: number,
  modelo: string,
  historicoPedidos: { fecha: Date; horas: number }[] = []
): string {
  const config = getActiveMaintenanceConfig();
  const intervaloHoras =
    config.horasPorRevisionPorModelo[modelo] || config.horasPorRevisionEstandar || 1000;

  const horasActuales = Number(horasTotalesActuales) || 0;
  // Siguiente múltiplo exacto del intervalo (ej: si lleva 1.050h con intervalo 1000 -> 2.000h)
  const proximoHitoHoras =
    Math.floor(horasActuales / intervaloHoras) * intervaloHoras + intervaloHoras;
  const horasRestantes = proximoHitoHoras - horasActuales;

  let horasAlAno = 1200;
  let fechaBase: Date | null = ultimaFechaRevision && !isNaN(ultimaFechaRevision.getTime())
    ? new Date(ultimaFechaRevision.getTime())
    : null;

  if (historicoPedidos && historicoPedidos.length >= 2) {
    const sorted = [...historicoPedidos]
      .filter((item) => item.fecha && !isNaN(item.fecha.getTime()))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    if (sorted.length >= 2) {
      const primero = sorted[0];
      const ultimo = sorted[sorted.length - 1];
      fechaBase = new Date(ultimo.fecha.getTime());

      const diffDias = (ultimo.fecha.getTime() - primero.fecha.getTime()) / (1000 * 60 * 60 * 24);
      const diffHoras = ultimo.horas - primero.horas;

      if (diffDias > 5 && diffHoras > 0) {
        horasAlAno = (diffHoras / diffDias) * 365;
      }
    }
  } else if (historicoPedidos && historicoPedidos.length === 1 && historicoPedidos[0].fecha && !isNaN(historicoPedidos[0].fecha.getTime())) {
    fechaBase = new Date(historicoPedidos[0].fecha.getTime());
  }

  if (!fechaBase || isNaN(fechaBase.getTime())) {
    return 'Pendiente';
  }

  const diasRestantes = horasAlAno > 0 ? Math.round((horasRestantes / horasAlAno) * 365) : 365;
  const fechaEstimada = new Date(fechaBase.getTime());
  fechaEstimada.setDate(fechaEstimada.getDate() + diasRestantes);

  return formatDateToEuropean(fechaEstimada);
}
