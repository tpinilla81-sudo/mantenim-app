'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Archivos detectados
  const [files, setFiles] = useState<{
    revisiones: File | null;
    productos: File | null;
    lineasContrato: File | null;
    pedidos: File | null;
    pedidosReg: File | null;
  }>({
    revisiones: null,
    productos: null,
    lineasContrato: null,
    pedidos: null,
    pedidosReg: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clasificación inteligente y flexible de los 5 ficheros
  const classifyFiles = (fileList: FileList | File[]) => {
    const newFiles = { ...files };

    Array.from(fileList).forEach(file => {
      const name = file.name.toLowerCase();
      
      if (name.includes('revision') || name.includes('rev') || name.includes('ppi')) {
        newFiles.revisiones = file;
      } else if (name.includes('producto') || name.includes('prod')) {
        newFiles.productos = file;
      } else if (name.includes('contrato') || name.includes('líneas') || name.includes('lineas') || name.includes('line')) {
        newFiles.lineasContrato = file;
      } else if (name.includes('registrado') || name.includes('reg') || name.includes('posted')) {
        newFiles.pedidosReg = file;
      } else if (name.includes('pedido') || name.includes('ped') || name.includes('order')) {
        if (!newFiles.pedidos) {
          newFiles.pedidos = file;
        } else if (!newFiles.pedidosReg) {
          newFiles.pedidosReg = file;
        }
      }
    });

    // Fallback por orden secuencial si no se detectaron por nombre exacto
    const unassignedFiles = Array.from(fileList).filter(f => 
      !Object.values(newFiles).includes(f)
    );

    if (unassignedFiles.length > 0) {
      if (!newFiles.revisiones && unassignedFiles.length > 0) newFiles.revisiones = unassignedFiles.shift() || null;
      if (!newFiles.productos && unassignedFiles.length > 0) newFiles.productos = unassignedFiles.shift() || null;
      if (!newFiles.lineasContrato && unassignedFiles.length > 0) newFiles.lineasContrato = unassignedFiles.shift() || null;
      if (!newFiles.pedidos && unassignedFiles.length > 0) newFiles.pedidos = unassignedFiles.shift() || null;
      if (!newFiles.pedidosReg && unassignedFiles.length > 0) newFiles.pedidosReg = unassignedFiles.shift() || null;
    }

    setFiles(newFiles);
    setResultMessage(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      classifyFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      classifyFiles(e.target.files);
    }
  };

  // Lector inteligente que salta filas vacías o cabeceras institucionales de Business Central
  const readFileAsJSON = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          
          let sheetName = workbook.SheetNames[0];
          let sheet = workbook.Sheets[sheetName];
          let rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

          // Buscar la fila donde realmente empiezan los datos (analizando las primeras 15 filas)
          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(rawData.length, 15); i++) {
            const rowStr = JSON.stringify(rawData[i]).toLowerCase();
            if (rowStr.includes('nº') || rowStr.includes('prod') || rowStr.includes('contrato') || rowStr.includes('servicio') || rowStr.includes('serie')) {
              headerRowIndex = i;
              break;
            }
          }

          // Leer el JSON usando el índice de cabecera detectado automáticamente
          const data = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex }) as any[];
          
          console.log(`📄 Fichero [${file.name}] (Hoja: ${sheetName}, Fila cabecera: ${headerRowIndex}): ${data.length} filas leídas. Columnas:`, data[0] ? Object.keys(data[0]) : 'Ninguna');
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleProcessAndSync = async () => {
    if (!files.revisiones || !files.productos || !files.lineasContrato || !files.pedidos || !files.pedidosReg) {
      setIsError(true);
      setResultMessage('Faltan ficheros por asignar. Comprueba que los 5 huecos estén ocupados.');
      return;
    }

    setLoading(true);
    setResultMessage(null);
    setIsError(false);

    try {
      console.group('📤 [Sincronización Local Masiva] Procesando ficheros...');
      const revData = await readFileAsJSON(files.revisiones);
      const prodData = await readFileAsJSON(files.productos);
      const lineasContratoData = await readFileAsJSON(files.lineasContrato);
      const pedidosData = await readFileAsJSON(files.pedidos);
      const pedidosRegData = await readFileAsJSON(files.pedidosReg);
      console.groupEnd();

      if (revData.length === 0) {
        throw new Error("El fichero de Revisiones está vacío o no se ha podido leer ninguna fila.");
      }

      // Cruce y fusión de datos inteligente en el cliente
      const planificacionMap = new Map();

      revData.forEach((item, index) => {
        const prodServicio = item['Nº prod. servicio'] || item['Nº Prod. Servicio'] || item['No. Prod. Servicio'] || index;
        const contrato = item['Nº Contrato'] || item['No. Contrato'] || 'N/A';
        const key = `${prodServicio}_${contrato}`;
        planificacionMap.set(key, { ...item, fuente: 'Revisiones' });
      });

      prodData.forEach((prod) => {
        const serie = String(prod['Nº Serie'] || prod['No. Serie'] || prod['Nº de serie'] || '');
        if (!serie) return;
        
        for (const [key, value] of planificacionMap.entries()) {
          if (key.includes(serie) || key.startsWith(serie)) {
            planificacionMap.set(key, { ...value, ...prod });
          }
        }
      });

      const resultadoFinal = Array.from(planificacionMap.values());

      localStorage.setItem('mantenim_planificacion_data', JSON.stringify(resultadoFinal));
      console.log(`✅ Guardados con éxito ${resultadoFinal.length} registros en localStorage.`);

      setIsError(false);
      setResultMessage(`¡Éxito! Se han procesado y cruzado ${resultadoFinal.length} registros localmente. Ya puedes consultar la sección de Planificación.`);
    } catch (error: any) {
      setIsError(true);
      console.error('🔥 Error procesando excels:', error);
      setResultMessage(`Error al procesar los ficheros: ${error.message || 'Formato no válido'}`);
    } finally {
      setLoading(false);
    }
  };

  const allAssigned = Boolean(files.revisiones && files.productos && files.lineasContrato && files.pedidos && files.pedidosReg);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronización Masiva (Arrastrar y Soltar)</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Modo Local Inteligente</span>
      </div>
      
      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Arrastra tus 5 excels de Business Central aquí</h3>
          <p className="text-sm text-muted-foreground">
            Suelta los archivos de golpe. Si alguno no se asigna automáticamente, puedes seleccionarlo haciendo clic en su casilla correspondiente.
          </p>
        </div>

        {/* ZONA DE DRAG & DROP */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/30 hover:border-primary/50 bg-muted/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx, .xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-semibold">Arrastra los 5 excels aquí o haz clic para buscarlos</p>
              <p className="text-xs text-muted-foreground mt-1">Soporta selección múltiple simultánea (.xlsx, .xls)</p>
            </div>
          </div>
        </div>

        {/* LISTADO DE LOS 5 FICHEROS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'revisiones', label: '1. Revisiones', file: files.revisiones, setter: (f: File) => setFiles(prev => ({ ...prev, revisiones: f })) },
            { key: 'productos', label: '2. Productos de Servicio', file: files.productos, setter: (f: File) => setFiles(prev => ({ ...prev, productos: f })) },
            { key: 'lineasContrato', label: '3. Líneas de Contrato', file: files.lineasContrato, setter: (f: File) => setFiles(prev => ({ ...prev, lineasContrato: f })) },
            { key: 'pedidos', label: '4. Pedidos de Servicio', file: files.pedidos, setter: (f: File) => setFiles(prev => ({ ...prev, pedidos: f })) },
            { key: 'pedidosReg', label: '5. Pedidos Registrados', file: files.pedidosReg, setter: (f: File) => setFiles(prev => ({ ...prev, pedidosReg: f })) },
          ].map((item) => {
            const inputId = `file-input-${item.key}`;
            return (
              <div 
                key={item.key} 
                onClick={() => document.getElementById(inputId)?.click()}
                className={`p-3 border rounded-lg flex items-center justify-between text-sm cursor-pointer transition-all hover:border-primary ${
                  item.file ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-muted/30 text-muted-foreground border-dashed'
                }`}
              >
                <input 
                  id={inputId} 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      item.setter(e.target.files[0]);
                    }
                  }} 
                />
                <div className="flex items-center space-x-2 truncate">
                  <FileSpreadsheet className={`w-4 h-4 flex-shrink-0 ${item.file ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <div className="truncate">
                    <p className="font-semibold text-xs">{item.label}</p>
                    <p className="text-xs truncate opacity-80">{item.file ? item.file.name : 'Haz clic o suelta aquí...'}</p>
                  </div>
                </div>
                {item.file && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 ml-2" />}
              </div>
            );
          })}
        </div>

        {/* ACCIONES */}
        <div className="flex items-center gap-4 pt-2 border-t">
          <button
            type="button"
            disabled={loading || !allAssigned}
            onClick={handleProcessAndSync}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium text-sm shadow-sm transition-all"
          >
            {loading ? 'Procesando los 5 ficheros...' : 'Procesar y Sincronizar Todo'}
          </button>
          
          <button
            type="button"
            onClick={() => {
              setFiles({ revisiones: null, productos: null, lineasContrato: null, pedidos: null, pedidosReg: null });
              setResultMessage(null);
            }}
            className="px-4 py-2.5 border rounded-lg hover:bg-muted font-medium text-sm"
          >
            Reiniciar selección
          </button>
        </div>

        {resultMessage && (
          <div className={`p-4 border rounded-lg text-sm font-medium flex items-start space-x-2 ${isError ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
            {isError ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <span>{resultMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncView;
