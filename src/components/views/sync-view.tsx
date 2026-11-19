'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Trash2,
} from 'lucide-react';

export interface EquipoContratoSync {
  'Nº prod. servicio': string;
  'Nº Contrato': string;
  'Origen Contrato': 'Línea de Contrato' | 'Producto de Servicio' | 'Ambos';
  'Nº Serie': string;
  'Modelo': string;
  'Sucursal': string;
  'Cliente Propietario': string;
  'Cliente Ubicación': string;
  'Nº de horas': number;
  'Tipo Registro': 'Contratado';
  idUnico: string;
}

export const STORAGE_CONTRATOS_KEY = 'mantenim_equipos_contrato';
export const STORAGE_PLANIFICACION_KEY = 'mantenim_planificacion_data';
export const SYNC_UPDATED_EVENT = 'mantenim-sync-updated';

// Columna L en Excel -> índice 11 (A=0, B=1, ..., L=11)
const COLUMNA_HORAS_PRODUCTOS_IDX = 11;

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isError, setIsError] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [equipos, setEquipos] = useState<EquipoContratoSync[]>([]);

  const [productosFile, setProductosFile] = useState<File | null>(null);
  const [lineasContratoFile, setLineasContratoFile] = useState<File | null>(null);

  const dropRef = useRef<HTMLInputElement>(null);
  const prodRef = useRef<HTMLInputElement>(null);
  const lineasRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_CONTRATOS_KEY) ||
        localStorage.getItem(STORAGE_PLANIFICACION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setEquipos(parsed);
        }
      }
    } catch (err) {
      console.error('Error leyendo equipos sincronizados:', err);
    }
  }, []);

  const asignarArchivos = (fileList: FileList | File[]) => {
    let nextProd = productosFile;
    let nextLineas = lineasContratoFile;
    const sinClasificar: File[] = [];

    Array.from(fileList).forEach((file) => {
      const name = file.name.toLowerCase();
      if (name.includes('linea') || name.includes('línea') || name.includes('contrato')) {
        nextLineas = file;
      } else if (name.includes('producto') || name.includes('prod') || name.includes('servicio')) {
        nextProd = file;
      } else {
        sinClasificar.push(file);
      }
    });

    sinClasificar.forEach((file) => {
      if (!nextProd) nextProd = file;
      else if (!nextLineas) nextLineas = file;
    });

    setProductosFile(nextProd);
    setLineasContratoFile(nextLineas);
    setStatusMessage(null);
    setIsError(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      asignarArchivos(e.dataTransfer.files);
    }
  };

  const detectarFilaCabecera = (matrix: any[][]): number => {
    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
      const filaStr = JSON.stringify(matrix[i] || []).toLowerCase();
      if (
        filaStr.includes('prod') ||
        filaStr.includes('contrato') ||
        filaStr.includes('serie') ||
        filaStr.includes('modelo') ||
        filaStr.includes('hora') ||
        filaStr.includes('nº') ||
        filaStr.includes('no.')
      ) {
        return i;
      }
    }
    return 0;
  };

  const convertirNumeroHoras = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (val === undefined || val === null) return 0;
    const raw = String(val).trim();
    if (!raw) return 0;

    let cleaned = raw.replace(/\s+/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '');
    }

    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const leerProductosConColumnaL = (
    file: File
  ): Promise<{ rows: Record<string, any>[]; horasPorFila: number[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
          }) as any[][];

          const headerIndex = detectarFilaCabecera(matrix);

          const jsonRows = XLSX.utils.sheet_to_json(sheet, {
            range: headerIndex,
            defval: '',
          }) as Record<string, any>[];

          // Extraer directamente la columna L (índice 11) de cada fila de datos
          const dataRows = matrix.slice(headerIndex + 1);
          const horasPorFila = jsonRows.map((_, idx) => {
            const filaMatriz = dataRows[idx];
            const celdaColL =
              Array.isArray(filaMatriz) && filaMatriz.length > COLUMNA_HORAS_PRODUCTOS_IDX
                ? filaMatriz[COLUMNA_HORAS_PRODUCTOS_IDX]
                : 0;
            return convertirNumeroHoras(celdaColL);
          });

          resolve({ rows: jsonRows, horasPorFila });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const leerExcel = (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
          }) as any[][];

          const headerIndex = detectarFilaCabecera(matrix);

          const rows = XLSX.utils.sheet_to_json(sheet, {
            range: headerIndex,
            defval: '',
          }) as Record<string, any>[];

          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const buscarColumna = (
    row: Record<string, any>,
    posiblesNombres: string[],
    excluir: string[] = []
  ): any => {
    const keys = Object.keys(row);

    for (const nombre of posiblesNombres) {
      const target = nombre.toUpperCase();
      const exacta = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excluir.some((ex) => kUp.includes(ex))) return false;
        return kUp === target;
      });
      if (exacta !== undefined && row[exacta] !== undefined && String(row[exacta]).trim() !== '') {
        return row[exacta];
      }
    }

    for (const nombre of posiblesNombres) {
      const target = nombre.toUpperCase();
      const parcial = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excluir.some((ex) => kUp.includes(ex))) return false;
        return kUp.includes(target);
      });
      if (parcial !== undefined && row[parcial] !== undefined && String(row[parcial]).trim() !== '') {
        return row[parcial];
      }
    }

    return '';
  };

  const tieneValorValido = (valor: any): boolean => {
    const limpio = String(valor ?? '').trim().toUpperCase();
    if (!limpio) return false;
    if (
      limpio === '0' ||
      limpio === '-' ||
      limpio === 'N/A' ||
      limpio === 'SIN CONTRATO' ||
      limpio === 'NULL' ||
      limpio === 'UNDEFINED'
    ) {
      return false;
    }
    return true;
  };

  const handleProcesar = async () => {
    if (!productosFile || !lineasContratoFile) {
      setIsError(true);
      setStatusMessage('Selecciona Productos de Servicio y Lista Líneas de Contrato.');
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      const [{ rows: prodRows, horasPorFila }, lineasRows] = await Promise.all([
        leerProductosConColumnaL(productosFile),
        leerExcel(lineasContratoFile),
      ]);

      const mapaContratos = new Map<string, { contrato: string; sucursal: string }>();

      lineasRows.forEach((linea) => {
        const idProd = String(
          buscarColumna(
            linea,
            ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
            ['GRUPO', 'TIPO']
          )
        ).trim();
        const contrato = String(
          buscarColumna(
            linea,
            ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
            ['GRUPO', 'TIPO']
          )
        ).trim();
        const sucursal = String(
          buscarColumna(linea, ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro'], ['GRUPO'])
        ).trim();

        if (idProd && tieneValorValido(contrato)) {
          const clave = idProd.toUpperCase();
          if (!mapaContratos.has(clave)) {
            mapaContratos.set(clave, { contrato, sucursal });
          }
        }
      });

      const resultado: EquipoContratoSync[] = [];
      const yaIncluidos = new Set<string>();

      prodRows.forEach((prod, idx) => {
        const idProd = String(
          buscarColumna(
            prod,
            ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
            ['GRUPO', 'TIPO']
          )
        ).trim();
        if (!idProd) return;

        const clave = idProd.toUpperCase();
        const contratoLinea = mapaContratos.get(clave);
        const contratoProd = String(
          buscarColumna(
            prod,
            ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
            ['GRUPO', 'TIPO']
          )
        ).trim();

        const tieneEnLinea = Boolean(contratoLinea && tieneValorValido(contratoLinea.contrato));
        const tieneEnProd = tieneValorValido(contratoProd);
        const contratoFinal = tieneEnLinea
          ? contratoLinea!.contrato
          : tieneEnProd
          ? contratoProd
          : '';

        if (!tieneValorValido(contratoFinal)) return;
        if (yaIncluidos.has(clave)) return;
        yaIncluidos.add(clave);

        const origenContrato: EquipoContratoSync['Origen Contrato'] =
          tieneEnLinea && tieneEnProd
            ? 'Ambos'
            : tieneEnLinea
            ? 'Línea de Contrato'
            : 'Producto de Servicio';

        resultado.push({
          'Nº prod. servicio': idProd,
          'Nº Contrato': contratoFinal,
          'Origen Contrato': origenContrato,
          'Nº Serie':
            String(
              buscarColumna(prod, ['Nº serie', 'Nº Serie', 'No. serie', 'Serie'], ['PRODUCTO'])
            ).trim() || 'N/A',
          'Modelo':
            String(buscarColumna(prod, ['Modelo', 'Cód. modelo', 'Descripción modelo'])).trim() ||
            'N/A',
          'Sucursal':
            String(
              buscarColumna(prod, ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro'])
            ).trim() ||
            contratoLinea?.sucursal ||
            'N/A',
          'Cliente Propietario':
            String(
              buscarColumna(prod, [
                'Nombre cliente propietario',
                'Cliente propietario',
                'Nº cliente propietario',
                'Nombre',
              ])
            ).trim() || 'N/A',
          'Cliente Ubicación':
            String(
              buscarColumna(prod, [
                'Nombre cliente ubicación',
                'Nombre cliente ubicacion',
                'Cliente ubicación',
                'Nº cliente ubicación',
              ])
            ).trim() || 'N/A',
          'Nº de horas': horasPorFila[idx] ?? 0,
          'Tipo Registro': 'Contratado',
          idUnico: `${idx}_${clave}`,
        });
      });

      const serialized = JSON.stringify(resultado);
      localStorage.setItem(STORAGE_CONTRATOS_KEY, serialized);
      localStorage.setItem(STORAGE_PLANIFICACION_KEY, serialized);
      window.dispatchEvent(new Event(SYNC_UPDATED_EVENT));

      setEquipos(resultado);
      setIsError(false);
      setStatusMessage(
        `Sincronizados ${resultado.length} equipos con contrato (horas leídas desde la columna L de Productos de Servicio). Ya están listos en Planificación / Revisiones.`
      );
    } catch (error: any) {
      setIsError(true);
      setStatusMessage(error?.message || 'Error al sincronizar los ficheros.');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarExcel = () => {
    if (equipos.length === 0) return;
    const rowsExport = equipos.map(({ idUnico, ...rest }) => rest);
    const hoja = XLSX.utils.json_to_sheet(rowsExport);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Equipos_Con_Contrato');
    XLSX.writeFile(libro, `Equipos_Con_Contrato_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_CONTRATOS_KEY);
    localStorage.removeItem(STORAGE_PLANIFICACION_KEY);
    window.dispatchEvent(new Event(SYNC_UPDATED_EVENT));
    setEquipos([]);
    setProductosFile(null);
    setLineasContratoFile(null);
    setStatusMessage(null);
    setIsError(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sincronización</h2>
          <p className="text-sm text-muted-foreground">
            Cruza <strong>Productos de Servicio</strong> (horas en columna L) contra <strong>Lista Líneas de Contrato</strong> y envía los equipos con contrato a <strong>Planificación / Revisiones</strong>.
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900">
          {equipos.length > 0
            ? `${equipos.length} equipos con contrato sincronizados`
            : 'Sin sincronizar'}
        </span>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => dropRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/60 bg-muted/20'
          }`}
        >
          <input
            ref={dropRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files && asignarArchivos(e.target.files)}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-7 h-7 text-primary" />
            <p className="text-sm font-medium">
              Arrastra aquí Productos de Servicio y Lista Líneas de Contrato
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => prodRef.current?.click()}
            className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer ${
              productosFile ? 'bg-emerald-50/50 border-emerald-300' : 'bg-muted/20 border-dashed'
            }`}
          >
            <input
              ref={prodRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setProductosFile(e.target.files[0]);
                  setStatusMessage(null);
                }
              }}
            />
            <div className="flex items-center gap-3 truncate">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold uppercase">Productos de Servicio</p>
                <p className="text-xs text-muted-foreground truncate">
                  {productosFile ? productosFile.name : 'Sin seleccionar'}
                </p>
              </div>
            </div>
            {productosFile && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
          </div>

          <div
            onClick={() => lineasRef.current?.click()}
            className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer ${
              lineasContratoFile ? 'bg-emerald-50/50 border-emerald-300' : 'bg-muted/20 border-dashed'
            }`}
          >
            <input
              ref={lineasRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setLineasContratoFile(e.target.files[0]);
                  setStatusMessage(null);
                }
              }}
            />
            <div className="flex items-center gap-3 truncate">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold uppercase">Lista Líneas de Contrato</p>
                <p className="text-xs text-muted-foreground truncate">
                  {lineasContratoFile ? lineasContratoFile.name : 'Sin seleccionar'}
                </p>
              </div>
            </div>
            {lineasContratoFile && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <button
            type="button"
            disabled={loading || !productosFile || !lineasContratoFile}
            onClick={handleProcesar}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          {equipos.length > 0 && (
            <button
              type="button"
              onClick={handleDescargarExcel}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Descargar Excel ({equipos.length})
            </button>
          )}

          {(equipos.length > 0 || productosFile || lineasContratoFile) && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 text-sm font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Vaciar
            </button>
          )}
        </div>

        {statusMessage && (
          <div
            className={`p-4 rounded-lg border text-sm font-medium flex items-center gap-2.5 ${
              isError
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncView;
