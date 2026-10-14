'use client'

import { useState, useMemo, useEffect } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Play,
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
  OT_ESTADOS,
  OT_TIPOS,
  OT_PRIORIDADES,
  EQUIPO_TIPOS,
  formatFecha,
  formatHora,
  formatMoneda,
  formatHoras,
  isoToInputDate,
  inputDateToIso,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ClienteOption { id: string; nombre: string }
interface EquipoOption {
  id: string
  codigo: string
  tipo: string
  marca: string
  modelo: string
  cliente: { id: string; nombre: string }
}
interface ContratoOption {
  id: string
  numero: string
  clienteId: string
}
interface TecnicoOption {
  id: string
  nombre: string
  apellidos: string
}

interface Orden {
  id: string
  numero: string
  equipoId: string
  equipo: EquipoOption
  contratoId: string | null
  contrato: ContratoOption | null
  tecnicoId: string | null
  tecnico: TecnicoOption | null
  tipo: string
  estado: string
  prioridad: string
  descripcion: string
  observaciones: string | null
  fechaProgramada: string
  fechaRealizada: string | null
  horasTrabajadas: number | null
  importe: number | null
}

interface OrdenFormData {
  numero: string
  equipoId: string
  contratoId: string
  tecnicoId: string
  tipo: string
  estado: string
  prioridad: string
  descripcion: string
  observaciones: string
  fechaProgramada: string
  fechaRealizada: string
  horasTrabajadas: string
  importe: string
}

const EMPTY_FORM: OrdenFormData = {
  numero: '',
  equipoId: '',
  contratoId: '',
  tecnicoId: '',
  tipo: 'PREVENTIVO',
  estado: 'PROGRAMADA',
  prioridad: 'MEDIA',
  descripcion: '',
  observaciones: '',
  fechaProgramada: new Date().toISOString().split('T')[0],
  fechaRealizada: '',
  horasTrabajadas: '',
  importe: '',
}

const FLUJO_ESTADOS: Record<string, string | null> = {
  PROGRAMADA: 'EN_PROCESO',
  EN_PROCESO: 'COMPLETADA',
  COMPLETADA: null,
  CANCELADA: null,
}

