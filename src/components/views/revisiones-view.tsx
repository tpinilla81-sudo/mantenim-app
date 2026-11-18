'use client';

import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, FileSpreadsheet, Download, Filter, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export function RevisionesView() {
  const [data, setData] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Filtros individuales por columna
  const [columnFilters, setColumnFilters] = useState({
    'Nº prod. servicio': '',
    'Nº Serie': '',
    'Modelo': '',
    'Sucursal': '',
    'Nº Contrato': '',
    'Fecha Próxima Revisión': '',
    'Nombre Cliente Propietario': '',
    'Tipo Registro': '',
  });

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
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleColumnFilterChange = (columnKey: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const clearAllFilters = () => {
    setGlobalSearch('');
    setColumnFilters({
      'Nº prod. servicio': '',
      'Nº Serie': '',
      'Modelo': '',
      'Sucursal': '',
      'Nº Contrato': '',
      'Fecha Próxima Revisión': '',
      'Nombre Cliente Propietario': '',
      'Tipo Registro': '',
    });
  };

  // Filtrado combinado (Búsqueda global + Filtros individuales por columna estilo Excel)
  const filteredData = data.filter((row) => {
    // 1. Filtro global
    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase().trim();
      const matchesGlobal = Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(searchLower);
      });
      if (!matchesGlobal) return false;
    }

    // 2. Filtros por columna específica
    for (const [key, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal || filterVal.trim() === '') continue;
      const cellVal = String(row[key] || '').toLowerCase();
      if (!cellVal.includes(filterVal.toLowerCase().trim())) {
        return false;
      }
    }

    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleDownloadExcel = () => {
    if (sortedData.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(sortedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificacion_Revisiones');
    XLSX.writeFile(workbook, `Planificacion_Revisiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hasActiveFilters = globalSearch.trim() !== '' || Object.values(columnFilters).some(v => v.trim() !== '');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Listado unificado con filtros independientes por columna estilo Excel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-medium">
            Mostrando {sortedData.length} de {data.length} equipos
          </span>
          {sortedData.length > 0 && (
            <button 
              onClick={handleDownloadExcel}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" /> Exportar Excel
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Buscador global */}
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
            <button onClick={() => setGlobalSearch('')} className="text-xs text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
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
              {/* Cabecera de nombres de columnas y ordenación */}
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
                  <div className="flex items-center
