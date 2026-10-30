import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  extractVariables,
  localDate,
  localTime,
  patientFullName,
  validateAppointment,
  type Appointment,
  type AppointmentInput,
  type AppointmentReminder,
  type AppointmentStatus,
  type CreateAppointmentInput,
  type Organization,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { AuthUser } from '../auth/decorators';
import { PatientsService } from './patients.service';
import { EnrollmentsService } from './enrollments.service';
import { OutboxService } from './outbox.service';
import { UsageService } from './usage.service';
import { missingVariables, variableValues } from './variables';

export interface AppointmentResult {
  appointment: Appointment;
  scheduled: number;
  warnings: string[];
}

/** Datos de la cita como contexto de las variables ({{fecha}}, {{hora}}…). */
export function appointmentContext(a: Pick<Appointment, 'date' | 'time' | 'reason' | 'professional'>) {
  return { reference_date: a.date, reference_time: a.time, procedure: a.reason, professional: a.professional };
}

/**
 * Citas agendadas a mano con sus recordatorios: no necesitan protocolo. Al
 * cambiar la fecha, la hora o los recordatorios, lo pendiente se cancela y
 * se vuelve a programar.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly patients: PatientsService,
    private readonly enrollments: EnrollmentsService,
    private readonly templates: TemplatesService,
    private readonly outbox: OutboxService,
    private readonly usage: UsageService,
  ) {}

  col(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.appointments);
  }

  toAppointment(id: string, d: FirebaseFirestore.DocumentData): Appointment {
    return {
      id,
      patient_id: d.patient_id,
      patient_name: d.patient_name,
      date: d.date,
      time: d.time,
      reason: d.reason ?? null,
      professional: d.professional ?? null,
      notes: d.notes ?? null,
      status: d.status,
      reminders: d.reminders ?? [],
      created_at: isoOrNull(d.created_at),
      created_by: d.created_by ?? null,
      updated_at: isoOrNull(d.updated_at),
    };
  }

  async get(orgId: string, id: string): Promise<Appointment> {
    const doc = await this.col(orgId).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Cita no encontrada');
    return this.toAppointment(doc.id, doc.data()!);
  }

  /** Citas entre dos fechas (YYYY-MM-DD, ambas incluidas). */
  async list(orgId: string, from: string, to: string): Promise<Appointment[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    const snap = await this.col(orgId).where('date', '>=', from).where('date', '<=', to).orderBy('date').get();
    return snap.docs.map((d) => this.toAppointment(d.id, d.data())).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }

  async listForPatient(orgId: string, patientId: string): Promise<Appointment[]> {
    const snap = await this.col(orgId).where('patient_id', '==', patientId).get();
    return snap.docs
      .map((d) => this.toAppointment(d.id, d.data()))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  }

  /**
   * Contexto de un envío manual suelto: la última inscripción activa o, si no
   * hay, la próxima cita agendada.
   */
  async manualContext(orgId: string, timeZone: string, patientId: string) {
    const enrollment = await this.enrollments.latestActive(orgId, patientId);
    if (enrollment) return enrollment;
    const now = new Date();
    const nowLocal = `${localDate(now, timeZone)}${localTime(now, timeZone)}`;
    const next = (await this.listForPatient(orgId, patientId))
      .filter((a) => a.status === 'scheduled' && `${a.date}${a.time}` > nowLocal)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    return next ? appointmentContext(next) : null;
  }

  async create(orgId: string, input: CreateAppointmentInput, user: AuthUser): Promise<AppointmentResult> {
    const [org, patient] = await Promise.all([this.orgs.get(orgId), this.patients.get(orgId, input.patient_id)]);
    const data = this.clean(input);
    const reminders = this.withIds(input.reminders);
    if (reminders.length) {
      if (patient.opted_out) throw new BadRequestException('El paciente se dio de baja de los mensajes');
      if (!patient.consent) throw new BadRequestException('El paciente no tiene autorización de datos registrada');
    }
    const { labels, warnings } = await this.checkTemplates(org, patient, { ...data, reminders });

    const ref = this.col(orgId).doc();
    const appt = { ...data, id: ref.id, patient_id: patient.id, patient_name: patientFullName(patient), reminders };
    const batch = this.firebase.db.batch();
    const { id: _id, ...doc } = appt;
    batch.set(ref, {
      ...doc,
      status: 'scheduled',
      created_by: user.uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    const plan = this.outbox.planAppointment(batch, org, appt, patient.phone, labels, user.uid);
    await batch.commit();
    if (plan.scheduled) await this.usage.countPatient(orgId, patient.id, this.usage.monthOf(new Date(), org.timezone));
    if (plan.past.length) warnings.push(`No se programaron porque su hora ya pasó: ${plan.past.join(', ')}.`);
    return { appointment: await this.get(orgId, ref.id), scheduled: plan.scheduled, warnings };
  }

  async update(orgId: string, id: string, input: AppointmentInput, user: AuthUser): Promise<AppointmentResult> {
    const current = await this.get(orgId, id);
    if (current.status !== 'scheduled') throw new BadRequestException('Solo se edita una cita agendada');
    const data = this.clean(input);
    const reminders = this.withIds(input.reminders);
    const replan =
      current.date !== data.date ||
      current.time !== data.time ||
      current.reason !== data.reason ||
      current.professional !== data.professional ||
      JSON.stringify(current.reminders.map((r) => [r.template_key, r.timing])) !==
        JSON.stringify(reminders.map((r) => [r.template_key, r.timing]));

    if (!replan) {
      await this.col(orgId).doc(id).update({ notes: data.notes, updated_at: FieldValue.serverTimestamp() });
      return { appointment: await this.get(orgId, id), scheduled: 0, warnings: [] };
    }

    const [org, patient] = await Promise.all([this.orgs.get(orgId), this.patients.get(orgId, current.patient_id)]);
    if (reminders.length && patient.opted_out) throw new BadRequestException('El paciente se dio de baja de los mensajes');
    const { labels, warnings } = await this.checkTemplates(org, patient, { ...data, reminders });

    // Primero se cancela lo pendiente: si algo falla después, no quedan duplicados
    await this.outbox.cancelPending(orgId, 'appointment_id', id, 'Cita modificada');
    const batch = this.firebase.db.batch();
    batch.update(this.col(orgId).doc(id), { ...data, reminders, updated_at: FieldValue.serverTimestamp() });
    const plan = this.outbox.planAppointment(
      batch,
      org,
      { ...data, id, patient_id: current.patient_id, patient_name: current.patient_name, reminders },
      patient.phone,
      labels,
      user.uid,
    );
    await batch.commit();
    if (plan.scheduled) await this.usage.countPatient(orgId, patient.id, this.usage.monthOf(new Date(), org.timezone));
    if (plan.past.length) warnings.push(`No se programaron porque su hora ya pasó: ${plan.past.join(', ')}.`);
    return { appointment: await this.get(orgId, id), scheduled: plan.scheduled, warnings };
  }

  /** Asistió, no asistió o cancelada: lo pendiente ya no sale. */
  async setStatus(orgId: string, id: string, status: AppointmentStatus): Promise<Appointment> {
    await this.get(orgId, id);
    await this.col(orgId).doc(id).update({ status, updated_at: FieldValue.serverTimestamp() });
    if (status !== 'scheduled') {
      const reason = status === 'cancelled' ? 'Cita cancelada' : 'La cita ya pasó';
      await this.outbox.cancelPending(orgId, 'appointment_id', id, reason);
    }
    return this.get(orgId, id);
  }

  private clean(input: AppointmentInput) {
    const errors = validateAppointment(input);
    if (errors.length) throw new BadRequestException(errors.join(' · '));
    return {
      date: input.date,
      time: input.time,
      reason: input.reason?.trim() || null,
      professional: input.professional?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  }

  private withIds(reminders: AppointmentInput['reminders']): AppointmentReminder[] {
    return (reminders ?? []).map((r) => ({
      id: randomUUID().slice(0, 8),
      template_key: r.template_key,
      timing: r.timing.kind === 'hours' ? { kind: 'hours', hours: r.timing.hours } : { kind: 'days', days: r.timing.days, time: r.timing.time },
    }));
  }

  /** Las plantillas existen y tienen todos sus datos; avisa si alguna no está aprobada. */
  private async checkTemplates(
    org: Organization,
    patient: { first_name: string; last_name: string },
    appt: Pick<Appointment, 'date' | 'time' | 'reason' | 'professional' | 'reminders'>,
  ) {
    const labels = new Map<string, string>();
    const warnings: string[] = [];
    const used = new Set<string>();
    for (const key of new Set(appt.reminders.map((r) => r.template_key))) {
      const t = await this.templates.byKey({ orgId: org.id }, key);
      if (!t) throw new BadRequestException(`La plantilla "${key}" no existe`);
      labels.set(key, t.label);
      for (const v of extractVariables(t.approved?.body ?? t.body)) used.add(v);
      if (!t.approved) warnings.push(`"${t.label}" aún no está aprobada en Meta: no saldrá hasta que se apruebe.`);
    }
    const missing = missingVariables([...used], variableValues({ org, patient, enrollment: appointmentContext(appt) }));
    if (missing.length) throw new BadRequestException(`Los recordatorios necesitan: ${missing.join(', ')}.`);
    return { labels, warnings };
  }
}
