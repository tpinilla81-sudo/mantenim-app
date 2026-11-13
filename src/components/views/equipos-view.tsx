'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Forklift,
  Clock,
  MapPin,
  FileSpreadsheet,
  Upload,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  EQUIPO_TIPOS,
  EQUIPO_ESTADOS,
  EQUIPO_TIPO_ICONS,
  formatFecha,
  isoToInputDate,
  diasHasta,
} from '@/lib/constants'

interface ClienteOption {
  id: string
  nombre: string
  nif: string
}

interface Equipo {
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
  // Campos nuevos (pueden no existir si equipo creado antes de la actualización)
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

interface EquipoFormData {
  codigo: string
  tipo: string
  marca: string
  modelo: string
  numeroSerie: string
  anioFabricacion: string
  ubicacion: string
  fechaInstalacion: string
  estado: string
  horasUso: string
  ultimaRevision: string
  notas: string
  clienteId: string
  // Manual: nº de revisiones contratadas al año (para POR_CONTRATO M1/M2/FSCR/FSSR)
  revisionesContratadasAnual: string
  // Campos para máquinas propias
  esMaquinaPropia: boolean
  horasAnualesEstimadas: string
  umbralHorasActual: string // 500 o 1000 (vacío = default 500)
}

const EMPTY_FORM: EquipoFormData = {
  codigo: '',
  tipo: 'MONTACARGAS_ELECTRICO',
  marca: '',
  modelo: '',
  numeroSerie: '',
  anioFabricacion: '',
  ubicacion: '',
  fechaInstalacion: '',
  estado: 'OPERATIVO',
  horasUso: '0',
  ultimaRevision: '',
  notas: '',
  clienteId: '',
  revisionesContratadasAnual: '',
  esMaquinaPropia: false,
  horasAnualesEstimadas: '',
  umbralHorasActual: '',
}

// Devuelve el valor mostrable (string) de una columna para un equipo.
// Se usa tanto para el filtrado como para listar valores únicos en el autofiltro.
function getCellValue(eq: Equipo, col: string): string {
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
function ColumnFilterHeader({
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

  const alignClass = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'

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

export function EquiposView() {
  // Filtros por columna (tipo Excel autofilter): cada columna guarda un array
  // de valores seleccionados. Vacío = mostrar todos.
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Equipo | null>(null)
  const [form, setForm] = useState<EquipoFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Equipo | null>(null)
  const [uploadingExcel, setUploadingExcel] = useState(false)
  const fileUploadRef = useRef<HTMLInputElement>(null)
  const [toggleTarget, setToggleTarget] = useState<Equipo | null>(null)
  const [deleteAllTarget, setDeleteAllTarget] = useState(false)

  const { data: clientesResp } = useFetch<{ data: ClienteOption[]; total: number }>(
    '/api/clientes?limit=500'
  )
  const clientesList = clientesResp?.data || []

  // Cargar TODOS los equipos (sin paginación, con scroll)
  const url = '/api/equipos?limit=20000'
  const { data: resp, loading, error, refetch } = useFetch<{
    data: Equipo[]
    total: number
  }>(url)

  // Filtrado client-side por columna (tipo Excel autofilter):
  // cada columna guarda un array de valores seleccionados; se muestra
  // la fila solo si el valor de la celda está en el array (OR dentro de la
  // columna, AND entre columnas).
  const allData = resp?.data || []

  // Lista de columnas filtrables y sus valores únicos (para los dropdowns).
  const FILTER_COLS: Array<{ key: string; title: string; align?: 'left' | 'center' | 'right' }> = [
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

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const c of FILTER_COLS) {
      const set = new Set<string>()
      for (const eq of allData) set.add(getCellValue(eq, c.key))
      map[c.key] = Array.from(set)
    }
    return map
  }, [allData])

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

  const updateFilter = (col: string, vals: string[]) => {
    setColFilters((prev) => {
      const next = { ...prev }
      if (vals && vals.length > 0) next[col] = vals
      else delete next[col]
      return next
    })
  }

  const clearAllFilters = () => setColFilters({})

  const activeFilterCount = Object.values(colFilters).filter((v) => v && v.length > 0).length

  // Siguiente código automático
  useEffect(() => {
    if (dialogOpen && !editing && data && data.length > 0) {
      const maxNum = data.reduce((max, e) => {
        const m = e.codigo.match(/EQ-(\d+)/)
        if (m) return Math.max(max, parseInt(m[1], 10))
        return max
      }, 0)
      const next = `EQ-${String(maxNum + 1).padStart(3, '0')}`
      if (!form.codigo) setForm((f) => ({ ...f, codigo: next }))
    }
  }, [dialogOpen, editing, data])

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      clienteId: clientesList?.[0]?.id || '',
    })
    setDialogOpen(true)
  }

  const openEdit = (e: Equipo) => {
    setEditing(e)
    setForm({
      codigo: e.codigo,
      tipo: e.tipo,
      marca: e.marca,
      modelo: e.modelo,
      numeroSerie: e.numeroSerie,
      anioFabricacion: e.anioFabricacion?.toString() || '',
      ubicacion: e.ubicacion || '',
      fechaInstalacion: isoToInputDate(e.fechaInstalacion),
      estado: e.estado,
      horasUso: e.horasUso.toString(),
      ultimaRevision: isoToInputDate(e.ultimaRevision),
      notas: e.notas || '',
      clienteId: e.clienteId,
      revisionesContratadasAnual: e.revisionesContratadasAnual?.toString() || '',
      esMaquinaPropia: e.esMaquinaPropia || false,
      horasAnualesEstimadas: e.horasAnualesEstimadas?.toString() || '',
      umbralHorasActual: e.umbralHorasActual?.toString() || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.codigo.trim() || !form.marca.trim() || !form.modelo.trim() ||
        !form.numeroSerie.trim() || !form.clienteId) {
      toast.error('Completa código, marca, modelo, Nº serie y cliente')
      return
    }
    setSaving(true)
    try {
      // Preparar payload con conversiones de tipos
      const payload = {
        ...form,
        revisionesContratadasAnual: form.revisionesContratadasAnual
          ? Number(form.revisionesContratadasAnual)
          : null,
        horasAnualesEstimadas: form.horasAnualesEstimadas
          ? Number(form.horasAnualesEstimadas)
          : null,
        umbralHorasActual: form.umbralHorasActual
          ? Number(form.umbralHorasActual)
          : null,
      }
      if (editing) {
        await apiFetch(`/api/equipos/${editing.id}`, 'PUT', payload)
        toast.success('Equipo actualizado correctamente')
        // Si cambiaron campos que afectan al cálculo, forzar recalc del equipo
        const cambioRevContratadas = form.revisionesContratadasAnual !== (editing.revisionesContratadasAnual?.toString() || '')
        const cambioUltimaRev = form.ultimaRevision !== (editing.ultimaRevision ? isoToInputDate(editing.ultimaRevision) : '')
        const cambioMaquinaPropia = form.esMaquinaPropia !== (editing.esMaquinaPropia || false)
        const cambioHorasAnuales = form.horasAnualesEstimadas !== (editing.horasAnualesEstimadas?.toString() || '')
        const cambioUmbral = form.umbralHorasActual !== (editing.umbralHorasActual?.toString() || '')
        if (cambioRevContratadas || cambioUltimaRev || cambioMaquinaPropia || cambioHorasAnuales || cambioUmbral) {
          await fetch(`/api/equipos/${editing.id}/recalc-revision`, { method: 'POST' })
            .catch(() => {})
        }
      } else {
        await apiFetch('/api/equipos', 'POST', payload)
        toast.success('Equipo creado correctamente')
      }
      setDialogOpen(false)
      refetch()
    } catch (err) {
      toast.error('Error al guardar', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/api/equipos/${deleteTarget.id}`, 'DELETE')
      toast.success(`Equipo "${deleteTarget.codigo}" eliminado`)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al eliminar', { description: (err as Error).message })
    }
  }

  const handleDeleteAll = async () => {
    setDeleteAllTarget(false)
    try {
      const res = await fetch('/api/equipos/all', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Listado borrado: ${json.deleted.equipos} equipos eliminados`)
      refetch()
    } catch (err) {
      toast.error('Error al borrar', { description: (err as Error).message })
    }
  }

  const handleToggleRevision = async (eq: Equipo) => {
    try {
      const res = await fetch(`/api/equipos/${eq.id}/toggle-revision`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(
        `${eq.codigo} → ${json.nuevoTipo === 'POR_CONTRATO' ? 'Por contrato (M1/M2)' : 'Por horas'}`
      )
      refetch()
    } catch (err) {
      toast.error('Error al alternar tipo de revisión', { description: (err as Error).message })
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px]">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <p className="text-[13px] text-muted-foreground">
          <strong className="text-foreground tabular-nums">{data.length}</strong>
          {data.length !== total ? ` de ${total}` : ''} equipos
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
        <div className="flex-1" />
        <a href="/api/equipos/template" download>
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Descargar plantilla
          </Button>
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileUploadRef.current?.click()}
          disabled={uploadingExcel}
        >
          {uploadingExcel ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Subiendo...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-1.5" />
              Subir Excel
            </>
          )}
        </Button>
        <input
          ref={fileUploadRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setUploadingExcel(true)
            try {
              const formData = new FormData()
              formData.append('file', file)
              formData.append('dryRun', 'false')
              const res = await fetch('/api/sync/excel-flexible', {
                method: 'POST',
                body: formData,
              })
              const json = await res.json()
              if (!res.ok) throw new Error(json.error || json.detail || `Error ${res.status}`)
              toast.success(
                `Excel procesado: ${json.rowsUpdated || 0} actualizados, ${json.rowsTotal || 0} filas total`,
                { description: `${json.columnsDetected?.length || 0} columnas reconocidas` }
              )
              refetch()
            } catch (err) {
              toast.error('Error al subir Excel', { description: (err as Error).message })
            } finally {
              setUploadingExcel(false)
              if (fileUploadRef.current) fileUploadRef.current.value = ''
            }
          }}
        />
        <Button onClick={openCreate} disabled={!clientesList?.length}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo equipo
        </Button>
        {data.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteAllTarget(true)}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Borrar listado
          </Button>
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
              <p className="text-sm font-medium">No hay equipos que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Registra una grúa o montacargas para empezar.
              </p>
            </div>
          ) : (
            <div
              className="overflow-y-auto overflow-x-hidden scrollbar-thin"
              style={{ maxHeight: 'calc(100vh - 170px)' }}
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
                  <col style={{ width: '10%' }} />  {/* Acciones */}
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
                        Acciones
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((eq) => (
                    <TableRow key={eq.id} className="hover:bg-muted/30">
                      <TableCell className="px-2 py-1.5">
                        <div className="text-[12px] font-mono font-medium truncate">{eq.codigo}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[12px] truncate">{eq.modelo || '—'}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[11px] font-mono text-muted-foreground truncate">{eq.numeroSerie}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[12px] truncate">
                          {eq.marca !== '—' ? `${eq.marca} ${eq.modelo}` : eq.modelo || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        {eq.esMaquinaPropia ? (
                          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">Sí</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[12px] truncate">{eq.cliente?.nombre || '—'}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[12px] text-muted-foreground truncate">{eq.ubicacion || '—'}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center text-[12px] tabular-nums">
                        <div className="truncate">{eq.horasUso.toLocaleString('es-ES')}</div>
                        {eq.proximaRevisionHoras != null && (
                          <p className="text-[10px] text-muted-foreground truncate">→ {eq.proximaRevisionHoras.toLocaleString('es-ES')}h</p>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        {eq.proximaRevisionFecha ? (
                          <div>
                            <p className="text-[11px] tabular-nums truncate">{formatFecha(eq.proximaRevisionFecha)}</p>
                            {(() => {
                              const d = diasHasta(eq.proximaRevisionFecha)
                              if (d === null) return null
                              if (d < 0) return <p className="text-[10px] text-rose-700 font-medium">vencida {-d}d</p>
                              if (d === 0) return <p className="text-[10px] text-amber-700 font-medium">hoy</p>
                              return <p className="text-[10px] text-muted-foreground">en {d}d</p>
                            })()}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 max-w-0">
                        <div className="text-[11px] font-mono text-muted-foreground truncate">{eq.contratoActivoId || '—'}</div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-center">
                        <EstadoBadge estado={eq.estado} label={EQUIPO_ESTADOS[eq.estado] || eq.estado} />
                      </TableCell>
                      <TableCell className="px-1 py-1 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleToggleRevision(eq)}
                            aria-label="Alternar tipo revisión"
                            title={eq.tipoRevision === 'POR_CONTRATO' ? 'Cambiar a Por horas' : 'Cambiar a Por contrato (M1/M2)'}
                          >
                            {eq.tipoRevision === 'POR_CONTRATO' ? (
                              <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ToggleLeft className="w-3.5 h-3.5 text-amber-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(eq)}
                            aria-label="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => setDeleteTarget(eq)}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar equipo ${editing.codigo}` : 'Nuevo equipo'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del equipo y guarda los cambios.'
                : 'Registra una grúa o montacargas nuevo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código interno *</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="EQ-012"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipo">Tipo de equipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EQUIPO_TIPOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marca">Marca *</Label>
                <Input
                  id="marca"
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  placeholder="Toyota, Liebherr, Comansa..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelo">Modelo *</Label>
                <Input
                  id="modelo"
                  value={form.modelo}
                  onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                  placeholder="8FGU25, LTM 1055..."
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="numserie">Número de serie *</Label>
                <Input
                  id="numserie"
                  value={form.numeroSerie}
                  onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })}
                  placeholder="TG25-2021-7784"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="anio">Año de fabricación</Label>
                <Input
                  id="anio"
                  type="number"
                  value={form.anioFabricacion}
                  onChange={(e) => setForm({ ...form, anioFabricacion: e.target.value })}
                  placeholder="2020"
                  min="1980"
                  max="2030"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horas">Horas de uso</Label>
                <Input
                  id="horas"
                  type="number"
                  value={form.horasUso}
                  onChange={(e) => setForm({ ...form, horasUso: e.target.value })}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cliente">Cliente propietario *</Label>
                <Select
                  value={form.clienteId}
                  onValueChange={(v) => setForm({ ...form, clienteId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesList?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} ({c.nif})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ubicacion">Ubicación actual</Label>
                <Input
                  id="ubicacion"
                  value={form.ubicacion}
                  onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                  placeholder="Obra / nave / almacén"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instalacion">Fecha de instalación</Label>
                <Input
                  id="instalacion"
                  type="date"
                  value={form.fechaInstalacion}
                  onChange={(e) => setForm({ ...form, fechaInstalacion: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="revision">Última revisión</Label>
                <Input
                  id="revision"
                  type="date"
                  value={form.ultimaRevision}
                  onChange={(e) => setForm({ ...form, ultimaRevision: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estadoEq">Estado del equipo</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm({ ...form, estado: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EQUIPO_ESTADOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2 border-t border-border pt-4">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Tipo de máquina y cálculo de revisiones
                </p>
                <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-md">
                  <Checkbox
                    id="esMaquinaPropia"
                    checked={form.esMaquinaPropia}
                    onCheckedChange={(v) => setForm({ ...form, esMaquinaPropia: v === true })}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="esMaquinaPropia" className="text-[13px] font-medium cursor-pointer">
                      Es máquina propia (sin contrato, revisión por horas)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Máquinas del cliente = tienen contrato M1/M2/FSCR/FSSR con revisiones por calendario.
                      Máquinas propias = son de tu empresa, se revisan cada X horas (500 o 1000).
                    </p>
                  </div>
                </div>
                {form.esMaquinaPropia && (
                  <div className="grid grid-cols-2 gap-3 pl-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="horasAnuales">Horas/año estimadas</Label>
                      <Input
                        id="horasAnuales"
                        type="number"
                        min="0"
                        value={form.horasAnualesEstimadas}
                        onChange={(e) => setForm({ ...form, horasAnualesEstimadas: e.target.value })}
                        placeholder="Ej: 1500 (si no sabes, deja vacío)"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Para estimar cuándo se alcanzará el umbral. Vacío = fallback hoy+30d.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="umbral">Umbral de revisión</Label>
                      <Select
                        value={form.umbralHorasActual || '500'}
                        onValueChange={(v) => setForm({ ...form, umbralHorasActual: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="500">Cada 500 h (mantenimiento normal)</SelectItem>
                          <SelectItem value="1000">Cada 1000 h (revisión mayor)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Default 500h. Cambia a 1000h si solo se revisa cada 1000h.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {!form.esMaquinaPropia && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="revContratadas">Revisiones contratadas / año (M1/M2/FSCR/FSSR)</Label>
                  <Input
                    id="revContratadas"
                    type="number"
                    min="1"
                    max="52"
                    value={form.revisionesContratadasAnual}
                    onChange={(e) => setForm({ ...form, revisionesContratadasAnual: e.target.value })}
                    placeholder="Vacío = usa periodicidad del contrato (default 12m). 4 = trimestral, 2 = semestral, 12 = mensual"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Solo aplica a equipos POR_CONTRATO (M1/M2/FSCR/FSSR). Si rellenas este campo, la próxima revisión se calcula con periodicidad = 12/N meses.
                    <strong>Ejemplo:</strong> 4 → cada 3 meses · 2 → cada 6 meses · 1 → anual · 12 → mensual.
                  </p>
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="notasEq">Notas técnicas</Label>
                <Textarea
                  id="notasEq"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Especificaciones, certificaciones, particularidades..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear equipo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar equipo"
        description={`¿Eliminar el equipo "${deleteTarget?.codigo}" (${deleteTarget?.marca} ${deleteTarget?.modelo})? Se eliminarán también sus órdenes de trabajo asociadas.`}
        confirmText="Sí, eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={deleteAllTarget}
        title="Borrar todo el listado"
        description={`Se borrarán TODOS los ${data.length} equipos, sus revisiones y vínculos con contratos. Esta acción no se puede deshacer. ¿Estás seguro?`}
        confirmText="Sí, borrar todo"
        destructive
        onConfirm={handleDeleteAll}
        onCancel={() => setDeleteAllTarget(false)}
      />
    </div>
  )
}
