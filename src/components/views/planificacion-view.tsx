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
  STORAGE_TAREA_KEY,
  STORAGE_PEDIDOS_KEY,
  SYNC_UPDATED_EVENT,
} from './sync-view';

const PAGE_SIZE = 50;

interface FilaPlanificacion extends EquipoContratoSync {
  esPropia: boolean;
  tieneContrato: boolean;
  revisionesAnuales: number | null;
  horasPorDia: number | null;
  'Fecha Última Revisión': string;
  'Fecha Próxima Revisión': string;
}

function normalizarId(val: any): string {
  if (val === undefined || val === null) return '';
  let s = String(val).trim();
  if (!s) return '';
  if (/^\d+\.0$/.test(s)) {
    s = s.replace(/\.0$/, '');
  }
  const sinCeros = s.replace(/^0+/, '');
  return sinCeros || (s === '0' ? '0' : '');
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

function parseBooleano(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val ?? '').trim().toLowerCase();
  return (
    s === 'true' ||
    s === 'sí' ||
    s === 'si' ||
    s === '1' ||
    s === 'yes' ||
    s === 'verdadero'
  );
}

function parseFecha(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }
  const s = String(val).trim();
  if (!s || s === '—' || s === '-') return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(dt.getTime())) return dt;
  }
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) {
    return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  }
  return null;
}

