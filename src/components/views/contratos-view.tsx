'use client'

// Sección Contratos.
//
// Muestra un listado de contratos con:
//   - Datos básicos (Nº, cliente, grupo, fechas, estado, precios)
//   - Productos de servicio vinculados (de la tabla LineaContrato, agrupados
//     por numeroContrato)
//   - Condiciones del contrato (textarea editable que se guarda con PUT)
//
// El usuario puede buscar, filtrar por estado, y redactar las condiciones
// de cada contrato a medida que las va definiendo.

import { useState, useMemo, useRef, useEffect } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Search,
  FileText,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  Package,
  Calendar,
  Euro,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { formatFecha, CONTRATO_ESTADOS } from '@/lib/constants'
import { cn } from '@/lib/utils'

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
  descripcionBC: string | null
  codVendedor: string | null
  codDelegacion: string | null
  codGrupoContrato: string | null
  codPeriodoPrecio: string | null
  ubicacionEquipo: string | null
  ultimaFactura: string | null
  proximaFactura: string | null
  importePorPeriodo: number | null
  esHistorico: boolean
}

interface LineaContratoLight {
  id: string
  numeroContrato: string
  numeroProductoServicio: string | null
  descripcion: string | null
  numeroSerie: string | null
  codGrupoContrato: string | null
  estadoContrato: string
  periodoServicio: string | null
}

interface CondicionesEditState {
  texto: string
  guardando: boolean
  guardado: boolean // mostrar "Guardado" temporalmente
  modificado: boolean
}

