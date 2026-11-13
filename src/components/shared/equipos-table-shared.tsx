'use client'

// Componentes y utilidades compartidas para tablas de equipos.
// Se usa tanto en EquiposView como en RevisionesView (hoja "Equipos con contrato")
// para evitar duplicación y garantizar que ambas vistas tengan EXACTAMENTE los
// mismos campos, anchos y comportamiento de autofiltro tipo Excel.

import { useState, useMemo } from 'react'
import { Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { EQUIPO_ESTADOS, formatFecha } from '@/lib/constants'

// Interfaz Equipo (campos usados en la tabla compartida)
export interface Equipo {
  id: string
  codigo: string
  tipo: string
  marca: string
  modelo: string
  numeroSerie: string
  anioFabricacion: number | null
  ubicacion: string | null
  fechaInstalacion: string | null
  estado: string
  horasUso: number
  ultimaRevision: string | null
  notas: string | null
  clienteId: string
  cliente: { id: string; nombre: string }
  tipoRevision?: string
  umbralHorasActual?: number | null
  proximaRevisionHoras?: number | null
  proximaRevisionFecha?: string | null
  ultimoMantenimientoHoras?: number | null
  codigoProductoBC?: string | null
  contratoActivoId?: string | null
  revisionesContratadasAnual?: number | null
  esMaquinaPropia?: boolean
  horasAnualesEstimadas?: number | null
}

// Definición de columnas filtrables y sus etiquetas.
export const FILTER_COLS: Array<{
  key: string
  title: string
  align?: 'left' | 'center' | 'right'
}> = [
  { key: 'codigo',          title: 'Nº' },
  { key: 'modelo',          title: 'Descripción' },
  { key: 'numeroSerie',     title: 'Nº Serie' },
  { key: 'marcaModelo',     title: 'Modelo' },
  { key: 'esPropio',        title: 'Es propio',   align: 'center' },
  { key: 'cliente',         title: 'Cliente' },
  { key: 'ubicacion',       title: 'Ubicación' },
  { key: 'horasUso',        title: 'Horas',       align: 'center' },
  { key: 'proximaRevision', title: 'Próx. rev.' },
  { key: 'contrato',        title: 'Contrato' },
  { key: 'estado',          title: 'Estado',      align: 'center' },
]

// Devuelve el valor mostrable (string) de una columna para un equipo.
// Se usa tanto para el filtrado como para listar valores únicos en el autofiltro.
export function getCellValue(eq: Equipo, col: string): string {
  switch (col) {
    case 'codigo': return eq.codigo || ''
    case 'modelo': return eq.modelo || '—'
    case 'numeroSerie': return eq.numeroSerie || ''
    case 'marcaModelo': return `${eq.marca || ''} ${eq.modelo || ''}`.trim() || '—'
    case 'esPropio': return eq.esMaquinaPropia ? 'Sí' : 'No'
    case 'cliente': return eq.cliente?.nombre || '—'
    case 'ubicacion': return eq.ubicacion || '—'
    case 'horasUso': return eq.horasUso != null ? eq.horasUso.toLocaleString('es-ES') : '—'
    case 'proximaRevision': return eq.proximaRevisionFecha ? formatFecha(eq.proximaRevisionFecha) : '—'
    case 'contrato': return eq.contratoActivoId || '—'
    case 'estado': return EQUIPO_ESTADOS[eq.estado] || eq.estado
    default: return ''
  }
}

// Cabecera con autofiltro tipo Excel: botón que abre un popover con checkbox
// por cada valor único presente en la columna.
export function ColumnFilterHeader({
  title,
  options,
  selected,
  onChange,
  align = 'left',
}: {
  title: string
  options: string[]
  selected: string[]
  onChange: (vals: string[]) => void
  align?: 'left' | 'center' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const o of options) {
      if (!seen.has(o)) {
        seen.add(o)
        ordered.push(o)
      }
    }
    ordered.sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }))
    if (!search.trim()) return ordered
    const q = search.toLowerCase()
    return ordered.filter((o) => o.toLowerCase().includes(q))
  }, [options, search])

  const isActive = selected.length > 0
  const allSelected = isActive && selected.length === filteredOptions.length && !search

  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(filteredOptions)
  }

  const alignClass =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full h-9 px-2 text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors',
            alignClass,
            isActive
              ? 'text-primary border-b-primary bg-primary/5'
              : 'text-foreground border-b-transparent hover:bg-muted/60'
          )}
        >
          <span className="truncate">{title}</span>
          {isActive && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-none bg-primary text-primary-foreground">
              {selected.length}
            </span>
          )}
          <Filter className={cn('w-3 h-3 shrink-0 ml-auto', isActive ? 'text-primary' : 'text-muted-foreground')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-2 border-b">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar valor..."
            className="h-7 text-[12px]"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 border-b text-[11px] bg-muted/30">
          <button
            type="button"
            onClick={toggleAll}
            className="text-primary hover:underline font-medium"
          >
            {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Limpiar
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto scrollbar-thin py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              Sin valores
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const checked = selected.includes(opt)
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 cursor-pointer text-[12px]"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      if (v === true) onChange([...selected, opt])
                      else onChange(selected.filter((s) => s !== opt))
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{opt === '' ? '(vacío)' : opt}</span>
                </label>
              )
            })
          )}
        </div>
        {isActive && (
          <div className="px-2 py-1.5 border-t text-[10px] text-muted-foreground bg-muted/20">
            {selected.length} de {options.length} valores
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
