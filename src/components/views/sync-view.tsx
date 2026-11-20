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
      setStatusMessage(
        'Selecciona al menos Productos de Servicio y Lista Líneas de Contrato para sincronizar.'
      );
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      const [
        productosExtraidos,
        lineasRows,
        revAnualesRows,
        pedidosRegRows,
        tareaServRows,
        extra1Rows,
        extra2Rows,
      ] = await Promise.all([
        leerProductosConColumnasFijas(productosFile),
        leerExcel(lineasContratoFile),
        revisionesAnualesFile ? leerExcel(revisionesAnualesFile) : Promise.resolve([]),
        pedidosRegistradosFile ? leerExcel(pedidosRegistradosFile) : Promise.resolve([]),
        tareaServicioFile ? leerExcel(tareaServicioFile) : Promise.resolve([]),
        extraFile1 ? leerExcel(extraFile1) : Promise.resolve([]),
        extraFile2 ? leerExcel(extraFile2) : Promise.resolve([]),
      ]);

      const todasRevAnuales = [...revAnualesRows];
      const todosPedidosReg = [...pedidosRegRows];
      const todasTareasServ = [...tareaServRows];

      [...extra1Rows, ...extra2Rows].forEach((r) => {
        const keysUp = Object.keys(r).map((k) => k.toUpperCase());
        if (keysUp.some((k) => k.includes('REVISIONES ANUALES'))) {
          todasRevAnuales.push(r);
        } else if (
          keysUp.some((k) => k.includes('TIPO PEDIDO SERVICIO') || k.includes('FECHA INICIAL'))
        ) {
          todosPedidosReg.push(r);
        } else if (
          keysUp.some((k) => k.includes('FECHA PEDIDO') || k.includes('CÓD. ESTADO REPARACIÓN'))
        ) {
          todasTareasServ.push(r);
        }
      });

      // 1. Mapa de contratos por Nº prod. servicio normalizado
      const mapaContratos = new Map<
        string,
        { contrato: string; sucursal: string; clienteNombre: string }
      >();

      lineasRows.forEach((linea) => {
        const idProdRaw = String(
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
        const clienteNombre = String(
          buscarColumna(linea, ['Nombre Cliente', 'Nombre', 'Cliente'])
        )
          .trim()
          .toUpperCase();

        const clave = normalizarId(idProdRaw);
        if (clave && tieneValorValido(contrato)) {
          if (!mapaContratos.has(clave)) {
            mapaContratos.set(clave, { contrato, sucursal, clienteNombre });
          }
        }
      });

      // 2. Mapa de Nº REVISIONES ANUALES desde REVISIONES-ANUALES-CONTRATOS
      const mapaRevisionesAnuales = new Map<string, number>();
      const mapaContratoPorProdRev = new Map<string, string>();

      todasRevAnuales.forEach((row) => {
        const idProdRaw = buscarColumna(row, [
          'Nº PRODUCTO SERVICIO',
          'Nº prod. servicio',
          'Nº Producto',
          'Producto',
        ]);
        const contratoRev = String(
          buscarColumna(row, ['Nº CONTRATO', 'Nº Contrato', 'Contrato'])
        ).trim();
        const revRaw = buscarColumna(row, [
          'Nº REVISIONES ANUALES',
          'Nº revisiones anuales',
          'Revisiones anuales',
          'Revisiones',
        ]);

        const clave = normalizarId(idProdRaw);
        const revNum = Number(String(revRaw ?? '').replace(',', '.').trim());
        if (clave && !isNaN(revNum) && revNum > 0) {
          const prev = mapaRevisionesAnuales.get(clave);
          if (!prev || revNum > prev) {
            mapaRevisionesAnuales.set(clave, revNum);
          }
        }
        if (clave && tieneValorValido(contratoRev) && !mapaContratoPorProdRev.has(clave)) {
          mapaContratoPorProdRev.set(clave, contratoRev);
        }
      });

      // 3. Procesar Pedidos Servicio Registrados
      const ultimaFechaRegistrada = new Map<string, Date>();
      const pedidosPorClienteRev = new Map<string, Date[]>();
      const eventosPropios: Array<{
        prodNorm: string;
        fecha: Date;
        horasDesc: number | null;
      }> = [];

      todosPedidosReg.forEach((ped) => {
        const desc = String(buscarColumna(ped, ['Descripción', 'Descripcion'])).trim();
        const tipo = String(
          buscarColumna(ped, ['Tipo pedido servicio', 'Tipo Pedido Servicio', 'Tipo'])
        )
          .trim()
          .toUpperCase();
        const clienteNom = String(
          buscarColumna(ped, ['Nombre', 'Nombre Cliente', 'Cliente'])
        )
          .trim()
          .toUpperCase();
        const clienteId = String(
          buscarColumna(ped, ['Nº cliente', 'No. cliente', 'Cliente'])
        )
          .trim()
          .toUpperCase();

        const fechaFin = parseFechaValor(
          buscarColumna(ped, ['Fecha finalización', 'Fecha finalizacion', 'Fecha'])
        );
        const fechaIni = parseFechaValor(
          buscarColumna(ped, ['Fecha inicial', 'Fecha pedido', 'Fecha Pedido'])
        );
        const fechaRef = fechaFin || fechaIni;
        if (!fechaRef) return;

        // Pedidos que empiezan por un número -> producto propio
        const matchInicio = desc.match(/^\s*0*(\d+)\b/);
        if (matchInicio) {
          const prodNorm = normalizarId(matchInicio[1]);
          if (prodNorm) {
            const prev = ultimaFechaRegistrada.get(prodNorm);
            if (!prev || fechaRef.getTime() > prev.getTime()) {
              ultimaFechaRegistrada.set(prodNorm, fechaRef);
            }

            const matchHoras =
              desc.match(/\b(\d{3,6})\s*(?:H|HORAS)\b/i) ||
              desc.match(/REVISI[ÓO]N[^0-9]{0,15}(\d{3,6})\b/i);
            const horasDesc = matchHoras ? Number(matchHoras[1]) : null;

            eventosPropios.push({
              prodNorm,
              fecha: fechaRef,
              horasDesc: horasDesc && !isNaN(horasDesc) ? horasDesc : null,
            });
          }
        }

        // Pedidos REVISION CLIENTE -> máquinas de clientes contratadas
        if (
          desc.toUpperCase().includes('REVISION CLIENTE') ||
          desc.toUpperCase().includes('REVISIÓN CLIENTE') ||
          tipo.includes('PREV')
        ) {
          if (clienteNom) {
            const arr = pedidosPorClienteRev.get(clienteNom) || [];
            arr.push(fechaRef);
            pedidosPorClienteRev.set(clienteNom, arr);
          }
          if (clienteId) {
            const arrId = pedidosPorClienteRev.get(`ID:${clienteId}`) || [];
            arrId.push(fechaRef);
            pedidosPorClienteRev.set(`ID:${clienteId}`, arrId);
          }
        }
      });

      // 4. Procesar Tarea Servicio
      const ultimaFechaTarea = new Map<string, Date>();
      todasTareasServ.forEach((tarea) => {
        const prodRaw = buscarColumna(tarea, [
          'Nº prod. servicio',
          'Nº producto',
          'Prod. servicio',
          'Producto',
        ]);
        const prodNorm = normalizarId(prodRaw);
        if (!prodNorm) return;

        const fechaFin = parseFechaValor(
          buscarColumna(tarea, ['Fecha finalización', 'Fecha finalizacion'])
        );
        const fechaPed = parseFechaValor(
          buscarColumna(tarea, ['Fecha Pedido', 'Fecha pedido', 'Fecha inicial'])
        );
        const fechaRef = fechaFin || fechaPed;
        if (!fechaRef) return;

        const prev = ultimaFechaTarea.get(prodNorm);
        if (!prev || fechaRef.getTime() > prev.getTime()) {
          ultimaFechaTarea.set(prodNorm, fechaRef);
        }
      });

      const eventosPorProd = new Map<
        string,
        Array<{ fecha: Date; horasDesc: number | null }>
      >();
      eventosPropios.forEach((ev) => {
        const list = eventosPorProd.get(ev.prodNorm) || [];
        list.push({ fecha: ev.fecha, horasDesc: ev.horasDesc });
        eventosPorProd.set(ev.prodNorm, list);
      });

      const ritmosMap: Record<string, { horasPorDia: number }> = {};

      const resultado: EquipoContratoSync[] = [];
      const yaIncluidos = new Set<string>();

      productosExtraidos.forEach(
        ({ rowObj, horas, clientePropietario, nombreClienteUbicacion, esPropia }, idx) => {
          const idProd = String(
            buscarColumna(
              rowObj,
              ['Nº prod. servicio', 'Nº producto', 'Prod. servicio', 'Producto', 'Nº', 'No.', 'Código'],
              ['GRUPO', 'TIPO']
            )
          ).trim();
          if (!idProd) return;

          const clave = normalizarId(idProd);
          if (!clave || yaIncluidos.has(clave)) return;

          const contratoLinea = mapaContratos.get(clave);
          const contratoProd = String(
            buscarColumna(
              rowObj,
              [
                'Nº contrato',
                'Nº Contrato Interno Mantenimiento en Vigor',
                'Nº Contrato Proveedor en Vigor',
                'Contrato',
              ],
              ['GRUPO', 'TIPO']
            )
          ).trim();

          const tieneEnLinea = Boolean(
            contratoLinea && tieneValorValido(contratoLinea.contrato)
          );
          const tieneEnProd = tieneValorValido(contratoProd);
          const contratoRev = mapaContratoPorProdRev.get(clave) || '';

          const contratoFinal = tieneEnLinea
            ? contratoLinea!.contrato
            : tieneEnProd
            ? contratoProd
            : tieneValorValido(contratoRev)
            ? contratoRev
            : '';

          const tieneContrato = tieneValorValido(contratoFinal);

          if (!esPropia && !tieneContrato) {
            return;
          }

          yaIncluidos.add(clave);

          let fechaUltimaDt: Date | null = null;
          const fTarea = ultimaFechaTarea.get(clave);
          const fReg = ultimaFechaRegistrada.get(clave);

          if (fTarea && fReg) {
            fechaUltimaDt = fTarea.getTime() >= fReg.getTime() ? fTarea : fReg;
          } else if (fTarea) {
            fechaUltimaDt = fTarea;
          } else if (fReg) {
            fechaUltimaDt = fReg;
          }

          const revAnuales = mapaRevisionesAnuales.get(clave) ?? null;
          if (!esPropia && !fechaUltimaDt) {
            const candidatosCli = [
              clientePropietario.toUpperCase(),
              nombreClienteUbicacion.toUpperCase(),
              contratoLinea?.clienteNombre || '',
            ].filter((c) => c && c !== 'N/A');

            for (const cNom of candidatosCli) {
              const fechasCli = pedidosPorClienteRev.get(cNom);
              if (fechasCli && fechasCli.length > 0) {
                const maxCli = fechasCli.reduce((acc, cur) =>
                  cur.getTime() > acc.getTime() ? cur : acc
                );
                if (!fechaUltimaDt || maxCli.getTime() > fechaUltimaDt.getTime()) {
                  fechaUltimaDt = maxCli;
                }
              }
            }
          }

          let horasPorDia: number | null = null;
          if (esPropia) {
            const evs = (eventosPorProd.get(clave) || []).sort(
              (a, b) => a.fecha.getTime() - b.fecha.getTime()
            );
            const conHoras = evs.filter((e) => e.horasDesc !== null && e.horasDesc > 0);
            if (conHoras.length >= 2) {
              const primero = conHoras[0];
              const ultimo = conHoras[conHoras.length - 1];
              const dias = Math.round(
                (ultimo.fecha.getTime() - primero.fecha.getTime()) / (1000 * 60 * 60 * 24)
              );
              const diffHoras = (ultimo.horasDesc as number) - (primero.horasDesc as number);
              if (dias > 0 && diffHoras > 0) {
                horasPorDia = diffHoras / dias;
              }
            }
            if (!horasPorDia && evs.length >= 2 && horas > 0) {
              const dias = Math.round(
                (evs[evs.length - 1].fecha.getTime() - evs[0].fecha.getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              if (dias >= 30) {
                horasPorDia = horas / dias;
              }
            }
            if (horasPorDia && horasPorDia > 0) {
              ritmosMap[clave] = { horasPorDia };
            }
          }

          let fechaProximaStr = '—';
          const fechaUltimaStr = fechaUltimaDt ? formatDDMMYYYY(fechaUltimaDt) : '';

          if (esPropia) {
            const hitoHoras = (Math.floor(Math.max(0, horas) / 1000) + 1) * 1000;
            const horasRestantes = Math.max(0, hitoHoras - horas);
            if (horasPorDia && horasPorDia > 0 && horasRestantes > 0) {
              const diasRest = Math.ceil(horasRestantes / horasPorDia);
              const fEst = new Date();
              fEst.setDate(fEst.getDate() + diasRest);
              fechaProximaStr = `${formatDDMMYYYY(fEst)} (${formatMiles(hitoHoras)} h)`;
            } else {
              fechaProximaStr = `${formatMiles(hitoHoras)} h (faltan ${formatMiles(
                horasRestantes
              )} h)`;
            }
          } else if (fechaUltimaDt && revAnuales && revAnuales > 0) {
            const intervaloDias = Math.max(1, Math.round(365 / revAnuales));
            const fProx = new Date(fechaUltimaDt.getTime());
            fProx.setDate(fProx.getDate() + intervaloDias);
            fechaProximaStr = formatDDMMYYYY(fProx);
          } else if (revAnuales && revAnuales > 0) {
            fechaProximaStr = `${revAnuales}/año`;
          }

          resultado.push({
            'Nº prod. servicio': idProd,
            'Nº Contrato': contratoFinal || (esPropia ? 'PROPIA' : '-'),
            'Nº de horas': horas,
            'Cliente Propietario': clientePropietario,
            'Nombre Cliente Ubicación': nombreClienteUbicacion,
            'Nº Serie':
              String(
                buscarColumna(rowObj, ['Nº serie', 'Nº Serie', 'No. serie', 'Serie'], ['PRODUCTO'])
              ).trim() || 'N/A',
            'Modelo':
              String(
                buscarColumna(rowObj, ['Modelo', 'Cód. modelo', 'Descripción modelo'])
              ).trim() || 'N/A',
            'Sucursal':
              String(
                buscarColumna(rowObj, [
                  'Sucursal',
                  'Nº Sucursal',
                  'Cód. sucursal',
                  'Delegación',
                  'Centro',
                ])
              ).trim() ||
              contratoLinea?.sucursal ||
              'N/A',
            'Es propia': esPropia,
            'Nº REVISIONES ANUALES': revAnuales,
            horasPorDia,
            'Fecha Última Revisión': fechaUltimaStr,
            'Fecha Próxima Revisión': fechaProximaStr,
            idUnico: `${idx}_${clave}`,
          });
        }
      );

      const serialized = JSON.stringify(resultado);
      localStorage.setItem(STORAGE_CONTRATOS_KEY, serialized);
      localStorage.setItem(STORAGE_PLANIFICACION_KEY, serialized);
      localStorage.setItem(STORAGE_RITMOS_KEY, JSON.stringify(ritmosMap));
      localStorage.setItem(
        STORAGE_REV_ANUALES_KEY,
        JSON.stringify(Object.fromEntries(mapaRevisionesAnuales))
      );
      window.dispatchEvent(new Event(SYNC_UPDATED_EVENT));

      setEquipos(resultado);
      setIsError(false);
      setStatusMessage(
        `Sincronizados ${resultado.length} equipos con todos los Excel cargados.`
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
    const rowsExport = equipos.map((rest) => ({
      'Nº Prod. Servicio': rest['Nº prod. servicio'],
      'Nº Contrato': rest['Nº Contrato'],
      'Nº Serie': rest['Nº Serie'],
      'Modelo': rest['Modelo'],
      'Nº de horas': rest['Nº de horas'],
      'Sucursal': rest['Sucursal'],
      'Cliente Propietario': rest['Cliente Propietario'],
      'Nombre Cliente Ubicación': rest['Nombre Cliente Ubicación'],
      'Fecha Última Revisión': rest['Fecha Última Revisión'] || '',
      'Fecha Próxima Revisión': rest['Fecha Próxima Revisión'] || '',
    }));
    const hoja = XLSX.utils.json_to_sheet(rowsExport);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Planificacion_Revisiones');
    const hoy = new Date();
    const stamp = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(hoy.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(libro, `Planificacion_Revisiones_${stamp}.xlsx`);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_CONTRATOS_KEY);
    localStorage.removeItem(STORAGE_PLANIFICACION_KEY);
    localStorage.removeItem(STORAGE_RITMOS_KEY);
    localStorage.removeItem(STORAGE_REV_ANUALES_KEY);
    window.dispatchEvent(new Event(SYNC_UPDATED_EVENT));
    setEquipos([]);
    setProductosFile(null);
    setLineasContratoFile(null);
    setRevisionesAnualesFile(null);
    setPedidosRegistradosFile(null);
    setTareaServicioFile(null);
    setExtraFile1(null);
    setExtraFile2(null);
    setStatusMessage(null);
    setIsError(false);
  };

  const slots = [
    {
      label: 'Productos de Servicio',
      file: productosFile,
      ref: prodRef,
      onChange: (f: File) => setProductosFile(f),
      requerido: true,
    },
    {
      label: 'Lista Líneas de Contrato',
      file: lineasContratoFile,
      ref: lineasRef,
      onChange: (f: File) => setLineasContratoFile(f),
      requerido: true,
    },
    {
      label: 'Revisiones Anuales Contratos',
      file: revisionesAnualesFile,
      ref: revAnualesRef,
      onChange: (f: File) => setRevisionesAnualesFile(f),
      requerido: false,
    },
    {
      label: 'Pedidos Servicio Registrados',
      file: pedidosRegistradosFile,
      ref: pedidosRegRef,
      onChange: (f: File) => setPedidosRegistradosFile(f),
      requerido: false,
    },
    {
      label: 'Tarea Servicio',
      file: tareaServicioFile,
      ref: tareaServRef,
      onChange: (f: File) => setTareaServicioFile(f),
      requerido: false,
    },
    {
      label: 'Excel Adicional 1 (Opcional)',
      file: extraFile1,
      ref: extra1Ref,
      onChange: (f: File) => setExtraFile1(f),
      requerido: false,
    },
    {
      label: 'Excel Adicional 2 (Opcional)',
      file: extraFile2,
      ref: extra2Ref,
      onChange: (f: File) => setExtraFile2(f),
      requerido: false,
    },
  ];

  const archivosSeleccionados = slots.filter((s) => Boolean(s.file)).length;

  if (!mounted) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sincronización</h2>
          <p className="text-sm text-muted-foreground">
            Sube y sincroniza todos los Excel de Business Central y revisiones anuales ({archivosSeleccionados}/{slots.length} seleccionados).
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900">
          {equipos.length > 0
            ? `${equipos.length} equipos sincronizados`
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
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/60 bg-muted/20'
          }`}
        >
          <input
            ref={dropRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files && asignarArchivos(e.target.files)}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-7 h-7 text-primary" />
            <p className="text-sm font-medium">
              Arrastra aquí todos los Excel de una vez o selecciona cada archivo abajo
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slots.map((slot) => (
            <div
              key={slot.label}
              onClick={() => slot.ref.current?.click()}
              className={`p-4 border rounded-lg flex items-center justify-between cursor-pointer ${
                slot.file
                  ? 'bg-emerald-50/50 border-emerald-300'
                  : 'bg-muted/20 border-dashed'
              }`}
            >
              <input
                ref={slot.ref}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    slot.onChange(e.target.files[0]);
                    setStatusMessage(null);
                  }
                }}
              />
              <div className="flex items-center gap-3 truncate">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold uppercase">
                    {slot.label} {slot.requerido ? '*' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {slot.file ? slot.file.name : 'Sin seleccionar'}
                  </p>
                </div>
              </div>
              {slot.file && (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <button
            type="button"
            disabled={loading || !productosFile || !lineasContratoFile}
            onClick={handleProcesar}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Sincronizar todos los Excel'}
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

          {(equipos.length > 0 || archivosSeleccionados > 0) && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/
