'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { calcularProximaRevisionContrato, calcularProximaRevisionPropia } from '@/lib/maintenance-rules';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [hasStoredData, setHasStoredData] = useState(false);

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

  // Comprobar si ya existen datos guardados en el navegador al cargar
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
  }, []);

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
          if (upper.includes('PRODUCTO') || upper.includes('PROD. SERVICIO') || upper.includes('Nº PROD') || upper.includes('CÓDIGO')) {
            if (val) prodServ = String(val).trim();
          } else if (upper.includes('CONTRATO')) {
            if (val) numContrato = String(val).trim();
          } else if (upper.includes('FECHA') || upper.includes('ULTIMA') || upper.includes('ÚLTIMA') || upper.includes('SERVICIO')) {
            fechaUltima = parseExcelDate(val);
          } else if (upper.includes('REVISIONES') || upper.includes('CANTIDAD') || upper.includes('Nº REVISIONES')) {
            const parsedNum = Number(val);
            if (!isNaN(parsedNum) && parsedNum > 0) revAnuales = parsedNum;
          }
        }

        if (prodServ) {
          revisionesMap.set(prodServ, { contrato: numContrato, ultimaFecha: fechaUltima, numRevisionesAnuales: rev
