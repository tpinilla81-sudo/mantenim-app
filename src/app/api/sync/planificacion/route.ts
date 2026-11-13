import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const fileRevisiones = formData.get('revisiones') as File;
    const fileProductos = formData.get('productos') as File;
    const fileLineasContrato = formData.get('lineasContrato') as File;
    const filePedidos = formData.get('pedidos') as File;
    const filePedidosReg = formData.get('pedidosReg') as File;

    if (!fileRevisiones || !fileProductos || !fileLineasContrato || !filePedidos || !filePedidosReg) {
      return NextResponse.json({ error: 'Faltan ficheros por subir. Se requieren los 5 excels obligatoriamente.' }, { status: 400 });
    }

    const parseExcel = async (file: File) => {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet) as any[];
    };

    const revData = await parseExcel(fileRevisiones);
    const prodData = await parseExcel(fileProductos);
    const lineasContratoData = await parseExcel(fileLineasContrato);
    const pedidosData = await parseExcel(filePedidos);
    const pedidosRegData = await parseExcel(filePedidosReg);

    const planificacionMap = new Map();

    revData.forEach((item, index) => {
      const key = `${item['Nº prod. servicio'] || index}_${item['Nº Contrato'] || 'N/A'}`;
      planificacionMap.set(key, { ...item, fuente: 'Revisiones' });
    });

    prodData.forEach((prod) => {
      const serie = String(prod['Nº Serie'] || '');
      for (const [key, value] of planificacionMap.entries()) {
        if (key.startsWith(serie)) {
          planificacionMap.set(key, { ...value, ...prod });
        }
      }
    });

    const resultadoFinal = Array.from(planificacionMap.values());

    return NextResponse.json({
      success: true,
      totalRegistros: resultadoFinal.length,
      data: resultadoFinal,
      message: 'Registrados'
    });

  } catch (error: any) {
    console.error('Error procesando los 5 excels:', error);
    return NextResponse.json({ error: error.message || 'Error interno al procesar los ficheros' }, { status: 500 });
  }
}
