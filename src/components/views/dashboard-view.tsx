'use client'

import { useFetch } from '@/lib/use-fetch'
import {
  Users,
  Forklift,
  FileText,
  ClipboardList,
  Euro,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Database,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/shared/estado-badge'
import {
  formatFecha,
  formatMoneda,
  diasHasta,
  EQUIPO_TIPOS,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

type ViewKey = 'dashboard' | 'clientes' | 'equipos' | 'contratos' | 'ordenes' | 'calendario' | 'sync'

interface SyncStatus {
  ultimoSync: {
    fecha: string
    fileName: string
    rowsTotal: number
    status: string
  } | null
  diasDesdeUltimoSync: number | null
  syncCaducado: boolean
  umbralCaducidadDias: number
  totalClientes: number
  totalContratos: number
}

interface DashboardData {
  kpis: {
    totalClientes: number
    totalEquipos: number
    totalContratos: number
    totalTecnicos: number
    totalOrdenes: number
    ordenesPendientes: number
    ordenesCompletadasMes: number
    ingresosMes: number
  }
  contratosPorVencer: Array<{
    id: string
    numero: string
    fechaFin: string
    cliente: { nombre: string }
  }>
  mantenimientosProximos: Array<{
    id: string
    numero: string
    descripcion: string
    fechaProgramada: string
    estado: string
    prioridad: string
    tipo: string
    equipo: { codigo: string; marca: string; modelo: string; cliente: { nombre: string } }
    tecnico: { nombre: string; apellidos: string } | null
  }>
  distribucionEquipos: Array<{ estado: string; _count: number }>
  distribucionOrdenesTipo: Array<{ tipo: string; _count: number }>
  distribucionOrdenesEstado: Array<{ estado: string; _count: number }>
}

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  trend?: string
}

function KpiCard({ label, value, icon: Icon, hint, trend }: KpiCardProps) {
  return (
    <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[13px] text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent text-accent-foreground">
            <Icon className="w-4 h-4" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-700">
            <TrendingUp className="w-3 h-3" />
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <div className="w-28 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right tabular-nums font-medium">{value}</div>
    </div>
  )
}

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data, loading, error } = useFetch<DashboardData>('/api/dashboard')
  const { data: syncStatus } = useFetch<SyncStatus>('/api/sync')

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/80">
              <CardContent className="p-5 animate-pulse">
                <div className="h-4 w-24 bg-muted rounded mb-2" />
                <div className="h-7 w-16 bg-muted rounded" />
              </CardContent>
            </Card>
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
            <p className="font-medium">No se pudo cargar el dashboard.</p>
            <p className="text-sm mt-1 text-rose-700">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const maxEquipos = Math.max(1, ...data.distribucionEquipos.map((d) => d._count))
  const maxOrdenes = Math.max(1, ...data.distribucionOrdenesEstado.map((d) => d._count))

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Banner de sincronización caducada */}
      {syncStatus && (
        !syncStatus.ultimoSync ? (
          <div className="flex items-start gap-3 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <Info className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-sky-900">
                Aún no has sincronizado con Business Central
              </p>
              <p className="text-[12px] text-sky-700 mt-1">
                Sube el Excel de "Contratos de servicio" para tener tus contratos reales cargados en la app.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-100"
              onClick={() => onNavigate('sync')}
            >
              <Database className="w-3.5 h-3.5 mr-1.5" />
              Sincronizar
            </Button>
          </div>
        ) : syncStatus.syncCaducado ? (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Sincronización con Business Central caducada
              </p>
              <p className="text-[12px] text-amber-700 mt-1">
                Han pasado <strong>{syncStatus.diasDesdeUltimoSync} días</strong> desde la última
                subida del Excel ({formatFecha(syncStatus.ultimoSync.fecha)}). Te recomendamos
                volver a exportar y subir el archivo actualizado.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => onNavigate('sync')}
            >
              <Database className="w-3.5 h-3.5 mr-1.5" />
              Subir Excel
            </Button>
          </div>
        ) : null
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Clientes activos"
          value={data.kpis.totalClientes}
          icon={Users}
          hint="Empresas con mantenimiento vigente"
        />
        <KpiCard
          label="Equipos totales"
          value={data.kpis.totalEquipos}
          icon={Forklift}
          hint="Grúas y montacargas"
        />
        <KpiCard
          label="Contratos activos"
          value={data.kpis.totalContratos}
          icon={FileText}
          hint="Acuerdos en vigor"
        />
        <KpiCard
          label="OTs pendientes"
          value={data.kpis.ordenesPendientes}
          icon={ClipboardList}
          hint="Próximos 30 días"
          trend={`${data.kpis.totalOrdenes} OT totales`}
        />
      </section>

      {/* Métricas del mes */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Euro className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground">Facturación del mes</p>
              <p className="text-xl font-semibold tabular-nums">
                {formatMoneda(data.kpis.ingresosMes)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground">OTs completadas (mes)</p>
              <p className="text-xl font-semibold tabular-nums">
                {data.kpis.ordenesCompletadasMes}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground">Técnicos disponibles</p>
              <p className="text-xl font-semibold tabular-nums">
                {data.kpis.totalTecnicos}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mantenimientos próximos */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">
              Mantenimientos próximos (30 días)
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-[12px]"
              onClick={() => onNavigate('ordenes')}
            >
              Ver todas
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.mantenimientosProximos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay mantenimientos programados en los próximos 30 días.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.mantenimientosProximos.slice(0, 8).map((m) => {
                  const dias = diasHasta(m.fechaProgramada)
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex flex-col items-center min-w-[44px]">
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `${dias} días`}
                        </span>
                        <EstadoBadge estado={m.prioridad} className="mt-1" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-mono font-medium text-foreground">
                            {m.numero}
                          </span>
                          <EstadoBadge estado={m.tipo} />
                          <EstadoBadge estado={m.estado} />
                        </div>
                        <p className="text-[13px] text-foreground mt-0.5 truncate">
                          {m.descripcion}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {m.equipo.codigo} · {m.equipo.marca} {m.equipo.modelo} · {m.equipo.cliente.nombre}
                          {m.tecnico && ` · ${m.tecnico.nombre} ${m.tecnico.apellidos}`}
                        </p>
                      </div>
                      <div className="text-right text-[12px] text-muted-foreground shrink-0">
                        {formatFecha(m.fechaProgramada)}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Contratos por vencer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Contratos a vencer (60 días)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.contratosPorVencer.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay contratos próximos a vencer.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.contratosPorVencer.slice(0, 6).map((c) => {
                  const dias = diasHasta(c.fechaFin) ?? 0
                  const urgente = dias <= 15
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-mono font-medium truncate">
                          {c.numero}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.cliente.nombre}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] tabular-nums">{formatFecha(c.fechaFin)}</p>
                        <p
                          className={cn(
                            'text-[11px] font-medium',
                            urgente ? 'text-rose-700' : 'text-amber-700'
                          )}
                        >
                          {dias === 0 ? 'Vence hoy' : `En ${dias} días`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-[12px]"
              onClick={() => onNavigate('contratos')}
            >
              Ver todos los contratos
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Distribuciones */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Distribución de equipos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.distribucionEquipos.map((d) => (
              <MiniBar
                key={d.estado}
                label={
                  d.estado === 'OPERATIVO' ? 'Operativos' :
                  d.estado === 'EN_MANTENIMIENTO' ? 'En mant.' : 'Fuera serv.'
                }
                value={d._count}
                max={maxEquipos}
                color={
                  d.estado === 'OPERATIVO' ? 'bg-emerald-500' :
                  d.estado === 'EN_MANTENIMIENTO' ? 'bg-amber-500' : 'bg-rose-500'
                }
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Órdenes por estado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.distribucionOrdenesEstado.map((d) => (
              <MiniBar
                key={d.estado}
                label={
                  d.estado === 'PROGRAMADA' ? 'Programadas' :
                  d.estado === 'EN_PROCESO' ? 'En proceso' :
                  d.estado === 'COMPLETADA' ? 'Completadas' : 'Canceladas'
                }
                value={d._count}
                max={maxOrdenes}
                color={
                  d.estado === 'PROGRAMADA' ? 'bg-sky-500' :
                  d.estado === 'EN_PROCESO' ? 'bg-amber-500' :
                  d.estado === 'COMPLETADA' ? 'bg-emerald-500' : 'bg-gray-400'
                }
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Órdenes por tipo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.distribucionOrdenesTipo.map((d) => (
              <MiniBar
                key={d.tipo}
                label={d.tipo === 'PREVENTIVO' ? 'Preventivos' : d.tipo === 'CORRECTIVO' ? 'Correctivos' : 'Reparaciones'}
                value={d._count}
                max={Math.max(1, ...data.distribucionOrdenesTipo.map((x) => x._count))}
                color={
                  d.tipo === 'PREVENTIVO' ? 'bg-cyan-500' :
                  d.tipo === 'CORRECTIVO' ? 'bg-amber-500' : 'bg-rose-500'
                }
              />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
