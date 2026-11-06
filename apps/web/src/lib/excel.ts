import type { CellValue, Workbook } from 'exceljs';

/** Ayudantes para leer y generar Excel en el navegador. */
/** Encabezado comparable: sin tildes, asteriscos ni dos puntos, en minúsculas. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*:]/g, '')
    .toLowerCase()
    .trim();

/** exceljs se carga solo cuando se usa (pesa ~1 MB). */
export async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}

export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return cellText(v.result as CellValue);
    return '';
  }
  return String(v);
}

export async function download(wb: Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function styleHeader(ws: ReturnType<Workbook['addWorksheet']>, widths: number[]) {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}
