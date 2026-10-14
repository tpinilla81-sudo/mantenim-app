'use client'

import { useState, useMemo } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { EQUIPO_TIPOS, formatFecha, diasHasta } from '@/lib/constants'
import { cn } from '@/lib/utils'

type ViewKey = 'dashboard' | 'clientes' | 'equipos' | 'contratos' | 'ordenes' | 'calendario' | 'sync' | 'revisiones'

interface RevisionEquipo {
  id: string
  cliente: { id: string; nombre: string } | null
}
interface RevisionItem {
  id: string
  tipo: string // POR_HORAS | POR_CONTRATO
  nivel: string | null // PEQUENA | MEDIA | GRANDE | CONTRATO
  horasObjetivo: number | null
  fechaProgramada: string
  estado: string // PROGRAMADA | VENCIDA | COMPLETADA
  equipo: {
    id: string
    codigo: string
    marca: string
    modelo: string
    tipo: string
    horasUso: number
    cliente: { id: string; nombre: string } | null
  }
}

interface RevisionesResponse {
  data: RevisionItem[]
  stats: {
    totalProgramadas: number
    totalVencidas: number
    totalCompletadas: number
    enProximosDias: number
    dias: number
  }
}

const NIVEL_LABEL: Record<string, string> = {
  PEQUENA: 'Pequeña (250h)',
  MEDIA: 'Media (500h)',
  GRANDE: 'Grande (1000h)',
  CONTRATO: 'Por contrato',
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'emerald' | 'amber' | 'sky' | 'gray'
}) {
  const colorClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    gray: 'bg-muted text-muted-foreground',
  }[color]
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[12px] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {value.toLocaleString('es-ES')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function RevisionesView() {
  const [estadoFilter, setEstadoFilter] = useState('TODAS')
  const [diasWindow, setDiasWindow] = useState('60')

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (estadoFilter !== 'TODAS') params.set('estado', estadoFilter)
    params.set('dias', diasWindow)
    params.set('limit', '200')
    return `/api/revisiones?${params.toString()}`
  }, [estadoFilter, diasWindow])

  const { data: resp, loading, error, refetch } = useFetch<RevisionesResponse>(url)

  const data = resp?.data || []
  const stats = resp?.stats

  const markAsCompleted = async (rev: RevisionItem) => {
    try {
      const res = await fetch(`/api/revisiones/${rev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'COMPLETADA',
          fechaRealizada: new Date().toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Revisión marcada como completada: ${rev.equipo.codigo}`)
      refetch()
    } catch (err) {
      toast.error('Error al actualizar', { description: (err as Error).message })
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px]">
      {/* KPIs */}
      {stats && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Programadas"
            value={stats.totalProgramadas}
            icon={CalendarClock}
            color="sky"
          />
          <KpiCard
            label="Vencidas"
            value={stats.totalVencidas}
            icon={AlertTriangle}
            color="amber"
          />
          <KpiCard
            label={`Próximos ${stats.dias} días`}
            value={stats.enProximosDias}
            icon={Clock}
            color="emerald"
          />
          <KpiCard
            label="Completadas"
            value={stats.totalCompletadas}
            icon={CheckCircle2}
            color="gray"
          />
        </section>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas las revisiones</SelectItem>
            <SelectItem value="PROGRAMADA">Programadas</SelectItem>
            <SelectItem value="VENCIDA">Vencidas</SelectItem>
            <SelectItem value="COMPLETADA">Completadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={diasWindow} onValueChange={setDiasWindow}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Próximos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">Próximos 15 días</SelectItem>
            <SelectItem value="30">Próximos 30 días</SelectItem>
            <SelectItem value="60">Próximos 60 días</SelectItem>
            <SelectItem value="90">Próximos 90 días</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Actualizar
        </Button>
      </div>

      {/* Tabla */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Calendario de revisiones calculadas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-rose-700 text-sm">Error: {error}</div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay revisiones que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Las revisiones se calculan automáticamente al importar equipos.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[120px]">Fecha</TableHead>
                    <TableHead className="min-w-[80px] text-center">Días</TableHead>
                    <TableHead className="min-w-[160px]">Equipo</TableHead>
                    <TableHead className="min-w-[200px]">Cliente</TableHead>
                    <TableHead className="min-w-[140px]">Tipo revisión</TableHead>
                    <TableHead className="min-w-[140px]">Nivel</TableHead>
                    <TableHead className="text-center min-w-[120px]">Horas actual / obj.</TableHead>
                    <TableHead className="text-center min-w-[100px]">Estado</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((rev) => {
                    const dias = diasHasta(rev.fechaProgramada)
                    const vencida = rev.estado === 'VENCIDA' || (dias !== null && dias < 0)
                    return (
                      <TableRow
                        key={rev.id}
                        className={cn('hover:bg-muted/30', vencida && 'bg-amber-50/30')}
                      >
                        <TableCell className="text-[12px] tabular-nums">
                          {formatFecha(rev.fechaProgramada)}
                        </TableCell>
                        <TableCell className="text-center">
                          {dias === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : dias === 0 ? (
                            <EstadoBadge estado="EN_PROCESO" label="Hoy" />
                          ) : dias < 0 ? (
                            <span className="text-[11px] font-medium text-rose-700">
                              {-dias}d vencida
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              en {dias}d
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-[12px] font-mono font-medium">
                            {rev.equipo.codigo}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {EQUIPO_TIPOS[rev.equipo.tipo] || rev.equipo.tipo} · {rev.equipo.marca} {rev.equipo.modelo}
                          </p>
                        </TableCell>
                        <TableCell className="text-[12px] truncate max-w-[200px]">
                          {rev.equipo.cliente?.nombre || '—'}
                        </TableCell>
                        <TableCell>
                          <EstadoBadge
                            estado={rev.tipo}
                            label={rev.tipo === 'POR_CONTRATO' ? 'Por contrato' : 'Por horas'}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-[12px]">
                            {rev.nivel ? NIVEL_LABEL[rev.nivel] || rev.nivel : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-[12px] tabular-nums">
                          {rev.equipo.horasUso.toLocaleString('es-ES')}
                          {rev.horasObjetivo && (
                            <span className="text-muted-foreground">
                              {' / '}
                              {rev.horasObjetivo.toLocaleString('es-ES')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <EstadoBadge estado={rev.estado} label={
                            rev.estado === 'PROGRAMADA' ? 'Programada' :
                            rev.estado === 'VENCIDA' ? 'Vencida' :
                            rev.estado === 'COMPLETADA' ? 'Completada' : rev.estado
                          } />
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {rev.estado !== 'COMPLETADA' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px]"
                              onClick={() => markAsCompleted(rev)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Completar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.length === 200 && (
        <p className="text-[12px] text-muted-foreground text-center">
          Mostrando las primeras 200 revisiones. Afilna los filtros para ver más.
        </p>
      )}
    </div>
  )
}
