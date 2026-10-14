import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/seed — Siembra datos demo si la base de datos está vacía
export async function GET() {
  try {
    // Comprobar si ya hay datos
    const existingClientes = await db.cliente.count()
    if (existingClientes > 0) {
      return NextResponse.json({ message: 'La base de datos ya contiene datos. Seed omitido.', count: existingClientes })
    }

    // ============================================================
    // 1. CLIENTES
    // ============================================================
    const clientes = await db.$transaction([
      db.cliente.create({
        data: {
          nombre: 'Construcciones y Reformas Levante S.L.',
          nif: 'B-98456120',
          email: 'admin@constrlevante.es',
          telefono: '963 245 871',
          direccion: 'Polígono Fuente del Jarro, nave 14',
          ciudad: 'Valencia',
          codigoPostal: '46011',
          contactoNombre: 'Pedro Martínez Ruiz',
          contactoEmail: 'pmartinez@constrlevante.es',
          contactoTelefono: '600 123 456',
          estado: 'ACTIVO',
          notas: 'Cliente preferente desde 2018. Pagos a 30 días.',
        },
      }),
      db.cliente.create({
        data: {
          nombre: 'Acsa Grup Constructores',
          nif: 'A-08234155',
          email: 'compras@acsagrup.es',
          telefono: '932 471 200',
          direccion: 'Av. Diagonal 405, planta 4',
          ciudad: 'Barcelona',
          codigoPostal: '08008',
          contactoNombre: 'Marta Vidal Sastre',
          contactoEmail: 'mvidal@acsagrup.es',
          contactoTelefono: '666 789 012',
          estado: 'ACTIVO',
          notas: 'Grupo grande con múltiples obras. Solicitar autorización previa para accesos.',
        },
      }),
      db.cliente.create({
        data: {
          nombre: 'Logística Portuario Mediterráneo S.A.',
          nif: 'A-96321584',
          email: 'operaciones@logportmed.es',
          telefono: '964 502 100',
          direccion: 'Muelle de la Aduana, Edif. APV',
          ciudad: 'Valencia',
          codigoPostal: '46024',
          contactoNombre: 'Javier Pons Lladó',
          contactoEmail: 'jpons@logportmed.es',
          contactoTelefono: '655 333 222',
          estado: 'ACTIVO',
          notas: 'Operaciones 24/7. Mantenimientos prioritarios en fin de semana.',
        },
      }),
      db.cliente.create({
        data: {
          nombre: 'Ferrer Logística y Distribución',
          nif: 'B-97123544',
          email: 'info@ferrerlog.es',
          telefono: '971 418 800',
          direccion: 'Polígono Son Castelló, nave 22',
          ciudad: 'Palma de Mallorca',
          codigoPostal: '07009',
          contactoNombre: 'Antonia Salas Miró',
          contactoEmail: 'asalas@ferrerlog.es',
          contactoTelefono: '677 888 999',
          estado: 'ACTIVO',
          notas: '',
        },
      }),
      db.cliente.create({
        data: {
          nombre: 'Hermanos Calvo e Hijos S.R.L.',
          nif: 'B-41287765',
          email: 'admin@calvohijos.es',
          telefono: '976 233 440',
          direccion: 'C/ Manuel Pardo 12',
          ciudad: 'Zaragoza',
          codigoPostal: '50003',
          contactoNombre: 'José Calvo Ballester',
          contactoEmail: 'jcalvo@calvohijos.es',
          contactoTelefono: '688 222 333',
          estado: 'ACTIVO',
          notas: '',
        },
      }),
      db.cliente.create({
        data: {
          nombre: 'Obras Subterráneas Meridional S.A.',
          nif: 'A-91567842',
          email: 'compras@obsubmer.es',
          telefono: '955 124 350',
          direccion: 'Polígono Industrial La Isla, c/ Industria 5',
          ciudad: 'Sevilla',
          codigoPostal: '41010',
          contactoNombre: 'Rocío Cárdenas Peña',
          contactoEmail: 'rcardenas@obsubmer.es',
          contactoTelefono: '699 111 444',
          estado: 'INACTIVO',
          notas: 'Contrato suspendido a petición del cliente. Revisar en Q3 2026.',
        },
      }),
    ])

    // ============================================================
    // 2. EQUIPOS
    // ============================================================
    const hoy = new Date()
    const haceUnAnio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())
    const haceDosAnios = new Date(hoy.getFullYear() - 2, hoy.getMonth(), hoy.getDate())
    const haceTresAnios = new Date(hoy.getFullYear() - 3, hoy.getMonth(), hoy.getDate())
    const haceCincoAnios = new Date(hoy.getFullYear() - 5, hoy.getMonth(), hoy.getDate())

    const equipos = await db.$transaction([
      // Levante — Grúa torre + montacargas
      db.equipo.create({
        data: {
          codigo: 'EQ-001',
          tipo: 'GRUA_TORRE',
          marca: 'Comansa',
          modelo: 'LCC-521-W',
          numeroSerie: 'LCC521W-2019-0456',
          anioFabricacion: 2019,
          ubicacion: 'Obla Nueva de Cullera — Cullera',
          fechaInstalacion: haceDosAnios,
          estado: 'OPERATIVO',
          horasUso: 4820,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 15),
          notas: 'Carga máx. 8.000 kg. Altura 50 m.',
          clienteId: clientes[0].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-002',
          tipo: 'MONTACARGAS_COMBUSTION',
          marca: 'Toyota',
          modelo: '8FGU25',
          numeroSerie: 'TG25-2021-7784',
          anioFabricacion: 2021,
          ubicacion: 'Nave central — Paterna',
          fechaInstalacion: haceUnAnio,
          estado: 'OPERATIVO',
          horasUso: 1240,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 8),
          notas: 'Carretilla diésel 2.500 kg.',
          clienteId: clientes[0].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-003',
          tipo: 'MONTACARGAS_ELECTRICO',
          marca: 'Linde',
          modelo: 'E25 EV',
          numeroSerie: 'LND-E25-2022-1142',
          anioFabricacion: 2022,
          ubicacion: 'Almacén refrigerado — Paterna',
          fechaInstalacion: haceUnAnio,
          estado: 'EN_MANTENIMIENTO',
          horasUso: 856,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 4, 22),
          notas: 'Uso en cámara frigorífica. Batería 48V 750Ah.',
          clienteId: clientes[0].id,
        },
      }),
      // Acsa — Grúa móvil + puente
      db.equipo.create({
        data: {
          codigo: 'EQ-004',
          tipo: 'GRUA_MOVIL',
          marca: 'Tadano',
          modelo: 'GR-700EX',
          numeroSerie: 'TDN-GR700-2020-2233',
          anioFabricacion: 2020,
          ubicacion: 'Obra Sagrera — Barcelona',
          fechaInstalacion: haceTresAnios,
          estado: 'OPERATIVO',
          horasUso: 3120,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 28),
          notas: 'Pluma 7 t. Certificado ITSE 2026 válido.',
          clienteId: clientes[1].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-005',
          tipo: 'GRUA_PUENTE',
          marca: 'GH Cranes',
          modelo: 'MD-Pro 10',
          numeroSerie: 'GH-MD10-2018-9981',
          anioFabricacion: 2018,
          ubicacion: 'Taller central — Llobregat',
          fechaInstalacion: haceCincoAnios,
          estado: 'OPERATIVO',
          horasUso: 8750,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 5, 12),
          notas: 'Pórtico bipolar 10 t. Carril 30 m.',
          clienteId: clientes[1].id,
        },
      }),
      // Logística Portuario — montacargas pesados
      db.equipo.create({
        data: {
          codigo: 'EQ-006',
          tipo: 'MONTACARGAS_COMBUSTION',
          marca: 'Kion',
          modelo: 'STC 120',
          numeroSerie: 'KIO-STC120-2019-3355',
          anioFabricacion: 2019,
          ubicacion: 'Muelle Príncipes — Puerto Valencia',
          fechaInstalacion: haceTresAnios,
          estado: 'OPERATIVO',
          horasUso: 6780,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 3, 5),
          notas: 'Reachstacker 12 t. Uso intensivo en muelle.',
          clienteId: clientes[2].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-007',
          tipo: 'MONTACARGAS_ELECTRICO',
          marca: 'Toyota',
          modelo: '8FBE20',
          numeroSerie: 'TG-8FBE20-2023-5510',
          anioFabricacion: 2023,
          ubicacion: 'Almacén CPA — Puerto Valencia',
          fechaInstalacion: haceUnAnio,
          estado: 'OPERATIVO',
          horasUso: 425,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 18),
          notas: 'Retráctil 2.000 kg. Recién puesto en servicio.',
          clienteId: clientes[2].id,
        },
      }),
      // Ferrer Logística (Mallorca) — grúa móvil + montacargas
      db.equipo.create({
        data: {
          codigo: 'EQ-008',
          tipo: 'GRUA_MOVIL',
          marca: 'Liebherr',
          modelo: 'LTM 1055',
          numeroSerie: 'LBH-LTM1055-2017-4488',
          anioFabricacion: 2017,
          ubicacion: 'Polígono Son Castelló — Palma',
          fechaInstalacion: haceCincoAnios,
          estado: 'OPERATIVO',
          horasUso: 5240,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 6, 3),
          notas: '55 t. Necesita revisión ITSE 4 años.',
          clienteId: clientes[3].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-009',
          tipo: 'MONTACARGAS_COMBUSTION',
          marca: 'Hyster',
          modelo: 'H50FT',
          numeroSerie: 'HYT-H50FT-2020-2210',
          anioFabricacion: 2020,
          ubicacion: 'Nave 22 — Son Castelló',
          fechaInstalacion: haceDosAnios,
          estado: 'FUERA_SERVICIO',
          horasUso: 2840,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 8, 14),
          notas: '5.000 kg diésel. Avería hidráulica en curso. Esperando bomba.',
          clienteId: clientes[3].id,
        },
      }),
      // Calvo Hijos (Zaragoza) — grúa puente + montacargas
      db.equipo.create({
        data: {
          codigo: 'EQ-010',
          tipo: 'GRUA_PUENTE',
          marca: 'Gimález',
          modelo: 'PBP-15',
          numeroSerie: 'GMZ-PBP15-2016-6677',
          anioFabricacion: 2016,
          ubicacion: 'Nave central — Zaragoza',
          fechaInstalacion: haceCincoAnios,
          estado: 'OPERATIVO',
          horasUso: 9120,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 20),
          notas: '15 t, luces 24 m. Próxima inspección reglamentaria 12 meses.',
          clienteId: clientes[4].id,
        },
      }),
      db.equipo.create({
        data: {
          codigo: 'EQ-011',
          tipo: 'MONTACARGAS_ELECTRICO',
          marca: 'Still',
          modelo: 'RX 60-20',
          numeroSerie: 'STL-RX6020-2022-9912',
          anioFabricacion: 2022,
          ubicacion: 'Nave anexa — Zaragoza',
          fechaInstalacion: haceUnAnio,
          estado: 'OPERATIVO',
          horasUso: 920,
          ultimaRevision: new Date(hoy.getFullYear(), hoy.getMonth() - 3, 9),
          notas: '2.000 kg eléctrico. Batería Li-ion 48V.',
          clienteId: clientes[4].id,
        },
      }),
    ])

    // ============================================================
    // 3. CONTRATOS
    // ============================================================
    const enSeisMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 6, hoy.getDate())
    const enTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 3, hoy.getDate())
    const enUnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate())
    const en15Dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 15)
    const enVencido = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate())

    const contratos = await db.$transaction([
      // Levante — contrato anual mixto cubriendo los 3 equipos
      db.contrato.create({
        data: {
          numero: 'CNT-2024-001',
          clienteId: clientes[0].id,
          fechaInicio: haceUnAnio,
          fechaFin: enUnMes,
          tipoMantenimiento: 'MIXTO',
          periodicidadMeses: 3,
          precioAnual: 4280.0,
          precioVisita: 220.0,
          estado: 'ACTIVO',
          fechaProxMantenimiento: en15Dias,
          condiciones: 'Incluye 4 revisiones preventivas anuales y hasta 20 h de correctivo. Fuera de horario +30%.',
          equipos: {
            create: [
              { equipoId: equipos[0].id },
              { equipoId: equipos[1].id },
              { equipoId: equipos[2].id },
            ],
          },
        },
      }),
      // Acsa — preventivo grúa móvil y puente
      db.contrato.create({
        data: {
          numero: 'CNT-2024-002',
          clienteId: clientes[1].id,
          fechaInicio: haceUnAnio,
          fechaFin: enTresMeses,
          tipoMantenimiento: 'PREVENTIVO',
          periodicidadMeses: 6,
          precioAnual: 5680.0,
          precioVisita: 350.0,
          estado: 'ACTIVO',
          fechaProxMantenimiento: enTresMeses,
          condiciones: 'Incluye revisión reglamentaria ITSE. Desplazamientos a obra incluidos en radio 50 km.',
          equipos: {
            create: [
              { equipoId: equipos[3].id },
              { equipoId: equipos[4].id },
            ],
          },
        },
      }),
      // Logística Portuario — intensivo trimestral
      db.contrato.create({
        data: {
          numero: 'CNT-2023-007',
          clienteId: clientes[2].id,
          fechaInicio: haceDosAnios,
          fechaFin: enSeisMeses,
          tipoMantenimiento: 'MIXTO',
          periodicidadMeses: 3,
          precioAnual: 8900.0,
          precioVisita: 180.0,
          estado: 'ACTIVO',
          fechaProxMantenimiento: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 10),
          condiciones: 'Disponibilidad 24/7 con SLA de respuesta 4 h. Penalización 2% si supera SLA.',
          equipos: {
            create: [
              { equipoId: equipos[5].id },
              { equipoId: equipos[6].id },
            ],
          },
        },
      }),
      // Ferrer Logística — solo preventivo
      db.contrato.create({
        data: {
          numero: 'CNT-2025-014',
          clienteId: clientes[3].id,
          fechaInicio: haceUnAnio,
          fechaFin: enVencido,
          tipoMantenimiento: 'PREVENTIVO',
          periodicidadMeses: 6,
          precioAnual: 3200.0,
          precioVisita: 280.0,
          estado: 'VENCIDO',
          fechaProxMantenimiento: null,
          condiciones: 'Renovación pendiente de confirmación por cliente.',
          equipos: {
            create: [
              { equipoId: equipos[7].id },
              { equipoId: equipos[8].id },
            ],
          },
        },
      }),
      // Calvo Hijos — correctivo y preventivo grúa puente
      db.contrato.create({
        data: {
          numero: 'CNT-2025-022',
          clienteId: clientes[4].id,
          fechaInicio: haceUnAnio,
          fechaFin: enSeisMeses,
          tipoMantenimiento: 'PREVENTIVO',
          periodicidadMeses: 4,
          precioAnual: 2850.0,
          precioVisita: 240.0,
          estado: 'ACTIVO',
          fechaProxMantenimiento: new Date(hoy.getFullYear(), hoy.getMonth() + 2, 5),
          condiciones: 'Incluye revisión cables y frenos cada 4 meses.',
          equipos: {
            create: [
              { equipoId: equipos[9].id },
              { equipoId: equipos[10].id },
            ],
          },
        },
      }),
    ])

    // ============================================================
    // 4. TÉCNICOS
    // ============================================================
    const tecnicos = await db.$transaction([
      db.tecnico.create({
        data: {
          nombre: 'Manuel',
          apellidos: 'García Soriano',
          dni: '12345678A',
          especialidad: 'MECANICA',
          email: 'mgarcia@tecnicsa.es',
          telefono: '600 111 222',
          estado: 'ACTIVO',
        },
      }),
      db.tecnico.create({
        data: {
          nombre: 'Rocío',
          apellidos: 'Beltrán Salas',
          dni: '23456789B',
          especialidad: 'HIDRAULICA',
          email: 'rbeltran@tecnicsa.es',
          telefono: '600 333 444',
          estado: 'ACTIVO',
        },
      }),
      db.tecnico.create({
        data: {
          nombre: 'Andrés',
          apellidos: 'López Calatayud',
          dni: '34567890C',
          especialidad: 'ELECTRONICA',
          email: 'alopez@tecnicsa.es',
          telefono: '600 555 666',
          estado: 'ACTIVO',
        },
      }),
      db.tecnico.create({
        data: {
          nombre: 'Cristina',
          apellidos: 'Vega Montiel',
          dni: '45678901D',
          especialidad: 'GENERAL',
          email: 'cvega@tecnicsa.es',
          telefono: '600 777 888',
          estado: 'VACACIONES',
        },
      }),
      db.tecnico.create({
        data: {
          nombre: 'Iván',
          apellidos: 'Ramírez Cifuentes',
          dni: '56789012E',
          especialidad: 'MECANICA',
          email: 'iramirez@tecnicsa.es',
          telefono: '600 999 000',
          estado: 'ACTIVO',
        },
      }),
    ])

    // ============================================================
    // 5. ÓRDENES DE TRABAJO
    // ============================================================
    const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1, 9, 0)
    const en5dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 5, 9, 0)
    const en10dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10, 9, 0)
    const en20dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 20, 9, 0)
    const en25dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 25, 9, 0)
    const hace5dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 5, 9, 0)
    const hace15dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 15, 9, 0)
    const hace30dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30, 9, 0)
    const hace45dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 45, 9, 0)

    await db.$transaction([
      // OT completadas (pasadas)
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-001',
          equipoId: equipos[0].id,
          contratoId: contratos[0].id,
          tecnicoId: tecnicos[0].id,
          tipo: 'PREVENTIVO',
          estado: 'COMPLETADA',
          prioridad: 'MEDIA',
          descripcion: 'Revisión trimestral grúa torre. Verificación cables, frenos y limitadores.',
          observaciones: 'Todo correcto. Sustituido cable auxiliar por desgaste (no facturable).',
          fechaProgramada: hace45dias,
          fechaRealizada: hace45dias,
          horasTrabajadas: 3.5,
          importe: 0,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-002',
          equipoId: equipos[5].id,
          contratoId: contratos[2].id,
          tecnicoId: tecnicos[1].id,
          tipo: 'CORRECTIVO',
          estado: 'COMPLETADA',
          prioridad: 'ALTA',
          descripcion: 'Fuga hidráulica en mástil reachstacker. Sustitución de retenes.',
          observaciones: 'Cambio de retenes cilindro 2. Pendiente relleno aceite hidráulico.',
          fechaProgramada: hace30dias,
          fechaRealizada: hace30dias,
          horasTrabajadas: 6.0,
          importe: 580.0,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-003',
          equipoId: equipos[3].id,
          contratoId: contratos[1].id,
          tecnicoId: tecnicos[4].id,
          tipo: 'PREVENTIVO',
          estado: 'COMPLETADA',
          prioridad: 'MEDIA',
          descripcion: 'Inspección reglamentaria grúa móvil Tadano. Verificación ITSE.',
          observaciones: 'ITSE superada. Próxima inspección en 12 meses.',
          fechaProgramada: hace15dias,
          fechaRealizada: hace15dias,
          horasTrabajadas: 4.0,
          importe: 350.0,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-004',
          equipoId: equipos[8].id,
          tecnicoId: tecnicos[1].id,
          tipo: 'CORRECTIVO',
          estado: 'EN_PROCESO',
          prioridad: 'URGENTE',
          descripcion: 'Avería bomba hidráulica Hyster H50FT. Pendiente recepción de recambio.',
          observaciones: 'Esperando bomba de repuesto. Pedido #PR-2026-118.',
          fechaProgramada: hace5dias,
          fechaRealizada: null,
          horasTrabajadas: 2.5,
          importe: null,
        },
      }),
      // OT programadas (próximas)
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-005',
          equipoId: equipos[0].id,
          contratoId: contratos[0].id,
          tecnicoId: tecnicos[0].id,
          tipo: 'PREVENTIVO',
          estado: 'PROGRAMADA',
          prioridad: 'MEDIA',
          descripcion: 'Mantenimiento trimestral preventivo grúa torre Comansa.',
          observaciones: '',
          fechaProgramada: manana,
          fechaRealizada: null,
          horasTrabajadas: null,
          importe: null,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-006',
          equipoId: equipos[2].id,
          contratoId: contratos[0].id,
          tecnicoId: tecnicos[2].id,
          tipo: 'CORRECTIVO',
          estado: 'PROGRAMADA',
          prioridad: 'ALTA',
          descripcion: 'Fallo intermitente en display Linde E25. Diagnóstico electrónico.',
          observaciones: 'Cliente reporta paradas aleatorias. Posible sensor pedal.',
          fechaProgramada: en5dias,
          fechaRealizada: null,
          horasTrabajadas: null,
          importe: null,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-007',
          equipoId: equipos[4].id,
          contratoId: contratos[1].id,
          tecnicoId: tecnicos[4].id,
          tipo: 'PREVENTIVO',
          estado: 'PROGRAMADA',
          prioridad: 'BAJA',
          descripcion: 'Revisión semestral grúa puente GH. Lubricación y ajustes.',
          observaciones: '',
          fechaProgramada: en10dias,
          fechaRealizada: null,
          horasTrabajadas: null,
          importe: null,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-008',
          equipoId: equipos[5].id,
          contratoId: contratos[2].id,
          tecnicoId: tecnicos[1].id,
          tipo: 'PREVENTIVO',
          estado: 'PROGRAMADA',
          prioridad: 'MEDIA',
          descripcion: 'Mantenimiento trimestral reachstacker Kion. Cambio filtros.',
          observaciones: '',
          fechaProgramada: en20dias,
          fechaRealizada: null,
          horasTrabajadas: null,
          importe: null,
        },
      }),
      db.ordenTrabajo.create({
        data: {
          numero: 'OT-2026-009',
          equipoId: equipos[6].id,
          contratoId: contratos[2].id,
          tecnicoId: tecnicos[3].id,
          tipo: 'PREVENTIVO',
          estado: 'PROGRAMADA',
          prioridad: 'MEDIA',
          descripcion: 'Revisión batería y cargador Toyota 8FBE20.',
          observaciones: '',
          fechaProgramada: en25dias,
          fechaRealizada: null,
          horasTrabajadas: null,
          importe: null,
        },
      }),
    ])

    const counts = {
      clientes: clientes.length,
      equipos: equipos.length,
      contratos: contratos.length,
      tecnicos: tecnicos.length,
      ordenes: 9,
    }

    return NextResponse.json({ message: 'Datos demo sembrados correctamente', counts })
  } catch (error) {
    console.error('Error en seed:', error)
    return NextResponse.json(
      { error: 'Error al sembrar datos demo', detail: String(error) },
      { status: 500 }
    )
  }
}
