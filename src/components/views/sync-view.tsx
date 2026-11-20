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
  'Nº de horas': number;
  'Cliente Propietario': string;
  'Nombre Cliente Ubicación': string;
  'Nº Serie': string;
  'Modelo': string;
  'Sucursal': string;
  'Es propia'?: boolean;
  'Nº REVISIONES ANUALES'?: number | null;
  horasPorDia?: number | null;
  'Fecha Última Revisión'?: string;
  'Fecha Próxima Revisión'?: string;
  idUnico: string;
}

export const STORAGE_CONTRATOS_KEY = 'mantenim_equipos_contrato';
export const STORAGE_PLANIFICACION_KEY = 'mantenim_planificacion_data';
export const STORAGE_RITMOS_KEY = 'mantenim_ritmos_horas_propios';
export const STORAGE_TAREA_KEY = 'mantenim_tarea_servicio';
export const STORAGE_PEDIDOS_KEY = 'mantenim_pedidos_registrados';
export const STORAGE_REV_ANUALES_KEY = 'mantenim_revisiones_anuales';
export const SYNC_UPDATED_EVENT = 'mantenim-sync-updated';

// H = 7, I = 8, L = 11 (índice base 0)
const COL_IDX_CLIENTE_PROPIETARIO = 7;
const COL_IDX_NOMBRE_CLIENTE_UBICACION = 8;
const COL_IDX_HORAS = 11;

function normalizarId(val: any): string {
  if (val === undefined || val === null) return '';
  let s = String(val).trim();
  if (!s) return '';
  if (/^\d+\.0$/.test(s)) {
    s = s.replace(/\.0$/, '');
  }
  const sinCeros = s.replace(/^0+/, '');
  return sinCeros || (s === '0' ? '0' : '');
}

function parseBooleano(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val ?? '').trim().toLowerCase();
  return (
    s === 'true' ||
    s === 'sí' ||
    s === 'si' ||
    s === '1' ||
    s === 'yes' ||
    s === 'verdadero'
  );
}

function parseFechaValor(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }
  const s = String(val).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(dt.getTime())) return dt;
  }
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) {
    return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  }
  return null;
}

function formatDDMMYYYY(dt: Date): string {
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMiles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function SyncView() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isError, setIsError] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [equipos, setEquipos] = useState<EquipoContratoSync[]>([]);

  const [productosFile, setProductosFile] = useState<File | null>(null);
  const [lineasContratoFile, setLineasContratoFile] = useState<File | null>(null);
  const [revisionesAnualesFile, setRevisionesAnualesFile] = useState<File | null>(null);
  const [pedidosRegistradosFile, setPedidosRegistradosFile] = useState<File | null>(null);
  const [tareaServicioFile, setTareaServicioFile] = useState<File | null>(null);
  const [extraFile1, setExtraFile1] = useState<File | null>(null);
  const [extraFile2, setExtraFile2] = useState<File | null>(null);

  const dropRef = useRef<HTMLInputElement>(null);
  const prodRef = useRef<HTMLInputElement>(null);
  const lineasRef = useRef<HTMLInputElement>(null);
  const revAnualesRef = useRef<HTMLInputElement>(null);
  const pedidosRegRef = useRef<HTMLInputElement>(null);
  const tareaServRef = useRef<HTMLInputElement>(null);
  const extra1Ref = useRef<HTMLInputElement>(null);
  const extra2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
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
    let nextRev = revisionesAnualesFile;
    let nextPed = pedidosRegistradosFile;
    let nextTarea = tareaServicioFile;
    let nextExtra1 = extraFile1;
    let nextExtra2 = extraFile2;
    const sinClasificar: File[] = [];

    Array.from(fileList).forEach((file) => {
      const name = file.name.toLowerCase();
      if (
        name.includes('revisiones-anuales') ||
        name.includes('revisiones_anuales') ||
        name.includes('anuales')
      ) {
        nextRev = file;
      } else if (name.includes('pedidos') && name.includes('registrad')) {
        nextPed = file;
      } else if (name.includes('tarea') && name.includes('servicio')) {
        nextTarea = file;
      } else if (
        name.includes('linea') ||
        name.includes('línea') ||
        name.includes('contrato')
      ) {
        nextLineas = file;
      } else if (
        name.includes('producto') ||
        name.includes('prod') ||
        name.includes('servicio')
      ) {
        nextProd = file;
      } else {
        sinClasificar.push(file);
      }
    });

    sinClasificar.forEach((file) => {
      if (!nextProd) nextProd = file;
      else if (!nextLineas) nextLineas = file;
      else if (!nextRev) nextRev = file;
      else if (!nextPed) nextPed = file;
      else if (!nextTarea) nextTarea = file;
      else if (!nextExtra1) nextExtra1 = file;
      else if (!nextExtra2) nextExtra2 = file;
    });

    setProductosFile(nextProd);
    setLineasContratoFile(nextLineas);
    setRevisionesAnualesFile(nextRev);
    setPedidosRegistradosFile(nextPed);
    setTareaServicioFile(nextTarea);
    setExtraFile1(nextExtra1);
    setExtraFile2(nextExtra2);
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
        filaStr.includes('no.') ||
        filaStr.includes('descripci') ||
        filaStr.includes('pedido')
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

  interface ProductoExtraido {
    rowObj: Record<string, any>;
    horas: number;
    clientePropietario: string;
    nombreClienteUbicacion: string;
    esPropia: boolean;
  }

  const leerProductosConColumnasFijas = (file: File): Promise<ProductoExtraido[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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

          const dataRows = matrix.slice(headerIndex + 1);

          const combinados: ProductoExtraido[] = jsonRows.map((rowObj, idx) => {
            const filaMatriz = Array.isArray(dataRows[idx]) ? dataRows[idx] : [];

            const rawHoras =
              filaMatriz.length > COL_IDX_HORAS ? filaMatriz[COL_IDX_HORAS] : 0;
            const rawProp =
              filaMatriz.length > COL_IDX_CLIENTE_PROPIETARIO
                ? filaMatriz[COL_IDX_CLIENTE_PROPIETARIO]
                : '';
            const rawUbic =
              filaMatriz.length > COL_IDX_NOMBRE_CLIENTE_UBICACION
                ? filaMatriz[COL_IDX_NOMBRE_CLIENTE_UBICACION]
                : '';

            const esPropiaRaw =
              rowObj['Es propia'] ??
              rowObj['Es Propia'] ??
              rowObj['esPropia'] ??
              false;

            return {
              rowObj,
              horas: convertirNumeroHoras(rawHoras),
              clientePropietario: String(rawProp ?? '').trim() || 'N/A',
              nombreClienteUbicacion: String(rawUbic ?? '').trim() || 'N/A',
              esPropia: parseBooleano(esPropiaRaw),
            };
          });

          resolve(combinados);
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
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const todasLasFilas: Record<string, any>[] = [];

          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              defval: '',
            }) as any[][];

            if (!matrix || matrix.length === 0) return;

            const headerIndex = detectarFilaCabecera(matrix);
            const rows = XLSX.utils.sheet_to_json(sheet, {
              range: headerIndex,
              defval: '',
            }) as Record<string, any>[];

            todasLasFilas.push(...rows);
          });

          resolve(todasLasFilas);
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
      limpio === 'SIN
