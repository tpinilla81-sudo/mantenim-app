'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Función auxiliar para leer un archivo Excel como JSON
  const readFileAsJSON = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet) as any[];
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  async function handleSincronizar5Excels(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResultMessage(null);
    setIsError(false);

    const form = e.currentTarget;
    const fileRevisiones = (form.elements.namedItem('revisiones') as HTMLInputElement)?.files?.[0];
    const fileProductos = (form.elements.namedItem('productos') as HTMLInputElement)?.files?.[0];
    const fileLineasContrato = (form.elements.namedItem('lineasContrato') as HTMLInputElement)?.files?.[0];
    const filePedidos = (form.elements.namedItem('pedidos') as HTMLInputElement)?.files?.[0];
    const filePedidosReg = (form.elements.namedItem('pedidosReg') as HTMLInputElement)?.files?.[0];

    if (!fileRevisiones || !fileProductos || !fileLineasContrato || !filePedidos || !filePedidosReg) {
      setIsError(true);
      setResultMessage('Faltan ficheros. Asegúrate de adjuntar los 5 excels obligatorios.');
      setLoading(false);
      return;
    }

    try {
      console.group('📤 [Sincronización Local] Leyendo ficheros en el navegador');
      const revData = await readFileAsJSON(fileRevisiones);
      const prodData = await readFileAsJSON(fileProductos);
      const lineasContratoData = await readFileAsJSON(fileLineasContrato);
      const pedidosData = await readFileAsJSON(filePedidos);
      const pedidosRegData = await readFileAsJSON(filePedidosReg);
      console.groupEnd();

      // Cruce y fusión de datos
      const planificacionMap = new Map();

      revData.forEach((item, index) => {
        const key = `${item['Nº prod. servicio'] || index}_${item['Nº Contrato'] || 'N/A'}`;
        planificacionMap.set(key, { ...item, fuente: 'Revisiones' });
      });

      prodData.forEach((prod) => {
        const serie = String(prod['Nº Serie'] || '');
        for (const [key, value] of planificacionMap.entries()) {
          if (key.startsWith(serie)) {
            planificacionMap.set(key, { ...value, ...prod });
          }
        }
      });

      const resultadoFinal = Array.from(planificacionMap.values());

      // Guardar directamente en localStorage
      localStorage.setItem('mantenim_planificacion_data', JSON.stringify(resultadoFinal));
      console.log(`✅ Guardados ${resultadoFinal.length} registros en localStorage.`);

      setIsError(false);
      setResultMessage(`Registrados. Se han procesado ${resultadoFinal.length} registros localmente. Ya puedes consultar la sección de Revisiones.`);
    } catch (error: any) {
      setIsError(true);
      console.error('🔥 Error procesando excels en cliente:', error);
      setResultMessage(`Error al procesar los ficheros: ${error.message || 'Formato no válido'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronizar BC (5 Excels)</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Procesamiento Local (Cliente)</span>
      </div>
      
      <div className="p-6 bg-card border rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Sincronización inteligente en el navegador</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Sube los 5 ficheros Excel requeridos. Se procesarán instantáneamente en tu navegador sin límites de servidor en Vercel.
        </p>
        
        <form onSubmit={handleSincronizar5Excels} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">1. Revisiones.xlsx</label>
              <input type="file" name="revisiones" accept=".xlsx, .xls" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">2. Productos de Servicio.xlsx</label>
              <input type="file" name="productos" accept=".xlsx, .xls" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">3. Lista Líneas de Contrato.xlsx</label>
              <input type="file" name="lineasContrato" accept=".xlsx, .xls" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">4. Pedidos servicio.xlsx</label>
              <input type="file" name="pedidos" accept=".xlsx, .xls" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">5. Pedidos Servicio Registrados.xlsx</label>
              <input type="file" name="pedidosReg" accept=".xlsx, .xls" required className="w-full text-sm border rounded p-2 bg-background" />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 font-medium text-sm"
            >
              {loading ? 'Procesando los 5 excels...' : 'Sincronizar localmente'}
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
            <div className={`mt-3 p-3 border rounded text-sm font-medium ${isError ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
              {resultMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default SyncView;
