import type { Appointment } from './appointments';
import type { AlertLevel } from './templates';

/** Días hacia atrás que revisa "Requiere atención". */
export const ATTENTION_DAYS = 7;
/** Días hacia atrás en los que se buscan citas sin marcar asistencia. */
export const UNMARKED_DAYS = 14;

/**
 * - alert: el paciente tocó un botón con alerta para la clínica
 * - failed: un envío falló o no se entregó
 * - no_response: no ha tocado ningún botón de un mensaje que los tiene
 * - inbound: el paciente escribió por WhatsApp
 */
export type AttentionKind = 'alert' | 'failed' | 'no_response' | 'inbound';

export interface AttentionItem {
  kind: AttentionKind;
  /** Envío de la parrilla (alert, failed) o número de WhatsApp (inbound) */
  id: string;
  patient_id: string | null;
  /** Nombre del paciente; si el número no es de un paciente, el de WhatsApp o el número */
  name: string;
  at: string;
  /** Botón que tocó, motivo de la falla o último mensaje que escribió */
  text: string;
  level: AlertLevel | null;
  /** Mensaje de la parrilla al que corresponde */
  context: string | null;
  /** inbound: mensajes sin atender de ese número */
  count: number;
}

export interface HomeAppointment extends Appointment {
  /** Último botón que tocó en un recordatorio de la cita */
  reply: { text: string; confirmed: boolean } | null;
}

export interface OrgHome {
  attention: AttentionItem[];
  today: HomeAppointment[];
  /** Citas de días anteriores que siguen como agendadas */
  unmarked: HomeAppointment[];
}

/** Orden de "Requiere atención": urgentes primero, informativas al final. */
export function attentionRank(i: Pick<AttentionItem, 'kind' | 'level'>): number {
  if (i.kind === 'alert') return i.level === 'urgent' ? 0 : i.level === 'warning' ? 1 : 5;
  return { failed: 2, no_response: 3, inbound: 4 }[i.kind];
}
