'use client'

// Hoja de equipos con contrato de mantenimiento.
// Misma estructura, columnas, anchos y autofiltro tipo Excel que EquiposView,
// pero solo muestra equipos con contratoActivoId no vacío (máquinas cliente con
// contrato M1/M2/FSCR/FSSR). Sin acciones de edición — es de solo lectura desde
// RevisionesView (para editar, hay que ir a Equipos).
//
// El parámetro `filterContracto` permite inyectar un filtro adicional por texto
// libre sobre el contratoActivoId (útil si se quiere acotar por contrato concreto).

import { useState, useMemo } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { Forklift, Filter, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  EQUIPO_ESTADOS,
  EQUIPO_TIPO_ICONS,
  formatFecha,
  diasHasta,
} from '@/lib/constants'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { cn } from '@/lib/utils'
import {
  Equipo,
  FILTER_COLS,
  getCellValue,
  ColumnFilterHeader,
} from '@/components/shared/equipos-table-shared'

interface EquiposContratoSheetProps {
  /** Si se pasa, solo muestra equipos cuyo contratoActivoId incluye este texto */
  filtroContratoExtra?: string
  /** Texto opcional a mostrar bajo el contador */
  hint?: string
}

export function EquiposContratoSheet({
  filtroContratoExtra,
  hint,
}: EquiposContratoSheetProps = {}) {
  // Filtros por columna (tipo Excel autofilter) — mismo tipo que EquiposView
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({})

  const url = '/api/equipos?limit=20000'
  const { data: resp, loading, error } = useFetch<{ data: Equipo[]; total: number }>(url)

  // Filtrado client-side: solo equipos con contratoActivoId
  const allData = useMemo(() => {
    const raw = resp?.data || []
    return raw.filter((eq) => {
      if (!eq.contratoActivoId || eq.contratoActivoId.trim() === '') return false
      if (filtroContratoExtra) {
        if (!eq.contratoActivoId.toLowerCase().includes(filtroContratoExtra.toLowerCase())) {
          return false
        }
      }
      return true
    })
  }, [resp, filtroContratoExtra])

  // Valores únicos por columna (para los dropdowns)
  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const c of FILTER_COLS) {
      const set = new Set<string>()
      for (const eq of allData) set.add(getCellValue(eq, c.key))
      map[c.key] = Array.from(set)
    }
    return map
  }, [allData])

  // Aplicar autofilter
  const data = useMemo(() => {
    return allData.filter((eq) => {
      for (const [col, selected] of Object.entries(colFilters)) {
        if (!selected || selected.length === 0) continue
        const cellVal = getCellValue(eq, col)
        if (!selected.includes(cellVal)) return false
      }
      return true
    })
  }, [allData, colFilters])

  const total = resp?.total || 0
  const activeFilterCount = Object.values(colFilters).filter(
    (v) => v && v.length > 0
  ).length

  const updateFilter = (col: string, vals: string[]) => {
    setColFilters((prev) => {
      const next = { ...prev }
      if (vals && vals.length > 0) next[col] = vals
      else delete next[col]
      return next
    })
  }
  const clearAllFilters = () => setColFilters({})

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <p className="text-[13px] text-muted-foreground">
          <strong className="text-foreground tabular-nums">{data.length}</strong>
          {data.length !== allData.length ? ` de ${allData.length} con contrato` : ' equipos con contrato'}
          {total > allData.length && (
            <span className="text-muted-foreground"> · {total.toLocaleString('es-ES')} totales en BD</span>
          )}
          {activeFilterCount > 0 && ' (filtrados)'}
        </p>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-7 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Filter className="w-3.5 h-3.5 mr-1" />
            Limpiar filtros ({activeFilterCount})
          </Button>
        )}
        {hint && (
          <p className="text-[11px] text-muted-foreground lg:ml-auto">{hint}</p>
        )}
      </div>

      {/* Tabla */}
      <Card className="border-border/80">
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
              <Forklift className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay equipos con contrato que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Los equipos con contrato de mantenimiento (M1/M2/FSCR/FSSR) aparecerán aquí.
                Importa el Excel de Business Central o marca equipos como &laquo;con contrato&raquo;.
              </p>
            </div>
          ) : (
            <div
              className="overflow-y-auto overflow-x-hidden scrollbar-thin"
              style={{ maxHeight: 'calc(100vh - 220px)' }}
            >
              <table className="w-full table-fixed caption-bottom text-sm border-separate border-spacing-0">
                <colgroup>
                  <col style={{ width: '6%' }} />   {/* Nº */}
                  <col style={{ width: '8%' }} />   {/* Descripción */}
                  <col style={{ width: '9%' }} />   {/* Nº Serie */}
                  <col style={{ width: '10%' }} />  {/* Modelo */}
                  <col style={{ width: '7%' }} />   {/* Es propio */}
                  <col style={{ width: '12%' }} />  {/* Cliente */}
                  <col style={{ width: '9%' }} />   {/* Ubicación */}
                  <col style={{ width: '6%' }} />   {/* Horas */}
                  <col style={{ width: '8%' }} />   {/* Próx. rev. */}
                  <col style={{ width: '8%' }} />   {/* Contrato */}
                  <col style={{ width: '7%' }} />   {/* Estado */}
                  <col style={{ width: '10%' }} />  {/* Próx. rev. detalle */}
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-muted">
                    {FILTER_COLS.map((c) => {
                      const opts = uniqueValues[c.key] || []
                      const sel = colFilters[c.key] || []
                      const alignClass =
                        c.align === 'center' ? 'text-center' :
                        c.align === 'right' ? 'text-right' : 'text-left'
                      return (
                        <TableHead
                          key={c.key}
                          className={cn(
                            'sticky top-0 z-20 bg-muted border-b border-border shadow-sm',
                            alignClass,
                            'px-1 align-bottom',
                          )}
                        >
                          <ColumnFilterHeader
                            title={c.title}
                            options={opts}
                            selected={sel}
                            onChange={(vals) => updateFilter(c.key, vals)}
                            align={c.align}
                          />
                        </TableHead>
                      )
                    })}
                    <TableHead className="sticky top-0 z-20 bg-muted border-b border-border shadow-sm text-right pr-2 align-bottom" style={{ width: '10%' }}>
                      <div className="h-9 flex items-center justify-end text-[12px] font-semibold text-foreground pr-1">
                        <CalendarClock className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                        Detalle rev.
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((eq) => {
                    const icon = EQUIPO_TIPO_ICONS[eq.tipo] || '🔧'
                    return (
                      <TableRow key={eq.id} className="hover:bg-muted/30">
                        <TableCell className="px-2 py-1.5">
                          <div className="text-[12px] font-mono font-medium truncate">
                            {icon} {eq.codigo}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[12px] truncate">{eq.modelo || '—'}</div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground truncate">
                            {eq.numeroSerie}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[12px] truncate">
                            {eq.marca !== '—' ? `${eq.marca} ${eq.modelo}` : eq.modelo || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-center">
                          {eq.esMaquinaPropia ? (
                            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                              Sí
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[12px] truncate">{eq.cliente?.nombre || '—'}</div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[12px] text-muted-foreground truncate">
                            {eq.ubicacion || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-center text-[12px] tabular-nums">
                          <div className="truncate">{eq.horasUso.toLocaleString('es-ES')}</div>
                          {eq.proximaRevisionHoras != null && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              → {eq.proximaRevisionHoras.toLocaleString('es-ES')}h
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          {eq.proximaRevisionFecha ? (
                            <div>
                              <p className="text-[11px] tabular-nums truncate">
                                {formatFecha(eq.proximaRevisionFecha)}
                              </p>
                              {(() => {
                                const d = diasHasta(eq.proximaRevisionFecha)
                                if (d === null) return null
                                if (d < 0)
                                  return (
                                    <p className="text-[10px] text-rose-700 font-medium">
                                      vencida {-d}d
                                    </p>
                                  )
                                if (d === 0)
                                  return <p className="text-[10px] text-amber-700 font-medium">hoy</p>
                                return <p className="text-[10px] text-muted-foreground">en {d}d</p>
                              })()}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 max-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground truncate">
                            {eq.contratoActivoId || '—'}
                          </div>
                          {eq.revisionesContratadasAnual != null && (
                            <p className="text-[10px] text-muted-foreground">
                              {eq.revisionesContratadasAnual} rev/año
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-center">
                          <EstadoBadge
                            estado={eq.estado}
                            label={EQUIPO_ESTADOS[eq.estado] || eq.estado}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right pr-2">
                          {eq.tipoRevision && (
                            <div className="flex flex-col items-end gap-0.5">
                              <span
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                                  eq.tipoRevision === 'POR_CONTRATO'
                                    ? 'bg-purple-50 border-purple-200 text-purple-700'
                                    : 'bg-blue-50 border-blue-200 text-blue-700'
                                )}
                              >
                                {eq.tipoRevision === 'POR_CONTRATO' ? 'Por contrato' : 'Por horas'}
                              </span>
                              {eq.ultimaRevision && (
                                <span className="text-[10px] text-muted-foreground">
                                  última: {formatFecha(eq.ultimaRevision)}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
