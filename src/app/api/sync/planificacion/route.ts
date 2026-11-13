import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const fileRevisiones = formData.get('revisiones') as File;
    const fileProductos = formData.get('productos') as File;
    const fileLineasContrato = formData.get('lineasContrato') as File;
    const filePedidos = formData.get('pedidos') as File;
    const filePedidosReg = formData.get('pedidosReg') as File;

    if (!fileRevisiones || !fileProductos || !fileLineasContrato || !filePedidos || !filePedidosReg) {
      return NextResponse.json({ error: 'Faltan ficheros por subir. Se requieren los 5 excels.' }, { status: 400 });
    }

    const parseExcelToJSON = async (file: File, allowedColumns: string[]) => {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

      return rawData.map(row => {
        const filteredRow: Record<string, any> = {};
        allowedColumns.forEach(col => {
          if (row[col] !== undefined) {
            filteredRow[col] = row[col];
          }
        });
        return filteredRow;
      });
    };

    const revData = await parseExcelToJSON(fileRevisiones, [
      'Nº prod. servicio', 'Nº Contrato', 'Nº de revisiones anuales'
    ]);

    const prodData = await parseExcelToJSON(fileProductos, [
      'Nº Serie', 'Modelo', 'Es propia', 'Nº cliente Propietario', 
      'Nombre Cliente Propietario', 'Nombre Cliente Ubicación', 'Nº cliente ubicación', 'Nº de horas'
    ]);

    const lineasContratoData = await parseExcelToJSON(fileLineasContrato, [
      'Cód. grupo contrato', 'Contract Starting Date', 'Contract Ending Date'
    ]);

    const pedidosData = await parseExcelToJSON(filePedidos, [
      'Nº', 'Centro responsabilidad', 'Descripción', 'Tipo pedido servicio', 
      'Fecha registro', 'Nº cliente', 'Nombre'
    ]);

    const pedidosRegData = await parseExcelToJSON(filePedidosReg, [
      'Nº', 'Descripción', 'Centro responsabilidad', 'Fecha finalización', 'Tipo pedido servicio'
    ]);

    const planificacionMap = new Map();

    revData.forEach(item => {
      const key = `${item['Nº prod. servicio'] || 'N/A'}_${item['Nº Contrato'] || 'N/A'}`;
      planificacionMap.set(key, { ...item, esHistorico: false });
    });

    prodData.forEach(prod => {
      for (const [key, value] of planificacionMap.entries()) {
        if (key.startsWith(String(prod['Nº Serie'] || ''))) {
          planificacionMap.set(key, { ...value, ...prod });
        }
      }
    });

    const planificacionFinal = Array.from(planificacionMap.values());

    return NextResponse.json({
      success: true,
      message: 'Planificación sincronizada correctamente. Los datos anteriores se han preservado.',
      totalRegistros: planificacionFinal.length,
      data: planificacionFinal
    });

  } catch (error: any) {
    console.error('Error procesando los excels de BC:', error);
    return NextResponse.json({ error: error.message || 'Error interno al procesar los ficheros' }, { status: 500 });
  }
}
