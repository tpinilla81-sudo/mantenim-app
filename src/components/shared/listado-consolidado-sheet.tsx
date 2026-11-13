'use client'

// Listado consolidado de productos de servicio con contrato vigente.
//
// Muestra los campos del flujo:
//   - Nº producto servicio
//   - Nº serie
//   - Descripción
//   - Cliente
//   - Nº contrato vigente
//   - Tipo contrato (codGrupoContrato)
//   - Fecha inicio contrato
//   - Fecha fin contrato
//   - Fecha última revisión
//   - Próxima revisión
//   - Estado
//
// Con autofiltro tipo Excel, sticky header, sin scroll horizontal.

import { useState, useMemo } from 'react'
import { useFetch } from '@/lib/use-fetch'
import { Filter, FileSpreadsheet } from 'lucide-react'
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
import { EstadoBadge } from '@/components/shared/estado-badge'
import { EQUIPO_ESTADOS, formatFecha, diasHasta } from '@/lib/constants'

interface Item {
  id: string
  numeroProductoServicio: string | null
  codigo: string
  numeroSerie: string
  descripcion: string
  cliente: string | null
  contratoVigente: string | null
  tipoContrato: string | null
  fechaInicioContrato: string | null
  fechaFinContrato: string | null
  periodoServicio: string | null
  ultimaRevision: string | null
  proximaRevisionFecha: string | null
  proximaRevisionHoras: number | null
  horasUso: number
  tipoRevision: string
  estado: string
  esMaquinaPropia: boolean
  ubicacion: string | null
  revisionesContratadasAnual: number | null
  tieneContratoVigente: boolean
}

const COLS: Array<{ key: string; title: string; width: string; align?: 'left' | 'center' }> = [
  { key: 'numeroProductoServicio', title: 'Nº prod. servicio', width: '7%' },
  { key: 'descripcion',             title: 'Descripción',       width: '12%' },
  { key: 'numeroSerie',             title: 'Nº Serie',          width: '9%' },
  { key: 'cliente',                 title: 'Cliente',           width: '11%' },
  { key: 'contratoVigente',         title: 'Contrato vigente',  width: '8%' },
  { key: 'tipoContrato',            title: 'Tipo contrato',     width: '6%' },
  { key: 'fechaInicioContrato',     title: 'Inicio contrato',   width: '7%' },
  { key: 'fechaFinContrato',        title: 'Fin contrato',      width: '7%' },
  { key: 'ultimaRevision',          title: 'Última revisión',   width: '7%' },
  { key: 'proximaRevisionFecha',    title: 'Próxima revisión',  width: '8%' },
  { key: 'horasUso',                title: 'Horas',             width: '5%', align: 'center' },
  { key: 'tipoRevision',            title: 'Tipo rev.',         width: '6%' },
  { key: 'estado',                  title: 'Estado',            width: '7%', align: 'center' },
]
// Total: 7+12+9+11+8+6+7+7+7+8+5+6+7 = 100%

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getCell(item: Item, col: string): string {
  const v = (item as any)[col]
  if (v == null || v === '') return '—'
  if (
    col === 'fechaInicioContrato' ||
    col === 'fechaFinContrato' ||
    col === 'ultimaRevision' ||
    col === 'proximaRevisionFecha'
  ) {
    return fmtFecha(v)
  }
  if (col === 'tipoContrato') {
    return v || '—'
  }
  if (col === 'tipoRevision') {
    return v === 'POR_CONTRATO' ? 'Contrato' : 'Por horas'
  }
  if (col === 'estado') {
    return EQUIPO_ESTADOS[v] || v
  }
  return String(v)
}

