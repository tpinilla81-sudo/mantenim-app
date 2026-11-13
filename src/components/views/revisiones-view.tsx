'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';

export function RevisionesView() {
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState('ALL');

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

  // Extraer lista única de clientes para el filtro avanzado
  const uniqueClients = useMemo(() => {
    const clients = new Set<string>();
    items.forEach(row => {
      const client = row['Nombre Cliente Propietario'] || row['Nombre'];
      if (client) clients.add(client);
    });
    return Array.from(clients).sort();
  }, [items]);

  // Filtrado en tiempo real
  const filteredItems = useMemo(() => {
    return items.filter(row => {
      const serie = String(row['Nº Serie'] || row['Nº prod. servicio'] || '').toLowerCase();
      const modelo = String(row['Modelo'] || '').toLowerCase();
      const contrato = String(row['Nº Contrato'] || '').toLowerCase();
      const cliente = String(row['Nombre Cliente Propietario'] || row['Nombre'] || '').toLowerCase();
      const ubicacion = String(row['Nombre Cliente Ubicación'] || '').toLowerCase();

      const query = searchTerm.toLowerCase();
      const matchesSearch = 
        serie.includes(query) || 
        modelo.includes(query) || 
        contrato.includes(query) || 
        cliente.includes(query) ||
        ubicacion.includes(query);

      const rowClient = row['Nombre Cliente Propietario'] || row['Nombre'];
      const matchesClient = selectedClient === 'ALL' || rowClient === selectedClient;

      return matchesSearch && matchesClient;
    });
  }, [items, searchTerm, selectedClient]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Dataset unificado resultante de la última sincronización con Business Central.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium bg-muted px-3 py-1.5 rounded border">
            Mostrando: <span className="font-bold">{filteredItems.length}</span> de {items.length} registros
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 border rounded-lg shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por Nº de Serie, Modelo, Contrato, Cliente o Ubicación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          
          <div className="sm:w-72">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full py-2 px-3 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Todos los clientes ({uniqueClients.length})</option>
              {uniqueClients.map((client, idx) => (
                <option key={idx} value={client}>{client}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center border rounded-lg bg-card text-muted-foreground">
          <p className="text-base font-medium mb-1">No hay datos de planificación sincronizados.</p>
          <p className="text-sm">Ve a la sección <span className="underline font-semibold">Sincronizar BC</span> para subir los 5 excels y generar los registros.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center border rounded-lg bg-card text-muted-foreground">
          <p className="text-base font-medium mb-1">Ningún registro coincide con los filtros de búsqueda.</p>
          <button 
            onClick={() => { setSearchTerm(''); setSelectedClient('ALL'); }}
            className="mt-3 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="p-3">Nº Serie</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3">Nº Contrato</th>
                  <th className="p-3">Cliente Propietario</th>
                  <th className="p-3">Ubicación</th>
                  <th className="p-3">Nº Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/50 transition-colors">
                    <td className="p-3 font-medium">{row['Nº Serie'] || row['Nº prod. servicio'] || 'N/A'}</td>
                    <td className="p-3">{row['Modelo'] || 'N/A'}</td>
                    <td className="p-3">{row['Nº Contrato'] || 'N/A'}</td>
                    <td className="p-3">{row['Nombre Cliente Propietario'] || row['Nombre'] || 'N/A'}</td>
                    <td className="p-3">{row['Nombre Cliente Ubicación'] || 'N/A'}</td>
                    <td className="p-3">{row['Nº de horas'] || '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default RevisionesView;
