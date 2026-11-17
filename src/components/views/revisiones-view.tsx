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
  horas: string;
}

export function RevisionesView() {
  const [items, setItems] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Filtros totales e independientes por cada una de las 6 columnas
  const [colFilters, setColFilters] = useState<ColumnFilters>({
    serie: '',
    modelo: '',
    contrato: '',
    propietario: '',
    ubicacion: '',
    horas: '',
  });

  // Ordenación
  const [sortField, setSortField] = useState<string>('Nº Serie');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Renderizado continuo (sin páginas, carga progresiva al hacer scroll)
  const [visibleCount, setVisibleCount] = useState(300);
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

  // Listas de valores únicos para los desplegables de filtro por columna
  const uniqueValues = useMemo(() => {
    const series = new Set<string>();
    const modelos = new Set<string>();
    const contratos = new Set<string>();
    const propietarios = new Set<string>();
    const ubicaciones = new Set<string>();
    const horasSet = new Set<string>();

    items.forEach(row => {
      const serie = String(row['Nº Serie'] || row['Nº prod. servicio'] || '');
      const modelo = String(row['Modelo'] || '');
      const contrato = String(row['Nº Contrato'] || '');
      const prop = String(row['Nombre Cliente Propietario'] || row['Nombre'] || '');
      const ubica = String(row['Nombre Cliente Ubicación'] || '');
      const hrs = String(row['Nº de horas'] ?? '');

      if (serie) series.add(serie);
      if (modelo) modelos.add(modelo);
      if (contrato) contratos.add(contrato);
      if (prop) propietarios.add(prop);
      if (ubica) ubicaciones.add(ubica);
      if (hrs !== '') horasSet.add(hrs);
    });

    return {
      series: Array.from(series).sort(),
      modelos: Array.from(modelos).sort(),
      contratos: Array.from(contratos).sort(),
      propietarios: Array.from(propietarios).sort(),
      ubicaciones: Array.from(ubicaciones).sort(),
      horas: Array.from(horasSet).sort((a, b) => Number(a) - Number(b)),
    };
  }, [items]);

  // Filtrado total combinado (Búsqueda global + 6 filtros independientes por columna) y Ordenación
  const filteredAndSortedItems = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSerie = colFilters.serie.toLowerCase().trim();
    const qModelo = colFilters.modelo.toLowerCase().trim();
    const qContrato = colFilters.contrato.toLowerCase().trim();
    const qProp = colFilters.propietario.toLowerCase().trim();
    const qUbica = colFilters.ubicacion.toLowerCase().trim();
    const qHoras = colFilters.horas.trim();

    const filtered = items.filter(row => {
      const serie = String(row['Nº Serie'] || row['Nº prod. servicio'] || '');
      const modelo = String(row['Modelo'] || '');
      const contrato = String(row['Nº Contrato'] || '');
      const propietario = String(row['Nombre Cliente Propietario'] || row['Nombre'] || '');
      const ubicacion = String(row['Nombre Cliente Ubicación'] || '');
      const horas = String(row['Nº de horas'] ?? '');

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

      // 2. Filtros totales independientes por columna tipo Excel
      if (qSerie && !serie.toLowerCase().includes(qSerie)) return false;
      if (qModelo && !modelo.toLowerCase().includes(qModelo)) return false;
      if (qContrato && !contrato.toLowerCase().includes(qContrato)) return false;
      if (qProp && !propietario.toLowerCase().includes(qProp)) return false;
      if (qUbica && !ubicacion.toLowerCase().includes(qUbica)) return false;
      if (qHoras && horas !== qHoras) return false;

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

  // Reiniciar scroll continuo al filtrar
  useEffect(() => {
    setVisibleCount(300);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [globalSearch, colFilters, sortField, sortDirection]);

  // Carga progresiva al hacer scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 400) {
      setVisibleCount(prev => Math.min(prev + 300, filteredAndSortedItems.length));
    }
  };

  const handleSort = (
