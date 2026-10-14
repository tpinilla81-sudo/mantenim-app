'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  Building2,
  Phone,
  Mail,
  MapPin,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CLIENTE_ESTADOS } from '@/lib/constants'

interface Cliente {
  id: string
  nombre: string
  nif: string
  email: string | null
  telefono: string | null
  direccion: string | null
  ciudad: string | null
  codigoPostal: string | null
  contactoNombre: string | null
  contactoEmail: string | null
  contactoTelefono: string | null
  estado: string
  notas: string | null
  _count: { equipos: number; contratos: number }
}

interface ClienteFormData {
  nombre: string
  nif: string
  email: string
  telefono: string
  direccion: string
  ciudad: string
  codigoPostal: string
  contactoNombre: string
  contactoEmail: string
  contactoTelefono: string
  estado: string
  notas: string
}

const EMPTY_FORM: ClienteFormData = {
  nombre: '',
  nif: '',
  email: '',
  telefono: '',
  direccion: '',
  ciudad: '',
  codigoPostal: '',
  contactoNombre: '',
  contactoEmail: '',
  contactoTelefono: '',
  estado: 'ACTIVO',
  notas: '',
}

export function ClientesView() {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [page, setPage] = useState(0)
  const pageSize = 100
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<ClienteFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (estadoFilter !== 'TODOS') params.set('estado', estadoFilter)
    params.set('limit', String(pageSize))
    params.set('offset', String(page * pageSize))
    return `/api/clientes?${params.toString()}`
  }, [search, estadoFilter, page])

  const { data: resp, loading, error, refetch } = useFetch<{
    data: Cliente[]
    total: number
    limit: number
    offset: number
  }>(url)

  // Resetear página al cambiar filtros
  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }
  const handleEstadoChange = (v: string) => {
    setEstadoFilter(v)
    setPage(0)
  }

  const data = resp?.data || []
  const total = resp?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 0
  const canNext = page + 1 < totalPages

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (c: Cliente) => {
    setEditing(c)
    setForm({
      nombre: c.nombre,
      nif: c.nif,
      email: c.email || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      ciudad: c.ciudad || '',
      codigoPostal: c.codigoPostal || '',
      contactoNombre: c.contactoNombre || '',
      contactoEmail: c.contactoEmail || '',
      contactoTelefono: c.contactoTelefono || '',
      estado: c.estado,
      notas: c.notas || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim() || !form.nif.trim()) {
      toast.error('Nombre y NIF son obligatorios')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/api/clientes/${editing.id}`, 'PUT', form)
        toast.success('Cliente actualizado correctamente')
      } else {
        await apiFetch('/api/clientes', 'POST', form)
        toast.success('Cliente creado correctamente')
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
      await apiFetch(`/api/clientes/${deleteTarget.id}`, 'DELETE')
      toast.success(`Cliente "${deleteTarget.nombre}" eliminado`)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al eliminar', { description: (err as Error).message })
    }
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
            placeholder="Buscar por nombre, NIF, ciudad o contacto..."
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={handleEstadoChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            <SelectItem value="ACTIVO">Activos</SelectItem>
            <SelectItem value="INACTIVO">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo cliente
        </Button>
      </div>

      {/* Tabla */}
      <Card className="border-border/80">
        <CardContent className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-rose-700 text-sm">Error: {error}</div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No hay clientes que mostrar</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Crea tu primer cliente para empezar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[260px]">Cliente</TableHead>
                    <TableHead className="min-w-[160px]">Contacto</TableHead>
                    <TableHead className="min-w-[180px]">Ubicación</TableHead>
                    <TableHead className="text-center">Equipos</TableHead>
                    <TableHead className="text-center">Contratos</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium truncate">{c.nombre}</p>
                            <p className="text-[11px] text-muted-foreground">{c.nif}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-[12px] truncate">
                            {c.contactoNombre || '—'}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.contactoTelefono || c.telefono || ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {[c.ciudad, c.codigoPostal].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{c._count.equipos}</TableCell>
                      <TableCell className="text-center tabular-nums">{c._count.contratos}</TableCell>
                      <TableCell className="text-center">
                        <EstadoBadge estado={c.estado} label={CLIENTE_ESTADOS[c.estado]} />
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-1">
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
            <strong className="text-foreground tabular-nums">{total.toLocaleString('es-ES')}</strong> clientes · Página{' '}
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
              {editing ? 'Editar cliente' : 'Nuevo cliente'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del cliente y guarda los cambios.'
                : 'Rellena los datos para crear un nuevo cliente.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="nombre">Nombre / Razón social *</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Construcciones y Reformas Levante S.L."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nif">NIF *</Label>
                <Input
                  id="nif"
                  value={form.nif}
                  onChange={(e) => setForm({ ...form, nif: e.target.value })}
                  placeholder="B-12345678"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm({ ...form, estado: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLIENTE_ESTADOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Datos fiscales
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="admin@empresa.es"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    placeholder="963 000 000"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="direccion">Dirección</Label>
                  <Input
                    id="direccion"
                    value={form.direccion}
                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    placeholder="Polígono Industrial, nave 14"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ciudad">Ciudad</Label>
                  <Input
                    id="ciudad"
                    value={form.ciudad}
                    onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                    placeholder="Valencia"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp">Código postal</Label>
                  <Input
                    id="cp"
                    value={form.codigoPostal}
                    onChange={(e) => setForm({ ...form, codigoPostal: e.target.value })}
                    placeholder="46011"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Persona de contacto
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cNombre">Nombre y apellidos</Label>
                  <Input
                    id="cNombre"
                    value={form.contactoNombre}
                    onChange={(e) => setForm({ ...form, contactoNombre: e.target.value })}
                    placeholder="Pedro Martínez Ruiz"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cTelefono">Teléfono</Label>
                  <Input
                    id="cTelefono"
                    value={form.contactoTelefono}
                    onChange={(e) => setForm({ ...form, contactoTelefono: e.target.value })}
                    placeholder="600 123 456"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="cEmail">Email de contacto</Label>
                  <Input
                    id="cEmail"
                    type="email"
                    value={form.contactoEmail}
                    onChange={(e) => setForm({ ...form, contactoEmail: e.target.value })}
                    placeholder="pmartinez@empresa.es"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="notas">Notas internas</Label>
              <Textarea
                id="notas"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Condiciones especiales, observaciones de cobro, etc."
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
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar cliente"
        description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"? Se eliminarán también sus equipos y contratos asociados.`}
        confirmText="Sí, eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
