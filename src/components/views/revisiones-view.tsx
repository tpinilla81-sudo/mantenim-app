'use client';

import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, Download, X, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { isDateOverdue, parseEuropeanDateString } from '@/lib/maintenance-rules';

interface ColumnFilterState {
  'Nº prod. servicio': string;
  'Nº Serie': string;
  'Modelo': string;
  'Sucursal': string;
  'Nº Contrato': string;
  'Fecha Próxima Revisión': string;
  'Nombre Cliente Propietario': string;
  'Tipo Registro': string;
  'Estado': string;
}

const initialColumnFilters: ColumnFilterState = {
  'Nº prod. servicio': '',
  'Nº Serie': '',
  'Modelo': '',
  'Sucursal': '',
  'Nº Contrato': '',
  'Fecha Próxima Revisión': '',
  'Nombre Cliente Propietario': '',
  'Tipo Registro': '',
  'Estado': '',
};

export function RevisionesView() {
  const [data, setData] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState>(initialColumnFilters);
  const [sortField, setSortField] = useState<string>('Fecha Próxima Revisión');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const saved = localStorage.getItem('mantenim_planificacion_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setData(parsed);
        }
      } catch (e) {
        console.error('Error al cargar los datos de planificación', e);
      }
    }
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleColumnFilterChange = (columnKey: keyof ColumnFilterState, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [columnKey]: value,
    }));
  };

  const clearAllFilters = () => {
    setGlobalSearch('');
    setColumnFilters(initialColumnFilters);
  };

  // Enriquecemos cada fila con su estado calculado para filtrar y ordenar con precisión
  const enrichedData = data.map((row) => {
    const fechaStr = String(row['Fecha Próxima Revisión'] || '');
    const retrasada = isDateOverdue(fechaStr);
    const estado = fechaStr === 'Pendiente' ? 'Pendiente' : retrasada ? 'Retrasada' : 'Al día';
    return {
      ...row,
      _retrasada: retrasada,
      _estado: estado,
    };
  });

  const totalRetrasadas = enrichedData.filter((r) => r._retrasada).length;

  const filteredData = enrichedData.filter((row) => {
    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase().trim();
      const matchesGlobal = Object.entries(row)
        .filter(([k]) => !k.startsWith('_') && k !== 'idUnico')
        .some(([, val]) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchLower);
        });
      if (!matchesGlobal) return false;
    }

    if (columnFilters['Nº prod. servicio'].trim()) {
      if (!String(row['Nº prod. servicio'] || '').toLowerCase().includes(columnFilters['Nº prod. servicio'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Nº Serie'].trim()) {
      if (!String(row['Nº Serie'] || '').toLowerCase().includes(columnFilters['Nº Serie'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Modelo'].trim()) {
      if (!String(row['Modelo'] || '').toLowerCase().includes(columnFilters['Modelo'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Sucursal'].trim()) {
      if (!String(row['Sucursal'] || '').toLowerCase().includes(columnFilters['Sucursal'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Nº Contrato'].trim()) {
      if (!String(row['Nº Contrato'] || '').toLowerCase().includes(columnFilters['Nº Contrato'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Fecha Próxima Revisión'].trim()) {
      if (!String(row['Fecha Próxima Revisión'] || '').toLowerCase().includes(columnFilters['Fecha Próxima Revisión'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Nombre Cliente Propietario'].trim()) {
      if (!String(row['Nombre Cliente Propietario'] || '').toLowerCase().includes(columnFilters['Nombre Cliente Propietario'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Tipo Registro'].trim()) {
      if (!String(row['Tipo Registro'] || '').toLowerCase().includes(columnFilters['Tipo Registro'].toLowerCase().trim())) {
        return false;
      }
    }

    if (columnFilters['Estado'].trim()) {
      if (!String(row._estado || '').toLowerCase().includes(columnFilters['Estado'].toLowerCase().trim())) {
        return false;
      }
    }

    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';

    // Ordenación cronológica real si ordenamos por Fecha Próxima Revisión en formato DD/MM/YYYY
    if (sortField === 'Fecha Próxima Revisión') {
      const dateA = parseEuropeanDateString(String(aVal));
      const dateB = parseEuropeanDateString(String(bVal));
      const timeA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const comparison = String(aVal).localeCompare(String(bVal), 'es', { sensitivity: 'base' });
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleDownloadExcel = () => {
    if (sortedData.length === 0) return;
    const exportRows = sortedData.map(({ _retrasada, _estado, idUnico, ...rest }) => ({
      ...rest,
      Estado: _estado,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Revisiones');
    XLSX.writeFile(workbook, `Planificacion_Revisiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hasActiveFilters =
    globalSearch.trim() !== '' ||
    Object.values(columnFilters).some((v) => v.trim() !== '');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Fechas en formato europeo (DD/MM/YYYY), detección de retrasos y filtros independientes por columna.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-medium">
            Mostrando {sortedData.length} de {data.length} equipos
          </span>

          <button
            type="button"
            onClick={() =>
              handleColumnFilterChange(
                'Estado',
                columnFilters['Estado'].toLowerCase() === 'retrasada' ? '' : 'Retrasada'
              )
            }
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
              columnFilters['Estado'].toLowerCase() === 'retrasada'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {totalRetrasadas} Retrasadas
          </button>

          {sortedData.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" /> Exportar Excel
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-sm flex-1 max-w-md focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Búsqueda global en toda la tabla..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full bg-transparent text-sm focus:outline-none"
          />
          {globalSearch && (
            <button
              type="button"
              onClick={() => setGlobalSearch('')}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Limpiar búsqueda global"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold hover:bg-secondary/80 flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Limpiar todos los filtros
          </button>
        )}
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 border-b text-xs text-muted-foreground uppercase font-semibold">
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nº prod. servicio')}>
                  <div className="flex items-center gap-1">Nº Prod. Servicio <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nº Serie')}>
                  <div className="flex items-center gap-1">Nº Serie <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Modelo')}>
                  <div className="flex items-center gap-1">Modelo <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Sucursal')}>
                  <div className="flex items-center gap-1">Sucursal <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nº Contrato')}>
                  <div className="flex items-center gap-1">Nº Contrato <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Fecha Próxima Revisión')}>
                  <div className="flex items-center gap-1">Próxima Revisión <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nombre Cliente Propietario')}>
                  <div className="flex items-center gap-1">Cliente Propietario <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Tipo Registro')}>
                  <div className="flex items-center gap-1">Horas / Tipo <ArrowUpDown className="w-3 h-3" /></div>
                </th>
              </tr>

              {/* Fila de filtros por columna estilo Excel */}
              <tr className="bg-muted/30 border-b">
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar prod..."
                    value={columnFilters['Nº prod. servicio']}
                    onChange={(e) => handleColumnFilterChange('Nº prod. servicio', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar serie..."
                    value={columnFilters['Nº Serie']}
                    onChange={(e) => handleColumnFilterChange('Nº Serie', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar modelo..."
                    value={columnFilters['Modelo']}
                    onChange={(e) => handleColumnFilterChange('Modelo', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar sucursal..."
                    value={columnFilters['Sucursal']}
                    onChange={(e) => handleColumnFilterChange('Sucursal', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar contrato..."
                    value={columnFilters['Nº Contrato']}
                    onChange={(e) => handleColumnFilterChange('Nº Contrato', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY o retrasada..."
                    value={columnFilters['Fecha Próxima Revisión']}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleColumnFilterChange('Fecha Próxima Revisión', val);
                      if (val.toLowerCase().includes('retras')) {
                        handleColumnFilterChange('Estado', 'Retrasada');
                      } else if (columnFilters['Estado'] === 'Retrasada' && !val.toLowerCase().includes('retras')) {
                        handleColumnFilterChange('Estado', '');
                      }
                    }}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Filtrar cliente..."
                    value={columnFilters['Nombre Cliente Propietario']}
                    onChange={(e) => handleColumnFilterChange('Nombre Cliente Propietario', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
                <th className="p-2">
                  <input
                    type="text"
                    placeholder="Contratado / Propia..."
                    value={columnFilters['Tipo Registro']}
                    onChange={(e) => handleColumnFilterChange('Tipo Registro', e.target.value)}
                    className="w-full px-2 py-1 bg-background border rounded text-xs font-normal focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {data.length === 0 ? (
                      <>
                        No hay datos cargados. Ve a{' '}
                        <span className="font-semibold text-foreground">Sincronizar BC</span> para procesar los ficheros.
                      </>
                    ) : (
                      <>No hay ningún equipo que coincida con los filtros aplicados.</>
                    )}
                  </td>
                </tr>
              ) : (
                sortedData.slice(0, 150).map((row, idx) => (
                  <tr
                    key={row.idUnico || idx}
                    className={`transition-colors ${
                      row._retrasada ? 'bg-red-50/40 hover:bg-red-50/80' : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3 font-medium">{String(row['Nº prod. servicio'] || '')}</td>
                    <td className="p-3 text-muted-foreground">{String(row['Nº Serie'] || '')}</td>
                    <td className="p-3">{String(row['Modelo'] || '')}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs font-semibold">
                        {String(row['Sucursal'] || '')}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs font-semibold text-primary">
                      {String(row['Nº Contrato'] || '')}
                    </td>
                    <td
                      className={`p-3 font-bold ${
                        row._retrasada
                          ? 'text-red-700 bg-red-100/60'
                          : 'text-emerald-700 bg-emerald-50/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{String(row['Fecha Próxima Revisión'] || '')}</span>
                        {row._retrasada && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-red-600 text-white">
                            Retrasada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 truncate max-w-[200px]">
                      {String(row['Nombre Cliente Propietario'] || '')}
                    </td>
                    <td className="p-3">
                      <div className="text-xs flex items-center gap-1.5">
                        <span className="font-semibold">{row['Nº de horas']} h</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            row['Tipo Registro'] === 'Contratado'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {String(row['Tipo Registro'] || '')}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RevisionesView;
