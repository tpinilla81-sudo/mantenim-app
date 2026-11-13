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

    // Fallback por orden secuencial si no se detectaron por nombre exacto pero se soltaron varios ficheros de golpe
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

  // Lector ultra-robusto que busca la primera hoja con datos reales
  const readFileAsJSON = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          
          let sheetName = workbook.SheetNames[0];
          let sheet = workbook.Sheets[sheetName];
          let data = XLSX.utils.sheet_to_json(sheet) as any[];

          // Si la primera hoja está vacía, buscamos en el resto de hojas del workbook
          if (data.length === 0 && workbook.SheetNames.length > 1) {
            for (const name of workbook.SheetNames) {
              const altSheet = workbook.Sheets[name];
              const altData = XLSX.utils.sheet_to_json(altSheet) as any[];
              if (altData.length > 0) {
                data = altData;
                sheetName = name;
                break;
              }
            }
          }
          
          console.log(`📄 Fichero [${file.name}] (Hoja: ${sheetName}): ${data.length} filas leídas. Columnas:`, data[0] ? Object.keys(data[0]) : 'Ninguna');
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

  const allAssigned = files.revisiones && files.productos && files.lineasContrato && files.pedidos && files.pedidosReg;

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

        {/* LISTADO DE LOS 5 FICHEROS CON OPCIÓN DE CLIC MANUAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'revisiones', label: '1. Revisiones', file: files.
