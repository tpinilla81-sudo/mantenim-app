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

export interface ProductoContratoBase {
  nProductoServicio: string;
  nContrato: string;
  nSerie: string;
  modelo: string;
  sucursal: string;
  clientePropietario: string;
  clienteUbicacion: string;
}

const STORAGE_KEY = 'mantenim_base_contratos';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isError, setIsError] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ProductoContratoBase[]>([]);

  const [productosFile, setProductosFile] = useState<File | null>(null);
  const [lineasContratoFile, setLineasContratoFile] = useState<File | null>(null);

  const dropRef = useRef<HTMLInputElement>(null);
  const prodRef = useRef<HTMLInputElement>(null);
  const lineasRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch (error) {
      console.error('Error leyendo storage:', error);
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
      if (exacta && String(row[exacta] ?? '').trim() !== '') {
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
      if (parcial && String(row[parcial] ?? '').trim() !== '') {
        return String(row[parcial]).trim();
      }
    }

    return '';
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
      setStatusMessage('Selecciona ambos Excels: Productos de Servicio y Lista Líneas de Contrato.');
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      const [productosRows, lineasRows] = await Promise.all([
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

      const resultado: ProductoContratoBase[] = [];
      const yaIncluidos = new Set<string>();

      productosRows.forEach((prod) => {
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

        const contratoFinal = contratoLinea?.contrato || (tieneValorValido(contratoProd) ? contratoProd : '');
        if (!tieneValorValido(contratoFinal)) return;
        if (yaIncluidos.has(clave)) return;
        yaIncluidos.add(clave);

        resultado.push({
          nProductoServicio: idProd,
          nContrato: contratoFinal,
          nSerie: buscarColumna(prod, ['Nº serie', 'Nº Serie', 'No. serie', 'Serie'], ['PRODUCTO']) || '-',
          modelo: buscarColumna(prod, ['Modelo', 'Cód. modelo', 'Descripción modelo']) || '-',
          sucursal:
            buscarColumna(prod, ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro']) ||
            contratoLinea?.sucursal ||
            '-',
          clientePropietario:
            buscarColumna(prod, [
              'Nombre cliente propietario',
              'Cliente propietario',
              'Nº cliente propietario',
              'Nombre',
            ]) || '-',
          clienteUbicacion:
            buscarColumna(prod, [
              'Nombre cliente ubicación',
              'Nombre cliente ubicacion',
              'Cliente ubicación',
              'Nº cliente ubicación',
            ]) || '-',
        });
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(resultado));
      setItems(resultado);
      setIsError(false);
      setStatusMessage(
        `Listo: ${resultado.length} productos de servicio con contrato obtenidos de ${productosRows.length} productos.`
      );
    } catch (error: any) {
      setIsError(true);
      setStatusMessage(error?.message || 'Error al leer los ficheros.');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarExcel = () => {
    if (items.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(items);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Equipos_Con_Contrato');
    XLSX.writeFile(libro, `Equipos_Con_Contrato_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
    setProductosFile(null);
    setLineasContratoFile(null);
    setStatusMessage(null);
    setIsError(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sincronización Base</h2>
          <p className="text-sm text-muted-foreground">
            Productos de Servicio frente a Lista Líneas de Contrato.
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted text-foreground">
          {items.length} equipos con contrato
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
            {loading ? 'Procesando...' : 'Procesar'}
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleDescargarExcel}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Descargar Excel
            </button>
          )}

          {(items.length > 0 || productosFile || lineasContratoFile) && (
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
            {isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 text-xs font-semibold text-muted-foreground">
            Mostrando hasta 100 filas de {items.length} equipos con contrato
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-xs uppercase text-muted-foreground">
                  <th className="p-3">Nº Prod. Servicio</th>
                  <th className="p-3">Nº Contrato</th>
                  <th className="p-3">Nº Serie</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3">Sucursal</th>
                  <th className="p-3">Cliente Propietario</th>
                  <th className="p-3">Cliente Ubicación</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.slice(0, 100).map((row, index) => (
                  <tr key={`${row.nProductoServicio}_${index}`} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{row.nProductoServicio}</td>
                    <td className="p-3 font-mono text-xs font-semibold">{row.nContrato}</td>
                    <td className="p-3 text-muted-foreground">{row.nSerie}</td>
                    <td className="p-3">{row.modelo}</td>
                    <td className="p-3">{row.sucursal}</td>
                    <td className="p-3">{row.clientePropietario}</td>
                    <td className="p-3">{row.clienteUbicacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncView;
