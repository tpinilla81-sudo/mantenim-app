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
      const pedidosRegData = await readFileAsJSON(files.pedidosReg);

      if (prodData.length === 0) {
        throw new Error("El fichero de Productos de Servicio está vacío.");
      }

      // 1. Mapa de Revisiones
      const revisionesMap = new Map();
      revData.forEach((rev) => {
        let prodServ = '';
        let numContrato = '';
        for (const k of Object.keys(rev)) {
          const val = String(rev[k] || '').trim();
          const upper = k.toUpperCase();
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD')) {
            if (val) prodServ = val;
          }
          if (upper.includes('CONTRATO')) {
            if (val) numContrato = val;
          }
        }
        if (!prodServ) {
          const keys = Object.keys(rev);
          if (keys.length > 0) prodServ = String(rev[keys[0]] || '').trim();
          if (keys.length > 1 && !numContrato) numContrato = String(rev[keys[1]] || '').trim();
        }
        if (prodServ) {
          revisionesMap.set(prodServ, numContrato);
        }
      });

      // 2. Mapa de Líneas de Contrato
      const lineasMap = new Map();
      lineasContratoData.forEach((linea) => {
        let prodServ = '';
        let numContrato = '';
        for (const k of Object.keys(linea)) {
          const val = String(linea[k] || '').trim();
          const upper = k.toUpperCase();
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD')) {
            if (val) prodServ = val;
          }
          if (upper.includes('CONTRATO') && !upper.includes('GRUPO')) {
            if (val) numContrato = val;
          }
        }
        if (prodServ) {
          lineasMap.set(prodServ, numContrato);
        }
      });

      // 3. Mapa de Pedidos Registrados para extraer la Delegación
      const delegacionMap = new Map();
      pedidosRegData.forEach((reg) => {
        let numCli = '';
        let delegacion = '';
        for (const k of Object.keys(reg)) {
          const val = String(reg[k] || '').trim();
          const upper = k.toUpperCase();
          if (upper.includes('CLIENTE') && !upper.includes('DIRECCIÓN')) {
            if (val) numCli = val;
          }
          if (upper.includes('DELEGACION') || upper.includes('DELEGACIÓN')) {
            if (val) delegacion = val;
          }
        }
        if (numCli && delegacion) {
          delegacionMap.set(numCli, delegacion);
        }
      });

      // 4. Filtrado y Construcción Final con Delegación
      const resultadoFinal: any[] = [];
      
      prodData.forEach((prod, index) => {
        let prodId = '';
        let serie = '';
        let modelo = '';
        let propietario = '';
        let numCliProp = '';
        let ubicacion = '';
        let horas = 0;

        for (const k of Object.keys(prod)) {
          const val = String(prod[k] || '').trim();
          const upperKey = k.trim().toUpperCase();
          
          if (upperKey === 'Nº' || upperKey === 'Nº PRODUCTO' || upperKey.includes('Nº PROD')) {
            if (!prodId) prodId = val;
          } else if (upperKey.includes('SERIE')) {
            serie = val;
          } else if (upperKey.includes('MODELO')) {
            modelo = val;
          } else if (upperKey.includes('PROPIETARIO') && upperKey.includes('NOMBRE')) {
            propietario = val;
          } else if (upperKey.includes('Nº CLIENTE PROPIETARIO')) {
            numCliProp = val;
          } else if (upperKey.includes('UBICACIÓN') && upperKey.includes('NOMBRE')) {
            ubicacion = val;
          } else if (upperKey.includes('HORAS')) {
            horas = Number(val) || 0;
          }
        }

        if (!prodId) {
          const keys = Object.keys(prod);
          if (keys.length > 0) prodId = String(prod[keys[0]] || '').trim();
        }

        if (prodId) {
          const contratoRev = revisionesMap.get(prodId);
          const contratoLinea = lineasMap.get(prodId);
          const contratoFinal = contratoLinea || contratoRev;

          if (contratoRev !== undefined || contratoLinea !== undefined) {
            // Buscar delegación por cliente o por defecto
            let delegacion = delegacionMap.get(numCliProp) || 'Sin Delegación';

            resultadoFinal.push({
              'Nº prod. servicio': prodId,
              'Nº Serie': serie || prodId,
              'Modelo': modelo || 'N/A',
              'Delegación': delegacion,
              'Nº Contrato': contratoFinal || 'Sin Contrato',
              'Nombre Cliente Propietario': propietario || 'N/A',
              'Nombre Cliente Ubicación': ubicacion || 'N/A',
              'Nº de horas': horas,
              'Tipo Registro': 'Contratado',
              idUnico: `${index}_${prodId}`
            });
          }
        }
      });

      const jsonString = JSON.stringify(resultadoFinal);
      localStorage.setItem('mantenim_planificacion_data', jsonString);

      setProcessedData(resultadoFinal);
      setIsError(false);
      setResultMessage(`¡Éxito! Procesados y guardados ${resultadoFinal.length} equipos con contrato y delegación.`);
    } catch (error: any) {
      setIsError(true);
      console.error(error);
      setResultMessage(`Error al procesar los ficheros: ${error.message || 'Formato no válido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (processedData.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Contratos');
    XLSX.writeFile(workbook, `Planificacion_Contratos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allAssigned = Boolean(files.revisiones && files.productos && files.lineasContrato && files.pedidos && files.pedidosReg);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronización (Con Delegación)</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Contratos y Delegación</span>
      </div>
      
      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Arrastra tus 5 excels de Business Central aquí</h3>
          <p className="text-sm text-muted-foreground">
            Se asignará la delegación correspondiente a cada equipo bajo contrato.
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

        <div className="grid grid-cols-1 sm:grid-cols
