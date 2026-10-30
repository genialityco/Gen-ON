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
}

export type ClinicalAccessAction = 'view' | 'update_background' | 'add_note';

export const CLINICAL_ACCESS_LABELS: Record<ClinicalAccessAction, string> = {
  view: 'Consultó',
  update_background: 'Actualizó antecedentes',
  add_note: 'Agregó nota',
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
