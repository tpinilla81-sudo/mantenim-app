'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  FileText,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight,
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
import { Checkbox } from '@/components/ui/checkbox'
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
  CONTRATO_ESTADOS,
  CONTRATO_TIPOS,
  EQUIPO_TIPOS,
  formatFecha,
  formatMoneda,
  diasHasta,
  isoToInputDate,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ClienteOption { id: string; nombre: string }
interface EquipoOption {
  id: string
  codigo: string
  tipo: string
  marca: string
  modelo: string
  clienteId: string
  cliente: { nombre: string }
}

interface ContratoEquipo {
  equipo: EquipoOption
}
interface Contrato {
  id: string
  numero: string
  clienteId: string
  cliente: { id: string; nombre: string }
  fechaInicio: string
  fechaFin: string
  tipoMantenimiento: string
  periodicidadMeses: number
  precioAnual: number
  precioVisita: number | null
  estado: string
  fechaProxMantenimiento: string | null
  condiciones: string | null
  equipos: ContratoEquipo[]
  _count: { ordenesTrabajo: number }
}

interface ContratoFormData {
  numero: string
  clienteId: string
  fechaInicio: string
  fechaFin: string
  tipoMantenimiento: string
  periodicidadMeses: string
  precioAnual: string
  precioVisita: string
  estado: string
  fechaProxMantenimiento: string
  condiciones: string
  equipoIds: string[]
}

const EMPTY_FORM: ContratoFormData = {
  numero: '',
  clienteId: '',
  fechaInicio: '',
  fechaFin: '',
  tipoMantenimiento: 'PREVENTIVO',
  periodicidadMeses: '3',
  precioAnual: '0',
  precioVisita: '',
  estado: 'ACTIVO',
  fechaProxMantenimiento: '',
  condiciones: '',
  equipoIds: [],
}

