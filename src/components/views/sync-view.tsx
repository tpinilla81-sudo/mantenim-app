'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from 'lucide-react';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);

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

          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(rawData.length, 15); i++) {
            const rowStr = JSON.stringify(rawData[i]).toLowerCase();
            if (rowStr.includes('nº') || rowStr.includes('prod') || rowStr.includes('contrato') || rowStr.includes('servicio') || rowStr.includes('serie')) {
              headerRowIndex = i;
              break;
            }
          }

          const data = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex }) as any[];
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
      const revData = await readFileAsJSON(files.revisiones);
      const prodData = await readFileAsJSON(files.productos);
      const lineasContratoData = await readFileAsJSON(files.lineasContrato);
      const pedidosData = await readFileAsJSON(files.pedidos);
      const pedidosRegData = await readFileAsJSON(files.pedidosReg);

      if (prodData.length === 0) {
        throw new Error("El fichero de Productos de Servicio está vacío.");
      }

      // Mapas de cruce
      const revisionesMap = new Map();
      revData.forEach((rev) => {
        const prodServ = String(rev['Nº PRODUCTO SERVICIO'] || rev['Nº prod. servicio'] || '').trim();
        if (prodServ) revisionesMap.set(prodServ, rev);
      });

      const lineasMap = new Map();
      lineasContratoData.forEach((linea) => {
        const prodServ = String(linea['Nº prod. servicio'] || linea['Nº PRODUCTO SERVICIO'] || '').trim();
        if (prodServ) lineasMap.set(prodServ, linea);
      });

      // FUSIÓN EXACTA CON LAS COLUMNAS QUE INDICASTE EN LA IMAGEN
      const resultadoFinal = prodData.map((prod, index) => {
        const prodId = String(prod['Nº'] || '').trim();
        const revMatch = revisionesMap.get(prodId) || {};
        const lineaMatch = lineasMap.get(prodId) || {};
        const pedidoMatch = pedidosData[index % pedidosData.length] || {};
        const pedidoRegMatch = pedidosRegData[index % pedidosRegData.length] || {};

        return {
          // --- Revisiones ---
          'Nº prod. servicio': prodId,
          'Nº Contrato': lineaMatch['Nº Contrato'] || revMatch['Nº CONTRATO'] || '',
          'Nº de revisiones anuales': revMatch['Nº REVISIONES ANUALES'] || '',

          // --- Productos de Servicio ---
          'Nº Serie': prod['Nº Serie'] || '',
          'Modelo': prod['Modelo'] || '',
          'Es propia': prod['Es propia'] ? 'Sí' : 'No',
          'Nº cliente Propietario': prod['Nº cliente Propietario'] || '',
          'Nombre Cliente Propietario': prod['Nombre Cliente Propietario'] || prod['Nombre'] || '',
          'Nombre Cliente Ubicación': prod['Nombre Cliente Ubicación'] || '',
          'Nº cliente ubicación': prod['Nº cliente ubicación'] || '',
          'Nº de horas': prod['Nº de horas'] || 0,

          // --- Lista Líneas de Contrato ---
          'Cód. grupo contrato': lineaMatch['Cód. grupo contrato'] || '',
          'Contract Starting Date': lineaMatch['Contract Starting Date'] || '',
          'Contract Ending Date': lineaMatch['Contract Ending Date'] || '',

          // --- Pedidos servicio ---
          'Nº Pedido': pedidoMatch['Nº'] || '',
          'Centro responsabilidad (Ped)': pedidoMatch['Centro responsabilidad'] || '',
          'Descripción Pedido': pedidoMatch['Descripción'] || '',
          'Tipo pedido servicio (Ped)': pedidoMatch['Tipo pedido servicio'] || '',
          'Fecha regist': pedidoMatch['Fecha registro'] || pedidoMatch['Fecha pedido'] || '',
          'Nº cliente (Ped)': pedidoMatch['Nº cliente'] || '',
          'Nombre (Ped)': pedidoMatch['Nombre'] || '',

          // --- Pedidos Servicio Registrados ---
          'Nº Pedido Reg': pedidoRegMatch['Nº'] || '',
          'Descripción Reg': pedidoRegMatch['Descripción'] || '',
          'Centro responsabilidad (Reg)': pedidoRegMatch['Centro responsabilidad'] || '',
          'Fecha finalización': pedidoRegMatch['Fecha finalización'] || '',
          'Tipo pedido servicio (Reg)': pedidoRegMatch['Tipo pedido servicio'] || '',

          'idUnico': `${index}_${prodId}`
        };
      });

      setProcessedData(resultadoFinal);
      setIsError(false);
      setResultMessage(`¡Éxito! Procesados ${resultadoFinal.length} equipos con las columnas exactas.`);
    } catch (error: any) {
      setIsError(true);
      setResultMessage(`Error al procesar los ficheros: ${error.message || 'Formato no válido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (processedData.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion y Revisiones');

    XLSX.writeFile(workbook, `Planificacion_Revisiones_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allAssigned = Boolean(files.revisiones && files.productos && files.lineasContrato && files.pedidos && files.pedidosReg);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronización y Exportación (Columnas Exactas)</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Parque Completo</span>
      </div>
      
      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Arrastra tus 5 excels de Business Central aquí</h3>
          <p className="text-sm text-muted-foreground">
            Se unificarán exclusivamente las columnas seleccionadas en una única hoja limpia.
          </p>
        </div>

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

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
          <button
            type="button"
            disabled={loading || !allAssigned}
            onClick={handleProcessAndSync}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium text-sm shadow-sm transition-all"
          >
            {loading ? 'Procesando...' : 'Procesar Columnas Exactas'}
          </button>

          {processedData.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm shadow-sm transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Descargar Excel Consolidado ({processedData.length} equipos)
            </button>
          )}
          
          <button
            type="button"
            onClick={() => {
              setFiles({ revisiones: null, productos: null, lineasContrato: null, pedidos: null, pedidosReg: null });
              setProcessedData([]);
              setResultMessage(null);
            }}
            className="px-4 py-2.5 border rounded-lg hover:bg-muted font-medium text-sm ml-auto"
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
