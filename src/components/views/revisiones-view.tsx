'use client';

import React, { useState, useEffect } from 'react';
import { Search, Calendar, FileSpreadsheet, ShieldAlert } from 'lucide-react';

export function RevisionesView() {
  const [data, setData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredData = data.filter((row) => {
    const searchString = searchTerm.toLowerCase();
    return Object.values(row).some((val) => 
      String(val || '').toLowerCase().includes(searchString)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Listado unificado de equipos con contrato y máquinas propias con fechas calculadas.
          </p>
        </div>
        <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-medium">
          Mostrando {filteredData.length} de {data.length} equipos
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-sm max-w-md">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Búsqueda rápida global..."
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
                <th className="p-3">Nº Prod. Servicio</th>
                <th className="p-3">Nº Serie</th>
                <th className="p-3">Modelo</th>
                <th className="p-3">Sucursal</th>
                <th className="p-3">Nº Contrato</th>
                <th className="p-3 text-emerald-700">Próxima Revisión</th>
                <th className="p-3">Cliente Propietario</th>
                <th className="p-3">Horas / Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No hay datos cargados o no coinciden con la búsqueda. Ve a la pestaña <span className="font-semibold text-foreground">Sincronizar BC</span> para procesar los ficheros.
                  </td>
                </tr>
              ) : (
                filteredData.slice(0, 100).map((row, idx) => (
                  <tr key={row.idUnico || idx} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{String(row['Nº prod. servicio'] || '')}</td>
                    <td className="p-3 text-muted-foreground">{String(row['Nº Serie'] || '')}</td>
                    <td className="p-3">{String(row['Modelo'] || '')}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs font-semibold">
                        {String(row['Sucursal'] || '')}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{String(row['Nº Contrato'] || '')}</td>
                    <td className="p-3 font-bold text-emerald-700 bg-emerald-50/30">
                      {String(row['Fecha Próxima Revisión'] || '')}
                    </td>
                    <td className="p-3 truncate max-w-[200px]">{String(row['Nombre Cliente Propietario'] || '')}</td>
                    <td className="p-3">
                      <div className="text-xs">
                        <span className="font-semibold">{row['Nº de horas']} h</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-muted uppercase">
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
