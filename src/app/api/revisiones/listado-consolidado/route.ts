import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/revisiones/listado-consolidado
//
// Devuelve el listado consolidado que aparece en la sección REVISIONES
// según el flujo: productos de servicio con contrato vigente + fechas.
//
// Por cada equipo con codigoProductoBC:
//   - Nº producto servicio (codigoProductoBC)
//   - Nº serie
//   - Descripción (marca + modelo)
//   - Cliente
//   - Nº contrato vigente (contratoActivoId, poblado por cross-check Excel 3)
//   - Tipo contrato (codGrupoContrato de la LineaContrato firmada con mismo
//     numeroProductoServicio)
//   - Fecha inicio contrato (de la LineaContrato)
//   - Fecha fin contrato (de la LineaContrato)
//   - Fecha última revisión (ultimaRevision del equipo, poblada por Excel 4
//     o pedidos de servicio)
//   - Horas uso actuales
//   - Próxima revisión fecha (proximaRevisionFecha, calculada por Lógicas)
//   - Próxima revisión horas (proximaRevisionHoras)
//   - Tipo revisión (POR_CONTRATO | POR_HORAS)
//   - Estado del equipo
//
// Parámetros:
//   ?soloConContrato=true — filtra solo equipos con contratoActivoId no vacío
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const soloConContrato = searchParams.get('soloConContrato') === 'true'
    const limit = Math.min(Number(searchParams.get('limit') || '20000'), 50000)

    // Cargar equipos
    const where: Record<string, unknown> = {}
    if (soloConContrato) {
      where.contratoActivoId = { not: null }
    }
    const equipos = await db.equipo.findMany({
      where,
      select: {
        id: true,
        codigo: true,
        codigoProductoBC: true,
        numeroSerie: true,
        marca: true,
        modelo: true,
        clienteId: true,
        cliente: { select: { id: true, nombre: true } },
        contratoActivoId: true,
        tipoRevision: true,
        ultimaRevision: true,
        proximaRevisionFecha: true,
        proximaRevisionHoras: true,
        horasUso: true,
        estado: true,
        esMaquinaPropia: true,
        ubicacion: true,
        revisionesContratadasAnual: true,
      },
      orderBy: { codigoProductoBC: 'asc' },
      take: limit,
    })

    // Cargar líneas firmadas agrupadas por numeroProductoServicio
    // para obtener tipo contrato + fechas inicio/fin
    const lineasFirmadas = await db.lineaContrato.findMany({
      where: {
        estadoContrato: { contains: 'Firmado', mode: 'insensitive' },
        numeroProductoServicio: { not: '' },
      },
      select: {
        numeroProductoServicio: true,
        numeroContrato: true,
        codGrupoContrato: true,
        fechaInicioContrato: true,
        fechaFinContrato: true,
        periodoServicio: true,
        siguienteFechaServicio: true,
      },
    })

    // Índice: numeroProductoServicio → primera línea firmada
    const productoALinea = new Map<
      string,
      {
        numeroContrato: string
        codGrupoContrato: string | null
        fechaInicioContrato: Date | null
        fechaFinContrato: Date | null
        periodoServicio: string | null
      }
    >()
    for (const lf of lineasFirmadas) {
      const prod = (lf.numeroProductoServicio || '').trim()
      if (!prod) continue
      if (!productoALinea.has(prod)) {
        productoALinea.set(prod, {
          numeroContrato: lf.numeroContrato,
          codGrupoContrato: lf.codGrupoContrato,
          fechaInicioContrato: lf.fechaInicioContrato,
          fechaFinContrato: lf.fechaFinContrato,
          periodoServicio: lf.periodoServicio,
        })
      }
    }

    // Join: para cada equipo, buscar su línea firmada por codigoProductoBC
    const listado = equipos
      .filter((eq) => eq.codigoProductoBC) // solo equipos con producto BC
      .map((eq) => {
        const linea = productoALinea.get(eq.codigoProductoBC || '')
        return {
          id: eq.id,
          numeroProductoServicio: eq.codigoProductoBC,
          codigo: eq.codigo,
          numeroSerie: eq.numeroSerie,
          descripcion: `${eq.marca || ''} ${eq.modelo || ''}`.trim(),
          cliente: eq.cliente?.nombre || null,
          contratoVigente: eq.contratoActivoId || null,
          tipoContrato: linea?.codGrupoContrato || null,
          fechaInicioContrato: linea?.fechaInicioContrato || null,
          fechaFinContrato: linea?.fechaFinContrato || null,
          periodoServicio: linea?.periodoServicio || null,
          ultimaRevision: eq.ultimaRevision,
          proximaRevisionFecha: eq.proximaRevisionFecha,
          proximaRevisionHoras: eq.proximaRevisionHoras,
          horasUso: eq.horasUso,
          tipoRevision: eq.tipoRevision,
          estado: eq.estado,
          esMaquinaPropia: eq.esMaquinaPropia,
          ubicacion: eq.ubicacion,
          revisionesContratadasAnual: eq.revisionesContratadasAnual,
          tieneContratoVigente: !!eq.contratoActivoId,
        }
      })

    return NextResponse.json({
      data: listado,
      total: listado.length,
      conContratoVigente: listado.filter((l) => l.tieneContratoVigente).length,
      sinContratoVigente: listado.filter((l) => !l.tieneContratoVigente).length,
    })
  } catch (err) {
    console.error('GET /api/revisiones/listado-consolidado error:', err)
    return NextResponse.json(
      { error: 'Error al obtener listado consolidado', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
