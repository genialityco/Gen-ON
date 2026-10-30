import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  computeSendAt,
  localDate,
  orderedSteps,
  reminderLabel,
  reminderSendAt,
  type Appointment,
  type Enrollment,
  type Organization,
  type OutboxItem,
  type OutboxStatus,
  type Protocol,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull } from '../common/firestore';

/** Un paso cuya hora ya pasó (con este margen) al inscribir no se programa. */
const PAST_GRACE_MS = 5 * 60_000;
const MAX_RANGE_DAYS = 62;

const RESCHEDULABLE: OutboxStatus[] = ['scheduled', 'failed', 'cancelled', 'skipped'];
const CANCELLABLE: OutboxStatus[] = ['scheduled', 'failed'];

export interface NewOutboxItem {
  enrollment_id: string | null;
  patient_id: string;
  patient_name: string;
  phone: string;
  protocol_id: string | null;
  protocol_name: string | null;
  step_id: string | null;
  appointment_id: string | null;
  step_label: string;
  day_offset: number | null;
  template_key: string;
  at: Date;
  shifted: boolean;
  manual: boolean;
  created_by: string | null;
}

/**
 * La parrilla: un documento por envío. `queue_at` existe solo mientras el
 * envío está programado; el despachador busca por ese campo.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly firebase: FirebaseService) {}

  col(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.outbox);
  }

  toItem(id: string, d: FirebaseFirestore.DocumentData): OutboxItem {
    return {
      id,
      enrollment_id: d.enrollment_id ?? null,
      patient_id: d.patient_id,
      patient_name: d.patient_name,
      phone: d.phone,
      protocol_id: d.protocol_id ?? null,
      protocol_name: d.protocol_name ?? null,
      step_id: d.step_id ?? null,
      appointment_id: d.appointment_id ?? null,
      step_label: d.step_label,
      day_offset: d.day_offset ?? null,
      template_key: d.template_key,
      send_at: isoOrNull(d.send_at)!,
      local_date: d.local_date,
      shifted: !!d.shifted,
      manual: !!d.manual,
      status: d.status,
      status_reason: d.status_reason ?? null,
      attempts: d.attempts ?? 0,
      wamid: d.wamid ?? null,
      sent_at: isoOrNull(d.sent_at),
      delivery_status: d.delivery_status ?? null,
      response: d.response ? { ...d.response, at: isoOrNull(d.response.at) } : null,
      created_at: isoOrNull(d.created_at),
    };
  }

  /** Documento nuevo: programado, u omitido si su hora ya pasó. */
  newDoc(item: NewOutboxItem, timeZone: string, now = new Date()) {
    const past = item.at.getTime() < now.getTime() - PAST_GRACE_MS;
    const sendAt = Timestamp.fromDate(item.at);
    const { at, ...rest } = item;
    return {
      ...rest,
      send_at: sendAt,
      local_date: localDate(at, timeZone),
      status: past ? 'skipped' : 'scheduled',
      status_reason: past ? 'La fecha ya había pasado al inscribir' : null,
      ...(past ? {} : { queue_at: sendAt }),
      attempts: 0,
      wamid: null,
      sent_at: null,
      delivery_status: null,
      response: null,
      created_at: FieldValue.serverTimestamp(),
    };
  }

  /** Arma la parrilla de una inscripción (en el mismo lote que la crea). */
  planEnrollment(
    batch: FirebaseFirestore.WriteBatch,
    org: Organization,
    enrollment: Omit<Enrollment, 'created_at'>,
    protocol: Protocol,
    phone: string,
    createdBy: string,
  ): number {
    const steps = orderedSteps(protocol.steps, org.default_send_time);
    for (const s of steps) {
      const { at, shifted } = computeSendAt({
        referenceDate: enrollment.reference_date,
        dayOffset: s.day_offset,
        time: s.time || org.default_send_time,
        timeZone: org.timezone,
        blockedWeekdays: org.blocked_weekdays,
      });
      batch.set(
        this.col(org.id).doc(),
        this.newDoc(
          {
            enrollment_id: enrollment.id,
            patient_id: enrollment.patient_id,
            patient_name: enrollment.patient_name,
            phone,
            protocol_id: protocol.id,
            protocol_name: protocol.name,
            step_id: s.id,
            appointment_id: null,
            step_label: s.label,
            day_offset: s.day_offset,
            template_key: s.template_key,
            at,
            shifted,
            manual: false,
            created_by: createdBy,
          },
          org.timezone,
        ),
      );
    }
    return steps.length;
  }

  /**
   * Recordatorios de una cita (en el mismo lote que la guarda). Los que ya
   * pasaron no se programan; se devuelven para avisar.
   */
  planAppointment(
    batch: FirebaseFirestore.WriteBatch,
    org: Organization,
    appt: Pick<Appointment, 'id' | 'patient_id' | 'patient_name' | 'date' | 'time' | 'reminders'>,
    phone: string,
    labels: Map<string, string>,
    createdBy: string,
    now = new Date(),
  ): { scheduled: number; past: string[] } {
    let scheduled = 0;
    const past: string[] = [];
    for (const r of appt.reminders) {
      const { at, shifted } = reminderSendAt(appt, r.timing, org);
      const when = reminderLabel(r.timing);
      if (at.getTime() < now.getTime() - PAST_GRACE_MS) {
        past.push(when);
        continue;
      }
      batch.set(
        this.col(org.id).doc(),
        this.newDoc(
          {
            enrollment_id: null,
            patient_id: appt.patient_id,
            patient_name: appt.patient_name,
            phone,
            protocol_id: null,
            protocol_name: null,
            step_id: r.id,
            appointment_id: appt.id,
            step_label: `${labels.get(r.template_key) ?? r.template_key} · ${when}`,
            day_offset: null,
            template_key: r.template_key,
            at,
            shifted,
            manual: true,
            created_by: createdBy,
          },
          org.timezone,
          now,
        ),
      );
      scheduled++;
    }
    return { scheduled, past };
  }

  async addManual(orgId: string, timeZone: string, item: NewOutboxItem): Promise<OutboxItem> {
    const ref = this.col(orgId).doc();
    await ref.set(this.newDoc(item, timeZone));
    return this.get(orgId, ref.id);
  }

  async get(orgId: string, id: string): Promise<OutboxItem> {
    const doc = await this.col(orgId).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Envío no encontrado');
    return this.toItem(doc.id, doc.data()!);
  }

  async list(orgId: string, fromIso: string, toIso: string): Promise<OutboxItem[]> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequestException(`El rango no puede pasar de ${MAX_RANGE_DAYS} días`);
    }
    const snap = await this.col(orgId)
      .where('send_at', '>=', Timestamp.fromDate(from))
      .where('send_at', '<', Timestamp.fromDate(to))
      .orderBy('send_at')
      .get();
    return snap.docs.map((d) => this.toItem(d.id, d.data()));
  }

  async listForPatient(orgId: string, patientId: string): Promise<OutboxItem[]> {
    const snap = await this.col(orgId).where('patient_id', '==', patientId).get();
    return snap.docs
      .map((d) => this.toItem(d.id, d.data()))
      .sort((a, b) => a.send_at.localeCompare(b.send_at));
  }

  async reschedule(orgId: string, timeZone: string, id: string, sendAt: Date): Promise<OutboxItem> {
    if (isNaN(sendAt.getTime())) throw new BadRequestException('Fecha inválida');
    if (sendAt.getTime() < Date.now() - 60_000) throw new BadRequestException('La fecha ya pasó');
    const item = await this.get(orgId, id);
    if (!RESCHEDULABLE.includes(item.status)) {
      throw new BadRequestException('Este envío ya salió o se está enviando');
    }
    const patient = await this.firebase.db
      .collection(COL.organizations)
      .doc(orgId)
      .collection(COL.patients)
      .doc(item.patient_id)
      .get();
    if (patient.get('opted_out')) throw new BadRequestException('El paciente se dio de baja');
    const ts = Timestamp.fromDate(sendAt);
    await this.col(orgId).doc(id).update({
      status: 'scheduled',
      status_reason: null,
      send_at: ts,
      queue_at: ts,
      local_date: localDate(sendAt, timeZone),
      shifted: false,
      attempts: 0,
    });
    return this.get(orgId, id);
  }

  async cancel(orgId: string, id: string, reason = 'Cancelado por la clínica'): Promise<OutboxItem> {
    const item = await this.get(orgId, id);
    if (!CANCELLABLE.includes(item.status)) throw new BadRequestException('Este envío no se puede cancelar');
    await this.col(orgId).doc(id).update({ status: 'cancelled', status_reason: reason, queue_at: FieldValue.delete() });
    return this.get(orgId, id);
  }

  /** Cancela lo pendiente de una inscripción, una cita o un paciente. */
  async cancelPending(orgId: string, field: 'enrollment_id' | 'appointment_id' | 'patient_id', value: string, reason: string) {
    const snap = await this.col(orgId).where(field, '==', value).get();
    const batch = this.firebase.db.batch();
    let n = 0;
    for (const doc of snap.docs) {
      if (!CANCELLABLE.includes(doc.get('status'))) continue;
      batch.update(doc.ref, { status: 'cancelled', status_reason: reason, queue_at: FieldValue.delete() });
      n++;
    }
    if (n) await batch.commit();
    return n;
  }

  /** Botón que tocó el paciente en un envío de la parrilla (queda la última respuesta). */
  async recordResponse(orgId: string, id: string, index: number, text: string, at: Timestamp) {
    const ref = this.col(orgId).doc(id);
    await this.firebase.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const prev = doc.get('response');
      if (!doc.exists || (prev?.at && prev.at.toMillis() > at.toMillis())) return;
      tx.update(ref, { response: { index, text, at } });
    });
  }
}
