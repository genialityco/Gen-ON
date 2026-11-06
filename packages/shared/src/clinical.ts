import type { Role } from './roles';

/**
 * Ficha clínica de seguimiento: complementa la historia clínica legal (que
 * sigue en el software de la clínica, p. ej. SICME). Antecedentes que se
 * actualizan, y notas que no se editan ni se borran: una corrección es una
 * aclaración ligada a la nota original.
 */
export const BACKGROUND_FIELDS = [
  { key: 'allergies', label: 'Alergias' },
  { key: 'medications', label: 'Medicamentos actuales' },
  { key: 'conditions', label: 'Antecedentes médicos' },
  { key: 'surgeries', label: 'Antecedentes quirúrgicos y estéticos' },
  { key: 'habits', label: 'Hábitos y otros' },
] as const;

export type BackgroundKey = (typeof BACKGROUND_FIELDS)[number]['key'];

export type ClinicalBackground = Record<BackgroundKey, string | null>;

export interface ClinicalRecord {
  patient_id: string;
  background: ClinicalBackground;
  updated_at: string | null;
  updated_by_name: string | null;
}

export const NOTE_KINDS = ['evolution', 'procedure', 'control', 'addendum'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  evolution: 'Evolución',
  procedure: 'Procedimiento',
  control: 'Control',
  addendum: 'Aclaración',
};

/** Datos de un procedimiento (útiles para trazabilidad: producto y lote). */
export interface ProcedureDetails {
  name: string;
  area: string | null;
  product: string | null;
  lot: string | null;
  quantity: string | null;
}

/**
 * Lo que el profesional le indicó al paciente en esta atención, escrito para
 * él. A diferencia del texto de la nota (uso interno), el asistente con IA lo
 * puede repetir tal cual si la clínica lo permite (`share_with_assistant`).
 */
export interface PatientGuidance {
  /** Cuidados e indicaciones */
  instructions: string | null;
  /** Medicamentos formulados, como los indicó el profesional */
  medications: string | null;
  /** Qué evitar y hasta cuándo */
  restrictions: string | null;
  /** Signos de alarma de este paciente: si los reporta, el asistente lo pasa como urgente */
  warning_signs: string | null;
  /** Próximo control sugerido (YYYY-MM-DD) */
  next_control: string | null;
}

export const GUIDANCE_FIELDS = [
  { key: 'instructions', label: 'Cuidados e indicaciones' },
  { key: 'medications', label: 'Medicamentos formulados' },
  { key: 'restrictions', label: 'Qué evitar' },
  { key: 'warning_signs', label: 'Signos de alarma' },
] as const;

export const GUIDANCE_MAX_LENGTH = 2000;

export const hasGuidance = (g: PatientGuidance | null | undefined) =>
  !!g && (GUIDANCE_FIELDS.some((f) => !!g[f.key]) || !!g.next_control);

export interface ClinicalNote {
  id: string;
  patient_id: string;
  kind: NoteKind;
  /** Fecha de la atención (YYYY-MM-DD) */
  date: string;
  body: string;
  procedure: ProcedureDetails | null;
  /** Nota que aclara (solo en las aclaraciones) */
  amends: string | null;
  guidance: PatientGuidance | null;
  /** El asistente con IA puede usar `guidance` con el paciente */
  share_with_assistant: boolean;
  author_uid: string;
  author_name: string;
  author_role: Role;
  created_at: string | null;
}

export interface ClinicalNoteInput {
  kind: NoteKind;
  date: string;
  body: string;
  procedure?: ProcedureDetails | null;
  amends?: string | null;
  guidance?: PatientGuidance | null;
  share_with_assistant?: boolean;
}

export type ClinicalAccessAction = 'view' | 'update_background' | 'add_note' | 'assistant';

export const CLINICAL_ACCESS_LABELS: Record<ClinicalAccessAction, string> = {
  view: 'Consultó',
  update_background: 'Actualizó antecedentes',
  add_note: 'Agregó nota',
  assistant: 'Consultó el asistente IA',
};

export interface ClinicalAccess {
  id: string;
  patient_id: string;
  uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  action: ClinicalAccessAction;
  at: string | null;
}

export interface ClinicalView {
  record: ClinicalRecord;
  notes: ClinicalNote[];
  can_write: boolean;
}

/** Filas por importación de fichas desde Excel. */
export const CLINICAL_IMPORT_MAX = 1000;

/**
 * Una fila del Excel de fichas: el paciente (celular o documento), sus
 * antecedentes (solo se cambian los que vienen) y, si trae contenido, una nota
 * con sus indicaciones para el paciente.
 */
export interface ClinicalImportRow {
  patient: string;
  date: string | null;
  kind: Exclude<NoteKind, 'addendum'> | null;
  procedure: string | null;
  area: string | null;
  /** Nota interna; si falta se usa "Importado desde Excel" */
  body: string | null;
  background: Partial<ClinicalBackground>;
  guidance: Partial<PatientGuidance>;
  share_with_assistant: boolean | null;
}

export interface ClinicalImportInput {
  rows: ClinicalImportRow[];
  /** Nombre del archivo, para la nota y la auditoría */
  source: string;
}

export interface ClinicalImportResult {
  notes: number;
  backgrounds: number;
  errors: number;
  rows: { index: number; status: 'ok' | 'error'; message: string | null }[];
}
