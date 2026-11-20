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
    let nextRev = revisionesAnualesFile