export function OrdenesView() {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [tipoFilter, setTipoFilter] = useState('TODOS')
  const [tecnicoFilter, setTecnicoFilter] = useState('TODOS')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Orden | null>(null)
  const [form, setForm] = useState<OrdenFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Orden | null>(null)

  const { data: equiposList } = useFetch<EquipoOption[]>('/api/equipos')
  const { data: tecnicosList } = useFetch<TecnicoOption[]>('/api/tecnicos')

  // Contratos disponibles para el equipo seleccionado
  const equipoSeleccionado = equiposList?.find((e) => e.id === form.equipoId)
  const contratosUrl = equipoSeleccionado
    ? `/api/contratos?clienteId=${equipoSeleccionado.cliente.id}&limit=500`
    : null
  const { data: contratosResp } = useFetch<{ data: ContratoOption[]; total: number }>(contratosUrl)
  const contratosDisponibles = contratosResp?.data || []

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (estadoFilter !== 'TODOS') params.set('estado', estadoFilter)
    if (tipoFilter !== 'TODOS') params.set('tipo', tipoFilter)
    if (tecnicoFilter !== 'TODOS') params.set('tecnicoId', tecnicoFilter)
    const qs = params.toString()
    return `/api/ordenes${qs ? '?' + qs : ''}`
  }, [search, estadoFilter, tipoFilter, tecnicoFilter])

  const { data, loading, error, refetch } = useFetch<Orden[]>(url)

  // Auto-calcular siguiente número
  useEffect(() => {
    if (dialogOpen && !editing && data && data.length > 0 && !form.numero) {
      const year = new Date().getFullYear()
      const yearCount = data.filter((o) => o.numero.includes(`OT-${year}`)).length + 1
      const next = `OT-${year}-${String(yearCount + 50).padStart(3, '0')}`
      setForm((f) => ({ ...f, numero: next }))
    }
  }, [dialogOpen, editing, data])

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      equipoId: equiposList?.[0]?.id || '',
      tecnicoId: tecnicosList?.find((t) => true)?.id || '',
      fechaProgramada: new Date().toISOString().split('T')[0],
    })
    setDialogOpen(true)
  }

  const openEdit = (o: Orden) => {
    setEditing(o)
    setForm({
      numero: o.numero,
      equipoId: o.equipoId,
      contratoId: o.contratoId || '',
      tecnicoId: o.tecnicoId || '',
      tipo: o.tipo,
      estado: o.estado,
      prioridad: o.prioridad,
      descripcion: o.descripcion,
      observaciones: o.observaciones || '',
      fechaProgramada: isoToInputDate(o.fechaProgramada),
      fechaRealizada: isoToInputDate(o.fechaRealizada),
      horasTrabajadas: o.horasTrabajadas?.toString() || '',
      importe: o.importe?.toString() || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.numero.trim() || !form.equipoId || !form.descripcion.trim() || !form.fechaProgramada) {
      toast.error('Completa número, equipo, descripción y fecha programada')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      contratoId: form.contratoId || null,
      tecnicoId: form.tecnicoId || null,
      fechaRealizada: form.fechaRealizada ? inputDateToIso(form.fechaRealizada) : null,
    }
    try {
      if (editing) {
        await apiFetch(`/api/ordenes/${editing.id}`, 'PUT', payload)
        toast.success('Orden de trabajo actualizada')
      } else {
        await apiFetch('/api/ordenes', 'POST', payload)
        toast.success('Orden de trabajo creada')
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
      await apiFetch(`/api/ordenes/${deleteTarget.id}`, 'DELETE')
      toast.success(`Orden "${deleteTarget.numero}" eliminada`)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al eliminar', { description: (err as Error).message })
    }
  }

  const avanzarEstado = async (o: Orden) => {
    const siguiente = FLUJO_ESTADOS[o.estado]
    if (!siguiente) return
    const updates: Record<string, unknown> = {
      ...o,
      estado: siguiente,
    }
    if (siguiente === 'COMPLETADA' && !o.fechaRealizada) {
      updates.fechaRealizada = new Date().toISOString()
    }
    try {
      await apiFetch(`/api/ordenes/${o.id}`, 'PUT', updates)
      toast.success(`${o.numero} → ${OT_ESTADOS[siguiente]}`)
      refetch()
    } catch (err) {
      toast.error('Error al actualizar', { description: (err as Error).message })
    }
  }

  const cancelarOrden = async (o: Orden) => {
    try {
      await apiFetch(`/api/ordenes/${o.id}`, 'PUT', { ...o, estado: 'CANCELADA' })
      toast.success(`${o.numero} cancelada`)
      refetch()
    } catch (err) {
      toast.error('Error al cancelar', { description: (err as Error).message })
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número o descripción..."
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            {Object.entries(OT_ESTADOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los tipos</SelectItem>
            {Object.entries(OT_TIPOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tecnicosList && (
          <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los técnicos</SelectItem>
              {tecnicosList.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre} {t.apellidos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <Button onClick={openCreate} disabled={!equiposList?.length}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva orden
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
          ) : !data || data.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay órdenes de trabajo</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Crea una orden para programar un mantenimiento.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[140px]">OT</TableHead>
                    <TableHead className="min-w-[200px]">Equipo / Cliente</TableHead>
                    <TableHead className="min-w-[220px]">Descripción</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="min-w-[110px] text-center">Prioridad</TableHead>
                    <TableHead className="min-w-[110px] text-center">Estado</TableHead>
                    <TableHead className="min-w-[140px]">Fecha prog.</TableHead>
                    <TableHead className="min-w-[140px]">Técnico</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((o) => {
                    const siguiente = FLUJO_ESTADOS[o.estado]
                    return (
                      <TableRow key={o.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="text-[12px] font-mono font-medium">{o.numero}</p>
                          {o.contrato && (
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {o.contrato.numero}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-[12px] font-medium">
                            {o.equipo.codigo}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {EQUIPO_TIPOS[o.equipo.tipo]} · {o.equipo.marca}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {o.equipo.cliente.nombre}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-[12px] line-clamp-2 max-w-[260px]">
                            {o.descripcion}
                          </p>
                          {o.importe != null && (
                            <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                              {formatMoneda(o.importe)}
                              {o.horasTrabajadas != null && ` · ${formatHoras(o.horasTrabajadas)}`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <EstadoBadge estado={o.tipo} label={OT_TIPOS[o.tipo]} />
                        </TableCell>
                        <TableCell className="text-center">
                          <EstadoBadge estado={o.prioridad} label={OT_PRIORIDADES[o.prioridad]} />
                        </TableCell>
                        <TableCell className="text-center">
                          <EstadoBadge estado={o.estado} label={OT_ESTADOS[o.estado]} />
                        </TableCell>
                        <TableCell>
                          <p className="text-[12px] tabular-nums">
                            {formatFecha(o.fechaProgramada)}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {formatHora(o.fechaProgramada)}
                          </p>
                        </TableCell>
                        <TableCell>
                          {o.tecnico ? (
                            <span className="text-[12px]">
                              {o.tecnico.nombre} {o.tecnico.apellidos}
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground italic">
                              Sin asignar
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end items-center gap-1">
                            {siguiente && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-[11px]"
                                onClick={() => avanzarEstado(o)}
                                title={`Avanzar a ${OT_ESTADOS[siguiente]}`}
                              >
                                {o.estado === 'PROGRAMADA' ? (
                                  <>
                                    <Play className="w-3 h-3" />
                                    Iniciar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Completar
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEdit(o)}
                              aria-label="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {o.estado !== 'CANCELADA' && o.estado !== 'COMPLETADA' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => cancelarOrden(o)}
                                aria-label="Cancelar OT"
                                title="Cancelar"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => setDeleteTarget(o)}
                              aria-label="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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

      {/* Diálogo create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar orden ${editing.numero}` : 'Nueva orden de trabajo'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos de la orden y guarda los cambios.'
                : 'Crea una nueva orden de mantenimiento o reparación.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="numOT">Número de OT *</Label>
                <Input
                  id="numOT"
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="OT-2026-001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="equipoOT">Equipo *</Label>
                <Select
                  value={form.equipoId}
                  onValueChange={(v) => setForm({ ...form, equipoId: v, contratoId: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {equiposList?.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.codigo} · {eq.marca} {eq.modelo} ({eq.cliente.nombre})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contratoOT">Contrato asociado</Label>
                <Select
                  value={form.contratoId}
                  onValueChange={(v) => setForm({ ...form, contratoId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin contrato (correctivo libre)" />
                  </SelectTrigger>
                  <SelectContent>
                    {!form.equipoId ? (
                      <SelectItem value="" disabled>Selecciona equipo primero</SelectItem>
                    ) : (
                      (contratosDisponibles || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.numero}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tecnicoOT">Técnico asignado</Label>
                <Select
                  value={form.tecnicoId}
                  onValueChange={(v) => setForm({ ...form, tecnicoId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {tecnicosList?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre} {t.apellidos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipoOT">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OT_TIPOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prioridadOT">Prioridad</Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(v) => setForm({ ...form, prioridad: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OT_PRIORIDADES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estadoOT">Estado</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm({ ...form, estado: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OT_ESTADOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fechaProg">Fecha programada *</Label>
                <Input
                  id="fechaProg"
                  type="date"
                  value={form.fechaProgramada}
                  onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="descripcionOT">Descripción del trabajo *</Label>
                <Textarea
                  id="descripcionOT"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Ej: Mantenimiento trimestral preventivo. Cambio de aceite, filtros y revisión frenos."
                  rows={3}
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="observOT">Observaciones</Label>
                <Textarea
                  id="observOT"
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  placeholder="Trabajos realizados, incidencias, repuestos pendientes..."
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fechaReal">Fecha de realización</Label>
                <Input
                  id="fechaReal"
                  type="date"
                  value={form.fechaRealizada}
                  onChange={(e) => setForm({ ...form, fechaRealizada: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="horasOT">Horas trabajadas</Label>
                <Input
                  id="horasOT"
                  type="number"
                  step="0.25"
                  value={form.horasTrabajadas}
                  onChange={(e) => setForm({ ...form, horasTrabajadas: e.target.value })}
                  placeholder="3.5"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="importeOT">Importe (€)</Label>
                <Input
                  id="importeOT"
                  type="number"
                  step="0.01"
                  value={form.importe}
                  onChange={(e) => setForm({ ...form, importe: e.target.value })}
                  placeholder="0.00"
                  min="0"
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
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear orden'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar orden de trabajo"
        description={`¿Eliminar la OT "${deleteTarget?.numero}"?`}
        confirmText="Sí, eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
