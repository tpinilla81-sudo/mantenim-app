import React, { useState } from 'react';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  async function handleSincronizar5Excels(e: React.FormEvent<HTMLFormElement>) {
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
        setResultMessage(`Registrados. Se han procesado ${result.totalRegistros} registros. Ya puedes actualizar la aplicación.`);
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
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold tracking-tight">Sincronizar BC</h2>
      
      {/* Sincronización inteligente: Subida de los 5 excels a la vez */}
      <div className="p-6 bg-card border rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Sincronización inteligente con Business Central</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Sube los 5 ficheros Excel requeridos simultáneamente. La aplicación cruzará y fusionará los datos de forma segura sin borrar información histórica.
        </p>
        
        <form onSubmit={handleSincronizar5Excels} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">1. Revisiones.xlsx</label>
              <input type="file" name="revisiones" accept=".xlsx" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">2. Productos de Servicio.xlsx</label>
              <input type="file" name="productos" accept=".xlsx" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">3. Lista Líneas de Contrato.xlsx</label>
              <input type="file" name="lineasContrato" accept=".xlsx" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">4. Pedidos servicio.xlsx</label>
              <input type="file" name="pedidos" accept=".xlsx" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">5. Pedidos Servicio Registrados.xlsx</label>
              <input type="file" name="pedidosReg" accept=".xlsx" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 font-medium text-sm"
            >
              {loading ? 'Procesando los 5 excels...' : 'Sincronizar y Registrar'}
            </button>
            
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 border rounded hover:bg-muted font-medium text-sm"
            >
              Actualizar aplicación
            </button>
          </div>

          {resultMessage && (
            <div className="mt-3 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-sm font-medium">
              {resultMessage}
            </div>
          )}
        </form>
      </div>

      {/* Historial de sincronizaciones (Limitado a 5 líneas) */}
      <div className="p-6 bg-card border rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Historial de sincronizaciones</h3>
        <div className="border rounded divide-y text-sm">
          <div className="p-3 flex justify-between items-center bg-muted/30">
            <span>Sincronización de 5 Excels Business Central (Planificación)</span>
            <span className="text-muted-foreground text-xs">Hoy, 13:10</span>
          </div>
          <div className="p-3 flex justify-between items-center">
            <span>Sincronización de contratos y líneas internas</span>
            <span className="text-muted-foreground text-xs">Ayer, 09:45</span>
          </div>
          <div className="p-3 flex justify-between items-center">
            <span>Actualización de pedidos de servicio registrados</span>
            <span className="text-muted-foreground text-xs">11/11/2026</span>
          </div>
          <div className="p-3 flex justify-between items-center">
            <span>Sincronización automática de productos de servicio</span>
            <span className="text-muted-foreground text-xs">10/11/2026</span>
          </div>
          <div className="p-3 flex justify-between items-center">
            <span>Carga inicial de catálogos y revisiones anuales</span>
            <span className="text-muted-foreground text-xs">08/11/2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
