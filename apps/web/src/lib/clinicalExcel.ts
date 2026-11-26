import { CLINICAL_IMPORT_MAX, type ClinicalImportRow } from '@genon/shared';
import { cellText, download, newWorkbook, normalize, styleHeader } from './excel';

type Column =
  | 'patient'
  | 'date'
  | 'kind'
  | 'procedure'
  | 'area'
  | 'body'
  | 'allergies'
  | 'current_medications'
  | 'conditions'
  | 'surgeries'
  | 'habits'
  | 'instructions'
  | 'medications'
  | 'restrictions'
  | 'warning_signs'
  | 'next_control'
  | 'share';

/** Encabezado de la plantilla (primero) y otros nombres que se aceptan. */
const COLUMNS: Record<Column, string[]> = {
  patient: ['Celular o documento', 'celular', 'documento', 'paciente', 'cedula', 'telefono'],
  date: ['Fecha de la atención', 'fecha', 'fecha de atencion'],
  kind: ['Tipo de nota', 'tipo'],
  procedure: ['Procedimiento'],
  area: ['Zona', 'area'],
  body: ['Nota interna', 'nota', 'evolucion', 'observaciones'],
  allergies: ['Alergias'],
  current_medications: ['Medicamentos actuales', 'medicamentos que toma'],
  conditions: ['Antecedentes médicos', 'antecedentes'],
  surgeries: ['Antecedentes quirúrgicos y estéticos', 'antecedentes quirurgicos', 'cirugias previas'],
  habits: ['Hábitos y otros', 'habitos'],
  instructions: ['Cuidados e indicaciones', 'indicaciones', 'cuidados'],
  medications: ['Medicamentos formulados', 'formula', 'formulacion'],
  restrictions: ['Qué evitar', 'restricciones'],
  warning_signs: ['Signos de alarma', 'alarmas'],
  next_control: ['Próximo control', 'proximo control sugerido', 'control'],
  share: ['Compartir con el asistente IA', 'compartir', 'asistente ia'],
};
const ORDER = Object.keys(COLUMNS) as Column[];
const WIDTHS = [18, 16, 14, 20, 14, 30, 18, 20, 20, 20, 16, 34, 30, 26, 30, 16, 16];

const KINDS: Record<string, ClinicalImportRow['kind']> = {
  procedimiento: 'procedure',
  control: 'control',
  evolucion: 'evolution',
};

/** Fecha de una celda: de Excel (fecha), AAAA-MM-DD o DD/MM/AAAA. Si no se reconoce, va tal cual y el servidor la rechaza. */
function toYmd(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v;
}

export async function downloadClinicalTemplate() {
  const wb = await newWorkbook();
  const ws = wb.addWorksheet('Fichas');
  ws.addRow(ORDER.map((c) => COLUMNS[c][0]));
  ws.addRow([
    '3001234567',
    '2026-11-04',
    'Procedimiento',
    'Rinoplastia',
    'Nariz',
    'Rinoplastia abierta sin complicaciones.',
    'Penicilina',
    'Ninguno',
    '',
    '',
    'No fuma',
    'Lavados nasales con suero 3 veces al día. Dormir con la cabeza elevada.',
    'Acetaminofén 500 mg cada 8 horas por 3 días.',
    'No usar gafas ni hacer ejercicio por 4 semanas.',
    'Sangrado que no para en 10 minutos, fiebre mayor a 38 °C.',
    '2026-11-11',
    'Sí',
  ]);
  ws.addRow(['Ejemplo: borra estas filas. Una fila por atención; solo «Celular o documento» es obligatorio.']);
  styleHeader(ws, WIDTHS);
  ws.getColumn(1).numFmt = '@';
  await download(wb, 'plantilla-fichas.xlsx');
}

export interface ParsedClinical {
  rows: { line: number; input: ClinicalImportRow }[];
  missing: boolean;
  tooMany: boolean;
}

/** Lee la primera hoja: fila 1 con los encabezados, en cualquier orden. */
export async function parseClinicalFile(file: File): Promise<ParsedClinical> {
  const wb = await newWorkbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], missing: true, tooMany: false };

  const col: Partial<Record<Column, number>> = {};
  ws.getRow(1).eachCell((cell, n) => {
    const h = normalize(cellText(cell.value));
    const key = ORDER.find((k) => COLUMNS[k].some((name) => normalize(name) === h));
    if (key && col[key] === undefined) col[key] = n;
  });
  if (col.patient === undefined) return { rows: [], missing: true, tooMany: false };

  const rows: ParsedClinical['rows'] = [];
  ws.eachRow((row, line) => {
    if (line === 1) return;
    const get = (k: Column) => (col[k] ? cellText(row.getCell(col[k]!).value).trim() : '');
    const text = (k: Column, max = 2000) => get(k).slice(0, max) || null;
    const patient = get('patient');
    if (!patient || /^ejemplo/i.test(patient)) return;
    const share = normalize(get('share'));
    rows.push({
      line,
      input: {
        patient: patient.slice(0, 50),
        date: toYmd(get('date'))?.slice(0, 20) ?? null,
        kind: KINDS[normalize(get('kind'))] ?? null,
        procedure: text('procedure', 120),
        area: text('area', 120),
        body: text('body', 10000),
        background: {
          allergies: text('allergies'),
          medications: text('current_medications'),
          conditions: text('conditions'),
          surgeries: text('surgeries'),
          habits: text('habits'),
        },
        guidance: {
          instructions: text('instructions'),
          medications: text('medications'),
          restrictions: text('restrictions'),
          warning_signs: text('warning_signs'),
          next_control: toYmd(get('next_control'))?.slice(0, 20) ?? null,
        },
        share_with_assistant: share ? !['no', 'n', 'false', '0'].includes(share) : null,
      },
    });
  });
  return { rows: rows.slice(0, CLINICAL_IMPORT_MAX), missing: false, tooMany: rows.length > CLINICAL_IMPORT_MAX };
}
