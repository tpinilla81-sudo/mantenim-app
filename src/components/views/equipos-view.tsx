'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Forklift,
  Clock,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

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
}

export function EquiposView() {
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('TODOS')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [clienteFilter, setClienteFilter] = useState('TODOS')
  const [tipoRevisionFilter, setTipoRevisionFilter] = useState('TODOS')
  const [page, setPage] = useState(0)
  const pageSize = 100
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Equipo | null>(null)
  const [form, setForm] = useState<EquipoFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Equipo | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Equipo | null>(null)

  const { data: clientesResp } = useFetch<{ data: ClienteOption[]; total: number }>(
    '/api/clientes?limit=500'
  )
  const clientesList = clientesResp?.data || []

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (tipoFilter !== 'TODOS') params.set('tipo', tipoFilter)
    if (estadoFilter !== 'TODOS') params.set('estado', estadoFilter)
    if (clienteFilter !== 'TODOS') params.set('clienteId', clienteFilter)
    if (tipoRevisionFilter !== 'TODOS') params.set('tipoRevision', tipoRevisionFilter)
    params.set('limit', String(pageSize))
    params.set('offset', String(page * pageSize))
    return `/api/equipos?${params.toString()}`
  }, [search, tipoFilter, estadoFilter, clienteFilter, tipoRevisionFilter, page])

  const { data: resp, loading, error, refetch } = useFetch<{
    data: Equipo[]
    total: number
    limit: number
    offset: number
  }>(url)

  const data = resp?.data || []
  const total = resp?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 0
  const canNext = page + 1 < totalPages

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }
  const handleTipoRevisionFilterChange = (v: string) => {
    setTipoRevisionFilter(v)
    setPage(0)
  }

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
      if (editing) {
        await apiFetch(`/api/equipos/${editing.id}`, 'PUT', form)
        toast.success('Equipo actualizado correctamente')
      } else {
        await apiFetch('/api/equipos', 'POST', form)
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
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por código, marca, modelo, serie..."
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los tipos</SelectItem>
            {Object.entries(EQUIPO_TIPOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            {Object.entries(EQUIPO_ESTADOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoRevisionFilter} onValueChange={handleTipoRevisionFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo revisión" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas las revisiones</SelectItem>
            <SelectItem value="POR_HORAS">Por horas</SelectItem>
            <SelectItem value="POR_CONTRATO">Por contrato (M1/M2)</SelectItem>
          </SelectContent>
        </Select>
        {clientesList && (
          <Select value={clienteFilter} onValueChange={setClienteFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los clientes</SelectItem>
              {clientesList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <Button onClick={openCreate} disabled={!clientesList?.length}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo equipo
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
              <Forklift className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay equipos que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Registra una grúa o montacargas para empezar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[180px]">Equipo</TableHead>
                    <TableHead className="min-w-[160px]">Marca / Modelo</TableHead>
                    <TableHead className="min-w-[140px]">Nº serie</TableHead>
                    <TableHead className="min-w-[180px]">Cliente</TableHead>
                    <TableHead className="min-w-[160px]">Ubicación</TableHead>
                    <TableHead className="text-center min-w-[100px]">Horas</TableHead>
                    <TableHead className="min-w-[150px]">Tipo revisión</TableHead>
                    <TableHead className="min-w-[120px]">Últ. revisión</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((eq) => (
                    <TableRow key={eq.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-accent text-accent-foreground flex items-center justify-center text-base shrink-0">
                            {EQUIPO_TIPO_ICONS[eq.tipo]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-mono font-medium">{eq.codigo}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {EQUIPO_TIPOS[eq.tipo]}
                              {eq.anioFabricacion ? ` · ${eq.anioFabricacion}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-[12px] font-medium">{eq.marca}</p>
                          <p className="text-[11px] text-muted-foreground">{eq.modelo}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] font-mono text-muted-foreground">
                        {eq.numeroSerie}
                      </TableCell>
                      <TableCell className="text-[12px] truncate max-w-[180px]">
                        {eq.cliente.nombre}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{eq.ubicacion || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        <div className="inline-flex items-center gap-1 text-[12px]">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {eq.horasUso.toLocaleString('es-ES')}
                        </div>
                        {eq.proximaRevisionHoras != null && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            → {eq.proximaRevisionHoras.toLocaleString('es-ES')} h
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {eq.tipoRevision === 'POR_CONTRATO' ? (
                          <EstadoBadge estado="PROGRAMADA" label="Por contrato" />
                        ) : (
                          <EstadoBadge estado="EN_PROCESO" label="Por horas" />
                        )}
                        {eq.proximaRevisionFecha && (
                          <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                            {formatFecha(eq.proximaRevisionFecha)}
                            {(() => {
                              const d = diasHasta(eq.proximaRevisionFecha)
                              if (d === null) return ''
                              if (d < 0) return ` · vencida ${-d}d`
                              if (d === 0) return ' · hoy'
                              return ` · en ${d}d`
                            })()}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-[12px] tabular-nums">
                        {formatFecha(eq.ultimaRevision)}
                      </TableCell>
                      <TableCell className="text-center">
                        <EstadoBadge estado={eq.estado} label={EQUIPO_ESTADOS[eq.estado] || eq.estado} />
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
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
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(eq)}
                            aria-label="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
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
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <p>
            Mostrando <strong className="text-foreground tabular-nums">{data.length}</strong> de{' '}
            <strong className="text-foreground tabular-nums">{total.toLocaleString('es-ES')}</strong> equipos · Página{' '}
            <strong className="text-foreground tabular-nums">{page + 1}</strong> de{' '}
            <strong className="text-foreground tabular-nums">{totalPages}</strong>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(0)}
              disabled={!canPrev}
              className="h-8 px-2"
            >
              <ChevronLeft className="w-3 h-3 mr-1" />
              Inicio
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!canPrev}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={!canNext}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(totalPages - 1)}
              disabled={!canNext}
              className="h-8 px-2"
            >
              Final
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

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
    </div>
  )
}
