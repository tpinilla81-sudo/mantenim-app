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

  const leerExcel = (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

          let headerIndex = 0;
          for (let i = 0; i < Math.min(matrix.length, 20); i++) {
            const filaStr = JSON.stringify(matrix[i] || []).toLowerCase();
            if (
              filaStr.includes('prod') ||
              filaStr.includes('contrato') ||
              filaStr.includes('serie') ||
              filaStr.includes('modelo') ||
              filaStr.includes('horas') ||
              filaStr.includes('nº') ||
              filaStr.includes('no.')
            ) {
              headerIndex = i;
              break;
            }
          }

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
  ): string => {
    const keys = Object.keys(row);

    for (const nombre of posiblesNombres) {
      const target = nombre.toUpperCase();
      const exacta = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excluir.some((ex) => kUp.includes(ex))) return false;
        return kUp === target;
      });
      if (exacta !== undefined && String(row[exacta] ?? '').trim() !== '') {
        return String(row[exacta]).trim();
      }
    }

    for (const nombre of posiblesNombres) {
      const target = nombre.toUpperCase();
      const parcial = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excluir.some((ex) => kUp.includes(ex))) return false;
        return kUp.includes(target);
      });
      if (parcial !== undefined && String(row[parcial] ?? '').trim() !== '') {
        return String(row[parcial]).trim();
      }
    }

    return '';
  };

  const parseHoras = (row: Record<string, any>): number => {
    const rawVal = buscarColumna(
      row,
      [
        'Nº de horas',
        'Nº horas',
        'N.º de horas',
        'N.º horas',
        'Horas',
        'Horas actuales',
        'Horas servicio',
        'Contador',
        'Cuentahoras',
        'Lectura horas',
      ],
      ['CONTRATO', 'TARIFA', 'PRECIO', 'IMPORTE']
    );

    if (!rawVal) return 0;
    if (typeof rawVal === 'number') return isNaN(rawVal) ? 0 : rawVal;

    // Soporta formatos como "1.234,56" o "1234.56" o "1234"
    let cleaned = String(rawVal).trim().replace(/\s+/g, '');
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

  const tieneValorValido = (valor: string): boolean => {
    const limpio = valor.trim().toUpperCase();
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
      const [prodRows, lineasRows] = await Promise.all([
        leerExcel(productosFile),
        leerExcel(lineasContratoFile),
      ]);

      const mapaContratos = new Map<string, { contrato: string; sucursal: string }>();

      lineasRows.forEach((linea) => {
        const idProd = buscarColumna(
          linea,
          ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
          ['GRUPO', 'TIPO']
        );
        const contrato = buscarColumna(
          linea,
          ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
          ['GRUPO', 'TIPO']
        );
        const sucursal = buscarColumna(
          linea,
          ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro'],
          ['GRUPO']
        );

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
        const idProd = buscarColumna(
          prod,
          ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
          ['GRUPO', 'TIPO']
        );
        if (!idProd) return;

        const clave = idProd.toUpperCase();
        const contratoLinea = mapaContratos.get(clave);
        const contratoProd = buscarColumna(
          prod,
          ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
          ['GRUPO', 'TIPO']
        );

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
            buscarColumna(prod, ['Nº serie', 'Nº Serie', 'No. serie', 'Serie'], ['PRODUCTO']) || 'N/A',
          'Modelo': buscarColumna(prod, ['Modelo', 'Cód. modelo', 'Descripción modelo']) || 'N/A',
          'Sucursal':
            buscarColumna(prod, ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro']) ||
            contratoLinea?.sucursal ||
            'N/A',
          'Cliente Propietario':
            buscarColumna(prod, [
              'Nombre cliente propietario',
              'Cliente propietario',
              'Nº cliente propietario',
              'Nombre',
            ]) || 'N/A',
