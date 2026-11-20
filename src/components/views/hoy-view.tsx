'use client'

import { useState, useEffect } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  Gauge,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/shared/estado-badge'
import {
  EQUIPO_TIPOS,
  formatFecha,
  diasHasta,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

type ViewKey =
  | 'hoy'
  | 'clientes'
  | 'equipos'
  | 'contratos'
  | 'ordenes'
  | 'calendario'
  | 'sync'
  | 'revisiones'
  | 'logicas'

interface EquipoInfo {
  id: string
  codigo: string
  marca: string
  modelo: string
  tipo: string
  horasUso: number
  cliente: { nombre: string } | null
}
interface RevisionHoy {
  id: string
  tipo: string
  nivel: string | null
  horasObjetivo: number | null
  fechaProgramada: string
  equipo: EquipoInfo
}
interface OTHoy {
  id: string
  numero: string
  descripcion: string
  estado: string
  prioridad: string
  tipo: string
  fechaProgramada: string
  equipo: EquipoInfo
  tecnico: { nombre: string; apellidos: string } | null
}

interface HoyData {
  fecha: string
  zonaFiltrada: string
  resumen: {
    revisionesHoy: number
    otsHoy: number
    vencidas: number
    proximos7dias: number
    equiposCercaUmbral: number
  }
  revisionesHoy: RevisionHoy[]
  otsHoy: OTHoy[]
  vencidasTop: RevisionHoy[]
  proximos7dias: RevisionHoy[]
  equiposCercaUmbral: EquipoInfo[]
}

function formatMiles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'emerald' | 'amber' | 'sky' | 'rose'
  hint?: string
}) {
  const colorClass = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  }[color]
  return (
    <Card className={cn('border-2', colorClass)}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function HoyView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [mounted, setMounted] = useState(false)
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string>('TODAS')
  const ZONAS_DISPONIBLES = ['TODAS', 'A10', 'B100', 'A20', 'VW', 'S1', 'S2', 'S3']

  useEffect(() => {
    setMounted(true)
  }, [])

  const url =
    zonaSeleccionada && zonaSeleccionada !== 'TODAS'
      ? `/api/hoy?zona=${encodeURIComponent(zonaSeleccionada)}`
      : '/api/hoy'
  const { data, loading, error, refetch } = useFetch<HoyData>(url)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const markCompleted = async (id: string, descripcionEquipo: string) => {
    setCompletingId(id)
    try {
      const res = await fetch(`/api/revisiones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'COMPLETADA',
          fechaRealizada: new Date().toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Revisión completada: ${descripcionEquipo}`)
      refetch()
    } catch (err) {
      toast.error('Error', { description: (err as Error).message })
    } finally {
      setCompletingId(null)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="p-4 lg:p-8 space-y-4">
        <div className="h-20 bg-muted/30 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-6 text-rose-800">
            <p className="font-medium">No se pudo cargar el trabajo del día.</p>
            <p className="text-sm mt-1 text-rose-700">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const fechaHoy = new Date(data.fecha)
  const fechaTexto = fechaHoy.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header con fecha + selector de zona */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trabajo de hoy</h1>
          <p className="text-[13px] text-muted-foreground capitalize">{fechaTexto}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground">Zona:</span>
          {ZONAS_DISPONIBLES.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZonaSeleccionada(z)}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                zonaSeleccionada === z
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              {z === 'TODAS' ? 'Todas' : z}
            </button>
          ))}
          <Button onClick={() => refetch()} variant="outline" size="sm" className="ml-2 h-7">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Banner de notificación: resumen del día */}
      {data.resumen.vencidas > 0 && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-300 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-900">
              Tienes {data.resumen.vencidas} revisiones vencidas
              {data.resumen.revisionesHoy > 0 && ` y ${data.resumen.revisionesHoy} para hoy`}
            </p>
            <p className="text-[12px] text-rose-700 mt-0.5">
              Revisa las más antiguas abajo y márcalas como completadas cuando las hagas.
            </p>
          </div>
        </div>
      )}

      {/* Mostrar zona filtrada si aplica */}
      {data.zonaFiltrada !== 'TODAS' && (
        <div className="text-[12px] text-muted-foreground">
          Filtrando por zona: <strong className="text-foreground">{data.zonaFiltrada}</strong>
        </div>
      )}

      {/* KPIs del día */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Revisiones hoy"
          value={data.resumen.revisionesHoy}
          icon={CalendarClock}
          color="sky"
        />
        <KpiCard
          label="Vencidas"
          value={data.resumen.vencidas}
          icon={AlertTriangle}
          color="rose"
          hint="Sin completar"
        />
        <KpiCard
          label="Próximos 7 días"
          value={data.resumen.proximos7dias}
          icon={Clock}
          color="emerald"
        />
        <KpiCard
          label="Cerca de umbral"
          value={data.resumen.equiposCercaUmbral}
          icon={Gauge}
          color="amber"
          hint="≤ 50h para revisión"
        />
      </section>

      {/* Lo que toca HOY */}
      {data.revisionesHoy.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              Pendientes de hoy
              <span className="ml-1 text-[12px] text-muted-foreground font-normal">
                ({data.revisionesHoy.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {data.revisionesHoy.map((r) => (
              <PendienteItem
                key={`rev-${r.id}`}
                numero={r.equipo.codigo}
                titulo={`Revisión ${r.nivel === 'CONTRATO' ? 'por contrato' : '500h'}`}
                descripcion={r.equipo.cliente?.nombre || 'Sin cliente'}
                meta={`${EQUIPO_TIPOS[r.equipo.tipo] || r.equipo.tipo} · ${r.equipo.marca} ${r.equipo.modelo}`}
                badge={<EstadoBadge estado={r.tipo} label={r.tipo === 'POR_CONTRATO' ? 'Por contrato' : 'Por horas'} />}
                badgeRight={<EstadoBadge estado="PROGRAMADA" label="Hoy" />}
                onMarkDone={() => markCompleted(r.id, r.equipo.codigo)}
                isMarking={completingId === r.id}
                onNavigate={() => onNavigate('revisiones')}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">No hay nada pendiente para hoy</p>
              <p className="text-[12px] text-emerald-700">
                Aprovecha para adelantar las vencidas o revisar las que están por llegar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Próximos 7 días */}
      {data.proximos7dias.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              Próximos 7 días
              <span className="ml-1 text-[12px] text-muted-foreground font-normal">
                ({data.proximos7dias.length} revisiones programadas)
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('revisiones')}>
              Ver todas
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {data.proximos7dias.map((r) => {
              const dias = diasHasta(r.fechaProgramada)
              return (
                <PendienteItem
                  key={`7d-${r.id}`}
                  numero={r.equipo.codigo}
                  titulo={`Revisión ${r.nivel === 'CONTRATO' ? 'por contrato' : '500h'}`}
                  descripcion={r.equipo.cliente?.nombre || 'Sin cliente'}
                  meta={`${EQUIPO_TIPOS[r.equipo.tipo] || r.equipo.tipo} · ${r.equipo.marca} ${r.equipo.modelo}${r.horasObjetivo ? ` · ${formatMiles(r.equipo.horasUso)}/${formatMiles(r.horasObjetivo)} h` : ''}`}
                  badge={<EstadoBadge estado={r.tipo} label={r.tipo === 'POR_CONTRATO' ? 'Por contrato' : 'Por horas'} />}
                  badgeRight={
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatFecha(r.fechaProgramada)}
                      {dias !== null && dias > 0 && ` · en ${dias}d`}
                    </span>
                  }
                  onMarkDone={null}
                  isMarking={false}
                  onNavigate={() => onNavigate('revisiones')}
                />
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Las más vencidas (top 10) */}
      {data.vencidasTop.length > 0 && (
        <Card className="border-rose-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Vencidas más antiguas
              <span className="ml-1 text-[12px] text-muted-foreground font-normal">
                ({data.resumen.vencidas} en total · top 10)
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('revisiones')}>
              Ver todas
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {data.vencidasTop.map((r) => {
              const dias = diasHasta(r.fechaProgramada)
              const diasVencida = dias !== null ? -dias : 0
              return (
                <PendienteItem
                  key={`venc-${r.id}`}
                  numero={r.equipo.codigo}
                  titulo={`Revisión ${r.nivel === 'CONTRATO' ? 'por contrato' : '500h'}`}
                  descripcion={r.equipo.cliente?.nombre || 'Sin cliente'}
                  meta={`${EQUIPO_TIPOS[r.equipo.tipo] || r.equipo.tipo} · ${r.equipo.marca} ${r.equipo.modelo}${r.horasObjetivo ? ` · ${formatMiles(r.equipo.horasUso)}/${formatMiles(r.horasObjetivo)} h` : ''}`}
                  badge={<EstadoBadge estado={r.tipo} label={r.tipo === 'POR_CONTRATO' ? 'Por contrato' : 'Por horas'} />}
                  badgeRight={
                    <span className="text-[11px] font-medium text-rose-700 tabular-nums">
                      Vencida hace {diasVencida}d
                    </span>
                  }
                  onMarkDone={() => markCompleted(r.id, r.equipo.codigo)}
                  isMarking={completingId === r.id}
                  onNavigate={() => onNavigate('revisiones')}
                />
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Equipos cerca de umbral */}
      {data.equiposCercaUmbral.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-600" />
              Equipos cerca de su umbral
              <span className="ml-1 text-[12px] text-muted-foreground font-normal">
                (≤ 50h para la próxima revisión)
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('equipos')}>
              Ver todos
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.equiposCercaUmbral.map((e) => {
                const umbral = e.horasUso ? Math.ceil((e.horasUso + 1) / 250) * 250 : 250
                const restantes = umbral - e.horasUso
                return (
                  <div
                    key={e.id}
                    className="p-3 rounded-lg border border-amber-200 bg-amber-50/40 hover:bg-amber-50 cursor-pointer transition-colors"
                    onClick={() => onNavigate('equipos')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-mono font-medium">{e.codigo}</p>
                      <EstadoBadge estado="EN_MANTENIMIENTO" label={`${restantes}h`} />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {EQUIPO_TIPOS[e.tipo] || e.tipo} · {e.marca} {e.modelo}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.cliente?.nombre || '—'}
                    </p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span className="tabular-nums">{formatMiles(e.horasUso)} h</span>
                        <span className="tabular-nums">{formatMiles(umbral)} h</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h
