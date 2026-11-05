import type { MemberRole, OrgRole } from './roles';
import type { PlanKey } from './plans';
import type { AlertLevel, TemplateMetaStatus } from './templates';

export type OrgStatus = 'setup' | 'active' | 'suspended';

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  setup: 'En configuración',
  active: 'Activa',
  suspended: 'Suspendida',
};

export type OrgKind = 'clinic' | 'aesthetic_center' | 'medical_office' | 'dental' | 'other';

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  clinic: 'Clínica',
  aesthetic_center: 'Centro de estética',
  medical_office: 'Consultorio médico',
  dental: 'Consultorio odontológico',
  other: 'Otro',
};

/** Fechas en ISO 8601 en las respuestas de la API. */
export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  plan: PlanKey;
  status: OrgStatus;
  timezone: string;
  /** Datos de la empresa (paso 1 del asistente de Meta) */
  legal_name: string | null;
  nit: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  /** Envíos: hora por defecto de los pasos sin hora y días sin envíos (0 = domingo) */
  default_send_time: string;
  blocked_weekdays: number[];
  /** Texto de autorización de datos que acepta el paciente ({{clinica}} se reemplaza) */
  consent_text: string;
  consent_version: number;
  /** Mensajes a pacientes por mes (hora de la clínica); null = sin límite */
  monthly_message_limit: number | null;
  /** Celulares del equipo que reciben por WhatsApp las alertas de los botones (máx. 3) */
  alert_notify_phones: string[];
  /** Nivel mínimo de alerta que se avisa por WhatsApp */
  alert_notify_level: AlertLevel;
  /** Horas sin respuesta a un mensaje con botones para que aparezca en "Requiere atención"; null = no */
  no_response_hours: number | null;
  /** Plantilla de aviso al equipo que Gen.ON crea en la cuenta de WhatsApp de la clínica */
  alert_template: AlertTemplateState | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AlertTemplateState {
  meta_name: string;
  meta_id: string | null;
  version: number;
  status: TemplateMetaStatus;
  rejected_reason: string | null;
}

export const MAX_ALERT_NOTIFY_PHONES = 3;
export const DEFAULT_NO_RESPONSE_HOURS = 48;

/** info < warning < urgent: se avisa lo que esté en el nivel mínimo o por encima. */
export const ALERT_LEVEL_RANK: Record<AlertLevel, number> = { info: 0, warning: 1, urgent: 2 };

export interface OrganizationSettingsInput {
  default_send_time?: string;
  blocked_weekdays?: number[];
  consent_text?: string;
  alert_notify_phones?: string[];
  alert_notify_level?: AlertLevel;
  no_response_hours?: number | null;
}

export interface CreateOrganizationInput {
  name: string;
  kind: OrgKind;
  plan: PlanKey;
  timezone?: string;
}

export type UpdateOrganizationInput = Partial<
  Pick<Organization, 'name' | 'kind' | 'plan' | 'status' | 'timezone' | 'monthly_message_limit'>
>;

export interface Member {
  uid: string;
  email: string;
  name: string | null;
  /** staff = equipo Gen.iality asignado (lo gestiona solo el superadmin) */
  role: MemberRole;
  created_at: string | null;
}

export interface AddMemberInput {
  email: string;
  name?: string;
  role: OrgRole;
}
