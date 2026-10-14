// Constantes y etiquetas legibles en español

export const EQUIPO_TIPOS: Record<string, string> = {
  GRUA_TORRE: 'Grúa torre',
  GRUA_MOVIL: 'Grúa móvil',
  GRUA_PUENTE: 'Grúa puente',
  MONTACARGAS_COMBUSTION: 'Montacargas combustión',
  MONTACARGAS_ELECTRICO: 'Montacargas eléctrico',
}

export const EQUIPO_TIPO_ICONS: Record<string, string> = {
  GRUA_TORRE: '🏗',
  GRUA_MOVIL: '🚜',
  GRUA_PUENTE: '🌉',
  MONTACARGAS_COMBUSTION: '🛻',
  MONTACARGAS_ELECTRICO: '🔋',
}

export const EQUIPO_ESTADOS: Record<string, string> = {
  OPERATIVO: 'Operativo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_SERVICIO: 'Fuera de servicio',
}

export const CLIENTE_ESTADOS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
}

export const CONTRATO_ESTADOS: Record<string, string> = {
  ACTIVO: 'Activo',
  VENCIDO: 'Vencido',
  SUSPENDIDO: 'Suspendido',
  CANCELADO: 'Cancelado',
}

export const CONTRATO_TIPOS: Record<string, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  MIXTO: 'Mixto',
}

export const OT_ESTADOS: Record<string, string> = {
  PROGRAMADA: 'Programada',
  EN_PROCESO: 'En proceso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
}

export const OT_TIPOS: Record<string, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  REPARACION: 'Reparación',
}

export const OT_PRIORIDADES: Record<string, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
}

export const TECNICO_ESTADOS: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  VACACIONES: 'Vacaciones',
}

export const TECNICO_ESPECIALIDADES: Record<string, string> = {
  MECANICA: 'Mecánica',
  ELECTRONICA: 'Electrónica',
  HIDRAULICA: 'Hidráulica',
  GENERAL: 'General',
}

// Paletas Tailwind por estado
export const ESTADO_COLOR: Record<string, string> = {
  OPERATIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EN_MANTENIMIENTO: 'bg-amber-50 text-amber-700 border-amber-200',
  FUERA_SERVICIO: 'bg-rose-50 text-rose-700 border-rose-200',
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INACTIVO: 'bg-gray-100 text-gray-600 border-gray-200',
  VENCIDO: 'bg-rose-50 text-rose-700 border-rose-200',
  SUSPENDIDO: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELADO: 'bg-gray-100 text-gray-600 border-gray-200',
  PROGRAMADA: 'bg-sky-50 text-sky-700 border-sky-200',
  EN_PROCESO: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELADA: 'bg-gray-100 text-gray-600 border-gray-200',
  VACACIONES: 'bg-violet-50 text-violet-700 border-violet-200',
  PREVENTIVO: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  CORRECTIVO: 'bg-amber-50 text-amber-700 border-amber-200',
  REPARACION: 'bg-rose-50 text-rose-700 border-rose-200',
  MIXTO: 'bg-violet-50 text-violet-700 border-violet-200',
  BAJA: 'bg-gray-100 text-gray-600 border-gray-200',
  MEDIA: 'bg-sky-50 text-sky-700 border-sky-200',
  ALTA: 'bg-amber-50 text-amber-700 border-amber-200',
  URGENTE: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Utilidades de fecha
export function formatFecha(fecha: string | Date | null | undefined): string {
  if (!fecha) return '—'
  try {
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatFechaCorta(fecha: string | Date | null | undefined): string {
  if (!fecha) return '—'
  try {
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatHora(fecha: string | Date | null | undefined): string {
  if (!fecha) return ''
  try {
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha
    return d.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function formatMoneda(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatHoras(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(1)} h`
}

export function diasHasta(fecha: string | Date | null | undefined): number | null {
  if (!fecha) return null
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const objetivo = new Date(d)
  objetivo.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export function isoToInputDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export function inputDateToIso(s: string): string | null {
  if (!s) return null
  const d = new Date(s + 'T09:00:00')
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}
