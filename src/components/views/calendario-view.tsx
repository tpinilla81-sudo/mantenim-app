'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  MapPin,
  User,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoBadge } from '@/components/shared/estado-badge'
import {
  OT_ESTADOS,
  OT_TIPOS,
  OT_PRIORIDADES,
  EQUIPO_TIPOS,
  formatFecha,
  formatHora,
  formatMoneda,
  formatHoras,
  ESTADO_COLOR,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

type ViewKey = 'dashboard' | 'clientes' | 'equipos' | 'contratos' | 'ordenes' | 'calendario'

interface OrdenCal {
  id: string
  numero: string
  descripcion: string
  fechaProgramada: string
  estado: string
  prioridad: string
  tipo: string
  equipo: {
    codigo: string
    marca: string
    modelo: string
    tipo: string
    cliente: { nombre: string }
  }
  tecnico: { nombre: string; apellidos: string } | null
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function CalendarioView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const hoy = new Date()
  const [cursor, setCursor] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [estadosVisibles, setEstadosVisibles] = useState<string[]>(['PROGRAMADA', 'EN_PROCESO'])
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null)
  const [detalle, setDetalle] = useState<OrdenCal | null>(null)

  // Fetch OTs del mes (con margen de una semana para cubrir bordes)
  const inicio = useMemo(() => {
    const primerLunes = new Date(cursor)
    const dia = primerLunes.getDate() - ((primerLunes.getDay() + 6) % 7)
    primerLunes.setDate(dia)
    primerLunes.setHours(0, 0, 0, 0)
    return primerLunes.toISOString()
  }, [cursor])

  const fin = useMemo(() => {
    const f = new Date(inicio)
    f.setDate(f.getDate() + 42) // 6 semanas
    return f.toISOString()
  }, [inicio])

  const url = `/api/ordenes?desde=${encodeURIComponent(inicio)}&hasta=${encodeURIComponent(fin)}`
  const { data, loading, error } = useFetch<OrdenCal[]>(url)

  // Indexar OTs por día (YYYY-MM-DD)
  const ordenesPorDia = useMemo(() => {
    const map = new Map<string, OrdenCal[]>()
    data?.forEach((o) => {
      const d = new Date(o.fechaProgramada)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    })
    return map
  }, [data])

  // Generar 42 días (6 semanas)
  const dias = useMemo(() => {
    const arr: Date[] = []
    const start = new Date(inicio)
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [inicio])

  const toggleEstado = (estado: string) => {
    setEstadosVisibles((prev) =>
      prev.includes(estado)
        ? prev.filter((e) => e !== estado)
        : [...prev, estado]
    )
  }

  const ordensDelDia = (d: Date): OrdenCal[] => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    return (ordenesPorDia.get(key) || []).filter((o) => estadosVisibles.includes(o.estado))
  }

  const irHoy = () => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const mesAnterior = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const mesSiguiente = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px]">
      {/* Header del calendario */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={mesAnterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-base font-semibold px-3 tabular-nums min-w-[160px] text-center">
            {MESES[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <Button variant="outline" size="sm" onClick={mesSiguiente}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={irHoy} className="ml-1">
            Hoy
          </Button>
        </div>
        {/* Filtros de estado */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] text-muted-foreground mr-1">Mostrar:</span>
          {(['PROGRAMADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'] as const).map((est) => {
            const active = estadosVisibles.includes(est)
            return (
              <button
                key={est}
                onClick={() => toggleEstado(est)}
                className={cn(
                  'text-[11px] font-medium px-2 py-1 rounded-full border transition-colors',
                  active
                    ? ESTADO_COLOR[est]
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {OT_ESTADOS[est]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cabecera de días */}
      <Card className="border-border/80 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[12px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        {/* Grid de días */}
        <div className="grid grid-cols-7 grid-rows-6">
          {dias.map((d, idx) => {
            const esOtroMes = d.getMonth() !== cursor.getMonth()
            const esHoy = d.toDateString() === hoy.toDateString()
            const ordens = ordensDelDia(d)
            const rowIdx = Math.floor(idx / 7)
            const isLastRow = rowIdx === 5
            const isLastCol = idx % 7 === 6
            return (
              <div
                key={idx}
                onClick={() => setDiaSeleccionado(d)}
                className={cn(
                  'min-h-[112px] lg:min-h-[120px] p-1.5 cursor-pointer transition-colors',
                  'hover:bg-muted/30',
                  !isLastRow && 'border-b border-border/60',
                  !isLastCol && 'border-r border-border/60',
                  esOtroMes && 'bg-muted/20 text-muted-foreground',
                  diaSeleccionado && diaSeleccionado.toDateString() === d.toDateString() && 'bg-accent/30 ring-1 ring-inset ring-ring/30'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] tabular-nums',
                      esHoy && 'bg-primary text-primary-foreground font-semibold',
                      !esHoy && !esOtroMes && 'text-foreground font-medium',
                      esOtroMes && 'text-muted-foreground'
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {ordens.length > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {ordens.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {ordens.slice(0, 3).map((o) => (
                    <button
                      key={o.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDetalle(o)
                      }}
                      className={cn(
                        'w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight border truncate block',
                        ESTADO_COLOR[o.estado]
                      )}
                      title={`${o.numero} · ${o.descripcion}`}
                    >
                      <span className="font-mono font-medium">{o.numero}</span>
                      {' '}
                      <span className="opacity-80">{o.equipo.codigo}</span>
                    </button>
                  ))}
                  {ordens.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-1">
                      +{ordens.length - 3} más
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {error && (
        <Card>
          <CardContent className="p-4 text-rose-700 text-sm">
            Error al cargar: {error}
          </CardContent>
        </Card>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <CalendarDays className="w-3.5 h-3.5" />
        <span>{loading ? 'Cargando...' : `${data?.length || 0} OTs en el periodo visible`}</span>
      </div>

      {/* Diálogo detalle de OT */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        {detalle && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="font-mono">{detalle.numero}</span>
                <EstadoBadge estado={detalle.estado} label={OT_ESTADOS[detalle.estado]} />
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex flex-wrap gap-2">
                <EstadoBadge estado={detalle.tipo} label={OT_TIPOS[detalle.tipo]} />
                <EstadoBadge estado={detalle.prioridad} label={OT_PRIORIDADES[detalle.prioridad]} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                  Descripción
                </p>
                <p className="text-sm">{detalle.descripcion}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Programada</p>
                    <p className="font-medium tabular-nums">
                      {formatFecha(detalle.fechaProgramada)} · {formatHora(detalle.fechaProgramada)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Equipo</p>
                    <p className="font-medium">
                      {detalle.equipo.codigo} · {detalle.equipo.marca}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Técnico</p>
                    <p className="font-medium">
                      {detalle.tecnico
                        ? `${detalle.tecnico.nombre} ${detalle.tecnico.apellidos}`
                        : 'Sin asignar'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                  Cliente
                </p>
                <p className="text-[13px] font-medium">{detalle.equipo.cliente.nombre}</p>
                <p className="text-[12px] text-muted-foreground">
                  {EQUIPO_TIPOS[detalle.equipo.tipo]} · {detalle.equipo.modelo}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              <Button size="sm" onClick={() => onNavigate('ordenes')}>
                Ver en Órdenes
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Diálogo día seleccionado — lista compacta */}
      <Dialog open={!!diaSeleccionado} onOpenChange={(o) => !o && setDiaSeleccionado(null)}>
        {diaSeleccionado && (
          <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto scrollbar-thin">
            <DialogHeader>
              <DialogTitle className="text-base">
                {diaSeleccionado.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {ordensDelDia(diaSeleccionado).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No hay órdenes programadas este día.
                </p>
              ) : (
                ordensDelDia(diaSeleccionado).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setDetalle(o)
                      setDiaSeleccionado(null)
                    }}
                    className="w-full text-left p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-mono font-medium">{o.numero}</span>
                      <EstadoBadge estado={o.estado} label={OT_ESTADOS[o.estado]} />
                      <EstadoBadge estado={o.tipo} label={OT_TIPOS[o.tipo]} />
                      <EstadoBadge estado={o.prioridad} label={OT_PRIORIDADES[o.prioridad]} />
                      <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                        {formatHora(o.fechaProgramada)}
                      </span>
                    </div>
                    <p className="text-[12px] mb-1 line-clamp-2">{o.descripcion}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.equipo.codigo} · {o.equipo.marca} {o.equipo.modelo} · {o.equipo.cliente.nombre}
                      {o.tecnico && ` · ${o.tecnico.nombre} ${o.tecnico.apellidos}`}
                    </p>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setDiaSeleccionado(null)}>
                Cerrar
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
