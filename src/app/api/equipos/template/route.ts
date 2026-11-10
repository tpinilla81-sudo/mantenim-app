import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// GET /api/equipos/template — Descarga una plantilla Excel para cargar equipos
export async function GET() {
  try {
    // Crear el workbook
    const wb = XLSX.utils.book_new()

    // ============================================================
    // Hoja 1: EQUIPOS (plantilla con columnas + 1 fila de ejemplo)
    // ============================================================
    const headers = [
      'Nº prod. servicio',
      'Descripción',
      'Nº Serie',
      'Nº de horas',
      'Nº Contrato',
      'Estado contrato',
      'Cliente',
      'Nombre',
      'Tipo pedido servicio',
      'Fecha última revisión',
      'Ship-To Code',
      'Es máquina propia',
      'COD.PREVISIONES CONTRATUALES',
      'Nº DE HORAS PREVISTA REVISION',
      'Nº DE HORAS TRABAJO ANUALES',
    ]

    // Fila de ejemplo (para que el usuario vea cómo rellenar)
    const ejemplo = [
      '001234',                          // Nº prod. servicio
      'H25 D 392',                       // Descripción (modelo)
      'H2X392T01825',                    // Nº Serie
      4820,                              // Nº de horas
      'CM10/000013',                     // Nº Contrato
      'Firmado',                         // Estado contrato
      '430000126',                       // Cliente (Nº cliente)
      'CUPESA MAT.CONSTRUCCION',         // Nombre
      'Preventivo',                      // Tipo pedido servicio
      '2025-03-15',                      // Fecha última revisión (YYYY-MM-DD)
      'A10',                             // Ship-To Code (zona/delegación)
      'No',                              // Es máquina propia (Sí/No)
      4,                                 // COD.PREVISIONES CONTRATUALES (solo máquinas cliente)
      '',                                // Nº DE HORAS PREVISTA REVISION (solo máquinas propias: 1000)
      '',                                // Nº DE HORAS TRABAJO ANUALES (solo máquinas propias)
    ]

    // Fila vacía para que el usuario empiece a rellenar
    const vacia = headers.map(() => '')

    const data = [headers, ejemplo, vacia]
    const ws = XLSX.utils.aoa_to_sheet(data)

    // Ajustar ancho de columnas
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }))

    XLSX.utils.book_append_sheet(wb, ws, 'Equipos')

    // ============================================================
    // Hoja 2: INSTRUCCIONES
    // ============================================================
    const instrucciones = [
      ['INSTRUCCIONES PARA RELLENAR LA PLANTILLA DE EQUIPOS'],
      [''],
      ['Cada fila = un equipo/máquina.'],
      [''],
      ['COLUMNAS:', '', ''],
      ['Nº prod. servicio', '*', 'Código único del equipo. Obligatorio.'],
      ['Descripción', '', 'Modelo/tipo de la máquina (ej: H25 D 392, E16 PH 386)'],
      ['Nº Serie', '', 'Número de serie físico del equipo'],
      ['Nº de horas', '', 'Horas actuales del contador'],
      ['Nº Contrato', '', 'Número de contrato activo (ej: CM10/000013)'],
      ['Estado contrato', '', 'Firmado, Caducado, Cancelado, etc.'],
      ['Cliente', '', 'Nº de cliente en BC (ej: 430000126)'],
      ['Nombre', '', 'Nombre del cliente'],
      ['Tipo pedido servicio', '', 'Preventivo, Correctivo, Reparación, etc.'],
      ['Fecha última revisión', '', 'Formato: YYYY-MM-DD (ej: 2025-03-15)'],
      ['Ship-To Code', '', 'Código de delegación/zona (ej: A10, B100, S2)'],
      [''],
      ['MÁQUINAS DE CLIENTE (con contrato M1/M2/FSCR/FSSR):', '', ''],
      ['Es máquina propia', '', 'Poner "No"'],
      ['COD.PREVISIONES CONTRATUALES', '*', 'Nº de revisiones contratadas/año (ej: 4 = trimestral)'],
      ['Nº DE HORAS PREVISTA REVISION', '', 'Dejar vacío (no aplica)'],
      ['Nº DE HORAS TRABAJO ANUALES', '', 'Dejar vacío (no aplica)'],
      [''],
      ['MÁQUINAS PROPIAS (sin contrato, revisión por horas):', '', ''],
      ['Es máquina propia', '', 'Poner "Sí"'],
      ['COD.PREVISIONES CONTRATUALES', '', 'Dejar vacío (no aplica)'],
      ['Nº DE HORAS PREVISTA REVISION', '*', 'Umbral de horas para revisión (ej: 1000)'],
      ['Nº DE HORAS TRABAJO ANUALES', '', 'Horas/año estimadas (ej: 1500). Para calcular próxima fecha.'],
      [''],
      ['* = Obligatorio'],
      [''],
      ['Una vez rellenada, súbelo desde la app: Equipos → Subir Excel'],
    ]

    const ws2 = XLSX.utils.aoa_to_sheet(instrucciones)
    ws2['!cols'] = [{ wch: 35 }, { wch: 8 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones')

    // Generar el archivo Excel como buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Devolver como descarga
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla_equipos.xlsx"',
      },
    })
  } catch (error) {
    console.error('GET /api/equipos/template error:', error)
    return NextResponse.json(
      { error: 'Error al generar la plantilla' },
      { status: 500 }
    )
  }
}
