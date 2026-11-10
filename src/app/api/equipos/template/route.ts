import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// GET /api/equipos/template — Descarga una plantilla Excel para cargar equipos
// Los encabezados coinciden con la exportación de BC "Productos de servicio"
export async function GET() {
  try {
    const wb = XLSX.utils.book_new()

    // ============================================================
    // Hoja 1: EQUIPOS — encabezados exactos de BC
    // ============================================================
    const headers = [
      'Nº',
      'Descripción',
      'Siguiente Fecha Mantenimiento',
      'Nº Serie',
      'Modelo',
      'Código de Servicio',
      'Es propio',
      'Nº cliente Propietario',
      'Nombre Cliente Propietario',
      'Nombre Cliente Ubicación',
      'Nº cliente ubicación',
      'Cód. dirección envío cliente ubicación',
      'Nº de horas',
      'Nº Sucursal',
      'Nº Contrato Servicio Alquiler en Vigor',
      'Nº Contrato Servicio Mantenimiento en Vigor',
      'Nº Contrato Interno Mantenimiento en Vigor',
    ]

    // Fila de ejemplo
    const ejemplo = [
      '001234',                              // Nº
      'H25 D 392',                           // Descripción
      '2026-03-15',                          // Siguiente Fecha Mantenimiento (YYYY-MM-DD)
      'H2X392T01825',                        // Nº Serie
      'H25',                                 // Modelo
      'SC-001',                              // Código de Servicio
      'No',                                  // Es propio (Sí/No)
      '430000126',                           // Nº cliente Propietario
      'CUPESA MAT.CONSTRUCCION',             // Nombre Cliente Propietario
      'CUPESA MAT.CONSTRUCCION',             // Nombre Cliente Ubicación
      '430000126',                           // Nº cliente ubicación
      'A10',                                 // Cód. dirección envío cliente ubicación
      4820,                                  // Nº de horas
      'S01',                                 // Nº Sucursal
      '',                                    // Nº Contrato Servicio Alquiler en Vigor
      'CM10/000013',                         // Nº Contrato Servicio Mantenimiento en Vigor
      'CMI10/000013',                        // Nº Contrato Interno Mantenimiento en Vigor
    ]

    const vacia = headers.map(() => '')
    const data = [headers, ejemplo, vacia]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Equipos')

    // ============================================================
    // Hoja 2: INSTRUCCIONES
    // ============================================================
    const instr = [
      ['INSTRUCCIONES PARA RELLENAR LA PLANTILLA'],
      [''],
      ['Cada fila = un equipo/máquina.'],
      [''],
      ['COLUMNAS:'],
      ['Nº', 'Código único del equipo. Obligatorio.'],
      ['Descripción', 'Texto descriptivo del equipo'],
      ['Siguiente Fecha Mantenimiento', 'Próxima fecha de revisión (YYYY-MM-DD). Si ya la sabes, ponla aquí. Si no, la app la calcula.'],
      ['Nº Serie', 'Número de serie físico'],
      ['Modelo', 'Modelo de la máquina'],
      ['Código de Servicio', 'Código de servicio interno'],
      ['Es propio', 'Sí = máquina propia (revisión por horas). No = máquina de cliente (revisión por contrato).'],
      ['Nº cliente Propietario', 'Nº de cliente propietario en BC'],
      ['Nombre Cliente Propietario', 'Nombre del cliente propietario'],
      ['Nombre Cliente Ubicación', 'Nombre del cliente donde está ubicada la máquina'],
      ['Nº cliente ubicación', 'Nº de cliente en la ubicación actual'],
      ['Cód. dirección envío cliente ubicación', 'Código de envío/zona/delegación (ej: A10, B100, S2)'],
      ['Nº de horas', 'Horas actuales del contador'],
      ['Nº Sucursal', 'Nº de sucursal'],
      ['Nº Contrato Servicio Alquiler en Vigor', 'Contrato de alquiler activo (si tiene)'],
      ['Nº Contrato Servicio Mantenimiento en Vigor', 'Contrato de mantenimiento activo'],
      ['Nº Contrato Interno Mantenimiento en Vigor', 'Contrato interno de mantenimiento'],
      [''],
      ['NOTAS:'],
      ['- "Es propio" = Sí → la máquina es de tu empresa (revisión por horas cada 1000h)'],
      ['- "Es propio" = No → la máquina es del cliente (revisión por contrato: M1/M2/FSCR/FSSR)'],
      ['- Si rellenas "Siguiente Fecha Mantenimiento", la app la usa directamente'],
      ['- Si la dejas vacía, la app la calcula según contrato o horas'],
    ]

    const ws2 = XLSX.utils.aoa_to_sheet(instr)
    ws2['!cols'] = [{ wch: 45 }, { wch: 70 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla_equipos.xlsx"',
      },
    })
  } catch (error) {
    console.error('GET /api/equipos/template error:', error)
    return NextResponse.json({ error: 'Error al generar plantilla' }, { status: 500 })
  }
}
