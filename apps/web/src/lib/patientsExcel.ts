import type { CellValue, Workbook } from 'exceljs';
import { CONSENT_METHOD_LABELS, PATIENT_IMPORT_MAX, type PatientInput, type PatientListItem } from '@genon/shared';
import { fmtDateTime } from './format';

/** Columnas que se leen al importar; la plantilla y la exportación usan el primer nombre de cada una. */
const COLUMNS: Record<keyof PatientInput, string[]> = {
  first_name: ['nombres', 'nombre', 'primer nombre'],
  last_name: ['apellidos', 'apellido'],
  phone: ['celular', 'telefono', 'movil', 'whatsapp', 'numero de celular'],
  document: ['documento', 'cedula', 'identificacion', 'numero de documento'],
  email: ['correo', 'correo electronico', 'email', 'e-mail'],
  notes: ['notas', 'observaciones', 'nota'],
};
const MAX_LENGTH: Record<keyof PatientInput, number> = { first_name: 200, last_name: 200, phone: 50, document: 100, email: 200, notes: 2000 };
const REQUIRED:(keyof PatientInput)[] = ['first_name', 'last_name', 'phone'];
const HEADERS = ['Nombres', 'Apellidos', 'Celular', 'Documento', 'Correo', 'Notas'];

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*:]/g, '')
    .toLowerCase()
    .trim();

/** exceljs se carga solo cuando se usa (pesa ~1 MB). */
async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}

function cellText(v: CellValue): string {
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

async function download(wb: Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function styleHeader(ws: ReturnType<Workbook['addWorksheet']>, widths: number[]) {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

export async function downloadImportTemplate() {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet('Pacientes');
  ws.addRow(HEADERS);
  ws.addRow(['María', 'Gómez Pérez', '3001234567', '1020304050', 'maria@correo.com', 'Ejemplo: borra esta fila']);
  styleHeader(ws, [18, 22, 16, 16, 26, 30]);
  // Celular y documento como texto para que Excel no los convierta en número
  ws.getColumn(3).numFmt = '@';
  ws.getColumn(4).numFmt = '@';
  await download(wb, 'plantilla-pacientes.xlsx');
}

export async function exportPatients(patients: PatientListItem[], tz: string, orgName: string) {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet('Pacientes');
  ws.addRow([...HEADERS, 'Protocolos activos', 'Autorización', 'Fecha de autorización', 'Baja', 'Registrado']);
  for (const p of patients) {
    ws.addRow([
      p.first_name,
      p.last_name,
      `+${p.phone}`,
      p.document ?? '',
      p.email ?? '',
      p.notes ?? '',
      p.active_protocols.map((pr) => pr.name).join(', '),
      p.consent ? CONSENT_METHOD_LABELS[p.consent.method] : 'Sin autorización',
      fmtDateTime(p.consent?.granted_at ?? null, tz),
      p.opted_out ? `Sí (${fmtDateTime(p.opted_out_at, tz)})` : 'No',
      fmtDateTime(p.created_at, tz),
    ]);
  }
  styleHeader(ws, [18, 22, 16, 16, 26, 30, 28, 22, 22, 22, 22]);
  const slug = normalize(orgName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await download(wb, `pacientes-${slug || 'clinica'}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export interface ParsedImport {
  /** Fila de Excel (para los mensajes) y los datos */
  rows: { line: number; input: PatientInput }[];
  /** Columnas obligatorias que no se encontraron */
  missing: string[];
  tooMany: boolean;
}

/** Lee la primera hoja: la fila 1 son los encabezados, en cualquier orden. */
export async function parsePatientsFile(file: File): Promise<ParsedImport> {
  const wb = await newWorkbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], missing: REQUIRED.map((k) => COLUMNS[k][0]), tooMany: false };

  const col: Partial<Record<keyof PatientInput, number>> = {};
  ws.getRow(1).eachCell((cell, n) => {
    const h = normalize(cellText(cell.value));
    const key = (Object.keys(COLUMNS) as (keyof PatientInput)[]).find((k) => COLUMNS[k].includes(h));
    if (key && col[key] === undefined) col[key] = n;
  });
  const missing = REQUIRED.filter((k) => col[k] === undefined).map((k) => HEADERS[Object.keys(COLUMNS).indexOf(k)]);
  if (missing.length) return { rows: [], missing, tooMany: false };

  const rows: ParsedImport['rows'] = [];
  ws.eachRow((row, line) => {
    if (line === 1) return;
    // Recortado al máximo que acepta la API; el detalle de cada fila lo valida el servidor
    const get = (k: keyof PatientInput) => (col[k] ? cellText(row.getCell(col[k]!).value).trim().slice(0, MAX_LENGTH[k]) : '');
    const input: PatientInput = {
      first_name: get('first_name'),
      last_name: get('last_name'),
      phone: get('phone'),
      document: get('document') || null,
      email: get('email') || null,
      notes: get('notes') || null,
    };
    if (Object.values(input).some(Boolean)) rows.push({ line, input });
  });
  return { rows: rows.slice(0, PATIENT_IMPORT_MAX), missing: [], tooMany: rows.length > PATIENT_IMPORT_MAX };
}
