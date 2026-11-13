'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Cog,
  Calculator,
  FlaskConical,
  Power,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EQUIPO_TIPOS } from '@/lib/constants'

interface Logica {
  id: string
  nombre: string
  descripcion: string | null
  tipoEquipo: string | null
  esMaquinaPropia: string | null // SI | NO | null
  tipoRevision: string // POR_HORAS | POR_CONTRATO
  umbralHoras: number | null
  periodicidadMeses: number | null
  revisionesAnual: number | null
  nivel: string | null
  servicio: string | null
  formula: string | null
  activa: boolean
  prioridad: number
  createdAt: string
  updatedAt: string
}

interface LogicaFormData {
  nombre: string
  descripcion: string
  tipoEquipo: string // '' = cualquiera
  esMaquinaPropia: string // '' = cualquiera
  tipoRevision: string
  umbralHoras: string
  periodicidadMeses: string
  revisionesAnual: string
  nivel: string
  servicio: string
  formula: string
  activa: boolean
  prioridad: string
}

const EMPTY_FORM: LogicaFormData = {
  nombre: '',
  descripcion: '',
  tipoEquipo: '',
  esMaquinaPropia: '',
  tipoRevision: 'POR_HORAS',
  umbralHoras: '500',
  periodicidadMeses: '',
  revisionesAnual: '',
  nivel: '',
  servicio: '',
  formula: '',
  activa: true,
  prioridad: '100',
}

const NIVELES: Record<string, string> = {
  PEQUENA: 'Pequeña (250h)',
  MEDIA: 'Media (500h)',
  GRANDE: 'Grande (1000h)',
  CONTRATO: 'Por contrato',
}

// Genera una descripción en lenguaje natural de la fórmula
function describeFormula(l: {
  tipoRevision: string
  umbralHoras: number | null
  periodicidadMeses: number | null
  revisionesAnual: number | null
  nivel: string | null
  servicio: string | null
}): string {
  if (l.tipoRevision === 'POR_HORAS') {
    const umbral = l.umbralHoras || '?'
    const nivelTxt = l.nivel ? ` · ${NIVELES[l.nivel] || l.nivel}` : ''
    return `Próxima revisión cuando horasUso + ${umbral}h alcance el umbral. Cada ${umbral}h de uso.${nivelTxt}`
  }
  if (l.tipoRevision === 'POR_CONTRATO') {
    let periodTxt: string
    if (l.revisionesAnual) {
      const meses = 12 / l.revisionesAnual
      periodTxt = `${l.revisionesAnual} revisiones/año (cada ${meses % 1 === 0 ? meses : meses.toFixed(1)} meses)`
    } else if (l.periodicidadMeses) {
      periodTxt = `cada ${l.periodicidadMeses} meses`
    } else {
      periodTxt = 'periodicidad por defecto del contrato (12 meses)'
    }
    const serv = l.servicio ? ` · Servicio ${l.servicio}` : ''
    return `Próxima revisión = última revisión + (${periodTxt}).${serv}`
  }
  return '—'
}

// Aplica una lógica a un equipo simulado para predecir la próxima revisión
function simular(
  logica: Logica,
  horas: number,
  ultimaRevisionISO: string | null,
  horasAnuales: number
): { fecha: string | null; horasObjetivo: number | null; descripcion: string } {
  if (logica.tipoRevision === 'POR_HORAS') {
    const umbral = logica.umbralHoras || 500
    const horasObjetivo = Math.ceil((horas + 1) / umbral) * umbral
    const horasRestantes = horasObjetivo - horas
    const diasEstimados = horasAnuales > 0 ? Math.ceil((horasRestantes / horasAnuales) * 365) : null
    let fecha: string | null = null
    if (diasEstimados != null) {
      const d = new Date()
      d.setDate(d.getDate() + diasEstimados)
      fecha = d.toISOString().slice(0, 10)
    }
    return {
      fecha,
      horasObjetivo,
      descripcion: `Próxima a las ${horasObjetivo.toLocaleString('es-ES')}h (${horasRestantes.toLocaleString('es-ES')}h restantes${diasEstimados != null ? `, ~${diasEstimados} días` : ''})`,
    }
  }
  // POR_CONTRATO
  const periodMeses = logica.revisionesAnual
    ? 12 / logica.revisionesAnual
    : logica.periodicidadMeses || 12
  const baseDate = ultimaRevisionISO ? new Date(ultimaRevisionISO) : new Date()
  const prox = new Date(baseDate)
  prox.setMonth(prox.getMonth() + Math.round(periodMeses))
  return {
    fecha: prox.toISOString().slice(0, 10),
    horasObjetivo: null,
    descripcion: `Próxima el ${prox.toLocaleDateString('es-ES')} (${periodMeses % 1 === 0 ? periodMeses : periodMeses.toFixed(1)} meses desde la última)`,
  }
}

