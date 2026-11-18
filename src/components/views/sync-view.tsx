'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ColumnFilters {
  serie: string;
  modelo: string;
  delegacion: string;
  contrato: string;
  propietario: string;
  ubicacion: string;
}

export function RevisionesView() {
  const [items, setItems] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  
  const [colFilters, setColFilters] = useState<ColumnFilters>({
    serie: '',
    modelo: '',
    delegacion: '',
    contrato: '',
    propietario: '',
    ubicacion: '',
  });

  const [sortField, setSortField] = useState<string>('Nº Serie');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [visibleCount, setVisibleCount] = useState(300);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('mantenim_planificacion_data');
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error('Error cargando datos de planificación', e);
      }
    }
  }, []);

  const uniqueValues = useMemo(() => {
    const series = new Set<string>();
    const modelos = new Set<string>();
    const delegaciones = new Set<string>();
    const contratos = new Set<string>();
    const propietarios = new Set<string>();
    const ubicaciones = new Set<string>();

    items.forEach(row => {
      if (row['Nº Serie']) series.add(String(row['Nº Serie']));
      if (row['Modelo']) modelos.add(String(row['Modelo']));
      if (row['Delegación']) delegaciones.add(String(row['Delegación']));
      if (row['Nº Contrato']) contratos.add(String(row['Nº Contrato']));
      const prop = row['Nombre Cliente Propietario'];
      if (prop) propietarios.add(String(prop));
      if (row['Nombre Cliente Ubicación']) ubicaciones.add(String(row['Nombre Cliente Ubicación']));
    });

    return {
      series: Array.from(series).sort(),
      modelos: Array.from(modelos).sort(),
      delegaciones: Array.from(delegaciones).sort(),
      contratos: Array.from(contratos).sort(),
      propietarios: Array.from(propietarios).sort(),
      ubicaciones: Array.from(ubicaciones).sort(),
    };
  }, [items]);

  const filteredAndSortedItems = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSerie = colFilters.serie.toLowerCase().trim();
    const qModelo = colFilters.modelo.toLowerCase().trim();
    const qDelegacion = colFilters.delegacion.toLowerCase().trim();
    const qContrato = colFilters.contrato.toLowerCase().trim();
    const qProp = colFilters.propietario.toLowerCase().trim();
    const qUbica = colFilters.ubicacion.toLowerCase().trim();

    const filtered = items.filter(row => {
      const serie = String(row['Nº Serie'] || row['Nº prod. servicio'] || '');
      const modelo = String(row['Modelo'] || '');
      const delegacion = String(row['Delegación'] || '');
      const contrato = String(row['Nº Contrato'] || '');
      const propietario = String(row['Nombre Cliente Propietario'] || '');
      const ubicacion = String(row['Nombre Cliente Ubicación'] || '');

      if (qGlobal) {
        const matchGlobal =
          serie.toLowerCase().includes(qGlobal) ||
          modelo.toLowerCase().includes(qGlobal) ||
          delegacion.toLowerCase().includes(qGlobal) ||
          contrato.toLowerCase().includes(qGlobal) ||
          propietario.toLowerCase().includes(qGlobal) ||
          ubicacion.toLowerCase().includes(qGlobal);
        if (!matchGlobal) return false;
      }

      if (qSerie && !serie.toLowerCase().includes(qSerie)) return false;
      if (qModelo && !modelo.toLowerCase().includes(qModelo)) return false;
      if (qDelegacion && !delegacion.toLowerCase().includes(qDelegacion)) return false;
      if (qContrato && !contrato.toLowerCase().includes(qContrato)) return false;
      if (qProp && !propietario.toLowerCase().includes(qProp)) return false;
      if (qUbica && !ubicacion.toLowerCase().includes(qUbica)) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      let valA = a[sortField] ?? '';
      let valB = b[sortField] ?? '';

      if (sortField === 'Nº de horas') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, globalSearch, colFilters, sortField, sortDirection]);

  useEffect(() => {
    setVisibleCount(300);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [globalSearch, colFilters, sortField, sortDirection]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 400) {
      setVisibleCount(prev => Math.min(prev + 300, filteredAndSortedItems.length));
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const resetAllFilters = () => {
    setGlobalSearch('');
    setColFilters({ serie: '', modelo: '', delegacion: '', contrato: '', propietario: '', ubicacion: '' });
  };

  const hasActiveFilters = globalSearch !== '' || Object.values(colFilters).some(val => val !== '');

  const handleExportFiltered = () => {
    if (filteredAndSortedItems.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(filteredAndSortedItems);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Revisiones');
    XLSX.writeFile(workbook, `Planificacion_Revisiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 shrink-0" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-primary shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 ml-1 text-primary shrink-0" />;
  };

  const displayedItems = filteredAndSortedItems.slice(0, visibleCount);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Listado completo de máquinas con contrato y delegación asignada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium bg-muted px-3 py-1.5 rounded border">
            Mostrando <span className="font-bold text-primary">{filteredAndSortedItems.length}</span> de <span className="font-bold">{items.length}</span> equipos
          </div>

          {filteredAndSortedItems.length > 0 && (
            <button
              onClick={handleExportFiltered}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Exportar vista ({filteredAndSortedItems.length})
            </button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 bg-card p-3 border rounded-lg shadow-sm items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Búsqueda rápida global..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              className="px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded flex items-center gap-1.5 shrink-0"
            >
              <FilterX className="w-3.5 h-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center border rounded-lg bg-card text-muted-foreground">
          <p className="text-base font-medium mb-1">No hay datos de planificación sincronizados.</p>
          <p className="text-sm">Ve a <span className="underline font-semibold">Sincronización</span> para procesar los ficheros.</p>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <div ref={tableContainerRef} onScroll={handleScroll} className="overflow-auto max-h-[72vh] relative">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-muted sticky top-0 z-10 shadow-sm">
                <tr className="border-b text-muted-foreground font-semibold">
                  <th onClick={() => handleSort('Nº Serie')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[140px]">
                    <div className="flex items-center">Nº Serie {renderSortIcon('Nº Serie')}</div>
                  </th>
                  <th onClick={() => handleSort('Modelo')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[160px]">
                    <div className="flex items-center">Modelo {renderSortIcon('Modelo')}</div>
                  </th>
                  <th onClick={() => handleSort('Delegación')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[130px]">
                    <div className="flex items-center">Delegación {renderSortIcon('Delegación')}</div>
                  </th>
                  <th onClick={() => handleSort('Nº Contrato')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[140px]">
                    <div className="flex items-center">Nº Contrato {renderSortIcon('Nº Contrato')}</div>
                  </th>
                  <th onClick={() => handleSort('Nombre Cliente Propietario')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[210px]">
                    <div className="flex items-center">Cliente Propietario {renderSortIcon('Nombre Cliente Propietario')}</div>
                  </th>
                  <th onClick={() => handleSort('Nombre Cliente Ubicación')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[210px]">
                    <div className="flex items-center">Ubicación {renderSortIcon('Nombre Cliente Ubicación')}</div>
                  </th>
                  <th onClick={() => handleSort('Nº de horas')} className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[100px]">
                    <div className="flex items-center">Horas {renderSortIcon('Nº de horas')}</div>
                  </th>
                </tr>

                {/* FILTROS TIPO EXCEL */}
                <tr className="bg-muted/95 border-b text-xs">
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.serie} onChange={(e) => setColFilters(p => ({ ...p, serie: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todas</option>
                      {uniqueValues.series.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.modelo} onChange={(e) => setColFilters(p => ({ ...p, modelo: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todos</option>
                      {uniqueValues.modelos.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.delegacion} onChange={(e) => setColFilters(p => ({ ...p, delegacion: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todas</option>
                      {uniqueValues.delegaciones.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.contrato} onChange={(e) => setColFilters(p => ({ ...p, contrato: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todos</option>
                      {uniqueValues.contratos.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.propietario} onChange={(e) => setColFilters(p => ({ ...p, propietario: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todos</option>
                      {uniqueValues.propietarios.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select value={colFilters.ubicacion} onChange={(e) => setColFilters(p => ({ ...p, ubicacion: e.target.value }))} className="w-full px-1.5 py-1 border rounded bg-background">
                      <option value="">Todas</option>
                      {uniqueValues.ubicaciones.map((v, i) => <option key={i} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal"></th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {displayedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No hay equipos planificados que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  displayedItems.map((row, idx) => (
                    <tr key={row.idUnico || idx} className="hover:bg-muted/50 transition-colors">
                      <td className="p-2.5 font-medium">{row['Nº Serie'] || 'N/A'}</td>
                      <td className="p-2.5">{row['Modelo'] || 'N/A'}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-purple-100 text-purple-800">
                          {row['Delegación'] || 'N/A'}
                        </span>
                      </td>
                      <td className="p-2.5">{row['Nº Contrato']}</td>
                      <td className="p-2.5">{row['Nombre Cliente Propietario'] || 'N/A'}</td>
                      <td className="p-2.5">{row['Nombre Cliente Ubicación'] || 'N/A'}</td>
                      <td className="p-2.5 font-mono">{row['Nº de horas'] ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between items-center">
            <span>Mostrando {displayedItems.length} de {filteredAndSortedItems.length} registros filtrados.</span>
            {visibleCount < filteredAndSortedItems.length && (
              <button onClick={() => setVisibleCount(filteredAndSortedItems.length)} className="text-primary hover:underline font-medium">
                Cargar todos ({filteredAndSortedItems.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RevisionesView;
