'use client';

import React, { useState, useEffect } from 'react';
import { Search, ArrowUpDown, FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export function RevisionesView() {
  const [data, setData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredData = data.filter((row) => {
    const searchString = searchTerm.toLowerCase();
    return Object.values(row).some((val) => 
      String(val || '').toLowerCase().includes(searchString)
    );
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Listado unificado con fechas de revisión calculadas por contrato y por horas reales.
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

      <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-sm max-w-md">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Buscar por contrato, cliente, modelo, sucursal..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-sm focus:outline-none"
        />
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
                <th className="p-3 text-emerald-700 cursor-pointer hover:bg-emerald-50/50" onClick={() => handleSort('Fecha Próxima Revisión')}>
                  <div className="flex items-center gap-1">Próxima Revisión <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nombre Cliente Propietario')}>
                  <div className="flex items-center gap-1">Cliente Propietario <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort('Nº de horas')}>
                  <div className="flex items-center gap-1">Horas / Tipo <ArrowUpDown className="w-3 h-3" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No hay datos cargados o no coinciden con la búsqueda. Ve a <span className="font-semibold text-foreground">Sincronizar BC</span> para procesar los ficheros.
                  </td>
                </tr>
              ) : (
                sortedData.slice(0, 150).map((row, idx) => (
                  <tr key={row.idUnico || idx} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{String(row['Nº prod. servicio'] || '')}</td>
                    <td className="p-3 text-muted-foreground">{String(row['Nº Serie'] || '')}</td>
                    <td className="p-3">{String(row['Modelo'] || '')}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs font-semibold">
                        {String(row['Sucursal'] || '')}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs font-semibold text-primary">{String(row['Nº Contrato'] || '')}</td>
                    <td className="p-3 font-bold text-emerald-700 bg-emerald-50/30">
                      {String(row['Fecha Próxima Revisión'] || '')}
                    </td>
                    <td className="p-3 truncate max-w-[200px]">{String(row['Nombre Cliente Propietario'] || '')}</td>
                    <td className="p-3">
                      <div className="text-xs flex items-center gap-1.5">
                        <span className="font-semibold">{row['Nº de horas']} h</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${row['Tipo Registro'] === 'Contratado' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
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
