'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  EquipoContratoSync,
  STORAGE_CONTRATOS_KEY,
  STORAGE_PLANIFICACION_KEY,
  SYNC_UPDATED_EVENT,
} from './sync-view';

const PAGE_SIZE = 50;

interface FilaPlanificacion extends EquipoContratoSync {
  'Fecha Última Revisión': string;
  'Fecha Próxima Revisión': string;
}

function parseHorasSeguro(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === undefined || val === null) return 0;
  const raw = String(val).trim();
  if (!raw) return 0;
  let cleaned = raw.replace(/\s+/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizarFila(raw: any, index: number): FilaPlanificacion {
  const nProd = String(
    raw?.['Nº prod. servicio'] ??
      raw?.nProductoServicio ??
      raw?.producto ??
      raw?.prod ??
      ''
  ).trim();

  const nContrato = String(
    raw?.['Nº Contrato'] ??
      raw?.nContrato ??
      raw?.contrato ??
      ''
  ).trim();

  const horasRaw =
    raw?.['Nº de horas'] ??
    raw?.['Nº horas'] ??
    raw?.horas ??
    raw?.contador ??
    0;

  const fechaUltimaRaw =
    raw?.['Fecha Última Revisión'] ??
    raw?.['Fecha última revisión'] ??
    raw?.['Fecha de la última revisión'] ??
    raw?.fechaUltimaRevision ??
    '';

  const fechaProximaRaw =
    raw?.['Fecha Próxima Revisión'] ??
    raw?.['Fecha próxima revisión'] ??
    raw?.fechaProximaRevision ??
    '';

  return {
    'Nº prod. servicio': nProd || '-',
    'Nº Contrato': nContrato || '-',
    'Nº Serie': String(raw?.['Nº Serie'] ?? raw?.nSerie ?? raw?.serie ?? 'N/A').trim() || 'N/A',
    'Modelo': String(raw?.['Modelo'] ?? raw?.modelo ?? 'N/A').trim() || 'N/A',
    'Nº de horas': parseHorasSeguro(horasRaw),
    'Sucursal': String(raw?.['Sucursal'] ?? raw?.sucursal ?? 'N/A').trim() || 'N/A',
    'Cliente Propietario':
      String(
        raw?.['Cliente Propietario'] ??
          raw?.['Nombre Cliente Propietario'] ??
          raw?.clientePropietario ??
          'N/A'
      ).trim() || 'N/A',
    'Nombre Cliente Ubicación':
      String(
        raw?.['Nombre Cliente Ubicación'] ??
          raw?.['Cliente Ubicación'] ??
          raw?.clienteUbicacion ??
          'N/A'
      ).trim() || 'N/A',
    'Fecha Última Revisión': String(fechaUltimaRaw ?? '').trim(),
    'Fecha Próxima Revisión': String(fechaProximaRaw ?? '').trim(),
    idUnico: String(raw?.idUnico ?? `${index}_${nProd}`).trim(),
  };
}

export function PlanificacionView() {
  const [equipos, setEquipos] = useState<FilaPlanificacion[]>([]);
  const [page, setPage] = useState(1);

  const [filtroGlobal, setFiltroGlobal] = useState('');
  const [filtroProd, setFiltroProd] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroSerie, setFiltroSerie] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroHoras, setFiltroHoras] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [filtroPropietario, setFiltroPropietario] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');
  const [filtroFechaUltima, setFiltroFechaUltima] = useState('');
  const [filtroFechaProxima, setFiltroFechaProxima] = useState('');

  const cargarDatos = () => {
    try {
      const raw =
        localStorage.getItem(STORAGE_CONTRATOS_KEY) ||
        localStorage.getItem(STORAGE_PLANIFICACION_KEY);

      if (!raw) {
        setEquipos([]);
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalizados = parsed
          .map((item, i) => normalizarFila(item, i))
          .filter((row) => row['Nº prod. servicio'] !== '-' && row['Nº Contrato'] !== '-');
        setEquipos(normalizados);
        setPage(1);
      } else {
        setEquipos([]);
      }
    } catch (err) {
      console.error('Error cargando equipos en Planificación / Revisiones:', err);
      setEquipos([]);
    }
  };

  useEffect(() => {
    cargarDatos();

    const handleSyncUpdate = () => cargarDatos();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        cargarDatos();
      }
    };

    window.addEventListener('storage', handleSyncUpdate);
    window.addEventListener(SYNC_UPDATED_EVENT, handleSyncUpdate);
    window.addEventListener('focus', handleSyncUpdate);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleSyncUpdate);
      window.removeEventListener(SYNC_UPDATED_EVENT, handleSyncUpdate);
      window.removeEventListener('focus', handleSyncUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const filtrados = useMemo(() => {
    return equipos.filter((item) => {
      if (
        filtroProd.trim() &&
        !item['Nº prod. servicio'].toLowerCase().includes(filtroProd.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroContrato.trim() &&
        !item['Nº Contrato'].toLowerCase().includes(filtroContrato.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroSerie.trim() &&
        !item['Nº Serie'].toLowerCase().includes(filtroSerie.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroModelo.trim() &&
        !item['Modelo'].toLowerCase().includes(filtroModelo.trim().toLowerCase())
      ) {
        return false;
      }
      if (filtroHoras.trim()) {
        const horasFormateadas = item['Nº de horas'].toLocaleString('es-ES');
        const horasCrudas = String(item['Nº de horas']);
        const qHoras = filtroHoras.trim().toLowerCase();
        if (
          !horasCrudas.toLowerCase().includes(qHoras) &&
          !horasFormateadas.toLowerCase().includes(qHoras)
        ) {
          return false;
        }
      }
      if (
        filtroSucursal.trim() &&
        !item['Sucursal'].toLowerCase().includes(filtroSucursal.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroPropietario.trim() &&
        !item['Cliente Propietario'].toLowerCase().includes(filtroPropietario.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroUbicacion.trim() &&
        !item['Nombre Cliente Ubicación']
          .toLowerCase()
          .includes(filtroUbicacion.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroFechaUltima.trim() &&
        !item['Fecha Última Revisión']
          .toLowerCase()
          .includes(filtroFechaUltima.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        filtroFechaProxima.trim() &&
        !item['Fecha Próxima Revisión']
          .toLowerCase()
          .includes(filtroFechaProxima.trim().toLowerCase())
      ) {
        return false;
      }
      if (filtroGlobal.trim()) {
        const q = filtroGlobal.trim().toLowerCase();
        const coincide = Object.entries(item)
          .filter(([k]) => k !== 'idUnico')
          .some(([, val]) => String(val ?? '').toLowerCase().includes(q));
        if (!coincide) return false;
      }
      return true;
    });
  }, [
    equipos,
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroHoras,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
    filtroFechaUltima,
    filtroFechaProxima,
    filtroGlobal,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    filtroProd,
    filtroContrato,
    filtroSerie,
    filtroModelo,
    filtroHoras,
    filtroSucursal,
    filtroPropietario,
    filtroUbicacion,
    filtroFechaUltima,
    filtroFechaProxima,
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
      filtroHoras.trim() ||
      filtroSucursal.trim() ||
      filtroPropietario.trim() ||
      filtroUbicacion.trim() ||
      filtroFechaUltima.trim() ||
      filtroFechaProxima.trim()
  );

  const limpiarFiltros = () => {
    setFiltroGlobal('');
    setFiltroProd('');
    setFiltroContrato('');
    setFiltroSerie('');
    setFiltroModelo('');
    setFiltroHoras('');
    setFiltroSucursal('');
    setFiltroPropietario('');
    setFiltroUbicacion('');
    setFiltroFechaUltima('');
    setFiltroFechaProxima('');
  };

  const exportarExcel = () => {
    if (filtrados.length === 0) return;
    const rowsExport = filtrados.map(({ idUnico, ...rest }) => ({
      'Nº Prod. Servicio': rest['Nº prod. servicio'],
      'Nº Contrato': rest['Nº Contrato'],
      'Nº Serie': rest['Nº Serie'],
      'Modelo': rest['Modelo'],
      'Nº de horas': rest['Nº de horas'],
      'Sucursal': rest['Sucursal'],
      'Cliente Propietario': rest['Cliente Propietario'],
      'Nombre Cliente Ubicación': rest['Nombre Cliente Ubicación'],
      'Fecha Última Revisión': rest['Fecha Última Revisión'],
      'Fecha Próxima Revisión': rest['Fecha Próxima Revisión'],
    }));
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws,
                                 
