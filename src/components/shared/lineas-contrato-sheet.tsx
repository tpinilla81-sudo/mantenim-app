'use client'

// Hoja de Líneas de Contrato de mantenimiento (solo lectura).
//
// Muestra EXACTAMENTE los 15 campos del Excel "Lista Líneas de Contrato"
// de Business Central, con el mismo formato que EquiposView:
//   - Autofiltro tipo Excel (popover con checkboxes por valor único)
//   - Cabecera sticky con fondo marcado
//   - table-fixed + colgroup con porcentajes = sin scroll horizontal
//
// La importación del Excel se hace desde la sección "Sincronizar BC"
// (SyncView) seleccionando el tipo "Excel 3 · Líneas contrato".

import { useState, useMemo } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { FileSpreadsheet, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ColumnFilterHeader } from '@/components/shared/equipos-table-shared'

interface LineaContrato {
  id: string
  estadoContrato: string
  numeroContrato: string
  numeroCliente: string | null
  clienteId: string | null
  nombreCliente: string | null
  shipToCode: string | null
  codGrupoContrato: string | null
  fechaInicioContrato: string | null
  fechaFinContrato: string | null
  numeroLinea: string
  numeroProductoServicio: string | null
  descripcion: string | null
  numeroSerie: string | null
  equipoId: string | null
  fechaInicial: string | null
  periodoServicio: string | null
  siguienteFechaServicio: string | null
}

const COLS: Array<{ key: keyof LineaContrato; title: string; width: string }> = [
  { key: 'estadoContrato',          title: 'Estado contrato',     width: '5%' },
  { key: 'numeroContrato',          title: 'Nº Contrato',         width: '7%' },
  { key: 'numeroCliente',           title: 'Nº cliente',          width: '5%' },
  { key: 'nombreCliente',           title: 'Nombre Cliente',      width: '12%' },
  { key: 'shipToCode',              title: 'Ship-to Code',        width: '5%' },
  { key: 'codGrupoContrato',        title: 'Cód. grupo contrato', width: '6%' },
  { key: 'fechaInicioContrato',     title: 'Contract Starting Date', width: '7%' },
  { key: 'fechaFinContrato',        title: 'Contract Ending Date',  width: '7%' },
  { key: 'numeroLinea',             title: 'Nº línea',            width: '4%' },
  { key: 'numeroProductoServicio',  title: 'Nº prod. servicio',   width: '5%' },
  { key: 'descripcion',             title: 'Descripción',         width: '12%' },
  { key: 'numeroSerie',             title: 'Nº Serie',            width: '9%' },
  { key: 'fechaInicial',            title: 'Fecha inicial',       width: '6%' },
  { key: 'periodoServicio',         title: 'Periodo servicio',    width: '4%' },
  { key: 'siguienteFechaServicio',  title: 'Siguiente fecha serv. planif.', width: '6%' },
]

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getCell(lc: LineaContrato, col: keyof LineaContrato): string {
  const v = lc[col]
  if (v == null || v === '') return '—'
  if (
    col === 'fechaInicioContrato' ||
    col === 'fechaFinContrato' ||
    col === 'fechaInicial' ||
    col === 'siguienteFechaServicio'
  ) {
    return fmtFecha(v as string)
  }
  return String(v)
}

export function LineasContratoSheet() {
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({})

  const { data: resp, loading, error } = useFetch<{ data: LineaContrato[]; total: number }>(
    '/api/lineas-contrato?limit=50000'
  )

  const allData = resp?.data || []

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const c of COLS) {
      const set = new Set<string>()
      for (const lc of allData) set.add(getCell(lc, c.key))
      map[c.key] = Array.from(set)
    }
    return map
  }, [allData])

  const data = useMemo(() => {
    return allData.filter((lc) => {
      for (const [col, selected] of Object.entries(colFilters)) {
        if (!selected || selected.length === 0) continue
        const cellVal = getCell(lc, col as keyof LineaContrato)
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
          {data.length !== allData.length ? ` de ${allData.length}` : ''} líneas de contrato
          {total > allData.length && (
            <span className="text-muted-foreground"> · {total.toLocaleString('es-ES')} totales en BD</span>
          )}
          {activeFilterCount > 0 && ' (filtradas)'}
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
        <p className="text-[11px] text-muted-foreground lg:ml-auto">
          {allData.length === 0
            ? 'Para cargar datos: Sincronizar BC → Excel 3 · Líneas contrato'
            : 'Para actualizar: Sincronizar BC → Excel 3 · Líneas contrato'}
        </p>
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
              <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">
                {allData.length === 0
                  ? 'No hay líneas de contrato cargadas'
                  : 'No hay líneas que coincidan con los filtros'}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-md mx-auto">
                {allData.length === 0
                  ? 'Ve a la sección "Sincronizar BC" y sube el Excel "Lista Líneas de Contrato" (tipo Excel 3 · Líneas contrato).'
                  : 'Limpia los filtros para ver todas las líneas.'}
              </p>
            </div>
          ) : (
            <div
              className="overflow-y-auto overflow-x-hidden scrollbar-thin"
              style={{ maxHeight: 'calc(100vh - 220px)' }}
            >
              <table className="w-full table-fixed caption-bottom text-sm border-separate border-spacing-0">
                <colgroup>
                  {COLS.map((c) => (
                    <col key={c.key} style={{ width: c.width }} />
                  ))}
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-muted">
                    {COLS.map((c) => {
                      const opts = uniqueValues[c.key] || []
                      const sel = colFilters[c.key] || []
                      return (
                        <TableHead
                          key={c.key}
                          className="sticky top-0 z-20 bg-muted border-b border-border shadow-sm px-1 align-bottom"
                        >
                          <ColumnFilterHeader
                            title={c.title}
                            options={opts}
                            selected={sel}
                            onChange={(vals) => updateFilter(c.key, vals)}
                          />
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((lc) => (
                    <TableRow key={lc.id} className="hover:bg-muted/30">
                      {COLS.map((c) => (
                        <TableCell
                          key={c.key}
                          className={cn(
                            'px-2 py-1.5 max-w-0',
                            c.key === 'numeroLinea' ||
                              c.key === 'numeroProductoServicio' ||
                              c.key === 'periodoServicio' ||
                              c.key === 'shipToCode' ||
                              c.key === 'numeroCliente'
                                ? 'text-center tabular-nums'
                                : ''
                          )}
                        >
                          <div
                            className={cn(
                              'text-[12px] truncate',
                              c.key === 'numeroContrato' || c.key === 'numeroSerie'
                                ? 'font-mono'
                                : '',
                              c.key === 'descripcion' ? 'text-foreground' : 'text-muted-foreground',
                              c.key === 'codGrupoContrato' && lc.codGrupoContrato
                                ? 'font-medium text-foreground'
                                : ''
                            )}
                          >
                            {getCell(lc, c.key)}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
