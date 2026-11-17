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

  // Lector inteligente que salta filas vacías o cabeceras institucionales de Business Central
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
          console.log(`📄 Fichero [${file.name}]:${data.length} filas leídas.`);
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

      if (prodData.length === 0) {
        throw new Error("El fichero de Productos de Servicio está vacío.");
      }

      // 1. Mapa de Revisiones por ID de Producto de Servicio
      const revisionesMap = new Map();
      revData.forEach((rev) => {
        const prodServ = String(rev['Nº PRODUCTO SERVICIO'] || rev['Nº prod. servicio'] || '').trim();
        if (prodServ) revisionesMap.set(prodServ, rev);
      });

      // 2. Mapa de Líneas de Contrato por ID de Producto de Servicio
      const lineasMap = new Map();
      lineasContratoData.forEach((linea) => {
        const prodServ = String(linea['Nº prod. servicio'] || linea['Nº PRODUCTO SERVICIO'] || '').trim();
        if (prodServ) lineasMap.set(prodServ, linea);
      });

      // 3. MAPEO OPTIMIZADO: Guardamos solo los campos esenciales para evitar superar la cuota de localStorage
      const resultadoFinal = prodData.map((prod, index) => {
        const prodId = String(prod['Nº'] || '').trim();
        const revMatch = revisionesMap.get(prodId) || {};
        const lineaMatch = lineasMap.get(prodId) || {};

        return {
          'Nº prod. servicio': prodId,
          'Nº Serie': prod['Nº Serie'] || '',
          'Modelo': prod['Modelo'] || '',
          'Nº Contrato': lineaMatch['Nº Contrato'] || revMatch['Nº CONTRATO'] || '',
          'Nombre Cliente Propietario': prod['Nombre Cliente Propietario'] || prod['Nombre'] || '',
          'Nombre Cliente Ubicación': prod['Nombre Cliente Ubicación'] || '',
          'Nº de horas': prod['Nº de horas'] || 0,
          fuente: 'Parque Completo',
          idUnico: `${index}_${prodId}`
        };
      });

      // Guardado optimizado en localStorage
      const jsonString = JSON.stringify(resultadoFinal);
      localStorage.setItem('mantenim_planificacion_data', jsonString);
      console.log(`✅ Guardados con éxito ${resultadoFinal.length} registros optimizados en localStorage.`);

      setIsError(false);
      setResultMessage(`¡Éxito! Se han procesado y guardado los ${resultadoFinal.length
