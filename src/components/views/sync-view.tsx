'use client'

import { useState, useRef, useCallback } from 'react'
import { useFetch, apiFetch } from '@/lib/use-fetch'
import { toast } from 'sonner'
import {
  Upload,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Building2,
  FileText,
  Loader2,
  Trash2,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { formatFecha, formatHora } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface SyncStatus {
  ultimoSync: {
    id: string
    fecha: string
    fileName: string
    fileSize: number
    rowsTotal: number
    rowsCreated: number
    rowsUpdated: number
    rowsSkipped: number
    rowsFailed: number
    clientesNuevos: number
    contratosNuevos: number
    contratosActualizados: number
    status: string
    duracionMs: number
    syncType: string
  } | null
  diasDesdeUltimoSync: number | null
  syncCaducado: boolean
  umbralCaducidadDias: number
  totalSyncs: number
  totalClientes: number
  totalContratos: number
  contratosActivos: number
  contratosVencidos: number
}

interface SyncLogEntry {
  id: string
  fecha: string
  fileName: string
  fileSize: number
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  rowsFailed: number
  clientesNuevos: number
  contratosNuevos: number
  contratosActualizados: number
  duracionMs: number
  status: string
  syncType: string
}

interface SyncResult {
  success: boolean
  fileName: string
  fileSize: number
  duration: number
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  rowsFailed: number
  clientesNuevos: number
  contratosNuevos: number
  contratosActualizados: number
  errores: string[]
  status: string
  totalClientes: number
  totalContratos: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

export function SyncView() {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Default: INCREMENTAL (preserva datos manuales). reemplazoTotal=false
  const [reemplazoTotal, setReemplazoTotal] = useState(false)
  // Tipo de Excel a subir: 'contratos' (Excel 1), 'equipos' (Excel 2),
  // 'flexible' (auto-detecta), 'lineas' (Líneas de Contrato BC) o
  // 'revisiones' (Últimas revisiones realizadas).
  const [excelType, setExcelType] = useState<'productos' | 'lineas' | 'pedidos' | 'historico' | 'revanuales'>('productos')
  const [previewResult, setPreviewResult] = useState<{ columnsDetected: Array<{header: string; field: string; entity: string}>; columnsNotDetected: string[]; rowsTotal: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [deleteTarget, setDeleteTarget] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: status, loading, error, refetch: refetchStatus } = useFetch<SyncStatus>('/api/sync')
  const { data: logs, refetch: refetchLogs } = useFetch<SyncLogEntry[]>('/api/sync/log?limit=20')
  const { data: rutina, refetch: refetchRutina } = useFetch<{
    pasos: Array<{
      id: string
      num: number
      titulo: string
      descripcion: string
      excelType: 'productos' | 'lineas' | 'pedidos' | 'historico' | 'revanuales' | null
      completado: boolean
      count: number
      fechaUltima: string | null
      esRecalc?: boolean
    }>
    totalPasos: number
    pasosCompletados: number
    siguientePendiente: string | null
    progreso: number
  }>('/api/sync/estado-rutina')

  const refetchAll = useCallback(() => {
    refetchStatus()
    refetchLogs()
    refetchRutina()
  }, [refetchStatus, refetchLogs, refetchRutina])

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('El archivo debe ser .xlsx o .xls')
      return
    }
    setSelectedFile(file)
    setLastResult(null)
    setPreviewResult(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [])

  // Modo flexible: primero hace dry-run para mostrar columnas detectadas, luego el usuario confirma
  const handlePreview = async () => {
    if (!selectedFile) {
      toast.error('Selecciona primero un archivo')
      return
    }
    setUploading(true)
    setProgress(10)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('dryRun', 'true')

      setProgress(40)
      const res = await fetch('/api/sync/excel-flexible', {
        method: 'POST',
        body: formData,
      })
      setProgress(80)

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || json.detail || `Error ${res.status}`)
      }

      setProgress(100)
      setPreviewResult({
        columnsDetected: json.columnsDetected || [],
        columnsNotDetected: json.columnsNotDetected || [],
        rowsTotal: json.rowsTotal || 0,
      })
      toast.success(`Detectadas ${json.columnsDetected?.length || 0} columnas en ${json.rowsTotal || 0} filas`)
    } catch (err) {
      toast.error('Error al analizar Excel', { description: (err as Error).message })
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  // Confirma y aplica los cambios del Excel flexible
  const handleConfirmFlexible = async () => {
    if (!selectedFile) {
      toast.error('Selecciona primero un archivo')
      return
    }
    setUploading(true)
    setProgress(10)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('dryRun', 'false')

      setProgress(40)
      const res = await fetch('/api/sync/excel-flexible', {
        method: 'POST',
        body: formData,
      })
      setProgress(80)

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || json.detail || `Error ${res.status}`)
      }

      setProgress(100)
      setLastResult(json as SyncResult)
      toast.success(
        `Sincronización completada: ${json.rowsUpdated} filas actualizadas · ${json.revisionesRecalculadas} revisiones recalculadas`
      )
      setSelectedFile(null)
      setPreviewResult(null)
      refetchAll()
    } catch (err) {
      toast.error('Error en la sincronización', { description: (err as Error).message })
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecciona primero un archivo')
      return
    }
    setUploading(true)
    setProgress(10)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Ruteo según tipo de Excel (5 Excels del flowchart)
      let endpoint: string
      let successMsg: string
      if (excelType === 'productos') {
        endpoint = '/api/sync/excel-equipos'
        formData.append('syncType', 'EXCEL_BC_EQUIPOS')
        successMsg = 'Productos de servicio importados'
      } else if (excelType === 'lineas') {
        endpoint = '/api/sync/excel-lineas-contrato'
        successMsg = 'Líneas de contrato importadas'
      } else if (excelType === 'pedidos') {
        endpoint = '/api/sync/excel-ultimas-revisiones'
        successMsg = 'Pedidos de servicio importados'
      } else if (excelType === 'historico') {
        endpoint = '/api/sync/excel-ultimas-revisiones'
        successMsg = 'Histórico de pedidos importado'
      } else if (excelType === 'revanuales') {
        endpoint = '/api/sync/excel-revisiones-anuales'
        successMsg = 'Revisiones anuales importadas'
      } else {
        endpoint = '/api/sync/excel-equipos'
        successMsg = 'Sincronización completada'
      }
      formData.append('reemplazoTotal', String(reemplazoTotal))

      setProgress(40)

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })

      setProgress(80)

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || json.detail || `Error ${res.status}`)
      }

      setProgress(100)
      setLastResult(json as SyncResult)

      // Mensaje de éxito según el tipo
      if (excelType === 'lineas') {
        const r = json as {
          creadas?: number
          actualizadas?: number
          crossCheck?: {
            equiposConContratoFirmado: number
            equiposConProductoBC: number
            equiposActualizadosTipo: number
            equiposSinContratoFirmado: number
            breakdownPorGrupo: Record<string, number>
          }
        }
        const cc = r.crossCheck
        const gruposTxt = cc
          ? Object.entries(cc.breakdownPorGrupo)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([g, n]) => `${g}: ${n}`)
              .join(' · ')
          : ''
        toast.success(
          `${successMsg}: ${r.creadas ?? 0} nuevas, ${r.actualizadas ?? 0} actualizadas`,
          {
            description: cc
              ? `Cross-check: ${cc.equiposConContratoFirmado}/${cc.equiposConProductoBC} con contrato · ${cc.equiposActualizadosTipo} tipos act. · ${gruposTxt}`
              : undefined,
          }
        )
      } else if (excelType === 'pedidos' || excelType === 'historico') {
        const r = json as {
          procesadas?: number
          equiposActualizados?: number
          revisionesCompletadasCreadas?: number
          noEncontrados?: number
          recalcLanzado?: number
        }
        toast.success(
          `${successMsg}: ${r.equiposActualizados ?? 0} equipos actualizados, ${r.revisionesCompletadasCreadas ?? 0} revisiones registradas`,
          {
            description: `${r.recalcLanzado ?? 0} recálculos · ${r.noEncontrados ?? 0} no encontrados`,
          }
        )
      } else if (excelType === 'revanuales') {
        const r = json as {
          procesadas?: number
          equiposActualizados?: number
          noEncontrados?: number
        }
        toast.success(
          `${successMsg}: ${r.equiposActualizados ?? 0} equipos actualizados`,
          {
            description: `${r.procesadas ?? 0} procesados · ${r.noEncontrados ?? 0} no encontrados`,
          }
        )
      } else {
        toast.success(successMsg)
      }
      setSelectedFile(null)
      refetchAll()
    } catch (err) {
      toast.error('Error en la sincronización', {
        description: (err as Error).message,
      })
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  const handleDeleteAll = async () => {
    setDeleteTarget(false)
    try {
      const res = await fetch('/api/sync/excel', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Base de datos vaciada')
      refetchAll()
    } catch (err) {
      toast.error('Error al vaciar', { description: (err as Error).message })
    }
  }

  const handleRecalc = async () => {
    setRecalculando(true)
    try {
      const res = await fetch('/api/sync/recalcular-tipos-revision', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const logicaCount = json.equiposConLogicaAplicada ?? 0
      const legacyCount = json.equiposConLegacyFallback ?? 0
      const topLogicas = Object.entries(json.logicaAplicadaNombres || {})
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]: any) => `${n.split('—')[0].trim()}: ${c}`)
        .join(' · ')
      toast.success(
        `Recálculo completado: ${json.marcadosPorContrato} por contrato · ${json.marcadosPorHoras} por horas`,
        {
          description: `Motor de Lógicas: ${logicaCount} equipos · Legacy fallback: ${legacyCount} · Revisiones reprogramadas: ${json.revisionesRecalculadas}${topLogicas ? ' · Top: ' + topLogicas : ''}`,
        }
      )
      refetchAll()
    } catch (err) {
      toast.error('Error al recalcular', { description: (err as Error).message })
    } finally {
      setRecalculando(false)
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Estado de sincronización */}
      <Card className={cn(
        'border-2',
        status?.syncCaducado ? 'border-amber-300' : 'border-border'
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Estado de sincronización con Business Central
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="h-24 bg-muted/30 rounded animate-pulse" />
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-md text-sm">
              Error al cargar: {error}
            </div>
          ) : !status?.ultimoSync ? (
            <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-md">
              <Info className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Aún no has sincronizado</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Sube el Excel de "Contratos de servicio" exportado desde Dynamics 365 Business Central.
                  La app te avisará cada {status?.umbralCaducidadDias || 30} días para que lo actualices.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Banner de caducado */}
              {status.syncCaducado && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      Han pasado {status.diasDesdeUltimoSync} días desde la última sincronización
                    </p>
                    <p className="text-[12px] text-amber-700 mt-1">
                      Te recomendamos volver a exportar el Excel desde Business Central y subirlo
                      para tener los contratos actualizados.
                    </p>
                  </div>
                </div>
              )}

              {/* Datos del último sync */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                    Última sincronización
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {formatFecha(status.ultimoSync.fecha)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatHora(status.ultimoSync.fecha)} · hace {status.diasDesdeUltimoSync}d
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                    Contratos procesados
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {status.ultimoSync.rowsTotal.toLocaleString('es-ES')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {status.ultimoSync.contratosNuevos} nuevos · {status.ultimoSync.contratosActualizados} act.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                    Estado
                  </p>
                  <EstadoBadge estado={status.ultimoSync.status} label={
                    status.ultimoSync.status === 'OK' ? 'OK' :
                    status.ultimoSync.status === 'PARCIAL' ? 'Parcial' :
                    status.ultimoSync.status === 'ERROR' ? 'Error' : status.ultimoSync.status
                  } />
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {formatDuration(status.ultimoSync.duracionMs)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                    Archivo
                  </p>
                  <p className="text-sm font-medium truncate" title={status.ultimoSync.fileName}>
                    {status.ultimoSync.fileName}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatFileSize(status.ultimoSync.fileSize)}
                  </p>
                </div>
              </div>

              {/* Resumen actual */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
                <Metric label="Clientes totales" value={status.totalClientes} icon={Building2} />
                <Metric label="Contratos totales" value={status.totalContratos} icon={FileText} />
                <Metric label="Contratos activos" value={status.contratosActivos} icon={CheckCircle2} color="emerald" />
                <Metric label="Contratos vencidos" value={status.contratosVencidos} icon={AlertTriangle} color="amber" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rutina de sincronización — checklist guiado */}
      {rutina && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Rutina de sincronización
              <span className="ml-auto text-[12px] font-normal text-muted-foreground">
                {rutina.pasosCompletados} de {rutina.totalPasos} pasos · {rutina.progreso}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Barra de progreso */}
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${rutina.progreso}%` }}
              />
            </div>

            {/* Pasos */}
            <div className="space-y-2">
              {rutina.pasos.map((paso) => {
                const esSiguiente = rutina.siguientePendiente === paso.id
                const esActual = paso.excelType === excelType && !paso.completado
                return (
                  <button
                    key={paso.id}
                    type="button"
                    onClick={() => {
                      if (paso.esRecalc) {
                        // Disparar recalc directamente
                        handleRecalc()
                      } else if (paso.excelType) {
                        setExcelType(paso.excelType)
                        setSelectedFile(null)
                        setPreviewResult(null)
                        // Scroll al área de upload
                        setTimeout(() => {
                          fileInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }, 100)
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                      paso.completado
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : esSiguiente
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-muted/30',
                    )}
                  >
                    {/* Indicador circular */}
                    <div
                      className={cn(
                        'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold',
                        paso.completado
                          ? 'bg-emerald-500 text-white'
                          : esSiguiente
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {paso.completado ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        paso.num
                      )}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-[13px] font-medium truncate',
                          paso.completado ? 'text-emerald-900' : 'text-foreground',
                        )}
                      >
                        {paso.titulo}
                        {esSiguiente && (
                          <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wider">
                            ← siguiente
                          </span>
                        )}
                        {esActual && (
                          <span className="ml-2 text-[10px] text-primary font-semibold uppercase tracking-wider">
                            ← subiendo ahora
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {paso.descripcion}
                      </p>
                    </div>

                    {/* Estado + count */}
                    <div className="shrink-0 text-right">
                      {paso.completado ? (
                        <>
                          <p className="text-[12px] font-semibold text-emerald-700 tabular-nums">
                            {paso.count.toLocaleString('es-ES')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {paso.fechaUltima
                              ? new Date(paso.fechaUltima).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                })
                              : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">pendiente</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {rutina.pasosCompletados === rutina.totalPasos && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <p className="text-[12px] text-emerald-900 font-medium">
                  ¡Rutina completada! Todos los datos están sincronizados.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subir Excel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Sincronización inteligente con Business Central
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Guía del flujo */}
          <div className="bg-sky-50 border border-sky-200 rounded-md p-3 text-[12px] text-sky-900 space-y-1">
            <p className="font-semibold text-sky-900">Flujo de sincronización (5 Excels + recalc):</p>
            <p><strong>1.</strong> Subir <strong>Productos de servicio</strong> (en servicio) → define las máquinas</p>
            <p><strong>2.</strong> Subir <strong>Lista línea de contrato</strong> (firmados) → contratos + tipo + condiciones</p>
            <p><strong>3.</strong> Subir <strong>Pedidos de servicio</strong> (terminados) → última revisión por producto</p>
            <p><strong>4.</strong> Subir <strong>Histórico pedidos</strong> (3 años) → histórico de revisiones</p>
            <p><strong>5.</strong> Subir <strong>Nº producto + contrato + rev/año</strong> → revisiones anuales contratadas</p>
            <p><strong>6.</strong> Pulsar <strong>"Recalcular revisiones"</strong> → Lógicas reprograman próximas</p>
            <p className="text-sky-700 mt-1">Los resultados aparecen en la sección <strong>Revisiones</strong>.</p>
          </div>

          {/* Selección de tipo de Excel */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[12px] text-muted-foreground mr-2">Excel a subir:</label>
            <Button
              type="button"
              variant={excelType === 'productos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcelType('productos'); setSelectedFile(null); setPreviewResult(null) }}
              className="h-8"
            >
              1 · Productos servicio
            </Button>
            <Button
              type="button"
              variant={excelType === 'lineas' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcelType('lineas'); setSelectedFile(null); setPreviewResult(null) }}
              className="h-8 border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              2 · Líneas contrato
            </Button>
            <Button
              type="button"
              variant={excelType === 'pedidos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcelType('pedidos'); setSelectedFile(null); setPreviewResult(null) }}
              className="h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              3 · Pedidos servicio
            </Button>
            <Button
              type="button"
              variant={excelType === 'historico' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcelType('historico'); setSelectedFile(null); setPreviewResult(null) }}
              className="h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              4 · Histórico pedidos
            </Button>
            <Button
              type="button"
              variant={excelType === 'revanuales' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExcelType('revanuales'); setSelectedFile(null); setPreviewResult(null) }}
              className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              5 · Rev. anuales
            </Button>
          </div>

          {/* Zona de drop */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-accent/40'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-10 h-10 text-emerald-600" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-[12px] text-muted-foreground tabular-nums">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arrastra el Excel aquí o haz clic para seleccionar
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {excelType === 'productos'
                    ? 'Excel 1: "Productos de servicio" (solo en servicio) — Lista de máquinas con Nº serie, marca, modelo, cliente'
                    : excelType === 'lineas'
                      ? 'Excel 2: "Lista Línea de Contrato" (solo firmados) — 15 columnas: Estado, Nº Contrato, Nº cliente, Nombre Cliente, Ship-to, Cód. grupo, fechas, Nº línea, Nº prod. servicio, Descripción, Nº Serie, Fecha inicial, Periodo, Siguiente fecha serv.'
                      : excelType === 'pedidos'
                        ? 'Excel 3: "Pedidos de servicio" (solo terminados) — Una fila por pedido completado. La app busca el más reciente por producto = última revisión. Columnas: Nº Serie (req.), Fecha (req.), Horas (opc.), Tipo servicio (opc.), Notas (opc.)'
                        : excelType === 'historico'
                          ? 'Excel 4: "Histórico pedidos servicio" (solo 3 años atrás) — Mismo formato que Excel 3 pero con histórico completo. La app registra todas las revisiones completadas y actualiza la última fecha.'
                          : 'Excel 5: "Nº producto + Nº contrato + Nº revisiones anuales" — Mapa que indica, por cada producto de servicio, a qué contrato pertenece y cuántas revisiones al año tiene contratadas. Columnas: Nº producto servicio, Nº contrato, Nº revisiones anuales.'}
                </p>
              </div>
            )}
          </div>

          {/* Opciones */}
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <Checkbox
              id="reemplazoTotal"
              checked={reemplazoTotal}
              onCheckedChange={(v) => setReemplazoTotal(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="reemplazoTotal" className="text-[13px] font-medium cursor-pointer text-amber-900">
                Reemplazo total (⚠️ borra todo tu trabajo manual)
              </Label>
              <p className="text-[11px] text-amber-800">
                <strong>NO recomendado para sincronizaciones mensuales.</strong> Borra todos los
                clientes, contratos, equipos, revisiones completadas, horas actualizadas y notas
                antes de importar. Úsalo solo si quieres empezar de cero.
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Subir Excel
                </>
              )}
            </Button>
            {selectedFile && !uploading && (
              <Button
                variant="ghost"
                onClick={() => setSelectedFile(null)}
              >
                Cancelar
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={handleRecalc}
              disabled={recalculando}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {recalculando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Recalculando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Recalcular tipos de revisión
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(true)}
              disabled={uploading}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Vaciar base de datos
            </Button>
          </div>

          {/* Barra de progreso */}
          {progress > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {progress < 40 ? 'Subiendo archivo...' :
                 progress < 80 ? 'Procesando filas...' :
                 progress < 100 ? 'Guardando cambios...' :
                 '¡Completado!'}
              </p>
            </div>
          )}

          {/* Resultado */}
          {lastResult && (
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-900">
                  Sincronización completada
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ResultMetric label="Clientes nuevos" value={lastResult.clientesNuevos} color="emerald" />
                <ResultMetric label="Contratos nuevos" value={lastResult.contratosNuevos} color="emerald" />
                <ResultMetric label="Contratos actualizados" value={lastResult.contratosActualizados} color="sky" />
                <ResultMetric label="Filas omitidas" value={lastResult.rowsSkipped} color="gray" />
                {lastResult.rowsFailed > 0 && (
                  <ResultMetric label="Filas con error" value={lastResult.rowsFailed} color="rose" />
                )}
              </div>
              <div className="text-[12px] text-muted-foreground">
                Tiempo: {formatDuration(lastResult.duration)} · Archivo: {lastResult.fileName}
              </div>
              {lastResult.errores && lastResult.errores.length > 0 && (
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-rose-700">
                    Ver {lastResult.errores.length} errores
                  </summary>
                  <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                    {lastResult.errores.slice(0, 30).map((err, i) => (
                      <li key={i} className="text-rose-700">{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial de sincronizaciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Historial de sincronizaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Todavía no hay sincronizaciones registradas.
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-left font-medium px-2 py-2">Fecha</th>
                    <th className="text-left font-medium px-2 py-2">Archivo</th>
                    <th className="text-right font-medium px-2 py-2">Filas</th>
                    <th className="text-right font-medium px-2 py-2">Nuevos</th>
                    <th className="text-right font-medium px-2 py-2">Actualizados</th>
                    <th className="text-right font-medium px-2 py-2">Errores</th>
                    <th className="text-center font-medium px-2 py-2">Estado</th>
                    <th className="text-right font-medium px-2 py-2">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-2">
                        <p className="text-[12px] tabular-nums">{formatFecha(log.fecha)}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{formatHora(log.fecha)}</p>
                      </td>
                      <td className="px-2 py-2">
                        <p className="text-[12px] truncate max-w-[200px]" title={log.fileName}>
                          {log.fileName}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {formatFileSize(log.fileSize)}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] tabular-nums">
                        {log.rowsTotal.toLocaleString('es-ES')}
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] tabular-nums">
                        {log.contratosNuevos}
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] tabular-nums">
                        {log.contratosActualizados}
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] tabular-nums">
                        {log.rowsFailed > 0 ? (
                          <span className="text-rose-700">{log.rowsFailed}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <EstadoBadge estado={log.status} label={
                          log.status === 'OK' ? 'OK' :
                          log.status === 'PARCIAL' ? 'Parcial' :
                          log.status === 'ERROR' ? 'Error' : log.status
                        } />
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] text-muted-foreground tabular-nums">
                        {formatDuration(log.duracionMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget}
        title="Vaciar base de datos"
        description="Se borrarán TODOS los clientes, contratos, equipos y órdenes de trabajo. Esta acción no se puede deshacer. ¿Estás seguro?"
        confirmText="Sí, vaciar todo"
        destructive
        onConfirm={handleDeleteAll}
        onCancel={() => setDeleteTarget(false)}
      />
    </div>
  )
}

function Metric({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color?: 'emerald' | 'amber' | 'sky' | 'gray'
}) {
  const colorClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    gray: 'bg-muted text-muted-foreground',
  }[color || 'gray']
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value.toLocaleString('es-ES')}</p>
      </div>
    </div>
  )
}

function ResultMetric({ label, value, color }: { label: string; value: number; color: 'emerald' | 'sky' | 'gray' | 'rose' }) {
  const colorClass = {
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
    gray: 'text-muted-foreground',
    rose: 'text-rose-700',
  }[color]
  return (
    <div className="text-center">
      <p className={cn('text-2xl font-bold tabular-nums', colorClass)}>
        {value.toLocaleString('es-ES')}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
function PlanificacionSyncSection() {
  const [loading, setLoading] = React.useState(false);
  const [resultMessage, setResultMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResultMessage(null);

    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('/api/sync/planificacion', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setResultMessage(`¡Planificación generada con éxito! Se procesaron ${result.totalRegistros} registros.`);
      } else {
        setResultMessage(`Error: ${result.error || 'Desconocido'}`);
      }
    } catch (error: any) {
      setResultMessage(`Error de red: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 p-6 bg-card border rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Sincronización Planificación (5 Excels BC)</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">1. Revisiones.xlsx</label>
            <input type="file" name="revisiones" accept=".xlsx" required className="w-full text-sm border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">2. Productos de Servicio.xlsx</label>
            <input type="file" name="productos" accept=".xlsx" required className="w-full text-sm border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">3. Lista Líneas de Contrato.xlsx</label>
            <input type="file" name="lineasContrato" accept=".xlsx" required className="w-full text-sm border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">4. Pedidos servicio.xlsx</label>
            <input type="file" name="pedidos" accept=".xlsx" required className="w-full text-sm border rounded p-2" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">5. Pedidos Servicio Registrados.xlsx</label>
            <input type="file" name="pedidosReg" accept=".xlsx" required className="w-full text-sm border rounded p-2" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 font-medium"
        >
          {loading ? 'Procesando y cruzando...' : 'Generar Planificación y Sincronizar'}
        </button>

        {resultMessage && (
          <p className="mt-2 text-sm font-semibold text-emerald-600">{resultMessage}</p>
        )}
      </form>
    </div>
  );
}