export function ListadoConsolidadoSheet() {
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({})
  const [soloConContrato, setSoloConContrato] = useState(true)

  const url = `/api/revisiones/listado-consolidado?limit=50000${soloConContrato ? '&soloConContrato=true' : ''}`
  const { data: resp, loading, error } = useFetch<{
    data: Item[]
    total: number
    conContratoVigente: number
    sinContratoVigente: number
  }>(url)

  const allData = resp?.data || []

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const c of COLS) {
      const set = new Set<string>()
      for (const item of allData) set.add(getCell(item, c.key))
      map[c.key] = Array.from(set)
    }
    return map
  }, [allData])

  const data = useMemo(() => {
    return allData.filter((item) => {
      for (const [col, selected] of Object.entries(colFilters)) {
        if (!selected || selected.length === 0) continue
        if (!selected.includes(getCell(item, col))) return false
      }
      return true
    })
  }, [allData, colFilters])

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
          {data.length !== allData.length ? ` de ${allData.length}` : ''} productos
          {activeFilterCount > 0 && ' (filtrados)'}
          {resp && (
            <span className="ml-2 text-muted-foreground">
              · {resp.conContratoVigente} con contrato vigente · {resp.sinContratoVigente} sin
            </span>
          )}
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
        <Button
          variant={soloConContrato ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSoloConContrato(!soloConContrato)}
          className="h-7 text-[12px] lg:ml-auto"
        >
          {soloConContrato ? 'Solo con contrato vigente' : 'Mostrar todos'}
        </Button>
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
              <p className="text-sm font-medium">No hay productos que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-md mx-auto">
                {soloConContrato
                  ? 'No hay productos con contrato vigente. Sube los Excels desde Sincronizar BC (Excel 1 + Excel 3) para poblar el listado.'
                  : 'No hay productos cargados. Sube los Excels desde Sincronizar BC.'}
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
                          className={cn(
                            'sticky top-0 z-20 bg-muted border-b border-border shadow-sm px-1 align-bottom',
                            c.align === 'center' ? 'text-center' : ''
                          )}
                        >
                          <ColumnFilterHeader
                            title={c.title}
                            options={opts}
                            selected={sel}
                            onChange={(vals) => updateFilter(c.key, vals)}
                            align={c.align === 'center' ? 'center' : 'left'}
                          />
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => {
                    const dias = item.proximaRevisionFecha
                      ? diasHasta(item.proximaRevisionFecha)
                      : null
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        {COLS.map((c) => (
                          <TableCell
                            key={c.key}
                            className={cn(
                              'px-2 py-1.5 max-w-0',
                              c.align === 'center' ? 'text-center tabular-nums' : ''
                            )}
                          >
                            {c.key === 'proximaRevisionFecha' ? (
                              <div>
                                <p className="text-[11px] tabular-nums truncate">
                                  {fmtFecha(item.proximaRevisionFecha)}
                                </p>
                                {dias !== null && (
                                  <p
                                    className={cn(
                                      'text-[10px] font-medium',
                                      dias < 0
                                        ? 'text-rose-600'
                                        : dias <= 30
                                          ? 'text-amber-600'
                                          : 'text-muted-foreground'
                                    )}
                                  >
                                    {dias < 0 ? `vencida ${-dias}d` : dias === 0 ? 'hoy' : `en ${dias}d`}
                                  </p>
                                )}
                              </div>
                            ) : c.key === 'tipoContrato' && item.tipoContrato ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium inline-block">
                                {item.tipoContrato}
                              </span>
                            ) : c.key === 'estado' ? (
                              <EstadoBadge
                                estado={item.estado}
                                label={EQUIPO_ESTADOS[item.estado] || item.estado}
                              />
                            ) : c.key === 'contratoVigente' ? (
                              <span
                                className={cn(
                                  'text-[11px] font-mono truncate block',
                                  item.contratoVigente
                                    ? 'text-foreground font-medium'
                                    : 'text-muted-foreground italic'
                                )}
                              >
                                {item.contratoVigente || 'sin contrato'}
                              </span>
                            ) : (
                              <div
                                className={cn(
                                  'text-[12px] truncate',
                                  c.key === 'numeroProductoServicio' || c.key === 'numeroSerie'
                                    ? 'font-mono text-muted-foreground'
                                    : '',
                                  c.key === 'descripcion' ? 'text-foreground' : 'text-muted-foreground',
                                  c.key === 'cliente' ? 'text-foreground' : ''
                                )}
                              >
                                {getCell(item, c.key)}
                              </div>
                            )}
                          </TableCell>
                        ))}
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