export function ContratosView() {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [page, setPage] = useState(0)
  const pageSize = 100
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contrato | null>(null)
  const [form, setForm] = useState<ContratoFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Contrato | null>(null)
  const [renovarTarget, setRenovarTarget] = useState<Contrato | null>(null)

  // Clientes para el Select (limit=500 para tenerlos todos)
  const { data: clientesResp } = useFetch<{ data: ClienteOption[]; total: number }>(
    '/api/clientes?limit=500'
  )
  const clientesList = clientesResp?.data || []

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (estadoFilter !== 'TODOS') params.set('estado', estadoFilter)
    params.set('limit', String(pageSize))
    params.set('offset', String(page * pageSize))
    return `/api/contratos?${params.toString()}`
  }, [search, estadoFilter, page])

  const { data: resp, loading, error, refetch } = useFetch<{
    data: Contrato[]
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
  const handleEstadoChange = (v: string) => {
    setEstadoFilter(v)
    setPage(0)
  }

  // Equipos del cliente seleccionado (para multi-select)
  const equiposUrl = form.clienteId ? `/api/equipos?clienteId=${form.clienteId}` : null
  const { data: equiposCliente } = useFetch<EquipoOption[]>(equiposUrl)

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      clienteId: clientesList?.[0]?.id || '',
      fechaInicio: new Date().toISOString().split('T')[0],
      fechaFin: new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0],
    })
    setDialogOpen(true)
  }

  const openEdit = (c: Contrato) => {
    setEditing(c)
    setForm({
      numero: c.numero,
      clienteId: c.clienteId,
      fechaInicio: isoToInputDate(c.fechaInicio),
      fechaFin: isoToInputDate(c.fechaFin),
      tipoMantenimiento: c.tipoMantenimiento,
      periodicidadMeses: c.periodicidadMeses.toString(),
      precioAnual: c.precioAnual.toString(),
      precioVisita: c.precioVisita?.toString() || '',
      estado: c.estado,
      fechaProxMantenimiento: isoToInputDate(c.fechaProxMantenimiento),
      condiciones: c.condiciones || '',
      equipoIds: c.equipos.map((ce) => ce.equipo.id),
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.numero.trim() || !form.clienteId || !form.fechaInicio || !form.fechaFin) {
      toast.error('Completa número, cliente, fechas de inicio y fin')
      return
    }
    if (new Date(form.fechaFin) <= new Date(form.fechaInicio)) {
      toast.error('La fecha de fin debe ser posterior a la fecha de inicio')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/api/contratos/${editing.id}`, 'PUT', form)
        toast.success('Contrato actualizado correctamente')
      } else {
        await apiFetch('/api/contratos', 'POST', form)
        toast.success('Contrato creado correctamente')
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
      await apiFetch(`/api/contratos/${deleteTarget.id}`, 'DELETE')
      toast.success(`Contrato "${deleteTarget.numero}" eliminado`)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al eliminar', { description: (err as Error).message })
    }
  }

  const handleRenovar = async () => {
    if (!renovarTarget) return
    try {
      const nuevaFechaFin = new Date(renovarTarget.fechaFin)
      nuevaFechaFin.setFullYear(nuevaFechaFin.getFullYear() + 1)
      const nuevaFechaInicio = new Date(renovarTarget.fechaFin)
      // Avanzar también próxima revisión
      const nuevaProx = renovarTarget.fechaProxMantenimiento
        ? new Date(renovarTarget.fechaProxMantenimiento)
        : new Date()
      nuevaProx.setFullYear(nuevaProx.getFullYear() + 1)

      await apiFetch(`/api/contratos/${renovarTarget.id}`, 'PUT', {
        numero: renovarTarget.numero,
        clienteId: renovarTarget.clienteId,
        fechaInicio: nuevaFechaInicio.toISOString(),
        fechaFin: nuevaFechaFin.toISOString(),
        tipoMantenimiento: renovarTarget.tipoMantenimiento,
        periodicidadMeses: renovarTarget.periodicidadMeses,
        precioAnual: renovarTarget.precioAnual,
        precioVisita: renovarTarget.precioVisita,
        estado: 'ACTIVO',
        fechaProxMantenimiento: nuevaProx.toISOString(),
        condiciones: renovarTarget.condiciones,
        equipoIds: renovarTarget.equipos.map((ce) => ce.equipo.id),
      })
      toast.success(`Contrato "${renovarTarget.numero}" renovado por 1 año`)
      setRenovarTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al renovar', { description: (err as Error).message })
    }
  }

  const toggleEquipo = (id: string) => {
    setForm((f) => ({
      ...f,
      equipoIds: f.equipoIds.includes(id)
        ? f.equipoIds.filter((x) => x !== id)
        : [...f.equipoIds, id],
    }))
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px]">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por número o cliente..."
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={handleEstadoChange}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            {Object.entries(CONTRATO_ESTADOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={openCreate} disabled={!clientesList?.length}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo contrato
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
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay contratos que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Crea el primer contrato de mantenimiento.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[140px]">Contrato</TableHead>
                    <TableHead className="min-w-[180px]">Cliente</TableHead>
                    <TableHead className="min-w-[180px]">Vigencia</TableHead>
                    <TableHead className="min-w-[120px]">Tipo</TableHead>
                    <TableHead className="text-center">Period.</TableHead>
                    <TableHead className="text-right">Importe anual</TableHead>
                    <TableHead className="min-w-[120px] text-center">Próx. mant.</TableHead>
                    <TableHead className="text-center">Equipos</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c) => {
                    const diasFin = diasHasta(c.fechaFin)
                    const porVencer = diasFin !== null && diasFin <= 60 && c.estado === 'ACTIVO'
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="text-[12px] font-mono font-medium">{c.numero}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c._count.ordenesTrabajo} OTs
                          </p>
                        </TableCell>
                        <TableCell className="text-[12px] truncate max-w-[180px]">
                          {c.cliente.nombre}
                        </TableCell>
                        <TableCell>
                          <div className="text-[12px] tabular-nums">
                            {formatFecha(c.fechaInicio)} →
                          </div>
                          <div
                            className={cn(
                              'text-[11px] tabular-nums',
                              porVencer ? 'text-amber-700 font-medium' : 'text-muted-foreground'
                            )}
                          >
                            {formatFecha(c.fechaFin)}
                            {porVencer && diasFin !== null && ` · en ${diasFin}d`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <EstadoBadge estado={c.tipoMantenimiento} label={CONTRATO_TIPOS[c.tipoMantenimiento]} />
                        </TableCell>
                        <TableCell className="text-center text-[12px] tabular-nums">
                          {c.periodicidadMeses}m
                        </TableCell>
                        <TableCell className="text-right text-[12px] tabular-nums">
                          {formatMoneda(c.precioAnual)}
                        </TableCell>
                        <TableCell className="text-center text-[12px] tabular-nums">
                          {c.fechaProxMantenimiento ? formatFecha(c.fechaProxMantenimiento) : '—'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {c.equipos.length}
                        </TableCell>
                        <TableCell className="text-center">
                          <EstadoBadge estado={c.estado} label={CONTRATO_ESTADOS[c.estado]} />
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-1">
                            {(c.estado === 'ACTIVO' || c.estado === 'VENCIDO') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setRenovarTarget(c)}
                                aria-label="Renovar"
                                title="Renovar 1 año"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEdit(c)}
                              aria-label="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => setDeleteTarget(c)}
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

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <p>
            Mostrando <strong className="text-foreground tabular-nums">{data.length}</strong> de{' '}
            <strong className="text-foreground tabular-nums">{total.toLocaleString('es-ES')}</strong> contratos · Página{' '}
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
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar contrato ${editing.numero}` : 'Nuevo contrato'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del contrato y guarda los cambios.'
                : 'Crea un nuevo contrato de mantenimiento.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="numeroCnt">Número de contrato *</Label>
                <Input
                  id="numeroCnt"
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="CNT-2026-001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clienteCnt">Cliente *</Label>
                <Select
                  value={form.clienteId}
                  onValueChange={(v) => setForm({ ...form, clienteId: v, equipoIds: [] })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesList?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inicio">Fecha inicio *</Label>
                <Input
                  id="inicio"
                  type="date"
                  value={form.fechaInicio}
                  onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin">Fecha fin *</Label>
                <Input
                  id="fin"
                  type="date"
                  value={form.fechaFin}
                  onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipoMant">Tipo de mantenimiento</Label>
                <Select
                  value={form.tipoMantenimiento}
                  onValueChange={(v) => setForm({ ...form, tipoMantenimiento: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTRATO_TIPOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period">Periodicidad (meses)</Label>
                <Select
                  value={form.periodicidadMeses}
                  onValueChange={(v) => setForm({ ...form, periodicidadMeses: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Mensual</SelectItem>
                    <SelectItem value="2">Bimensual</SelectItem>
                    <SelectItem value="3">Trimestral</SelectItem>
                    <SelectItem value="4">Cuatrimestral</SelectItem>
                    <SelectItem value="6">Semestral</SelectItem>
                    <SelectItem value="12">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="precioAnual">Precio anual (€)</Label>
                <Input
                  id="precioAnual"
                  type="number"
                  step="0.01"
                  value={form.precioAnual}
                  onChange={(e) => setForm({ ...form, precioAnual: e.target.value })}
                  placeholder="4280.00"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="precioVisita">Precio por visita extra (€)</Label>
                <Input
                  id="precioVisita"
                  type="number"
                  step="0.01"
                  value={form.precioVisita}
                  onChange={(e) => setForm({ ...form, precioVisita: e.target.value })}
                  placeholder="220.00"
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estadoCnt">Estado del contrato</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm({ ...form, estado: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTRATO_ESTADOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proxMant">Fecha próximo mantenimiento</Label>
                <Input
                  id="proxMant"
                  type="date"
                  value={form.fechaProxMantenimiento}
                  onChange={(e) => setForm({ ...form, fechaProxMantenimiento: e.target.value })}
                />
              </div>
            </div>

            {/* Selección de equipos del cliente */}
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Equipos cubiertos por el contrato</Label>
              <p className="text-[12px] text-muted-foreground">
                Selecciona los equipos del cliente a los que aplica este contrato.
              </p>
              {!form.clienteId ? (
                <p className="text-[12px] text-muted-foreground italic p-4 border border-dashed border-border rounded-md text-center">
                  Selecciona un cliente primero.
                </p>
              ) : !equiposCliente || equiposCliente.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic p-4 border border-dashed border-border rounded-md text-center">
                  Este cliente no tiene equipos registrados.
                </p>
              ) : (
                <div className="border border-border rounded-md max-h-56 overflow-y-auto scrollbar-thin divide-y divide-border">
                  {equiposCliente.map((eq) => {
                    const checked = form.equipoIds.includes(eq.id)
                    return (
                      <label
                        key={eq.id}
                        className={cn(
                          'flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors',
                          checked && 'bg-accent/30'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleEquipo(eq.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-mono">{eq.codigo}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {EQUIPO_TIPOS[eq.tipo]} · {eq.marca} {eq.modelo}
                          </p>
                        </div>
                        {checked && <Check className="w-4 h-4 text-emerald-600" />}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="cond">Condiciones del contrato</Label>
              <Textarea
                id="cond"
                value={form.condiciones}
                onChange={(e) => setForm({ ...form, condiciones: e.target.value })}
                placeholder="Incluye 4 revisiones preventivas anuales. Desplazamientos a obra incluidos en radio 50 km..."
                rows={3}
              />
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
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear contrato'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar contrato"
        description={`¿Eliminar el contrato "${deleteTarget?.numero}" de ${deleteTarget?.cliente?.nombre}?`}
        confirmText="Sí, eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Confirmar renovación */}
      <ConfirmDialog
        open={!!renovarTarget}
        title="Renovar contrato 1 año"
        description={`El contrato "${renovarTarget?.numero}" se renovará desde ${renovarTarget && formatFecha(renovarTarget.fechaFin)} hasta ${renovarTarget && formatFecha(new Date(new Date(renovarTarget.fechaFin).getFullYear() + 1, new Date(renovarTarget.fechaFin).getMonth(), new Date(renovarTarget.fechaFin).getDate()))}.`}
        confirmText="Sí, renovar"
        onConfirm={handleRenovar}
        onCancel={() => setRenovarTarget(null)}
      />
    </div>
  )
}
