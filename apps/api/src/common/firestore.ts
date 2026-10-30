import { Timestamp } from 'firebase-admin/firestore';

/** Convierte los Timestamp de Firestore a ISO 8601 para las respuestas. */
export function toPlain<T = any>(value: unknown): T {
  if (value instanceof Timestamp) return value.toDate().toISOString() as T;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map((v) => toPlain(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out as T;
  }
  return value as T;
}

export function isoOrNull(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

/** Fecha local YYYY-MM-DD en la zona horaria de la organización. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Colecciones (en un solo lugar para no repetir rutas). */
export const COL = {
  organizations: 'organizations',
  users: 'users',
  /** Secretos por organización: solo el backend los lee (reglas lo niegan todo) */
  orgSecrets: 'org_secrets',
  // Subcolecciones de organizations/{orgId}
  members: 'members',
  metaConnection: 'meta_connection',
  messages: 'messages',
  webhookEvents: 'webhook_events',
  statsDaily: 'stats_daily',
  waContacts: 'wa_contacts',
  templates: 'templates',
  protocols: 'protocols',
  patients: 'patients',
  enrollments: 'enrollments',
  outbox: 'outbox',
  appointments: 'appointments',
  // Ficha clínica: fuera de patients para que las reglas la excluyan aparte
  clinicalRecords: 'clinical_records',
  clinicalNotes: 'clinical_notes',
  clinicalAccess: 'clinical_access',
  usageMonthly: 'usage_monthly',
  // Biblioteca global de Gen.iality
  libraryTemplates: 'library_templates',
  libraryProtocols: 'library_protocols',
} as const;

/** Plantillas y protocolos viven en una organización o en la biblioteca global. */
export type Scope = { orgId: string } | 'library';

export const META_CONNECTION_DOC = 'main';
