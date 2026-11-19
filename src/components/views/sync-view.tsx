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
  idUnico: string;
}

export const STORAGE_CONTRATOS_KEY = 'mantenim_equipos_contrato';
export const STORAGE_PLANIFICACION_KEY = 'mantenim_planificacion_data';
export const SYNC_UPDATED_EVENT = 'mantenim-sync-updated';

// Índices en base 0 de la hoja Excel "Productos de Servicio":
// H = 7 (Cliente Propietario), I = 8 (Nombre Cliente Ubicación), L = 11 (Nº de horas)
const COL_IDX_CLIENTE_PROPIETARIO = 7;
const COL_IDX_NOMBRE_CLIENTE_UBICACION = 8;
const COL_IDX_HORAS = 11;

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

  interface ProductoExtraido {
    rowObj: Record<string, any>;
    horas: number;
    clientePropietario: string;
    nombreClienteUbicacion: string;
  }

  const leerProductosConColumnasFijas = (file: File): Promise<ProductoExtraido[]> => {
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

            return {
              rowObj,
              horas: convertirNumeroHoras(rawHoras),
              clientePropietario: String(rawProp ?? '').trim() || 'N/A',
              nombreClienteUbicacion: String(rawUbic ?? '').trim() || 'N/A',
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
        if (
