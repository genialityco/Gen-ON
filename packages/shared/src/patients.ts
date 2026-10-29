import type { MessageDeliveryStatus } from './meta-setup';

export type ConsentMethod = 'written' | 'verbal' | 'digital_form' | 'whatsapp';

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  written: 'Firmada en papel',
  verbal: 'Verbal (registrada por el personal)',
  digital_form: 'Formulario digital',
  whatsapp: 'Por WhatsApp',
};

/**
 * Autorización del tratamiento de datos (Ley 1581 de 2012: los de salud son
 * datos sensibles y exigen autorización expresa). Se guarda el texto exacto
 * que se aceptó, su versión, quién la registró y cuándo.
 */
export interface Consent {
  method: ConsentMethod;
  text: string;
  version: number;
  granted_at: string | null;
  registered_by: string;
  registered_by_name: string | null;
  note: string | null;
}

export const DEFAULT_CONSENT_TEXT =
  'Autorizo a {{clinica}} a tratar mis datos personales, incluidos datos de salud, para enviarme por WhatsApp indicaciones, recordatorios y seguimiento de mi tratamiento, conforme a la Ley 1581 de 2012 y a su política de tratamiento de datos. Puedo consultar, corregir o revocar esta autorización en cualquier momento, también respondiendo BAJA.';

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  /** Solo dígitos, con indicativo (573001234567) */
  phone: string;
  document: string | null;
  email: string | null;
  notes: string | null;
  consent: Consent | null;
  opted_out: boolean;
  opted_out_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PatientInput {
  first_name: string;
  last_name: string;
  phone: string;
  document?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface CreatePatientInput extends PatientInput {
  consent: { method: ConsentMethod; note?: string | null };
  /** Inscribir de una vez a un protocolo */
  enrollment?: CreateEnrollmentInput | null;
}

export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Activa',
  completed: 'Terminada',
  cancelled: 'Cancelada',
};

export interface Enrollment {
  id: string;
  patient_id: string;
  patient_name: string;
  protocol_id: string;
  protocol_name: string;
  /** Fecha del procedimiento o cita (YYYY-MM-DD local) */
  reference_date: string;
  reference_time: string | null;
  procedure: string | null;
  professional: string | null;
  status: EnrollmentStatus;
  created_at: string | null;
  created_by: string | null;
}

export interface CreateEnrollmentInput {
  protocol_id: string;
  reference_date: string;
  reference_time?: string | null;
  procedure?: string | null;
  professional?: string | null;
}

export type OutboxStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped';

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  scheduled: 'Programado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falló',
  cancelled: 'Cancelado',
  skipped: 'Omitido',
};

export const DELIVERY_STATUS_LABELS: Record<MessageDeliveryStatus, string> = {
  accepted: 'Aceptado por Meta',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'No entregado',
};

/** Un envío de la parrilla. */
export interface OutboxItem {
  id: string;
  enrollment_id: string | null;
  patient_id: string;
  patient_name: string;
  phone: string;
  protocol_id: string | null;
  protocol_name: string | null;
  step_id: string | null;
  step_label: string;
  day_offset: number | null;
  template_key: string;
  send_at: string;
  local_date: string;
  /** Se corrió por caer en un día bloqueado */
  shifted: boolean;
  manual: boolean;
  status: OutboxStatus;
  status_reason: string | null;
  attempts: number;
  wamid: string | null;
  sent_at: string | null;
  delivery_status: MessageDeliveryStatus | null;
  /** Botón que tocó el paciente */
  response: { index: number; text: string; at: string | null } | null;
  created_at: string | null;
}

export interface ScheduleManualInput {
  patient_id: string;
  template_key: string;
  /** ISO; vacío = ahora */
  send_at?: string | null;
}

export interface MonthlyUsage {
  month: string;
  new_patients: number;
  included: number;
  extra: number;
}

/**
 * Celular del paciente: solo dígitos con indicativo. Un celular colombiano
 * de 10 dígitos (3xx) recibe el 57.
 */
export function normalizePatientPhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function patientFullName(p: { first_name: string; last_name: string }) {
  return `${p.first_name} ${p.last_name}`.trim();
}
