'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { EquipoContratoSync } from './sync-view';

const STORAGE_CONTRATOS_KEY = 'mantenim_equipos_contrato';
const STORAGE_PLANIFICACION_KEY = 'mantenim_planificacion_data';
const PAGE_SIZE = 50;

export function PlanificacionView() {
  const [equipos, setEquipos] = useState<EquipoContratoSync[]>([]);
  const [page, setPage] = useState(1);

  const [filtroGlobal, setFiltroGlobal] = useState('');
  const [filtroProd, setFiltroProd] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroSerie, setFiltroSerie] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [filtroPropietario, setFiltroPropietario] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');

  const cargarDatos = () => {
    try {
      const raw =
        localStorage.getItem(STORAGE_CONTRATOS_KEY) ||
        localStorage.getItem(STORAGE_PLANIFICACION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setEquipos(parsed);
          setPage(1);
        } else {
          setEquipos([]);
        }
      } else {
        setEquipos([]);
      }
    } catch (err) {
      console.error('Error cargando planificación:', err);
      setEquipos([]);
    }
  };

  useEffect(() => {
    cargarDatos();
    const onStorageChange = () => cargarDatos();
    window.addEventListener('storage', onStorageChange);
    window.addEventListener('mantenim-sync-updated', onStorageChange);
    return () => {
      window.removeEventListener('storage', onStorageChange);
      window.removeEventListener('mantenim-sync-updated', onStorageChange);
    };
  }, []);

  const filtrados = useMemo(() => {
    return equipos.filter((item) => {
      if (
        filtroProd.trim() &&
        !String(item['Nº prod. servicio'] ?? '')
          .toLowerCase()
          .includes(filtroProd.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroContrato.trim() &&
        !String(item['Nº Contrato'] ?? '')
          .toLowerCase()
          .includes(filtroContrato.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroSerie.trim() &&
        !String(item['Nº Serie'] ?? '')
          .toLowerCase()
          .includes(filtroSerie.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroModelo.trim() &&
        !String(item['Modelo'] ?? '')
          .toLowerCase()
          .includes(filtroModelo.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroSucursal.trim() &&
        !String(item['Sucursal'] ?? '')
          .toLowerCase()
          .includes(filtroSucursal.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroPropietario.trim() &&
        !String(item['Cliente Propietario'] ?? '')
          .toLowerCase()
          .includes(filtroPropietario.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroUbicacion.trim() &&
        !String(item['Cliente Ubicación'] ?? '')
          .toLowerCase()
          .includes(filtroUbicacion.trim().toLowerCase())
      ) {
        return false;
      }
      if (filtroGlobal.trim()) {
        const q = filtroGlobal.trim().toLowerCase();
        const matchAny = Object.entries(item)
          .filter(([k]) => k !== 'idUnico')
          .some(([, val]) => String(val ?? '').toLowerCase().includes(q));
        if (!matchAny) return false;
      }
      return true;
    });
  }, [
    equipos,
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
    filtroGlobal,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
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
      filtroSucursal.trim() ||
      filtroPropietario.trim() ||
      filtroUbicacion.trim()
  );

  const limpiarFiltros = () => {
    setFiltroGlobal('');
    setFiltroProd('');
    setFiltroContrato('');
    setFiltroSerie('');
    setFiltroModelo('');
    setFiltroSucursal('');
    setFiltroPropietario('');
    setFiltroUbicacion('');
  };

  const exportarExcel = () => {
    if (filtrados.length === 0) return;
    const rowsExport = filtrados.map(({ idUnico, ...rest }) => rest);
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planificacion_Revisiones');
    XLSX.writeFile(wb, `Planificacion_Revisiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Equipos con contrato sincronizados desde <strong>Productos de Servicio</strong> y <strong>Lista Líneas de Contrato</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900">
            {filtrados.length} filtrados / {equipos.length} total
          </span>
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
        <div className="bg-card border rounded-xl p-10 text-center space-y-2 shadow-sm">
          <p className="text-sm font-semibold">No hay equipos sincronizados todavía</p>
          <p className="text-xs text-muted-foreground">
            Ve a <strong>Sincronización</strong>, carga <strong>Productos de Servicio</strong> y <strong>Lista Líneas de Contrato</strong>, y pulsa <strong>Sincronizar</strong>.
          </p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Mostrando {visibleRows.length} de {filtrados.length} filtrados / {equipos.length} total
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
                  <th className="p-3">Sucursal</th>
                  <th className="p-3">Cliente Propietario</th>
                  <th className="p-3">Cliente Ubicación</th>
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
                      placeholder="Sucursal..."
                      value={filtroSucursal}
                      onChange={(e) => setFiltroSucursal(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Propietario..."
                      value={filtroPropietario}
                      onChange={(e) => setFiltroPropietario(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Ubicación..."
                      value={filtroUbicacion}
                      onChange={(e) => setFiltroUbicacion(e.target.value)}
                      className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none"
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                      No hay equipos que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, idx) => (
                    <tr key={row.idUnico || `${row['Nº prod. servicio']}_${idx}`} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold">{row['Nº prod. servicio']}</td>
                      <td className="p-3 font-mono text-xs font-bold text-primary">{row['Nº Contrato']}</td>
                      <td className="p-3 text-muted-foreground">{row['Nº Serie']}</td>
                      <td className="p-3">{row['Modelo']}</td>
                      <td className="p-3">{row['Sucursal']}</td>
                      <td className="p-3">{row['Cliente Propietario']}</td>
                      <td className="p-3">{row['Cliente Ubicación']}</td>
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
