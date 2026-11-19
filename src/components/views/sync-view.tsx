'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Trash2,
  Search,
  X,
} from 'lucide-react';

export interface EquipoConContrato {
  'Nº prod. servicio': string;
  'Nº Contrato': string;
  'Origen Contrato': 'Línea de Contrato' | 'Producto de Servicio' | 'Ambos';
  'Nº Serie': string;
  'Modelo': string;
  'Sucursal': string;
  'Cliente Propietario': string;
  'Cliente Ubicación': string;
  idUnico: string;
}

interface ResumenSincronizacion {
  totalProductos: number;
  totalLineasContrato: number;
  productosUnicosConContrato: number;
  productosSinContrato: number;
}

const STORAGE_KEY = 'mantenim_equipos_contrato';
const RESUMEN_KEY = 'mantenim_equipos_contrato_resumen';

export function SyncView() {
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [equipos, setEquipos] = useState<EquipoConContrato[]>([]);
  const [resumen, setResumen] = useState<ResumenSincronizacion | null>(null);

  const [filtroGlobal, setFiltroGlobal] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('');

  const [productosFile, setProductosFile] = useState<File | null>(null);
  const [lineasContratoFile, setLineasContratoFile] = useState<File | null>(null);

  const dropInputRef = useRef<HTMLInputElement>(null);
  const prodInputRef = useRef<HTMLInputElement>(null);
  const lineasInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEquipos(parsed);
        }
      }

      const savedResumen = localStorage.getItem(RESUMEN_KEY);
      if (savedResumen) {
        setResumen(JSON.parse(savedResumen));
      }
    } catch (err) {
      console.error('Error al cargar datos guardados:', err);
    }
  }, []);

  const assignFiles = (fileList: FileList | File[]) => {
    let nextProd = productosFile;
    let nextLineas = lineasContratoFile;
    const restantes: File[] = [];

    Array.from(fileList).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (lower.includes('linea') || lower.includes('línea') || lower.includes('contrato')) {
        nextLineas = file;
      } else if (lower.includes('producto') || lower.includes('prod') || lower.includes('servicio')) {
        nextProd = file;
      } else {
        restantes.push(file);
      }
    });

    restantes.forEach((file) => {
      if (!nextProd) nextProd = file;
      else if (!nextLineas) nextLineas = file;
    });

    setProductosFile(nextProd);
    setLineasContratoFile(nextLineas);
    setMessage(null);
    setIsError(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      assignFiles(e.dataTransfer.files);
    }
  };

  const readExcelRows = (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawMatrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

          let headerRow = 0;
          for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
            const rowText = JSON.stringify(rawMatrix[i] || []).toLowerCase();
            if (
              rowText.includes('prod') ||
              rowText.includes('contrato') ||
              rowText.includes('serie') ||
              rowText.includes('modelo') ||
              rowText.includes('nº') ||
              rowText.includes('no.')
            ) {
              headerRow = i;
              break;
            }
          }

          const jsonRows = XLSX.utils.sheet_to_json(firstSheet, {
            range: headerRow,
            defval: '',
          }) as Record<string, any>[];

          resolve(jsonRows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const getField = (
    row: Record<string, any>,
    candidates: string[],
    excludeWords: string[] = []
  ): string => {
    const keys = Object.keys(row);

    for (const cand of candidates) {
      const cUp = cand.toUpperCase();
      const match = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excludeWords.some((ex) => kUp.includes(ex))) return false;
        return kUp === cUp;
      });
      if (match !== undefined && String(row[match] ?? '').trim() !== '') {
        return String(row[match]).trim();
      }
    }

    for (const cand of candidates) {
      const cUp = cand.toUpperCase();
      const match = keys.find((k) => {
        const kUp = k.trim().toUpperCase();
        if (excludeWords.some((ex) => kUp.includes(ex))) return false;
        return kUp.includes(cUp);
      });
      if (match !== undefined && String(row[match] ?? '').trim() !== '') {
        return String(row[match]).trim();
      }
    }

    return '';
  };

  const esContratoValido = (valor: string): boolean => {
    const clean = valor.trim().toUpperCase();
    if (!clean) return false;
    if (
      clean === '0' ||
      clean === '-' ||
      clean === 'N/A' ||
      clean === 'SIN CONTRATO' ||
      clean === 'NULL' ||
      clean === 'UNDEFINED'
    ) {
      return false;
    }
    return true;
  };

  const handleSincronizar = async () => {
    if (!productosFile || !lineasContratoFile) {
      setIsError(true);
      setMessage('Debes cargar tanto "Productos de Servicio" como "Lista Líneas de Contrato".');
      return;
    }

    setLoading(true);
    setMessage(null);
    setIsError(false);

    try {
      const [prodRows, lineasRows] = await Promise.all([
        readExcelRows(productosFile),
        readExcelRows(lineasContratoFile),
      ]);

      if (prodRows.length === 0) {
        throw new Error('El Excel de Productos de Servicio no contiene filas.');
      }
      if (lineasRows.length === 0) {
        throw new Error('El Excel de Lista Líneas de Contrato no contiene filas.');
      }

      // Mapa de líneas de contrato por Nº de producto de servicio
      const contratoPorProducto = new Map<string, { contrato: string; sucursal: string }>();

      lineasRows.forEach((linea) => {
        const prodId = getField(
          linea,
          ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
          ['GRUPO', 'TIPO']
        );
        const numContrato = getField(
          linea,
          ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
          ['GRUPO', 'TIPO']
        );
        const sucursal = getField(
          linea,
          ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro'],
          ['GRUPO']
        );

        if (prodId && esContratoValido(numContrato)) {
          const key = prodId.toUpperCase();
          if (!contratoPorProducto.has(key)) {
            contratoPorProducto.set(key, { contrato: numContrato, sucursal });
          }
        }
      });

      const sincronizados: EquipoConContrato[] = [];
      const vistos = new Set<string>();
      let sinContratoCount = 0;

      prodRows.forEach((prod, idx) => {
        const prodId = getField(
          prod,
          ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
          ['GRUPO', 'TIPO']
        );
        if (!prodId) return;

        const key = prodId.toUpperCase();
        const contratoEnProd = getField(
          prod,
          ['Nº contrato', 'N. contrato', 'Contrato', 'Nº de contrato'],
          ['GRUPO', 'TIPO']
        );
        const lineaMatch = contratoPorProducto.get(key);

        const tieneEnProd = esContratoValido(contratoEnProd);
        const tieneEnLinea = Boolean(lineaMatch && esContratoValido(lineaMatch.contrato));

        const contratoFinal = tieneEnLinea
          ? lineaMatch!.contrato
          : tieneEnProd
          ? contratoEnProd
          : '';

        if (!esContratoValido(contratoFinal)) {
          sinContratoCount++;
          return;
        }

        if (vistos.has(key)) return;
        vistos.add(key);

        const origenContrato: EquipoConContrato['Origen Contrato'] =
          tieneEnLinea && tieneEnProd
            ? 'Ambos'
            : tieneEnLinea
            ? 'Línea de Contrato'
            : 'Producto de Servicio';

        const serie = getField(prod, ['Nº serie', 'Nº Serie', 'No. serie', 'Serie'], ['PRODUCTO']);
        const modelo = getField(prod, ['Modelo', 'Cód. modelo', 'Descripción modelo']);
        const sucursal =
          getField(prod, ['Sucursal', 'Cód. sucursal', 'Delegación', 'Centro']) ||
          lineaMatch?.sucursal ||
          '';
        const propietario = getField(prod, [
          'Nombre cliente propietario',
          'Cliente propietario',
          'Nº cliente propietario',
          'Nombre',
        ]);
        const ubicacion = getField(prod, [
          'Nombre cliente ubicación',
          'Nombre cliente ubicacion',
          'Cliente ubicación',
          'Nº cliente ubicación',
        ]);

        sincronizados.push({
          'Nº prod. servicio': prodId,
          'Nº Contrato': contratoFinal,
          'Origen Contrato': origenContrato,
          'Nº Serie': serie || 'N/A',
          'Modelo': modelo || 'N/A',
          'Sucursal': sucursal || 'N/A',
          'Cliente Propietario': propietario || 'N/A',
          'Cliente Ubicación': ubicacion || 'N/A',
          idUnico: `${idx}_${key}`,
        });
      });

      const nuevoResumen: ResumenSincronizacion = {
        totalProductos: prodRows.length,
        totalLineasContrato: lineasRows.length,
        productosUnicosConContrato: sincronizados.length,
        productosSinContrato: sinContratoCount,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(sincronizados));
      localStorage.setItem(RESUMEN_KEY, JSON.stringify(nuevoResumen));
      setEquipos(sincronizados);
      setResumen(nuevoResumen);
      setIsError(false);
      setMessage(
        `Sincronización afianzada: ${sincronizados.length} equipos con contrato listos (de ${prodRows.length} filas en Productos de Servicio y ${lineasRows.length} filas en Lista Líneas de Contrato).`
      );
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.message || 'Error al sincronizar los ficheros.');
    } finally {
      setLoading(false);
    }
  };

  const equiposFiltrados = useMemo(() => {
    return equipos.filter((eq) => {
      if (filtroProducto.trim()) {
        if (!eq['Nº prod. servicio'].toLowerCase().includes(filtroProducto.trim().toLowerCase())) {
          return false;
        }
      }
      if (filtroContrato.trim()) {
        if (!eq['Nº Contrato'].toLowerCase().includes(filtroContrato.trim().toLowerCase())) {
          return false;
        }
      }
      if (filtroSucursal.trim()) {
        if (!eq['Sucursal'].toLowerCase().includes(filtroSucursal.trim().toLowerCase())) {
          return false;
        }
      }
      if (filtroGlobal.trim()) {
        const q = filtroGlobal.trim().toLowerCase();
        const coincide = Object.entries(eq)
          .filter(([k]) => k !== 'idUnico')
          .some(([, val]) => String(val).toLowerCase().includes(q));
        if (!coincide) return false;
      }
      return true;
    });
  }, [equipos, filtroProducto, filtroContrato, filtroSucursal, filtroGlobal]);

  const handleExportExcel = () => {
    if (equiposFiltrados.length === 0) return;
    const rowsToExport = equiposFiltrados.map(({ idUnico, ...rest }) => rest);
    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos_Con_Contrato');
    XLSX.writeFile(wb, `Productos_Con_Contrato_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleLimpiarDatos = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESUMEN_KEY);
    setEquipos([]);
    setResumen(null);
    setFiltroGlobal('');
    setFiltroProducto('');
    setFiltroContrato('');
    setFiltroSucursal('');
    setMessage('Datos sincronizados eliminados.');
    setIsError(false);
  };

  const hayFiltros =
    filtroGlobal.trim() !== '' ||
    filtroProducto.trim() !== '' ||
    filtroContrato.trim() !== '' ||
    filtroSucursal.trim() !== '';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sincronización: Productos con Contrato</h2>
          <p className="text-sm text-muted-foreground">
            Cruza <strong>Productos de Servicio</strong> contra <strong>Lista Líneas de Contrato</strong> para obtener los equipos con contrato.
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900">
          {equipos.length > 0 ? `${equipos.length} equipos sincronizados` : 'Sin sincronizar'}
        </span>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border rounded-lg p-3.5 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">Filas en Productos de Servicio</p>
            <p className="text-xl font-bold mt-0.5">{resumen.totalProductos}</p>
          </div>
          <div className="bg-card border rounded-lg p-3.5 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">Filas en Lista Líneas de Contrato</p>
            <p className="text-xl font-bold mt-0.5">{resumen.totalLineasContrato}</p>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5 shadow-sm">
            <p className="text-xs text-emerald-800 font-semibold">Equipos Únicos con Contrato</p>
            <p className="text-xl font-bold text-emerald-950 mt-0.5">{resumen.productosUnicosConContrato}</p>
          </div>
          <div className="bg-muted/30 border rounded-lg p-3.5 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">Sin Contrato / Descartados</p>
            <p className="text-xl font-bold mt-0.5">{resumen.productosSinContrato}</p>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => dropInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/60 bg-muted/20'
          }`}
        >
          <input
            ref={dropInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files && assignFiles(e.target.files)}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-primary" />
            <p className="font-semibold text-sm">
              Arrastra aquí los dos Excels (Productos de Servicio y Lista Líneas de Contrato) o haz clic
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => prodInputRef.current?.click()}
            className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer transition-all ${
              productosFile
                ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                : 'bg-muted/20 border-dashed text-muted-foreground hover:border-primary'
            }`}
          >
            <input
              ref={prodInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setProductosFile(e.target.files[0]);
                  setMessage(null);
                }
              }}
            />
            <div className="flex items-center gap-3 truncate">
              <FileSpreadsheet className="w-5 h-5 shrink-0 text-emerald-700" />
              <div className="truncate">
                <p className="text-xs font-bold uppercase">1. Productos de Servicio</p>
                <p className="text-xs truncate">
                  {productosFile ? productosFile.name : 'Seleccionar fichero...'}
                </p>
              </div>
            </div>
            {productosFile && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
          </div>

          <div
            onClick={() => lineasInputRef.current?.click()}
            className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer transition-all ${
              lineasContratoFile
                ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                : 'bg-muted/20 border-dashed text-muted-foreground hover:border-primary'
            }`}
          >
            <input
              ref={lineasInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setLineasContratoFile(e.target.files[0]);
                  setMessage(null);
                }
              }}
            />
            <div className="flex items-center gap-3 truncate">
              <FileSpreadsheet className="w-5 h-5 shrink-0 text-emerald-700" />
              <div className="truncate">
                <p className="text-xs font-bold uppercase">2. Lista Líneas de Contrato</p>
                <p className="text-xs truncate">
                  {lineasContratoFile ? lineasContratoFile.name : 'Seleccionar fichero...'}
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
            onClick={handleSincronizar}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Sincronizar Equipos con Contrato'}
          </button>

          {equipos.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={equiposFiltrados.length === 0}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Exportar Excel ({equiposFiltrados.length})
              </button>

              <button
                type="button"
                onClick={handleLimpiarDatos}
                className="px-3.5 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 text-sm font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Limpiar
              </button>
            </>
          )}
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg border text-sm font-medium flex items-center gap-2.5 ${
              isError
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span>{message}</span>
          </div>
        )}
      </div>

      {equipos.length > 0 && (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold">
              Equipos con contrato sincronizados (mostrando {Math.min(equiposFiltrados.length, 100)} de {equiposFiltrados.length} filtrados / {equipos.length} total)
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background border rounded-md px-2.5 py-1.5 text-xs">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar en todo..."
                  value={filtroGlobal}
                  onChange={(e) => setFiltroGlobal(e.target.value)}
                  className="bg-transparent focus:outline-none w-36"
                />
              </div>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroGlobal('');
                    setFiltroProducto('');
                    setFiltroContrato('');
                    setFiltroSucursal('');
                  }}
                  className="px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-xs uppercase text-muted-foreground">
                  <th className="p-3">Nº Prod. Servicio</th>
                  <th className="p-3">Nº Contrato</th>
                  <th className="p-3">Origen</th>
                  <th className="p-3">Nº Serie</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3">Sucursal</th>
                  <th className="p-3">Cliente Propietario</th>
                  <th className="p-3">Cliente Ubicación</th>
                </tr>
                <tr className="bg-muted/20 border-b">
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar prod..."
                      value={filtroProducto}
                      onChange={(e) => setFiltroProducto(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar contrato..."
                      value={filtroContrato}
                      onChange={(e) => setFiltroContrato(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2" />
                  <th className="p-2" />
                  <th className="p-2" />
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Sucursal..."
                      value={filtroSucursal}
                      onChange={(e) => setFiltroSucursal(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2" />
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {equiposFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">
                      No hay equipos que coincidan con el filtro aplicado.
                    </td>
                  </tr>
                ) : (
                  equiposFiltrados.slice(0, 100).map((item) => (
                    <tr key={item.idUnico} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold">{item['Nº prod. servicio']}</td>
                      <td className="p-3 font-mono text-xs font-bold text-primary">{item['Nº Contrato']}</td>
                      <td className="p-3 text-xs">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                          {item['Origen Contrato']}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{item['Nº Serie']}</td>
                      <td className="p-3">{item['Modelo']}</td>
                      <td className="p-3">{item['Sucursal']}</td>
                      <td className="p-3">{item['Cliente Propietario']}</td>
                      <td className="p-3">{item['Cliente Ubicación']}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncView;
