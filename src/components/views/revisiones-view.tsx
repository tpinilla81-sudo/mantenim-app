'use client';

import React, { useState, useEffect } from 'react';

export function RevisionesView() {
  const [items, setItems] = useState<any[]>([]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planificación / Revisiones</h2>
          <p className="text-sm text-muted-foreground">
            Dataset unificado resultante de la última sincronización con Business Central.
          </p>
        </div>
        <div className="text-sm font-medium bg-muted px-3 py-1.5 rounded border">
          Total registros: {items.length}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-12 text-center border rounded-lg bg-card text-muted-foreground">
          <p className="text-base font-medium mb-1">No hay datos de planificación sincronizados.</p>
          <p className="text-sm">Ve a la sección <span className="underline font-semibold">Sincronizar BC</span> para subir los 5 excels y generar los registros.</p>
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
                {items.map((row, idx) => (
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
