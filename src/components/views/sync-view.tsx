'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { calcularProximaRevisionContrato, calcularProximaRevisionPropia } from '@/lib/maintenance-rules';

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
        if (!newFiles.pedidos) newFiles.pedidos = file;
        else if (!newFiles.pedidosReg) newFiles.pedidosReg = file;
      }
    });

    const unassignedFiles = Array.from(fileList).filter(f => !Object.values(newFiles).includes(f));
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

  const parseExcelDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - (25567 + 2)) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    const str = String(val).trim();
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
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
      const revisionesMap = new Map<string, { contrato: string; ultimaFecha: Date | null; numRevisionesAnuales: number }>();
      revData.forEach((rev) => {
        let prodServ = '';
        let numContrato = '';
        let fechaUltima: Date | null = null;
        let revAnuales = 1;

        for (const k of Object.keys(rev)) {
          const val = rev[k];
          const upper = k.toUpperCase();
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD')) {
            if (val) prodServ = String(val).trim();
          } else if (upper.includes('CONTRATO')) {
            if (val) numContrato = String(val).trim();
          } else if (upper.includes('FECHA') || upper.includes('ULTIMA') || upper.includes('ÚLTIMA') || upper.includes('SERVICIO')) {
            const parsed = parseExcelDate(val);
            if (parsed) fechaUltima = parsed;
          } else if (upper.includes('REVISIONES') || upper.includes('CANTIDAD') || upper.includes('Nº REVISIONES')) {
            const parsedNum = Number(val);
            if (!isNaN(parsedNum) && parsedNum > 0) revAnuales = parsedNum;
          }
        }

        if (prodServ) {
          revisionesMap.set(prodServ, { contrato: numContrato, ultimaFecha: fechaUltima, numRevisionesAnuales: revAnuales });
        }
      });

      // 2. Mapa de Líneas de Contrato
      const lineasMap = new Map<string, { contrato: string; sucursal: string }>();
      lineasContratoData.forEach((linea) => {
        let prodServ = '';
        let numContrato = '';
        let suc = '';
        for (const k of Object.keys(linea)) {
          const val = String(linea[k] || '').trim();
          const upper = k.toUpperCase();
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD')) {
            if (val) prodServ = val;
          } else if (upper.includes('CONTRATO') && !upper.includes('GRUPO')) {
            if (val) numContrato = val;
          } else if (upper.includes('SUCURSAL') || upper.includes('CENTRO') || upper.includes('DELEGACI')) {
            if (val) suc = val;
          }
        }
        if (prodServ) {
          lineasMap.set(prodServ, { contrato: numContrato, sucursal: suc });
        }
      });

      // 3. Histórico de horas por equipo para máquinas propias
      const historialProdMap = new Map<string, { fecha: Date; horas: number }[]>();
      pedidosRegData.forEach((reg) => {
        let prodServ = '';
        let fechaReg: Date | null = null;
        let horasReg = 0;

        for (const k of Object.keys(reg)) {
          const val = reg[k];
          const upper = k.toUpperCase();
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD')) {
            if (val) prodServ = String(val).trim();
          } else if (upper.includes('FECHA')) {
            fechaReg = parseExcelDate(val);
          } else if (upper.includes('HORAS')) {
            const num = Number(val);
            if (!isNaN(num)) horasReg = num;
          }
        }

        if (prodServ && fechaReg) {
          const list = historialProdMap.get(prodServ) || [];
          list.push({ fecha: fechaReg, horas: horasReg });
          historialProdMap.set(prodServ, list);
        }
      });

      // 4. Procesamiento final (Contratos + Propias con reglas aplicadas)
      const resultadoFinal: any[] = [];
      
      prodData.forEach((prod, index) => {
        let prodServId = '';
        let numSerie = '';
        let modelo = '';
        let sucursalProd = '';
        let propietario = '';
        let ubicacion = '';
        let horasActuales = 0;
        let esPropiaFlag = false;

        for (const k of Object.keys(prod)) {
          const val = String(prod[k] || '').trim();
          const upperKey = k.trim().toUpperCase();
          
          if (upperKey === 'Nº' || upperKey === 'Nº PRODUCTO' || upperKey.includes('Nº PROD')) {
            if (!prodServId) prodServId = val;
          } else if (upperKey.includes('SERIE') && !upperKey.includes('PRODUCTO')) {
            numSerie = val;
          } else if (upperKey.includes('MODELO')) {
            modelo = val;
          } else if (upperKey.includes('SUCURSAL') || upperKey.includes('DELEGACI') || upperKey.includes('CENTRO')) {
            if (val) sucursalProd = val;
          } else if (upperKey.includes('PROPIETARIO') && upperKey.includes('NOMBRE')) {
            propietario = val;
          } else if (upperKey.includes('UBICACIÓN') && upperKey.includes('NOMBRE')) {
            ubicacion = val;
          } else if (upperKey.includes('HORAS')) {
            const num = Number(val);
            if (!isNaN(num)) horasActuales = num;
          } else if (upperKey.includes('PROPIA')) {
            if (val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'sí') esPropiaFlag = true;
          }
        }

        if (!prodServId) {
          const keys = Object.keys(prod);
          if (keys.length > 0) prodServId = String(prod[keys[0]] || '').trim();
        }

        if (prodServId) {
          const revInfo = revisionesMap.get(prodServId);
          const lineaInfo = lineasMap.get(prodServId);
          const contratoFinal = lineaInfo?.contrato || revInfo?.contrato;
          const tieneContrato = revInfo !== undefined || lineaInfo !== undefined;

          if (tieneContrato || esPropiaFlag) {
            const sucursalFinal = sucursalProd || lineaInfo?.sucursal || 'S01';
            let fechaProximaStr = 'Pendiente';

            if (tieneContrato) {
              fechaProximaStr = calcularProximaRevisionContrato(revInfo?.ultimaFecha || null, revInfo?.numRevisionesAnuales || 1);
            } else if (esPropiaFlag) {
              const historico = historialProdMap.get(prodServId) || [];
              const ultimaRevPropia = historico.length > 0 ? historico[historico.length - 1].fecha : null;
              fechaProximaStr = calcularProximaRevisionPropia(ultimaRevPropia, horasActuales, modelo, historico);
            }

            resultadoFinal.push({
              'Nº prod. servicio': prodServId,
              'Nº Serie': numSerie || 'N/A',
              'Modelo': modelo || 'N/A',
              'Sucursal': sucursalFinal,
              'Nº Contrato': contratoFinal || 'Sin Contrato',
              'Fecha Próxima Revisión': fechaProximaStr,
              'Nombre Cliente Propietario': propietario || 'N/A',
              'Nombre Cliente Ubicación': ubicacion || 'N/A',
              'Nº de horas': horasActuales,
              'Tipo Registro': tieneContrato ? 'Contratado' : 'Propia',
              idUnico: `${index}_${prodServId}`
            });
          }
        }
      });

      localStorage.setItem('mantenim_planificacion_data', JSON.stringify(resultadoFinal));
      setProcessedData(resultadoFinal);
      setIsError(false);
      setResultMessage(`¡Éxito! Procesados ${resultadoFinal.length} equipos aplicando las reglas de cálculo.`);
    } catch (error: any) {
      setIsError(true);
      setResultMessage(`Error al procesar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (processedData.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Calculada');
    XLSX.writeFile(workbook, `Planificacion_Mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allAssigned = Boolean(files.revisiones && files.productos && files.lineasContrato && files.pedidos && files.pedidosReg);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronización con Lógicas de Negocio</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Motor de Cálculo Activo</span>
      </div>
      
      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Arrastra tus 5 excels de Business Central</h3>
          <p className="text-sm text-muted-foreground">
            Se calcularán automáticamente las fechas de revisión para contratos y máquinas propias (cada 1.000h).
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
          <input ref={fileInputRef} type="file" multiple accept=".xlsx, .xls" onChange={handleFileSelect} className="hidden" />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-semibold">Arrastra los 5 excels aquí o haz clic para buscarlos</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'revisiones', label: '1. Revisiones', file: files.revisiones, setter: (f: File) => setFiles(p => ({ ...p, revisiones: f })) },
            { key: 'productos', label: '2. Productos de Servicio', file: files.productos, setter: (f: File) => setFiles(p => ({ ...p, productos: f })) },
            { key: 'lineasContrato', label: '3. Líneas de Contrato', file: files.lineasContrato, setter: (f: File) => setFiles(p => ({ ...p, lineasContrato: f })) },
            { key: 'pedidos', label: '4. Pedidos de Servicio', file: files.pedidos, setter: (f: File) => setFiles(p => ({ ...p, pedidos: f })) },
            { key: 'pedidosReg', label: '5. Pedidos Registrados', file: files.pedidosReg, setter: (f: File) => setFiles(p => ({ ...p, pedidosReg: f })) },
          ].map((item) => {
            const inputId = `file-input-${item.key}`;
            return (
              <div key={item.key} onClick={() => document.getElementById(inputId)?.click()} className={`p-3 border rounded-lg flex items-center justify-between text-sm cursor-pointer transition-all hover:border-primary ${item.file ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-muted/30 text-muted-foreground border-dashed'}`}>
                <input id={inputId} type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) item.setter(e.target.files[0]); }} />
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
          <button type="button" disabled={loading || !allAssigned} onClick={handleProcessAndSync} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium text-sm shadow-sm transition-all">
            {loading ? 'Calculando...' : 'Procesar con Reglas de Mantenimiento'}
          </button>
          {processedData.length > 0 && (
            <button type="button" onClick={handleDownloadExcel} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> Descargar Excel ({processedData.length})
            </button>
          )}
        </div>

        {resultMessage && (
          <div className={`p-4 border rounded-lg text-sm font-medium flex items-start space-x-2 ${isError ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-800'}`}>
            {isError ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            <span>{resultMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncView;
