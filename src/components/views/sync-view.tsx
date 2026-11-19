'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { calcularProximaRevisionContrato, calcularProximaRevisionPropia } from '@/lib/maintenance-rules';
import {
  calcularCrucesPedidosRegistrados,
  CrucePedidoResultado,
} from '@/lib/pedido-producto-matcher';

interface RevisionReal {
  fecha: Date;
  horas: number;
}

const STORAGE_CRUCES_KEY = 'mantenim_cruces_pedidos_2025_2026';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [hasStoredData, setHasStoredData] = useState(false);
  const [crucesData, setCrucesData] = useState<CrucePedidoResultado[]>([]);

  const [files, setFiles] = useState<{
    revisiones: File | null;
    productos: File | null;
    lineasContrato: File | null;
    tareasServicio: File | null;
    pedidosReg: File | null;
  }>({
    revisiones: null,
    productos: null,
    lineasContrato: null,
    tareasServicio: null,
    pedidosReg: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('mantenim_planificacion_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProcessedData(parsed);
          setHasStoredData(true);
        }
      } catch (e) {
        console.error('Error leyendo datos guardados', e);
      }
    }

    const savedCruces = localStorage.getItem(STORAGE_CRUCES_KEY);
    if (savedCruces) {
      try {
        const parsedCruces = JSON.parse(savedCruces);
        if (Array.isArray(parsedCruces)) {
          setCrucesData(parsedCruces);
        }
      } catch (e) {
        console.error('Error leyendo cruces guardados', e);
      }
    }
  }, []);

  const classifyFiles = (fileList: FileList | File[]) => {
    const newFiles = { ...files };
    Array.from(fileList).forEach((file) => {
      const name = file.name.toLowerCase();
      if (name.includes('revision') || name.includes('rev') || name.includes('ppi')) {
        newFiles.revisiones = file;
      } else if (name.includes('producto') || name.includes('prod')) {
        newFiles.productos = file;
      } else if (name.includes('contrato') || name.includes('líneas') || name.includes('lineas') || name.includes('line')) {
        newFiles.lineasContrato = file;
      } else if (name.includes('tarea') || name.includes('task')) {
        newFiles.tareasServicio = file;
      } else if (name.includes('registrado') || name.includes('reg') || name.includes('posted')) {
        newFiles.pedidosReg = file;
      }
    });

    const unassignedFiles = Array.from(fileList).filter((f) => !Object.values(newFiles).includes(f));
    if (unassignedFiles.length > 0) {
      if (!newFiles.revisiones && unassignedFiles.length > 0) newFiles.revisiones = unassignedFiles.shift() || null;
      if (!newFiles.productos && unassignedFiles.length > 0) newFiles.productos = unassignedFiles.shift() || null;
      if (!newFiles.lineasContrato && unassignedFiles.length > 0) newFiles.lineasContrato = unassignedFiles.shift() || null;
      if (!newFiles.tareasServicio && unassignedFiles.length > 0) newFiles.tareasServicio = unassignedFiles.shift() || null;
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
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const rowStr = JSON.stringify(rawData[i]).toLowerCase();
            if (
              rowStr.includes('nº') ||
              rowStr.includes('no.') ||
              rowStr.includes('prod') ||
              rowStr.includes('contrato') ||
              rowStr.includes('servicio') ||
              rowStr.includes('tarea') ||
              rowStr.includes('serie') ||
              rowStr.includes('fecha') ||
              rowStr.includes('pedido')
            ) {
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

  const readSheetAsRows = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
          resolve(rows);
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
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === 'number') {
      if (val <= 0) return null;
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    const str = String(val).trim();
    if (!str || str.toLowerCase() === 'undefined' || str === '0' || str === '-') return null;

    const cleanStr = str.split(' ')[0];
    const parts = cleanStr.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime())) return d;
      } else {
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        if (!isNaN(d.getTime())) return d;
      }
    }

    const standardDate = new Date(str);
    return isNaN(standardDate.getTime()) ? null : standardDate;
  };

  const parseHoursValue = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const normalized = String(val).trim().replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    return isNaN(num) ? 0 : num;
  };

  const isProductColumn = (upperKey: string): boolean => {
    return (
      upperKey.includes('PRODUCTO') ||
      upperKey.includes('PROD.') ||
      upperKey.includes('PROD ') ||
      upperKey.includes('SERVICIO') ||
      upperKey.includes('EQUIPO') ||
      upperKey.includes('MÁQUINA') ||
      upperKey.includes('MAQUINA') ||
      upperKey === 'Nº' ||
      upperKey === 'NO.' ||
      upperKey.includes('CÓDIGO') ||
      upperKey.includes('CODIGO')
    );
  };

  const isHoursColumn = (upperKey: string): boolean => {
    return (
      upperKey.includes('HORAS') ||
      upperKey.includes('CONTADOR') ||
      upperKey.includes('LECTURA') ||
      upperKey.includes('CUENTAHORAS')
    );
  };

  const parseTareasServicio = (rawRows: any[][]): Map<string, RevisionReal[]> => {
    const map = new Map<string, RevisionReal[]>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!Array.isArray(row) || row.length <= 15) continue;

      const prodId = String(row[15] ?? '').trim();
      const tipoPedido = String(row[18] ?? '').trim().toUpperCase();
      const contrasteDesc = String(row[19] ?? '').trim().toUpperCase();
      const rawFecha = row.length > 23 ? row[23] : null;

      if (!prodId || prodId.toUpperCase().includes('PROD') || prodId.toUpperCase().includes('PRODUCTO')) {
        continue;
      }

      const esRevision =
        tipoPedido.includes('MANTPREV') ||
        contrasteDesc.includes('REVISION') ||
        contrasteDesc.includes('REVISIÓN');

      if (!esRevision) continue;

      const fecha = parseExcelDate(rawFecha);
      if (!fecha) continue;

      let horasFila = 0;
      for (let c = 0; c < row.length; c++) {
        const cellVal = row[c];
        if (typeof cellVal === 'number' && c !== 15 && c !== 18 && c !== 19 && c !== 23 && cellVal > 0 && cellVal < 200000) {
          horasFila = Math.max(horasFila, cellVal);
        }
      }

      const existing = map.get(prodId) || [];
      existing.push({ fecha, horas: horasFila });
      map.set(prodId, existing);
    }

    return map;
  };

  const handleProcessAndSync = async () => {
    if (!files.revisiones || !files.productos || !files.lineasContrato || !files.tareasServicio) {
      setIsError(true);
      setResultMessage('Faltan ficheros obligatorios (Revisiones, Productos de Servicio, Líneas de Contrato y Tareas de Servicio).');
      return;
    }

    setLoading(true);
    setResultMessage(null);
    setIsError(false);

    try {
      const [revData, prodData, lineasContratoData, tareasRawRows, pedidosRegData] = await Promise.all([
        readFileAsJSON(files.revisiones),
        readFileAsJSON(files.productos),
        readFileAsJSON(files.lineasContrato),
        readSheetAsRows(files.tareasServicio),
        files.pedidosReg ? readFileAsJSON(files.pedidosReg) : Promise.resolve([]),
      ]);

      if (prodData.length === 0) {
        throw new Error('El fichero de Productos de Servicio está vacío.');
      }

      const revisionesPorEquipo = parseTareasServicio(tareasRawRows);

      const revisionesMap = new Map<string, { contrato: string; numRevisionesAnuales: number }>();
      revData.forEach((rev) => {
        let prodServ = '';
        let numContrato = '';
        let revAnuales = 1;

        for (const k of Object.keys(rev)) {
          const val = rev[k];
          const valStr = String(val || '').trim();
          const upper = k.toUpperCase().trim();

          if (isProductColumn(upper)) {
            if (valStr) prodServ = valStr;
          } else if ((upper === 'Nº CONTRATO' || upper === 'N. CONTRATO' || upper === 'CONTRATO') && !upper.includes('GRUPO') && valStr) {
            numContrato = valStr;
          } else if (upper.includes('REVISIONES') || upper.includes('CANTIDAD') || upper.includes('Nº REVISIONES') || upper.includes('ANUAL')) {
            const parsedNum = Number(val);
            if (!isNaN(parsedNum) && parsedNum > 0) revAnuales = parsedNum;
          }
        }

        if (prodServ) {
          const prev = revisionesMap.get(prodServ);
          revisionesMap.set(prodServ, {
            contrato: numContrato || prev?.contrato || '',
            numRevisionesAnuales: revAnuales || prev?.numRevisionesAnuales || 1,
          });
        }
      });

      const lineasMap = new Map<string, { contrato: string; sucursal: string }>();
      lineasContratoData.forEach((linea) => {
        let prodServ = '';
        let numContrato = '';
        let suc = '';

        for (const k of Object.keys(linea)) {
          const val = String(linea[k] || '').trim();
          const upper = k.toUpperCase().trim();

          if (upper.includes('GRUPO') || upper.includes('TIPO')) continue;

          if (isProductColumn(upper)) {
            if (val) prodServ = val;
          } else if ((upper === 'Nº CONTRATO' || upper === 'N. CONTRATO' || upper === 'CONTRATO') && val) {
            numContrato = val;
          } else if (upper.includes('SUCURSAL') || upper.includes('CENTRO') || upper.includes('DELEGACI')) {
            if (val) suc = val;
          }
        }

        if (prodServ) {
          lineasMap.set(prodServ, { contrato: numContrato, sucursal: suc });
        }
      });

      const resultadoFinal: any[] = [];
      const currentYear = new Date().getFullYear();
      let equiposConUltimaRev = 0;

      prodData.forEach((prod, index) => {
        let prodServId = '';
        let numSerie = '';
        let modelo = '';
        let sucursalProd = '';
        let propietario = '';
        let ubicacion = '';
        let horasProd = 0;
        let contratoEnProd = '';
        let esPropiaFlag = false;

        for (const k of Object.keys(prod)) {
          const val = String(prod[k] || '').trim();
          const upperKey = k.trim().toUpperCase();

          if (upperKey.includes('GRUPO') || upperKey.includes('TIPO')) continue;

          if (isProductColumn(upperKey)) {
            if (!prodServId && val) prodServId = val;
          } else if ((upperKey === 'Nº CONTRATO' || upperKey === 'N. CONTRATO' || upperKey === 'CONTRATO') && val) {
            contratoEnProd = val;
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
          } else if (isHoursColumn(upperKey)) {
            const num = parseHoursValue(prod[k]);
            if (num > 0) horasProd = num;
          } else if (upperKey.includes('PROPIA')) {
            if (val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'sí' || val.toLowerCase() === 'si') {
              esPropiaFlag = true;
            }
          }
        }

        if (!prodServId) {
          const keys = Object.keys(prod);
          if (keys.length > 0) prodServId = String(prod[keys[0]] || '').trim();
        }

        if (prodServId) {
          const revInfo = revisionesMap.get(prodServId);
          const lineaInfo = lineasMap.get(prodServId);
          const historialRev = (revisionesPorEquipo.get(prodServId) || []).sort(
            (a, b) => a.fecha.getTime() - b.fecha.getTime()
          );

          const contratoFinal = contratoEnProd || lineaInfo?.contrato || revInfo?.contrato || '';
          const contratoStr = String(contratoFinal).trim();

          const upperC = contratoStr.toUpperCase();
          const esValido =
            contratoStr !== '' &&
            upperC !== 'SIN CONTRATO' &&
            upperC !== 'UNDEFINED' &&
            upperC !== 'NULL' &&
            contratoStr !== '0';

          if (esValido || esPropiaFlag || historialRev.length > 0) {
            const sucursalFinal = sucursalProd || lineaInfo?.sucursal || 'S01';

            const ultimaRev = historialRev.length > 0 ? historialRev[historialRev.length - 1] : null;
            const ultimaFechaReal = ultimaRev?.fecha || null;
            if (ultimaFechaReal) equiposConUltimaRev++;

            const registrosConHoras = historialRev.filter((h) => h.horas > 0);
            const ultimoConHoras =
              registrosConHoras.length > 0 ? registrosConHoras[registrosConHoras.length - 1] : null;
            const horasActuales = ultimoConHoras ? ultimoConHoras.horas : horasProd;

            const revisionesEnAno = historialRev.filter((h) => h.fecha.getFullYear() === currentYear).length;

            let fechaProximaStr = 'Pendiente';

            if (esValido) {
              fechaProximaStr = ultimaFechaReal
                ? calcularProximaRevisionContrato(
                    ultimaFechaReal,
                    revInfo?.numRevisionesAnuales || 1,
                    revisionesEnAno
                  )
                : 'Pendiente';
            } else {
              fechaProximaStr = calcularProximaRevisionPropia(
                ultimaFechaReal,
                horasActuales,
                modelo,
                historialRev.map((h) => ({ fecha: h.fecha, horas: h.horas }))
              );
            }

            resultadoFinal.push({
              'Nº prod. servicio': prodServId,
              'Nº Serie': numSerie || 'N/A',
              'Modelo': modelo || 'N/A',
              'Sucursal': sucursalFinal,
              'Nº Contrato': contratoStr,
              'Fecha Próxima Revisión': fechaProximaStr,
              'Nombre Cliente Propietario': propietario || 'N/A',
              'Nombre Cliente Ubicación': ubicacion || 'N/A',
              'Nº de horas': horasActuales,
              'Tipo Registro': esValido ? 'Contratado' : 'Propia',
              idUnico: `${index}_${prodServId}`,
            });
          }
        }
      });

      const { cruces, asignados, sinCruce } = calcularCrucesPedidosRegistrados({
        pedidosRegData,
        prodData,
        lineasContratoData,
        parseDateFn: parseExcelDate,
      });

      localStorage.setItem('mantenim_planificacion_data', JSON.stringify(resultadoFinal));
      localStorage.setItem(STORAGE_CRUCES_KEY, JSON.stringify(cruces));

      setProcessedData(resultadoFinal);
      setCrucesData(cruces);
      setHasStoredData(true);
      setIsError(false);
      setResultMessage(
        `Procesados ${resultadoFinal.length} equipos (${equiposConUltimaRev} con última revisión). Cruces pedidos 2025/2026: ${cruces.length} total (${asignados.length} asignados, ${sinCruce.length} sin cruce automático).`
      );
    } catch (error: any) {
      setIsError(true);
      setResultMessage(`Error al procesar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportCrucesToExcel = (rows: CrucePedidoResultado[], suffix: string) => {
    if (rows.length === 0) return;
    const cleanRows = rows.map(({ _asignado, ...rest }) => ({
      ...rest,
      Estado_Cruce: _asignado ? 'Asignado' : 'Sin cruce automático',
    }));
    const worksheet = XLSX.utils.json_to_sheet(cleanRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, suffix.slice(0, 31));
    XLSX.writeFile(workbook, `Cruces_Pedidos_2025_2026_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadExcel = () => {
    const dataToExport =
      processedData.length > 0
        ? processedData
        : JSON.parse(localStorage.getItem('mantenim_planificacion_data') || '[]');
    if (dataToExport.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Contratos');
    XLSX.writeFile(workbook, `Planificacion_Contratos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const allAssigned = Boolean(
    files.revisiones && files.productos && files.lineasContrato && files.tareasServicio
  );

  const pedidosAsignados = crucesData.filter((c) => c._asignado);
  const pedidosSinCruce = crucesData.filter((c) => !c._asignado);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sincronización de Ficheros</h2>
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">
          {hasStoredData ? '✓ Datos guardados' : 'Pendiente'}
        </span>
      </div>

      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">Carga de Ficheros</h3>
          <p className="text-sm text-muted-foreground">
            Sube los 5 excels de Business Central para calcular la planificación de revisiones y el cruce de Pedidos de Servicio Registrados (2025/2026).
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-muted-foreground/30 hover:border-primary/50 bg-muted/20'
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
              <p className="text-base font-semibold">
                {hasStoredData ? 'Arrastra nuevos excels para actualizar' : 'Arrastra los 5 excels aquí'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              key: 'revisiones',
              label: '1. Revisiones',
              file: files.revisiones,
              setter: (f: File) => setFiles((p) => ({ ...p, revisiones: f })),
            },
            {
              key: 'productos',
              label: '2. Productos de Servicio',
              file: files.productos,
              setter: (f: File) => setFiles((p) => ({ ...p, productos: f })),
            },
            {
              key: 'lineasContrato',
              label: '3. Líneas de Contrato',
              file: files.lineasContrato,
              setter: (f: File) => setFiles((p) => ({ ...p, lineasContrato: f })),
            },
            {
              key: 'tareasServicio',
              label: '4. Tareas de Servicio',
              file: files.tareasServicio,
              setter: (f: File) => setFiles((p) => ({ ...p, tareasServicio: f })),
            },
            {
              key: 'pedidosReg',
              label: '5. Pedidos de Servicio Registrados',
              file: files.pedidosReg,
              setter: (f: File) => setFiles((p) => ({ ...p, pedidosReg: f })),
            },
          ].map((item) => {
            const inputId = `file-input-${item.key}`;
            return (
              <div
                key={item.key}
                onClick={() => document.getElementById(inputId)?.click()}
                className={`p-3 border rounded-lg flex items-center justify-between text-sm cursor-pointer transition-all hover:border-primary ${
                  item.file
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                    : 'bg-muted/30 text-muted-foreground border-dashed'
                }`}
              >
                <input
                  id={inputId}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) item.setter(e.target.files[0]);
                  }}
                />
                <div className="flex items-center space-x-2 truncate">
                  <FileSpreadsheet
                    className={`w-4 h-4 flex-shrink-0 ${item.file ? 'text-emerald-600' : 'text-muted-foreground'}`}
                  />
                  <div className="truncate">
                    <p className="font-semibold text-xs">{item.label}</p>
                    <p className="text-xs truncate opacity-80">
                      {item.file ? item.file.name : hasStoredData ? 'Guardado ✓' : 'Haz clic o suelta aquí...'}
                    </p>
                  </div>
                </div>
                {item.file && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 ml-2" />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <button
            type="button"
            disabled={loading || !allAssigned}
            onClick={handleProcessAndSync}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Procesando...' : 'Procesar y Guardar'}
          </button>

          {(processedData.length > 0 || hasStoredData) && (
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Descargar Planificación
            </button>
          )}
        </div>

        {crucesData.length > 0 && (
          <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold">
                  Cruce Pedidos de Servicio Registrados ↔ Productos de Servicio (2025 / 2026)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Total 2025/2026: <strong>{crucesData.length}</strong> · Asignados: <strong>{pedidosAsignados.length}</strong> · Sin cruce automático: <strong>{pedidosSinCruce.length}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportCrucesToExcel(pedidosAsignados, 'Asignados')}
                  disabled={pedidosAsignados.length === 0}
                  className="px-3 py-1.5 bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Excel Asignados ({pedidosAsignados.length})
                </button>
                <button
                  type="button"
                  onClick={() => exportCrucesToExcel(pedidosSinCruce, 'Sin_Cruce')}
                  disabled={pedidosSinCruce.length === 0}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-40 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Excel Sin Cruce ({pedidosSinCruce.length})
                </button>
                <button
                  type="button"
                  onClick={() => exportCrucesToExcel(crucesData, 'Todos')}
                  className="px-3 py-1.5 bg-slate-800 text-white rounded-md hover:bg-slate-900 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Excel Todos ({crucesData.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {resultMessage && (
          <div
            className={`p-4 border rounded-lg text-sm font-medium flex items-start space-x-2 ${
              isError ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{resultMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncView;
