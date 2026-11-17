'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ArrowUpDown, ChevronUp, ChevronDown, FilterX, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ColumnFilters {
  serie: string;
  modelo: string;
  contrato: string;
  propietario: string;
  ubicacion: string;
  horasMin: string;
}

export function RevisionesView() {
  const [items, setItems] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Filtros individuales tipo Excel por columna
  const [colFilters, setColFilters] = useState<ColumnFilters>({
    serie: '',
    modelo: '',
    contrato: '',
    propietario: '',
    ubicacion: '',
    horasMin: '',
  });

  // Ordenación
  const [sortField, setSortField] = useState<string>('Nº Serie');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Renderizado continuo (sin páginas, carga progresiva al hacer scroll para no congelar el DOM con 9.300 filas)
  const [visibleCount, setVisibleCount] = useState(200);
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

  // Listas de valores únicos para los desplegables tipo Excel (Modelo, Contrato, Propietario, Ubicación)
  const uniqueValues = useMemo(() => {
    const modelos = new Set<string>();
    const contratos = new Set<string>();
    const propietarios = new Set<string>();
    const ubicaciones = new Set<string>();

    items.forEach(row => {
      if (row['Modelo']) modelos.add(String(row['Modelo']));
      if (row['Nº Contrato']) contratos.add(String(row['Nº Contrato']));
      const prop = row['Nombre Cliente Propietario'] || row['Nombre'];
      if (prop) propietarios.add(String(prop));
      if (row['Nombre Cliente Ubicación']) ubicaciones.add(String(row['Nombre Cliente Ubicación']));
    });

    return {
      modelos: Array.from(modelos).sort(),
      contratos: Array.from(contratos).sort(),
      propietarios: Array.from(propietarios).sort(),
      ubicaciones: Array.from(ubicaciones).sort(),
    };
  }, [items]);

  // Filtrado combinado (Global + Filtros tipo Excel por columna) y Ordenación
  const filteredAndSortedItems = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSerie = colFilters.serie.toLowerCase().trim();
    const qHorasMin = colFilters.horasMin !== '' ? Number(colFilters.horasMin) : null;

    const filtered = items.filter(row => {
      const serie = String(row['Nº Serie'] || row['Nº prod. servicio'] || '');
      const modelo = String(row['Modelo'] || '');
      const contrato = String(row['Nº Contrato'] || '');
      const propietario = String(row['Nombre Cliente Propietario'] || row['Nombre'] || '');
      const ubicacion = String(row['Nombre Cliente Ubicación'] || '');
      const horas = Number(row['Nº de horas']) || 0;

      // 1. Búsqueda global
      if (qGlobal) {
        const matchGlobal =
          serie.toLowerCase().includes(qGlobal) ||
          modelo.toLowerCase().includes(qGlobal) ||
          contrato.toLowerCase().includes(qGlobal) ||
          propietario.toLowerCase().includes(qGlobal) ||
          ubicacion.toLowerCase().includes(qGlobal);
        if (!matchGlobal) return false;
      }

      // 2. Filtros por columna tipo Excel
      if (qSerie && !serie.toLowerCase().includes(qSerie)) return false;
      if (colFilters.modelo && modelo !== colFilters.modelo) return false;
      if (colFilters.contrato && contrato !== colFilters.contrato) return false;
      if (colFilters.propietario && propietario !== colFilters.propietario) return false;
      if (colFilters.ubicacion && ubicacion !== colFilters.ubicacion) return false;
      if (qHorasMin !== null && !isNaN(qHorasMin) && horas < qHorasMin) return false;

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

  // Reiniciar el scroll continuo cuando cambian los filtros
  useEffect(() => {
    setVisibleCount(200);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [globalSearch, colFilters, sortField, sortDirection]);

  // Detectar scroll para ir pintando el resto del listado de una tacada sin lag
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
    setColFilters({
      serie: '',
      modelo: '',
      contrato: '',
      propietario: '',
      ubicacion: '',
      horasMin: '',
    });
  };

  const hasActiveFilters =
    globalSearch !== '' ||
    Object.values(colFilters).some(val => val !== '');

  const handleExportFiltered = () => {
    if (filteredAndSortedItems.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(filteredAndSortedItems);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Filtrada');
    XLSX.writeFile(workbook, `Planificacion_Equipos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 shrink-0" />;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 ml-1 text-primary shrink-0" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 ml-1 text-primary shrink-0" />
    );
  };

  const displayedItems = filteredAndSortedItems.slice(0, visibleCount);

  return (
    <div className="p-6 space-y-4">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Listado continuo del parque completo. Ordena por columna y filtra tipo Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium bg-muted px-3 py-1.5 rounded border">
            Mostrando <span className="font-bold text-primary">{filteredAndSortedItems.length}</span> de{' '}
            <span className="font-bold">{items.length}</span> equipos
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

      {/* BARRA DE BÚSQUEDA GLOBAL Y LIMPIEZA DE FILTROS */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 bg-card p-3 border rounded-lg shadow-sm items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Búsqueda rápida en cualquier campo..."
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
              <FilterX className="w-3.5 h-3.5" /> Borrar todos los filtros
            </button>
          )}
        </div>
      )}

      {/* TABLA CONTINUA SIN PAGINACIÓN CON FILTROS TIPO EXCEL */}
      {items.length === 0 ? (
        <div className="p-12 text-center border rounded-lg bg-card text-muted-foreground">
          <p className="text-base font-medium mb-1">No hay datos de planificación sincronizados.</p>
          <p className="text-sm">
            Ve a la sección <span className="underline font-semibold">Sincronización</span> para procesar los 5 excels.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <div
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="overflow-auto max-h-[72vh] relative"
          >
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-muted sticky top-0 z-10 shadow-sm">
                {/* FILA 1: TÍTULOS ORDENABLES */}
                <tr className="border-b text-muted-foreground font-semibold">
                  <th
                    onClick={() => handleSort('Nº Serie')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[140px]"
                  >
                    <div className="flex items-center">Nº Serie {renderSortIcon('Nº Serie')}</div>
                  </th>
                  <th
                    onClick={() => handleSort('Modelo')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[160px]"
                  >
                    <div className="flex items-center">Modelo {renderSortIcon('Modelo')}</div>
                  </th>
                  <th
                    onClick={() => handleSort('Nº Contrato')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[150px]"
                  >
                    <div className="flex items-center">Nº Contrato {renderSortIcon('Nº Contrato')}</div>
                  </th>
                  <th
                    onClick={() => handleSort('Nombre Cliente Propietario')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[220px]"
                  >
                    <div className="flex items-center">Cliente Propietario {renderSortIcon('Nombre Cliente Propietario')}</div>
                  </th>
                  <th
                    onClick={() => handleSort('Nombre Cliente Ubicación')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[220px]"
                  >
                    <div className="flex items-center">Ubicación {renderSortIcon('Nombre Cliente Ubicación')}</div>
                  </th>
                  <th
                    onClick={() => handleSort('Nº de horas')}
                    className="p-2.5 cursor-pointer hover:bg-muted/80 select-none min-w-[110px]"
                  >
                    <div className="flex items-center">Nº Horas {renderSortIcon('Nº de horas')}</div>
                  </th>
                </tr>

                {/* FILA 2: FILTROS TIPO EXCEL POR COLUMNA */}
                <tr className="bg-muted/95 border-b text-xs">
                  <th className="p-1.5 font-normal">
                    <input
                      type="text"
                      placeholder="Filtrar serie..."
                      value={colFilters.serie}
                      onChange={(e) => setColFilters(prev => ({ ...prev, serie: e.target.value }))}
                      className="w-full px-2 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    />
                  </th>
                  <th className="p-1.5 font-normal">
                    <select
                      value={colFilters.modelo}
                      onChange={(e) => setColFilters(prev => ({ ...prev, modelo: e.target.value }))}
                      className="w-full px-1.5 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Todos ({uniqueValues.modelos.length})</option>
                      {uniqueValues.modelos.map((m, i) => (
                        <option key={i} value={m}>{m}</option>
                      ))}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select
                      value={colFilters.contrato}
                      onChange={(e) => setColFilters(prev => ({ ...prev, contrato: e.target.value }))}
                      className="w-full px-1.5 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Todos ({uniqueValues.contratos.length})</option>
                      {uniqueValues.contratos.map((c, i) => (
                        <option key={i} value={c}>{c}</option>
                      ))}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select
                      value={colFilters.propietario}
                      onChange={(e) => setColFilters(prev => ({ ...prev, propietario: e.target.value }))}
                      className="w-full px-1.5 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Todos ({uniqueValues.propietarios.length})</option>
                      {uniqueValues.propietarios.map((p, i) => (
                        <option key={i} value={p}>{p}</option>
                      ))}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <select
                      value={colFilters.ubicacion}
                      onChange={(e) => setColFilters(prev => ({ ...prev, ubicacion: e.target.value }))}
                      className="w-full px-1.5 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Todas ({uniqueValues.ubicaciones.length})</option>
                      {uniqueValues.ubicaciones.map((u, i) => (
                        <option key={i} value={u}>{u}</option>
                      ))}
                    </select>
                  </th>
                  <th className="p-1.5 font-normal">
                    <input
                      type="number"
                      placeholder="Mín. h..."
                      value={colFilters.horasMin}
                      onChange={(e) => setColFilters(prev => ({ ...prev, horasMin: e.target.value }))}
                      className="w-full px-2 py-1 border rounded bg-background text-foreground focus:outline-none focus:border-primary"
                    />
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {displayedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No hay equipos que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  displayedItems.map((row, idx) => (
                    <tr key={row.idUnico || idx} className="hover:bg-muted/50 transition-colors">
                      <td className="p-2.5 font-medium">{row['Nº Serie'] || row['Nº prod. servicio'] || 'N/A'}</td>
                      <td className="p-2.5">{row['Modelo'] || 'N/A'}</td>
                      <td className="p-2.5">{row['Nº Contrato'] || 'Sin Contrato'}</td>
                      <td className="p-2.5">{row['Nombre Cliente Propietario'] || row['Nombre'] || 'N/A'}</td>
                      <td className="p-2.5">{row['Nombre Cliente Ubicación'] || 'N/A'}</td>
                      <td className="p-2.5 font-mono">{row['Nº de horas'] ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* PIE INFORMATIVO DE CARGA CONTINUA */}
          <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between items-center">
            <span>
              Desplázate hacia abajo para ver todo el listado continuo ({displayedItems.length} de {filteredAndSortedItems.length} renderizados).
            </span>
            {visibleCount < filteredAndSortedItems.length && (
              <button
                onClick={() => setVisibleCount(filteredAndSortedItems.length)}
                className="text-primary hover:underline font-medium"
              >
                Cargar todos de golpe ({filteredAndSortedItems.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RevisionesView;
