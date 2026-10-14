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
  const [reemplazoTotal, setReemplazoTotal] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [deleteTarget, setDeleteTarget] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: status, loading, error, refetch: refetchStatus } = useFetch<SyncStatus>('/api/sync')
  const { data: logs, refetch: refetchLogs } = useFetch<SyncLogEntry[]>('/api/sync/log?limit=20')

  const refetchAll = useCallback(() => {
    refetchStatus()
    refetchLogs()
  }, [refetchStatus, refetchLogs])

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('El archivo debe ser .xlsx o .xls')
      return
    }
    setSelectedFile(file)
    setLastResult(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [])

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
      formData.append('syncType', 'EXCEL_BC')
      formData.append('reemplazoTotal', String(reemplazoTotal))

      setProgress(40)

      // Usar fetch directamente (no apiFetch) porque enviamos FormData
      const res = await fetch('/api/sync/excel', {
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
        `Sincronización completada: ${(json as SyncResult).contratosNuevos + (json as SyncResult).contratosActualizados} contratos procesados`
      )
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

      {/* Subir Excel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Subir Excel de Business Central
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
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
                  Formatos aceptados: .xlsx, .xls (exportación estándar de BC)
                </p>
              </div>
            )}
          </div>

          {/* Opciones */}
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-md">
            <Checkbox
              id="reemplazoTotal"
              checked={reemplazoTotal}
              onCheckedChange={(v) => setReemplazoTotal(v === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="reemplazoTotal" className="text-[13px] font-medium cursor-pointer">
                Reemplazo total (recomendado)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Borra todos los clientes, contratos, equipos y órdenes de trabajo actuales antes
                de importar el Excel. Si lo desactivas, los datos del Excel se fusionan con los
                existentes (los contratos con el mismo número se actualizan).
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
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
                  Sincronizar ahora
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