export function LogicasView() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Logica | null>(null)
  const [form, setForm] = useState<LogicaFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Logica | null>(null)

  // Simulador
  const [simHoras, setSimHoras] = useState('1250')
  const [simTipo, setSimTipo] = useState('MONTACARGAS_ELECTRICO')
  const [simPropia, setSimPropia] = useState(false)
  const [simHorasAnuales, setSimHorasAnuales] = useState('1500')
  const [simUltimaRev, setSimUltimaRev] = useState('')

  const { data: resp, loading, error, refetch } = useFetch<{ data: Logica[]; total: number }>(
    '/api/logicas'
  )
  const logicas = resp?.data || []

  // Lógica que aplicaría el simulador (primera activa que coincide los criterios)
  const logicaAplicable = useMemo(() => {
    const activas = logicas.filter((l) => l.activa)
    activas.sort((a, b) => a.prioridad - b.prioridad)
    return activas.find((l) => {
      if (l.tipoEquipo && l.tipoEquipo !== simTipo) return false
      if (l.esMaquinaPropia) {
        const want = simPropia ? 'SI' : 'NO'
        if (l.esMaquinaPropia !== want) return false
      }
      return true
    })
  }, [logicas, simTipo, simPropia])

  const resultadoSimulacion = useMemo(() => {
    if (!logicaAplicable) return null
    return simular(
      logicaAplicable,
      Number(simHoras) || 0,
      simUltimaRev || null,
      Number(simHorasAnuales) || 0
    )
  }, [logicaAplicable, simHoras, simHorasAnuales, simUltimaRev])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (l: Logica) => {
    setEditing(l)
    setForm({
      nombre: l.nombre,
      descripcion: l.descripcion || '',
      tipoEquipo: l.tipoEquipo || '',
      esMaquinaPropia: l.esMaquinaPropia || '',
      tipoRevision: l.tipoRevision,
      umbralHoras: l.umbralHoras?.toString() || '',
      periodicidadMeses: l.periodicidadMeses?.toString() || '',
      revisionesAnual: l.revisionesAnual?.toString() || '',
      nivel: l.nivel || '',
      servicio: l.servicio || '',
      formula: l.formula || '',
      activa: l.activa,
      prioridad: l.prioridad.toString(),
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        tipoEquipo: form.tipoEquipo || null,
        esMaquinaPropia: form.esMaquinaPropia || null,
        tipoRevision: form.tipoRevision,
        umbralHoras: form.umbralHoras ? Number(form.umbralHoras) : null,
        periodicidadMeses: form.periodicidadMeses ? Number(form.periodicidadMeses) : null,
        revisionesAnual: form.revisionesAnual ? Number(form.revisionesAnual) : null,
        nivel: form.nivel || null,
        servicio: form.servicio || null,
        formula: form.formula || null,
        activa: form.activa,
        prioridad: Number(form.prioridad) || 100,
      }
      if (editing) {
        await apiFetch(`/api/logicas/${editing.id}`, 'PUT', payload)
        toast.success('Lógica actualizada')
      } else {
        await apiFetch('/api/logicas', 'POST', payload)
        toast.success('Lógica creada')
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
      await apiFetch(`/api/logicas/${deleteTarget.id}`, 'DELETE')
      toast.success(`Lógica "${deleteTarget.nombre}" eliminada`)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error('Error al eliminar', { description: (err as Error).message })
    }
  }

  const handleToggleActiva = async (l: Logica) => {
    try {
      await apiFetch(`/api/logicas/${l.id}`, 'PUT', { activa: !l.activa })
      toast.success(`${l.nombre}: ${!l.activa ? 'activada' : 'desactivada'}`)
      refetch()
    } catch (err) {
      toast.error('Error al cambiar estado', { description: (err as Error).message })
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted-foreground">
            Define cómo se calcula la <strong className="text-foreground">próxima revisión</strong> de cada equipo según su tipo y propietario.
            Las reglas se aplican en orden de <strong className="text-foreground">prioridad</strong> (1 = máxima).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva lógica
        </Button>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm bg-rose-50 rounded-lg border border-rose-200">
          Error: {error}
        </div>
      ) : logicas.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Cog className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No hay lógicas configuradas</p>
            <p className="text-[12px] text-muted-foreground mt-1 max-w-md mx-auto">
              Crea tu primera regla de cálculo. Por ejemplo: &laquo;Montacargas eléctrico propio →
              revisión cada 500 horas&raquo;.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Crear primera lógica
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logicas.map((l) => (
            <Card
              key={l.id}
              className={l.activa ? 'border-border/80' : 'border-border/40 opacity-70'}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Prioridad */}
                  <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-muted/60 border">
                    <span className="text-[10px] text-muted-foreground uppercase">Prior.</span>
                    <span className="text-lg font-bold tabular-nums">{l.prioridad}</span>
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold truncate">{l.nombre}</h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                          l.tipoRevision === 'POR_HORAS'
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-purple-50 border-purple-200 text-purple-700'
                        }`}
                      >
                        {l.tipoRevision === 'POR_HORAS' ? 'Por horas' : 'Por contrato'}
                      </span>
                      {l.servicio && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                          {l.servicio}
                        </span>
                      )}
                      {l.activa ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                          Activa
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground font-medium">
                          Inactiva
                        </span>
                      )}
                    </div>

                    {/* Criterios */}
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="text-muted-foreground">Aplica a:</span>
                      <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/60">
                        {l.tipoEquipo ? EQUIPO_TIPOS[l.tipoEquipo] || l.tipoEquipo : 'Cualquier tipo'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/60">
                        {l.esMaquinaPropia === 'SI'
                          ? 'Máquina propia'
                          : l.esMaquinaPropia === 'NO'
                            ? 'Máquina cliente'
                            : 'Propia o cliente'}
                      </span>
                      {l.nivel && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/60">
                          {NIVELES[l.nivel] || l.nivel}
                        </span>
                      )}
                    </div>

                    {/* Fórmula */}
                    <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-[12px] font-mono leading-relaxed">
                      <Calculator className="w-3.5 h-3.5 inline-block mr-1.5 text-muted-foreground align-text-bottom" />
                      {l.formula || describeFormula(l)}
                    </div>

                    {l.descripcion && (
                      <p className="text-[11px] text-muted-foreground">{l.descripcion}</p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="shrink-0 flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleToggleActiva(l)}
                      title={l.activa ? 'Desactivar' : 'Activar'}
                    >
                      <Power
                        className={`w-3.5 h-3.5 ${l.activa ? 'text-emerald-600' : 'text-muted-foreground'}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(l)}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => setDeleteTarget(l)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Simulador */}
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Simulador de cálculo</h2>
            <span className="text-[11px] text-muted-foreground">
              Comprueba qué lógica se aplicaría a un equipo hipotético y qué próxima revisión calcularía
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Tipo de equipo</Label>
              <Select value={simTipo} onValueChange={setSimTipo}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EQUIPO_TIPOS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Horas actuales</Label>
              <Input
                type="number"
                value={simHoras}
                onChange={(e) => setSimHoras(e.target.value)}
                className="h-9 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Horas/año estimadas</Label>
              <Input
                type="number"
                value={simHorasAnuales}
                onChange={(e) => setSimHorasAnuales(e.target.value)}
                className="h-9 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Última revisión</Label>
              <Input
                type="date"
                value={simUltimaRev}
                onChange={(e) => setSimUltimaRev(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Propietario</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background">
                <Checkbox
                  checked={simPropia}
                  onCheckedChange={(v) => setSimPropia(v === true)}
                  id="sim-propia"
                />
                <Label htmlFor="sim-propia" className="text-[12px] cursor-pointer">
                  Máquina propia
                </Label>
              </div>
            </div>
          </div>

          {logicaAplicable ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-[12px] text-muted-foreground">Lógica aplicable</p>
                  <p className="text-sm font-semibold">{logicaAplicable.nombre}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {describeFormula(logicaAplicable)}
                  </p>
                  {resultadoSimulacion && (
                    <div className="mt-2 pt-2 border-t border-primary/20 text-[12px]">
                      <span className="text-muted-foreground">Resultado: </span>
                      <span className="font-medium text-foreground">
                        {resultadoSimulacion.descripcion}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-800">
              {logicas.length === 0
                ? 'No hay lógicas configuradas. Crea al menos una para que el simulador pueda evaluarla.'
                : 'Ninguna lógica activa coincide con los criterios seleccionados. Ajusta el tipo de equipo o el propietario, o crea una lógica que aplique a esa combinación.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar lógica "${editing.nombre}"` : 'Nueva lógica de cálculo'}
            </DialogTitle>
            <DialogDescription>
              Configura los criterios de aplicación y la fórmula de cálculo de la próxima revisión.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Montacargas propio → revisión cada 500h"
                  required
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <Textarea
                  id="descripcion"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Notas internas, rationale de la regla..."
                  rows={2}
                />
              </div>

              <div className="col-span-2 border-t border-border pt-4">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Criterios de aplicación
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tipoEquipo">Tipo de equipo</Label>
                <Select
                  value={form.tipoEquipo || '__ANY__'}
                  onValueChange={(v) => setForm({ ...form, tipoEquipo: v === '__ANY__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ANY__">Cualquier tipo</SelectItem>
                    {Object.entries(EQUIPO_TIPOS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="esMaquinaPropia">Propietario</Label>
                <Select
                  value={form.esMaquinaPropia || '__ANY__'}
                  onValueChange={(v) => setForm({ ...form, esMaquinaPropia: v === '__ANY__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ANY__">Propia o cliente</SelectItem>
                    <SelectItem value="SI">Máquina propia</SelectItem>
                    <SelectItem value="NO">Máquina cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 border-t border-border pt-4">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Cálculo de la próxima revisión
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tipoRevision">Tipo de cálculo *</Label>
                <Select
                  value={form.tipoRevision}
                  onValueChange={(v) => setForm({ ...form, tipoRevision: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POR_HORAS">Por horas de uso</SelectItem>
                    <SelectItem value="POR_CONTRATO">Por contrato (calendario)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nivel">Nivel de revisión</Label>
                <Select
                  value={form.nivel || '__NINGUNO__'}
                  onValueChange={(v) => setForm({ ...form, nivel: v === '__NINGUNO__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NINGUNO__">Sin nivel</SelectItem>
                    {Object.entries(NIVELES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.tipoRevision === 'POR_HORAS' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="umbral">Umbral de horas *</Label>
                  <Input
                    id="umbral"
                    type="number"
                    value={form.umbralHoras}
                    onChange={(e) => setForm({ ...form, umbralHoras: e.target.value })}
                    placeholder="500 o 1000"
                    min="50"
                    step="50"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Cada cuántas horas toca revisión. 500 = mantenimiento normal, 1000 = revisión mayor.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="revisionesAnual">Revisiones/año</Label>
                    <Input
                      id="revisionesAnual"
                      type="number"
                      value={form.revisionesAnual}
                      onChange={(e) => setForm({ ...form, revisionesAnual: e.target.value })}
                      placeholder="4 = trimestral, 2 = semestral"
                      min="1"
                      max="52"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="periodicidad">O bien periodicidad (meses)</Label>
                    <Input
                      id="periodicidad"
                      type="number"
                      value={form.periodicidadMeses}
                      onChange={(e) => setForm({ ...form, periodicidadMeses: e.target.value })}
                      placeholder="3, 6, 12..."
                      min="1"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Rellena solo uno de los dos. Si pones ambos, se usa &laquo;revisiones/año&raquo;.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="servicio">Servicio (M1/M2/FSCR/FSSR)</Label>
                    <Input
                      id="servicio"
                      value={form.servicio}
                      onChange={(e) => setForm({ ...form, servicio: e.target.value })}
                      placeholder="M1, M2, FSCR, FSSR..."
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="prioridad">Prioridad (1 = máxima)</Label>
                <Input
                  id="prioridad"
                  type="number"
                  value={form.prioridad}
                  onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                  placeholder="100"
                  min="1"
                />
                <p className="text-[11px] text-muted-foreground">
                  Si un equipo cumple varias lógicas, se aplica la de número más bajo.
                </p>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="formula">Fórmula en lenguaje natural (opcional)</Label>
                <Textarea
                  id="formula"
                  value={form.formula}
                  onChange={(e) => setForm({ ...form, formula: e.target.value })}
                  placeholder="Se autogenera si lo dejas vacío. Ej: próximo a 1500h, 2000h, 2500h... según umbral."
                  rows={2}
                />
              </div>

              <div className="col-span-2 flex items-center gap-3 p-3 bg-muted/30 rounded-md">
                <Checkbox
                  id="activa"
                  checked={form.activa}
                  onCheckedChange={(v) => setForm({ ...form, activa: v === true })}
                />
                <Label htmlFor="activa" className="text-[13px] cursor-pointer">
                  Activa (se aplica al calcular próximas revisiones)
                </Label>
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
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Guardando...
                  </>
                ) : editing ? (
                  'Guardar cambios'
                ) : (
                  'Crear lógica'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar lógica"
        description={`¿Eliminar la lógica "${deleteTarget?.nombre}"? No afectará a los equipos ya calculados, pero las próximas revisiones se calcularán con la siguiente lógica aplicable.`}
        confirmText="Sí, eliminar"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
