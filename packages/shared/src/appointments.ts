import { computeSendAt, isHhmm, isYmd, zonedTime } from './schedule';

export type AppointmentStatus = 'scheduled' | 'attended' | 'no_show' | 'cancelled';

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  attended: 'Asistió',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
};

/**
 * Cuándo sale un recordatorio de la cita:
 * - days: N días antes a una hora fija (0 = el mismo día). Si cae en un día
 *   sin envíos, se adelanta.
 * - hours: N horas antes de la hora de la cita.
 */
export type ReminderTiming = { kind: 'days'; days: number; time: string } | { kind: 'hours'; hours: number };

export interface AppointmentReminder {
  id: string;
  template_key: string;
  timing: ReminderTiming;
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  /** YYYY-MM-DD y HH:mm en la hora de la clínica */
  date: string;
  time: string;
  /** Motivo o procedimiento ({{procedimiento}} en las plantillas) */
  reason: string | null;
  professional: string | null;
  notes: string | null;
  status: AppointmentStatus;
  reminders: AppointmentReminder[];
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
}

export interface AppointmentInput {
  date: string;
  time: string;
  reason?: string | null;
  professional?: string | null;
  notes?: string | null;
  reminders: { template_key: string; timing: ReminderTiming }[];
}

export interface CreateAppointmentInput extends AppointmentInput {
  patient_id: string;
}

export const MAX_REMINDERS = 5;

export function reminderLabel(t: ReminderTiming): string {
  if (t.kind === 'hours') return t.hours === 1 ? '1 hora antes' : `${t.hours} horas antes`;
  const when = t.days === 0 ? 'El mismo día' : t.days === 1 ? '1 día antes' : `${t.days} días antes`;
  return `${when}, ${t.time}`;
}

/** Hora de envío de un recordatorio. */
export function reminderSendAt(
  appt: { date: string; time: string },
  timing: ReminderTiming,
  org: { timezone: string; blocked_weekdays: number[] },
): { at: Date; shifted: boolean } {
  if (timing.kind === 'hours') {
    const at = zonedTime(appt.date, appt.time, org.timezone);
    return { at: new Date(at.getTime() - timing.hours * 3_600_000), shifted: false };
  }
  // Día de la cita como día 0: un día bloqueado antes de la cita se adelanta
  const r = computeSendAt({
    referenceDate: appt.date,
    dayOffset: -timing.days,
    time: timing.time,
    timeZone: org.timezone,
    blockedWeekdays: timing.days === 0 ? [] : org.blocked_weekdays,
  });
  return { at: r.at, shifted: r.shifted };
}

/** Problemas de una cita y sus recordatorios; vacío = válida. */
export function validateAppointment(input: AppointmentInput): string[] {
  const errors: string[] = [];
  if (!isYmd(input.date)) errors.push('Fecha inválida');
  if (!isHhmm(input.time)) errors.push('Hora inválida');
  if ((input.reminders?.length ?? 0) > MAX_REMINDERS) errors.push(`Máximo ${MAX_REMINDERS} recordatorios por cita`);
  for (const r of input.reminders ?? []) {
    if (!r.template_key) errors.push('Cada recordatorio necesita una plantilla');
    const t = r.timing;
    if (t?.kind === 'hours') {
      if (!Number.isInteger(t.hours) || t.hours < 1 || t.hours > 72) errors.push('Las horas antes van de 1 a 72');
    } else if (t?.kind === 'days') {
      if (!Number.isInteger(t.days) || t.days < 0 || t.days > 30) errors.push('Los días antes van de 0 a 30');
      if (!isHhmm(t.time)) errors.push('Hora del recordatorio inválida');
      // El mismo día: el recordatorio debe salir antes de la cita
      else if (t.days === 0 && isHhmm(input.time) && t.time >= input.time) {
        errors.push('El recordatorio del mismo día debe salir antes de la hora de la cita');
      }
    } else {
      errors.push('Momento del recordatorio inválido');
    }
  }
  return errors;
}
