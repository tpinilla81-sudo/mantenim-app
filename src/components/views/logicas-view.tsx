'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, CheckCircle2, Sliders } from 'lucide-react';
import { MaintenanceRuleConfig, defaultMaintenanceConfig, getActiveMaintenanceConfig } from '@/lib/maintenance-rules';

export function LogicasView() {
  const [config, setConfig] = useState<MaintenanceRuleConfig>(defaultMaintenanceConfig);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevasHoras, setNuevasHoras] = useState(1000);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    setConfig(getActiveMaintenanceConfig());
  }, []);

  const handleSave = () => {
    localStorage.setItem('mantenim_custom_rules', JSON.stringify(config));
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3500);
  };

  const handleAddModelo = () => {
    if (!nuevoModelo.trim()) return;
    setConfig(prev => ({
      ...prev,
      horasPorRevisionPorModelo: {
        ...prev.horasPorRevisionPorModelo,
        [nuevoModelo.trim()]: Number(nuevasHoras) || 1000
      }
    }));
    setNuevoModelo('');
    setNuevasHoras(1000);
  };

  const handleRemoveModelo = (modeloKey: string) => {
    setConfig(prev => {
      const copy = { ...prev.horasPorRevisionPorModelo };
      delete copy[modeloKey];
      return { ...prev, horasPorRevisionPorModelo: copy };
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Lógicas de Mantenimiento</h2>
          <p className="text-sm text-muted-foreground">
            Configura los parámetros, intervalos de horas estándar y excepciones por modelo.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" /> Guardar Lógicas
        </button>
      </div>

      {savedMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>¡Lógicas guardadas con éxito! Vuelve a la sección de Sincronización para reprocesar los ficheros aplicando estas reglas.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Parámetros Generales */}
        <div className="p-6 bg-card border rounded-lg shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-semibold text-base border-b pb-3">
            <Sliders className="w-5 h-5 text-primary" /> Parámetros Generales
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Intervalo estándar de horas (Máquinas Propias)</label>
            <input
              type="number"
              value={config.horasPorRevisionEstandar}
              onChange={(e) => setConfig({ ...config, horasPorRevisionEstandar: Number(e.target.value) || 1000 })}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground">Número de horas de funcionamiento por defecto entre revisiones.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Meses base para contratos estándar</label>
            <input
              type="number"
              value={config.mesesRevisionesContratoEstandar}
              onChange={(e) => setConfig({ ...config, mesesRevisionesContratoEstandar: Number(e.target.value) || 12 })}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground">Referencia de meses por defecto para contratos de revisión anual.</p>
          </div>
        </div>

        {/* Excepciones por Modelo */}
        <div className="p-6 bg-card border rounded-lg shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-semibold text-base border-b pb-3">
            <Settings className="w-5 h-5 text-primary" /> Intervalos por Modelo Específico
          </div>

          <p className="text-xs text-muted-foreground">
            Añade modelos de máquinas que requieran un intervalo de horas diferente al estándar general.
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: H 20 39X"
                value={nuevoModelo}
                onChange={(e) => setNuevoModelo(e.target.value)}
                className="flex-1 px-3 py-1.5 border rounded-lg text-sm bg-background"
              />
              <input
                type="number"
                placeholder="Horas"
                value={nuevasHoras}
                onChange={(e) => setNuevasHoras(Number(e.target.value))}
                className="w-24 px-3 py-1.5 border rounded-lg text-sm bg-background"
              />
              <button
                type="button"
                onClick={handleAddModelo}
                className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 text-sm font-medium flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Añadir
              </button>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto divide-y">
              {Object.keys(config.horasPorRevisionPorModelo).length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No hay excepciones por modelo configuradas. Se usará el estándar de {config.horasPorRevisionEstandar}h.
                </div>
              ) : (
                Object.entries(config.horasPorRevisionPorModelo).map(([mod, hrs]) => (
                  <div key={mod} className="flex items-center justify-between px-3 py-2 text-xs bg-background hover:bg-muted/50">
                    <div>
                      <span className="font-semibold">{mod}</span>: <span className="font-mono text-primary font-bold">{hrs} horas</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveModelo(mod)}
                      className="text-destructive hover:text-destructive/80 p-1 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogicasView;
