'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  EquipoContratoSync,
  STORAGE_CONTRATOS_KEY,
  STORAGE_PLANIFICACION_KEY,
  SYNC_UPDATED_EVENT,
} from './sync-view';

const PAGE_SIZE = 50;

interface FilaPlanificacion extends EquipoContratoSync {
  esPropia: boolean;
  tieneContrato: boolean;
  revisionesAnuales: number | null;
  horasPorDia: number | null;
  'Fecha Última Revisión': string;
  'Fecha Próxima Revisión': string;
}

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

function parseHorasSeguro(val: any): number {
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
}

function parseBooleano(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === 'sí' || s === 'si' || s === '1' || s === 'yes' || s === 'verdadero';
}

function parseFecha(val: any): Date | null {
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
  if (!s || s === '—' || s === '-') return null;
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

interface AuxUltimasRevisiones {
  porProd: Record<string, string>;
  porCliente: Record<string, string>;
}

function leerAuxiliaresUltimaRevision(): AuxUltimasRevisiones {
  const porProd: Record<string, string> = {};
  const porCliente: Record<string, string> = {};

  const actualizarMax = (mapa: Record<string, string>, clave: string, dt: Date | null) => {
    if (!clave || !dt) return;
    const prevDt = parseFecha(mapa[clave]);
    if (!prevDt || dt.getTime() > prevDt.getTime()) {
      mapa[clave] = formatDDMMYYYY(dt);
    }
  };

  try {
    const rawTarea = localStorage.getItem('mantenim_tarea_servicio');
    if (rawTarea) {
      const arr = JSON.parse(rawTarea);
      if (Array.isArray(arr)) {
        for (const r of arr) {
          const pn = normalizarId(
            r?.['Nº prod. servicio'] ?? r?.['Nº producto'] ?? r?.producto
          );
          const dt = parseFecha(
            r?.['Fecha finalización'] ?? r?.['Fecha Pedido'] ?? r?.fecha
          );
          actualizarMax(porProd, pn, dt);
        }
      }
    }

    const rawPed = localStorage.getItem('mantenim_pedidos_registrados');
    if (rawPed) {
      const arr = JSON.parse(rawPed);
      if (Array.isArray(arr)) {
        for (const r of arr) {
          const desc = String(r?.['Descripción'] ?? r?.descripcion ?? '').trim();
          const dt = parseFecha(
            r?.['Fecha finalización'] ?? r?.['Fecha inicial'] ?? r?.fecha
          );
          const matchNum = desc.match(/^\s*0*(\d+)\b/);
          if (matchNum) {
            actualizarMax(porProd, normalizarId(matchNum[1]), dt);
          }
          if (/revisi[óo]n\s*cliente/i.test(desc)) {
            const cli = String(r?.['Nombre'] ?? r?.['Nombre Cliente'] ?? '')
              .trim()
              .toUpperCase();
            actualizarMax(porCliente, cli, dt);
          }
        }
      }
    }
  } catch {
    // ignorar errores de lectura
  }

  return { porProd, porCliente };
}

function calcularProximaRevision(
  esPropia: boolean,
  horas: number,
  horasPorDia: number | null,
  fechaUltimaStr: string,
  revisionesAnuales: number | null
): string {
  if (esPropia) {
    const hitoHoras = (Math.floor(Math.max(0, horas) / 1000) + 1) * 1000;
    const horasRestantes = Math.max(0, hitoHoras - horas);

    if (horasPorDia && horasPorDia > 0 && horasRestantes > 0) {
      const diasEstimados = Math.ceil(horasRestantes / horasPorDia);
      const fechaEst = new Date();
      fechaEst.setDate(fechaEst.getDate() + diasEstimados);
      return `${formatDDMMYYYY(fechaEst)} (${hitoHoras.toLocaleString('es-ES')} h)`;
    }

    return `${hitoHoras.toLocaleString('es-ES')} h (faltan ${Math.round(
      horasRestantes
    ).toLocaleString('es-ES')} h)`;
  }

  const fechaUltima = parseFecha(fechaUltimaStr);
  const revAnuales =
    revisionesAnuales && revisionesAnuales > 0 ? revisionesAnuales : null;

  if (!fechaUltima || !revAnuales) {
    return revAnuales ? `${revAnuales}/año` : '—';
  }

  const diasIntervalo = Math.max(1, Math.round(365 / revAnuales));
  const proxima = new Date(fechaUltima.getTime());
  proxima.setDate(proxima.getDate() + diasIntervalo);
  return formatDDMMYYYY(proxima);
}

function normalizarFila(
  raw: any,
  index: number,
  aux: AuxUltimasRevisiones
): FilaPlanificacion | null {
  const nProd = String(
    raw?.['Nº prod. servicio'] ??
      raw?.nProductoServicio ??
      raw?.producto ??
      raw?.prod ??
      ''
  ).trim();

  const prodNorm = normalizarId(nProd);

  const nContrato = String(
    raw?.['Nº Contrato'] ?? raw?.nContrato ?? raw?.contrato ?? ''
  ).trim();

  const esPropia = parseBooleano(
    raw?.['Es propia'] ?? raw?.esPropia ?? raw?.propia ?? false
  );

  const tieneContrato =
    Boolean(nContrato && nContrato !== '-' && nContrato.toUpperCase() !== 'N/A') ||
    parseBooleano(raw?.tieneContrato ?? false);

  if (!esPropia && !tieneContrato) {
    return null;
  }

  const horas = parseHorasSeguro(
    raw?.['Nº de horas'] ??
      raw?.['Nº horas'] ??
      raw?.horas ??
      raw?.contador ??
      0
  );

  const clientePropietario =
    String(
      raw?.['Cliente Propietario'] ??
        raw?.['Nombre Cliente Propietario'] ??
        raw?.clientePropietario ??
        'N/A'
    ).trim() || 'N/A';

  const nombreClienteUbicacion =
    String(
      raw?.['Nombre Cliente Ubicación'] ??
        raw?.['Cliente Ubicación'] ??
        raw?.clienteUbicacion ??
        'N/A'
    ).trim() || 'N/A';

  // Resolver Fecha Última Revisión: priorizar la más reciente entre dato de fila y auxiliares
  const candidatosFecha: Date[] = [];

  const fFila = parseFecha(
    raw?.['Fecha Última Revisión'] ??
      raw?.['Fecha última revisión'] ??
      raw?.['Fecha de la última revisión'] ??
      raw?.fechaUltimaRevision ??
      ''
  );
  if (fFila) candidatosFecha.push(fFila);

  if (prodNorm && aux.porProd[prodNorm]) {
    const fAuxProd = parseFecha(aux.porProd[prodNorm]);
    if (fAuxProd) candidatosFecha.push(fAuxProd);
  }

  if (!esPropia) {
    for (const c of [clientePropietario, nombreClienteUbicacion]) {
      const key = c.trim().toUpperCase();
      if (key && key !== 'N/A' && aux.porCliente[key]) {
        const fAuxCli = parseFecha(aux.porCliente[key]);
        if (fAuxCli) candidatosFecha.push(fAuxCli);
      }
    }
  }

  const fechaUltimaMax =
    candidatosFecha.length > 0
      ? candidatosFecha.reduce((max, cur) =>
          cur.getTime() > max.getTime() ? cur : max
        )
      : null;

  const fechaUltima = fechaUltimaMax ? formatDDMMYYYY(fechaUltimaMax) : '';

  const revRaw =
    raw?.['Nº REVISIONES ANUALES'] ??
    raw?.['Nº revisiones anuales'] ??
    raw?.revisionesAnuales ??
    null;
  const revNum =
    revRaw !== null && revRaw !== '' && !isNaN(Number(revRaw))
      ? Number(revRaw)
      : null;

  const horasPorDia =
    raw?.horasPorDia !== undefined &&
    raw?.horasPorDia !== null &&
    !isNaN(Number(raw.horasPorDia)) &&
    Number(raw.horasPorDia) > 0
      ? Number(raw.horasPorDia)
      : null;

  const fechaProximaCalculada = calcularProximaRevision(
    esPropia,
    horas,
    horasPorDia,
    fechaUltima,
    revNum
  );

  const fechaProxima =
    fechaProximaCalculada !== '—'
      ? fechaProximaCalculada
      : String(
          raw?.['Fecha Próxima Revisión'] ??
            raw?.['Fecha próxima revisión'] ??
            raw?.fechaProximaRevision ??
            '—'
        ).trim() || '—';

  return {
    'Nº prod. servicio': nProd || '-',
    'Nº Contrato': nContrato || (esPropia ? 'PROPIA' : '-'),
    'Nº Serie':
      String(raw?.['Nº Serie'] ?? raw?.nSerie ?? raw?.serie ?? 'N/A').trim() ||
      'N/A',
    'Modelo':
      String(raw?.['Modelo'] ?? raw?.modelo ?? 'N/A').trim() || 'N/A',
    'Nº de horas': horas,
    'Sucursal':
      String(raw?.['Sucursal'] ?? raw?.sucursal ?? 'N/A').trim() || 'N/A',
    'Cliente Propietario': clientePropietario,
    'Nombre Cliente Ubicación': nombreClienteUbicacion,
    esPropia,
    tieneContrato,
    revisionesAnuales: revNum,
    horasPorDia,
    'Fecha Última Revisión': fechaUltima,
    'Fecha Próxima Revisión': fechaProxima,
    idUnico: String(raw?.idUnico ?? `${index}_${nProd}`).trim(),
  };
}

export function PlanificacionView() {
  const [equipos, setEquipos] = useState<FilaPlanificacion[]>([]);
  const [page, setPage] = useState(1);

  const [filtroGlobal, setFiltroGlobal] = useState('');
  const [filtroProd, setFiltroProd] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroSerie, setFiltroSerie] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroHoras, setFiltroHoras] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [filtroPropietario, setFiltroPropietario] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');
  const [filtroFechaUltima, setFiltroFechaUltima] = useState('');
  const [filtroFechaProxima, setFiltroFechaProxima] = useState('');

  const cargarDatos = () => {
    try {
      const raw =
        localStorage.getItem(STORAGE_CONTRATOS_KEY) ||
        localStorage.getItem(STORAGE_PLANIFICACION_KEY);

      if (!raw) {
        setEquipos([]);
        return;
      }

      const aux = leerAuxiliaresUltimaRevision();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalizados = parsed
          .map((item, i) => normalizarFila(item, i, aux))
          .filter(
            (row): row is FilaPlanificacion =>
              row !== null && row['Nº prod. servicio'] !== '-'
          );
        setEquipos(normalizados);
        setPage(1);
      } else {
        setEquipos([]);
      }
    } catch (err) {
      console.error('Error cargando equipos en Planificación / Revisiones:', err);
      setEquipos([]);
    }
  };

  useEffect(() => {
    cargarDatos();

    const handleSyncUpdate = () => cargarDatos();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        cargarDatos();
      }
    };

    window.addEventListener('storage', handleSyncUpdate);
    window.addEventListener(SYNC_UPDATED_EVENT, handleSyncUpdate);
    window.addEventListener('focus', handleSyncUpdate);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleSyncUpdate);
      window.removeEventListener(SYNC_UPDATED_EVENT, handleSyncUpdate);
      window.removeEventListener('focus', handleSyncUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const filtrados = useMemo(() => {
    return equipos.filter((item) => {
      if (
        filtroProd.trim() &&
        !item['Nº prod. servicio']
          .toLowerCase()
          .includes(filtroProd.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroContrato.trim() &&
        !item['Nº Contrato']
          .toLowerCase()
          .includes(filtroContrato.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroSerie.trim() &&
        !item['Nº Serie']
          .toLowerCase()
          .includes(filtroSerie.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroModelo.trim() &&
        !item['Modelo']
          .toLowerCase()
          .includes(filtroModelo.trim().toLowerCase())
      ) {
        return false;
      }
      if (filtroHoras.trim()) {
        const horasFormateadas = item['Nº de horas'].toLocaleString('es-ES');
        const horasCrudas = String(item['Nº de horas']);
        const qHoras = filtroHoras.trim().toLowerCase();
        if (
          !horasCrudas.toLowerCase().includes(qHoras) &&
          !horasFormateadas.toLowerCase().includes(qHoras)
        ) {
          return false;
        }
      }
      if (
        filtroSucursal.trim() &&
        !item['Sucursal']
          .toLowerCase()
          .includes(filtroSucursal.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroPropietario.trim() &&
        !item['Cliente Propietario']
          .toLowerCase()
          .includes(filtroPropietario.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroUbicacion.trim() &&
        !item['Nombre Cliente Ubicación']
          .toLowerCase()
          .includes(filtroUbicacion.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroFechaUltima.trim() &&
        !item['Fecha Última Revisión']
          .toLowerCase()
          .includes(filtroFechaUltima.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroFechaProxima.trim() &&
        !item['Fecha Próxima Revisión']
          .toLowerCase()
          .includes(filtroFechaProxima.trim().toLowerCase())
      ) {
        return false;
      }
      if (filtroGlobal.trim()) {
        const q = filtroGlobal.trim().toLowerCase();
        const coincide = Object.entries(item)
          .filter(([k]) => k !== 'idUnico')
          .some(([, val]) => String(val ?? '').toLowerCase().includes(q));
        if (!coincide) return false;
      }
      return true;
    });
  }, [
    equipos,
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroHoras,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
    filtroFechaUltima,
    filtroFechaProxima,
    filtroGlobal,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroHoras,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
    filtroFechaUltima,
    filtroFechaProxima,
    filtroGlobal,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtrados.slice(start, start + PAGE_SIZE);
  }, [filtrados, currentPage]);

  const hayFiltros = Boolean(
    filtroGlobal.trim() ||
      filtroProd.trim() ||
      filtroContrato.trim() ||
      filtroSerie.trim() ||
      filtroModelo.trim() ||
      filtroHoras.trim() ||
      filtroSucursal.trim() ||
      filtroPropietario.trim() ||
      filtroUbicacion.trim() ||
      filtroFechaUltima.trim() ||
      filtroFechaProxima.trim()
  );

  const limpiarFiltros = () => {
    setFiltroGlobal('');
    setFiltroProd('');
    setFiltroContrato('');
    setFiltroSerie('');
    setFiltroModelo('');
    setFiltroHoras('');
    setFiltroSucursal('');
    setFiltroPropietario('');
    setFiltroUbicacion('');
    setFiltroFechaUltima('');
    setFiltroFechaProxima('');
  };

  const exportarExcel = () => {
    if (filtrados.length === 0) return;
    const rowsExport = filtrados.map((rest) => ({
      'Nº Prod. Servicio': rest['Nº prod. servicio'],
      'Nº Contrato': rest['Nº Contrato'],
      'Nº Serie': rest['Nº Serie'],
      'Modelo': rest['Modelo'],
      'Nº de horas': rest['Nº de horas'],
      'Sucursal': rest['Sucursal'],
      'Cliente Propietario': rest['Cliente Propietario'],
      'Nombre Cliente Ubicación': rest['Nombre Cliente Ubicación'],
      'Fecha Última Revisión': rest['Fecha Última Revisión'],
      'Fecha Próxima Revisión': rest['Fecha Próxima Revisión'],
    }));
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planificacion_Revisiones');
    XLSX.writeFile(
      wb,
      `Planificacion_Revisiones_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Última revisión (más reciente entre tareas y pedidos registrados) y próxima revisión planificada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900">
            {filtrados.length} filtrados / {equipos.length} total
          </span>
          <button
            type="button"
            onClick={cargarDatos}
            className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Recargar
          </button>
          {filtrados.length > 0 && (
            <button
              type="button"
              onClick={exportarExcel}
              className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
          )}
        </div>
      </div>

      {equipos.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center space-y-3 shadow-sm">
          <p className="text-sm font-semibold">
            No hay máquinas propias ni de cliente con contrato cargadas
          </p>
          <p className="text-xs text-muted-foreground">
            Sincroniza los ficheros en la pestaña de Sincronización para cargar los datos.
          </p>
          <button
            type="button"
            onClick={cargarDatos}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Comprobar datos guardados
          </button>
        </div>
      ) : (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Mostrando {visibleRows.length} de {filtrados.length} filtrados /{' '}
              {equipos.length} total
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background border rounded-md px-2.5 py-1.5 text-xs">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar en toda la tabla..."
                  value={filtroGlobal}
                  onChange={(e) => setFiltroGlobal(e.target.value)}
                  className="bg-transparent focus:outline-none w-44"
                />
              </div>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
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
                  <th className="p-3">Nº Serie</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3 text-right">Nº de horas</th>
                  <th className="p-3">Sucursal</th>
                  <th className="p-3">Cliente Propietario</th>
                  <th className="p-3">Nombre Cliente Ubicación</th>
                  <th className="p-3">Fecha Última Revisión</th>
                  <th className="p-3">Fecha Próxima Revisión</th>
                </tr>
                <tr className="bg-muted/20 border-b">
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar prod..."
                      value={filtroProd}
                      onChange={(e) => setFiltroProd(e.target.value)}
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
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar serie..."
                      value={filtroSerie}
                      onChange={(e) => setFiltroSerie(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar modelo..."
                      value={filtroModelo}
                      onChange={(e) => setFiltroModelo(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Horas..."
                      value={filtroHoras}
                      onChange={(e) => setFiltroHoras(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal text-right focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Sucursal..."
                      value={filtroSucursal}
                      onChange={(e) => setFiltroSucursal(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Cliente propietario..."
                      value={filtroPropietario}
                      onChange={(e) => setFiltroPropietario(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Nombre cliente ubicación..."
                      value={filtroUbicacion}
                      onChange={(e) => setFiltroUbicacion(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY..."
                      value={filtroFechaUltima}
                      onChange={(e) => setFiltroFechaUltima(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Fecha o horas..."
                      value={filtroFechaProxima}
                      onChange={(e) => setFiltroFechaProxima(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-6 text-center text-muted-foreground text-xs"
                    >
                      No hay equipos que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, idx) => (
                    <tr
                      key={row.idUnico || `${row['Nº prod. servicio']}_${idx}`}
                      className="hover:bg-muted/20"
                    >
                      <td className="p-3 font-semibold">
                        {row['Nº prod. servicio']}
                      </td>
                      <td className="p-3 font-mono text-xs font-bold text-primary">
                        {row['Nº Contrato']}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row['Nº Serie']}
                      </td>
                      <td className="p-3">{row['Modelo']}</td>
                      <td className="p-3 text-right font-mono text-xs font-semibold">
                        {row['Nº de horas'].toLocaleString('es-ES')}
                      </td>
                      <td className="p-3">{row['Sucursal']}</td>
                      <td className="p-3">{row['Cliente Propietario']}</td>
                      <td className="p-3">{row['Nombre Cliente Ubicación']}</td>
                      <td className="p-3 font-mono text-xs">
                        {row['Fecha Última Revisión'] || '—'}
                      </td>
                      <td className="p-3 font-mono text-xs font-medium">
                        {row['Fecha Próxima Revisión'] || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtrados.length > PAGE_SIZE && (
            <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 border rounded bg-background disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 border rounded bg-background disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Siguiente <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PlanificacionView;