export function ContratosView() {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('TODOS')
  const [incluirHistoricos, setIncluirHistoricos] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [condicionesEdit, setCondicionesEdit] = useState<Record<string, CondicionesEditState>>({})

  // Cargar contratos
  const contratosUrl = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', '500')
    if (incluirHistoricos) params.set('historico', 'true')
    return `/api/contratos?${params.toString()}`
  }, [incluirHistoricos])

  const { data: resp, loading, error, refetch } = useFetch<{ data: Contrato[]; total: number }>(
    contratosUrl
  )

  // Cargar líneas de contrato (productos de servicio) para vincular
  const { data: lineasResp } = useFetch<{ data: LineaContratoLight[] }>(
    '/api/lineas-contrato?limit=50000'
  )

  const allContratos = resp?.data || []
  const allLineas = lineasResp?.data || []

  // Agrupar líneas por numeroContrato
  const lineasPorContrato = useMemo(() => {
    const map: Record<string, LineaContratoLight[]> = {}
    for (const l of allLineas) {
      if (!map[l.numeroContrato]) map[l.numeroContrato] = []
      map[l.numeroContrato].push(l)
    }
    return map
  }, [allLineas])

  // Filtrado client-side
  const contratos = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allContratos.filter((c) => {
      if (estadoFilter !== 'TODOS' && c.estado !== estadoFilter) return false
      if (!q) return true
      return (
        c.numero.toLowerCase().includes(q) ||
        c.cliente?.nombre?.toLowerCase().includes(q) ||
        c.descripcionBC?.toLowerCase().includes(q) ||
        c.codGrupoContrato?.toLowerCase().includes(q)
      )
    })
  }, [allContratos, search, estadoFilter])

  // Inicializar condiciones editables cuando se expande un contrato
  useEffect(() => {
    if (expandedId) {
      const contrato = allContratos.find((c) => c.id === expandedId)
      if (contrato && !condicionesEdit[expandedId]) {
        setCondicionesEdit((prev) => ({
          ...prev,
          [expandedId]: {
            texto: contrato.condiciones || '',
            guardando: false,
            guardado: false,
            modificado: false,
          },
        }))
      }
    }
  }, [expandedId, allContratos, condicionesEdit])

  const handleCondicionesChange = (id: string, texto: string) => {
    setCondicionesEdit((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { texto: '', guardando: false, guardado: false, modificado: false }), texto, modificado: true, guardado: false },
    }))
  }

  const handleSaveCondiciones = async (id: string, numero: string) => {
    const edit = condicionesEdit[id]
    if (!edit) return
    setCondicionesEdit((prev) => ({
      ...prev,
      [id]: { ...prev[id], guardando: true },
    }))
    try {
      await apiFetch(`/api/contratos/${id}`, 'PUT', { condiciones: edit.texto || null })
      setCondicionesEdit((prev) => ({
        ...prev,
        [id]: { ...prev[id], guardando: false, guardado: true, modificado: false },
      }))
      toast.success(`Condiciones guardadas: ${numero}`)
      // Quitar el "Guardado" tras 3s
      setTimeout(() => {
        setCondicionesEdit((prev) => ({
          ...prev,
          [id]: { ...prev[id], guardado: false },
        }))
      }, 3000)
      refetch()
    } catch (err) {
      setCondicionesEdit((prev) => ({
        ...prev,
        [id]: { ...prev[id], guardando: false },
      }))
      toast.error('Error al guardar', { description: (err as Error).message })
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
            placeholder="Buscar por Nº contrato, cliente, grupo..."
            className="pl-9"
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            {Object.entries(CONTRATO_ESTADOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={incluirHistoricos ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIncluirHistoricos(!incluirHistoricos)}
          className="h-9"
        >
          {incluirHistoricos ? 'Incluyendo históricos' : 'Solo activos'}
        </Button>
        <p className="text-[13px] text-muted-foreground lg:ml-auto">
          <strong className="text-foreground tabular-nums">{contratos.length}</strong>
          {contratos.length !== allContratos.length ? ` de ${allContratos.length}` : ''} contratos
        </p>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-rose-700 text-sm bg-rose-50 rounded-lg border border-rose-200">
          Error: {error}
        </div>
      ) : contratos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No hay contratos que mostrar</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Importa los Excels desde Sincronizar BC para poblar la tabla de contratos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contratos.map((c) => {
            const isExpanded = expandedId === c.id
            const lineas = lineasPorContrato[c.numero] || []
            const edit = condicionesEdit[c.id]
            const productosCount = lineas.length
            return (
              <Card key={c.id} className={cn('border-border/80', isExpanded && 'border-primary/40')}>
                <CardContent className="p-0">
                  {/* Cabecera (clic para expandir) */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-semibold truncate">{c.numero}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.cliente?.nombre || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.codGrupoContrato && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium">
                            {c.codGrupoContrato}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                          {c.tipoMantenimiento}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {productosCount} prod.
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatFecha(c.fechaInicio)} → {formatFecha(c.fechaFin)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        <EstadoBadge
                          estado={c.estado}
                          label={CONTRATO_ESTADOS[c.estado] || c.estado}
                        />
                        {c.precioAnual > 0 && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            <Euro className="w-3 h-3" />
                            {c.precioAnual.toLocaleString('es-ES', { maximumFractionDigits: 0 })}/año
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Contenido expandido */}
                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                      {/* Datos adicionales */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                        {c.descripcionBC && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Descripción BC</p>
                            <p className="text-foreground">{c.descripcionBC}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Periodicidad</p>
                          <p className="text-foreground">{c.periodicidadMeses} meses</p>
                        </div>
                        {c.codVendedor && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Vendedor</p>
                            <p className="text-foreground">{c.codVendedor}</p>
                          </div>
                        )}
                        {c.codPeriodoPrecio && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Periodo precio</p>
                            <p className="text-foreground">{c.codPeriodoPrecio}</p>
                          </div>
                        )}
                        {c.ultimaFactura && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Últ. factura</p>
                            <p className="text-foreground">{formatFecha(c.ultimaFactura)}</p>
                          </div>
                        )}
                        {c.proximaFactura && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Próx. factura</p>
                            <p className="text-foreground">{formatFecha(c.proximaFactura)}</p>
                          </div>
                        )}
                        {c.precioVisita != null && c.precioVisita > 0 && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Precio visita</p>
                            <p className="text-foreground">{c.precioVisita.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</p>
                          </div>
                        )}
                        {c.importePorPeriodo != null && (
                          <div>
                            <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Importe/periodo</p>
                            <p className="text-foreground">{c.importePorPeriodo.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</p>
                          </div>
                        )}
                      </div>

                      {/* Productos de servicio vinculados */}
                      <div>
                        <p className="text-[12px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-primary" />
                          Productos de servicio vinculados ({productosCount})
                        </p>
                        {productosCount === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">
                            No hay líneas de contrato vinculadas a este Nº Contrato. Sube el Excel 3 (Lista Líneas de Contrato) desde Sincronizar BC.
                          </p>
                        ) : (
                          <div className="border border-border rounded-md overflow-hidden max-h-48 overflow-y-auto scrollbar-thin">
                            <table className="w-full text-[11px]">
                              <thead className="bg-muted/60 sticky top-0">
                                <tr>
                                  <th className="text-left px-2 py-1 font-medium">Nº prod. servicio</th>
                                  <th className="text-left px-2 py-1 font-medium">Descripción</th>
                                  <th className="text-left px-2 py-1 font-medium">Nº Serie</th>
                                  <th className="text-left px-2 py-1 font-medium">Periodo</th>
                                  <th className="text-left px-2 py-1 font-medium">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineas.map((l) => (
                                  <tr key={l.id} className="border-t border-border/60 hover:bg-muted/30">
                                    <td className="px-2 py-1 font-mono">{l.numeroProductoServicio || '—'}</td>
                                    <td className="px-2 py-1 truncate max-w-[200px]">{l.descripcion || '—'}</td>
                                    <td className="px-2 py-1 font-mono text-muted-foreground truncate max-w-[120px]">{l.numeroSerie || '—'}</td>
                                    <td className="px-2 py-1 text-center">{l.periodoServicio || '—'}</td>
                                    <td className="px-2 py-1 text-center">{l.estadoContrato}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Condiciones del contrato (editable) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            Condiciones del contrato
                          </p>
                          <div className="flex items-center gap-2">
                            {edit?.guardado && (
                              <span className="text-[11px] text-emerald-600 font-medium">✓ Guardado</span>
                            )}
                            {edit?.modificado && (
                              <span className="text-[11px] text-amber-600">Sin guardar</span>
                            )}
                            <Button
                              size="sm"
                              variant={edit?.modificado ? 'default' : 'outline'}
                              className="h-7 text-[12px]"
                              disabled={!edit?.modificado || edit?.guardando}
                              onClick={() => handleSaveCondiciones(c.id, c.numero)}
                            >
                              {edit?.guardando ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5 mr-1" />
                              )}
                              Guardar
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={edit?.texto ?? ''}
                          onChange={(e) => handleCondicionesChange(c.id, e.target.value)}
                          placeholder="Redacta aquí las condiciones del contrato: alcance, exclusiones, período de vigencia, condiciones de pago, penalties por retraso, condiciones de renovación..."
                          rows={6}
                          className="text-[12px] resize-y"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