function formatDDMMYYYY(dt: Date): string {
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMiles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface AuxUltimasRevisiones {
  porProd: Record<string, string>;
  porCliente: Record<string, string>;
}

function leerAuxiliaresUltimaRevision(): AuxUltimasRevisiones {
  const porProd: Record<string, string> = {};
  const porCliente: Record<string, string> = {};

  const actualizarMax = (mapa: Record<string, string>, clave: string, dt: Date | null) => {
    if (!clave || !dt) return;
    const prevDt = parseFecha(mapa[clave]);
    if (!prevDt || dt.getTime() > prevDt.getTime()) {
      mapa[clave] = formatDDMMYYYY(dt);
    }
  };

  try {
    const rawTarea = localStorage.getItem(STORAGE_TAREA_KEY);
    if (rawTarea) {
      const arr = JSON.parse(rawTarea);
      if (Array.isArray(arr)) {
        for (const r of arr) {
          const pn = normalizarId(
            r?.['Nº prod. servicio'] ?? r?.['Nº producto'] ?? r?.producto
          );
          const dt = parseFecha(
            r?.['Fecha finalización'] ?? r?.['Fecha Pedido'] ?? r?.fecha
          );
          actualizarMax(porProd, pn, dt);
        }
      }
    }

    const rawPed = localStorage.getItem(STORAGE_PEDIDOS_KEY);
    if (rawPed) {
      const arr = JSON.parse(rawPed);
      if (Array.isArray(arr)) {
        for (const r of arr) {
          const desc = String(r?.['Descripción'] ?? r?.descripcion ?? '').trim();
          const dt = parseFecha(
            r?.['Fecha finalización'] ?? r?.['Fecha inicial'] ?? r?.fecha
          );
          const matchNum = desc.match(/^\s*0*(\d+)\b/);
          if (matchNum) {
            actualizarMax(porProd, normalizarId(matchNum[1]), dt);
          }
          if (/revisi[óo]n\s*cliente/i.test(desc)) {
            const cli = String(r?.['Nombre'] ?? r?.['Nombre Cliente'] ?? '')
              .trim()
              .toUpperCase();
            actualizarMax(porCliente, cli, dt);
          }
        }
      }
    }
  } catch {
    // ignorar errores de lectura en localStorage
  }

  return { porProd, porCliente };
}

function calcularProximaRevision(
  esPropia: boolean,
  horas: number,
  horasPorDia: number | null,
  fechaUltimaStr: string,
  revisionesAnuales: number | null,
  fechaReferenciaCliente: Date
): string {
  if (esPropia) {
    const hitoHoras = (Math.floor(Math.max(0, horas) / 1000) + 1) * 1000;
    const horasRestantes = Math.max(0, hitoHoras - horas);

    if (horasPorDia && horasPorDia > 0 && horasRestantes > 0) {
      const diasEstimados = Math.ceil(horasRestantes / horasPorDia);
      const fechaEst = new Date(
        fechaReferenciaCliente.getFullYear(),
        fechaReferenciaCliente.getMonth(),
        fechaReferenciaCliente.getDate() + diasEstimados
      );
      return `${formatDDMMYYYY(fechaEst)} (${formatMiles(hitoHoras)} h)`;
    }

    return `${formatMiles(hitoHoras)} h (faltan ${formatMiles(horasRestantes)} h)`;
  }

  const fechaUltima = parseFecha(fechaUltimaStr);
  const revAnuales =
    revisionesAnuales && revisionesAnuales > 0 ? revisionesAnuales : null;

  if (!fechaUltima || !revAnuales) {
    return revAnuales ? `${revAnuales}/año` : '—';
  }

  const diasIntervalo = Math.max(1, Math.round(365 / revAnuales));
  const proxima = new Date(
    fechaUltima.getFullYear(),
    fechaUltima.getMonth(),
    fechaUltima.getDate() + diasIntervalo
  );
  return formatDDMMYYYY(proxima);
}

function normalizarFila(
  raw: any,
  index: number,
  aux: AuxUltimasRevisiones,
  fechaReferenciaCliente: Date
): FilaPlanificacion | null {
  const nProd = String(
    raw?.['Nº prod. servicio'] ??
      raw?.nProductoServicio ??
      raw?.producto ??
      raw?.prod ??
      ''
  ).trim();

  const prodNorm = normalizarId(nProd);

  const nContrato = String(
    raw?.['Nº Contrato'] ?? raw?.nContrato ?? raw?.contrato ?? ''
  ).trim();

  const esPropia = parseBooleano(
    raw?.['Es propia'] ?? raw?.esPropia ?? raw?.propia ?? false
  );

  const tieneContrato =
    Boolean(nContrato && nContrato !== '-' && nContrato.toUpperCase() !== 'N/A') ||
    parseBooleano(raw?.tieneContrato ?? false);

  if (!esPropia && !tieneContrato) {
    return null;
  }

  const horas = parseHorasSeguro(
    raw?.['Nº de horas'] ??
      raw?.['Nº horas'] ??
      raw?.horas ??
      raw?.contador ??
      0
  );

  const clientePropietario =
    String(
      raw?.['Cliente Propietario'] ??
        raw?.['Nombre Cliente Propietario'] ??
        raw?.clientePropietario ??
        'N/A'
    ).trim() || 'N/A';

  const nombreClienteUbicacion =
    String(
      raw?.['Nombre Cliente Ubicación'] ??
        raw?.['Cliente Ubicación'] ??
        raw?.clienteUbicacion ??
        'N/A'
    ).trim() || 'N/A';

  const candidatosFecha: Date[] = [];

  const fFila = parseFecha(
    raw?.['Fecha Última Revisión'] ??
      raw?.['Fecha última revisión'] ??
      raw?.['Fecha de la última revisión'] ??
      raw?.fechaUltimaRevision ??
      ''
  );
  if (fFila) candidatosFecha.push(fFila);

  if (prodNorm && aux.porProd[prodNorm]) {
    const fAuxProd = parseFecha(aux.porProd[prodNorm]);
    if (fAuxProd) candidatosFecha.push(fAuxProd);
  }

  if (!esPropia) {
    for (const c of [clientePropietario, nombreClienteUbicacion]) {
      const key = c.trim().toUpperCase();
      if (key && key !== 'N/A' && aux.porCliente[key]) {
        const fAuxCli = parseFecha(aux.porCliente[key]);
        if (fAuxCli) candidatosFecha.push(fAuxCli);
      }
    }
  }

  const fechaUltimaMax =
    candidatosFecha.length > 0
      ? candidatosFecha.reduce((max, cur) =>
          cur.getTime() > max.getTime() ? cur : max
        )
      : null;

  const fechaUltima = fechaUltimaMax ? formatDDMMYYYY(fechaUltimaMax) : '';

  const revRaw =
    raw?.['Nº REVISIONES ANUALES'] ??
    raw?.['Nº revisiones anuales'] ??
    raw?.revisionesAnuales ??
    null;
  const revNum =
    revRaw !== null && revRaw !== '' && !isNaN(Number(revRaw))
      ? Number(revRaw)
      : null;

  const horasPorDia =
    raw?.horasPorDia !== undefined &&
    raw?.horasPorDia !== null &&
    !isNaN(Number(raw.horasPorDia)) &&
    Number(raw.horasPorDia) > 0
      ? Number(raw.horasPorDia)
      : null;

  const fechaProximaCalculada = calcularProximaRevision(
    esPropia,
    horas,
    horasPorDia,
    fechaUltima,
    revNum,
    fechaReferenciaCliente
  );

  const fechaProxima =
    fechaProximaCalculada !== '—'
      ? fechaProximaCalculada
      : String(
          raw?.['Fecha Próxima Revisión'] ??
            raw?.['Fecha próxima revisión'] ??
            raw?.fechaProximaRevision ??
            '—'
        ).trim() || '—';

  return {
    'Nº prod. servicio': nProd || '-',
    'Nº Contrato': nContrato || (esPropia ? 'PROPIA' : '-'),
    'Nº Serie':
      String(raw?.['Nº Serie'] ?? raw?.nSerie ?? raw?.serie ?? 'N/A').trim() ||
      'N/A',
    'Modelo':
      String(raw?.['Modelo'] ?? raw?.modelo ?? 'N/A').trim() || 'N/A',
    'Nº de horas': horas,
    'Sucursal':
      String(raw?.['Sucursal'] ?? raw?.sucursal ?? 'N/A').trim() || 'N/A',
    'Cliente Propietario': clientePropietario,
    'Nombre Cliente Ubicación': nombreClienteUbicacion,
    esPropia,
    tieneContrato,
    revisionesAnuales: revNum,
    horasPorDia,
