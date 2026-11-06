import {
  APPOINTMENT_STATUS_LABELS,
  NOTE_KIND_LABELS,
  formatLongDate,
  formatTime12,
  type AppointmentStatus,
  type NoteKind,
  type PatientGuidance,
} from '@genon/shared';
import type { PromptPatient } from './prompt';

/** Lo que el paciente puede consultar de sí mismo, ya leído de la base. */
export interface PatientRecord {
  patient: { first_name: string; last_name: string; phone: string; email: string | null };
  appointments: { date: string; time: string; reason: string | null; professional: string | null; status: AppointmentStatus }[];
  enrollments: {
    protocol_name: string;
    procedure: string | null;
    professional: string | null;
    reference_date: string;
    reference_time: string | null;
    status: string;
  }[];
  /** Mensajes de la parrilla que ya recibió, con el texto aprobado y sus datos */
  received: { date: string; label: string; text: string }[];
  /** Próximos envíos programados (fechas locales) */
  scheduled: string[];
  /** Ficha de seguimiento, si la clínica permite que el asistente la use */
  clinical?: {
    allergies: string | null;
    medications: string | null;
    notes: { date: string; kind: NoteKind; procedure: string | null; area: string | null; author: string; guidance: PatientGuidance }[];
  } | null;
}

const MAX_UPCOMING = 5;
const MAX_PAST = 3;

const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function relative(today: string, date: string): string {
  const d = dayDiff(today, date);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

/**
 * Contexto del paciente para el prompt: sus datos registrados, citas,
 * procedimientos y las indicaciones que ya recibió (texto validado por un
 * profesional de la salud). `procedures` sirve para elegir los temas que
 * aplican a su procedimiento.
 */
export function buildPatientContext(r: PatientRecord, today: string, nowLocal: string): PromptPatient & { procedures: string[] } {
  const p = r.patient;
  const lines: string[] = [
    `Nombre completo: ${p.first_name} ${p.last_name}`.trim(),
    `Celular registrado: +${p.phone}${p.email ? ` · Correo: ${p.email}` : ''}`,
  ];

  const when = (a: { date: string; time: string }) => `${a.date}${a.time}`;
  const describe = (a: PatientRecord['appointments'][number]) =>
    `${formatLongDate(a.date)} (${relative(today, a.date)}), ${formatTime12(a.time)}${a.reason ? `, ${a.reason}` : ''}${a.professional ? `, con ${a.professional}` : ''}`;
  const upcoming = r.appointments
    .filter((a) => a.status === 'scheduled' && when(a) >= nowLocal)
    .sort((a, b) => when(a).localeCompare(when(b)))
    .slice(0, MAX_UPCOMING);
  const past = r.appointments
    .filter((a) => when(a) < nowLocal || a.status !== 'scheduled')
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, MAX_PAST);
  lines.push('', 'Citas próximas:', ...(upcoming.length ? upcoming.map((a) => `- ${describe(a)}`) : ['- No tiene citas próximas agendadas.']));
  if (past.length) {
    lines.push('Citas anteriores:', ...past.map((a) => `- ${describe(a)} · ${APPOINTMENT_STATUS_LABELS[a.status]}`));
  }

  const procedures: string[] = [];
  const shown = r.enrollments.filter((e) => e.status !== 'cancelled');
  if (shown.length) {
    lines.push('', 'Procedimientos y seguimientos:');
    for (const e of shown) {
      if (e.procedure) procedures.push(e.procedure);
      procedures.push(e.protocol_name);
      const state = e.status === 'active' ? 'seguimiento activo' : 'seguimiento terminado';
      lines.push(
        `- ${e.procedure ?? e.protocol_name}: ${formatLongDate(e.reference_date)} (${relative(today, e.reference_date)})${e.reference_time ? `, ${formatTime12(e.reference_time)}` : ''}${e.professional ? `, con ${e.professional}` : ''} · ${e.protocol_name}, ${state}`,
      );
    }
  }
  for (const a of r.appointments) if (a.reason) procedures.push(a.reason);

  if (r.received.length) {
    lines.push('', 'Indicaciones que ya recibió por WhatsApp (validadas por un profesional de la salud; puedes repetirlas tal cual):');
    for (const m of r.received) lines.push(`- ${formatLongDate(m.date)} · ${m.label}: ${m.text}`);
  }
  const c = r.clinical;
  if (c && (c.allergies || c.medications || c.notes.length)) {
    lines.push('', 'Ficha de seguimiento (lo registró su profesional de la salud; puedes repetirlo tal cual, sin agregar nada):');
    if (c.allergies) lines.push(`- Alergias registradas: ${c.allergies}`);
    if (c.medications) lines.push(`- Medicamentos que toma (reportados por el paciente): ${c.medications}`);
    for (const n of c.notes) {
      const g = n.guidance;
      const what = [NOTE_KIND_LABELS[n.kind], n.procedure && `${n.procedure}${n.area ? ` (${n.area})` : ''}`].filter(Boolean).join(': ');
      lines.push(`- ${formatLongDate(n.date)} (${relative(today, n.date)}) · ${what} · ${n.author}`);
      if (g.instructions) lines.push(`  Cuidados e indicaciones: ${g.instructions}`);
      if (g.medications) lines.push(`  Medicamentos formulados: ${g.medications}`);
      if (g.restrictions) lines.push(`  Qué evitar: ${g.restrictions}`);
      if (g.warning_signs) lines.push(`  Signos de alarma: ${g.warning_signs}`);
      if (g.next_control) lines.push(`  Próximo control sugerido: ${formatLongDate(g.next_control)} (${relative(today, g.next_control)})`);
      if (n.procedure) procedures.push(n.procedure);
    }
  }

  if (r.scheduled.length) {
    lines.push('', `Próximos mensajes programados: ${r.scheduled.length}, el siguiente el ${formatLongDate(r.scheduled[0])}.`);
  }

  return { first_name: p.first_name.trim().split(/\s+/)[0] ?? p.first_name, context: lines, procedures };
}
