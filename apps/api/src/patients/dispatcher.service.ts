import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildSendComponents, outboxButtonPayload, type Organization, type Template } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { MetaApiError, MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';
import { EnrollmentsService } from './enrollments.service';
import { variableValues } from './variables';
import { AppointmentsService, appointmentContext } from './appointments.service';
import { UsageService } from './usage.service';

const BATCH = 50;
const LEASE_MS = 3 * 60_000;
const MAX_ATTEMPTS = 5;
/** Lo que se atrasó más que esto (p. ej. con la organización suspendida) ya no sale. */
const STALE_MS = 12 * 3_600_000;
/** Códigos de Meta que se pueden reintentar: límites de velocidad y fallas temporales */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131056, 133004]);

export function isRetryable(e: unknown): boolean {
  if (!(e instanceof MetaApiError)) return true; // red, timeout
  if (e.httpStatus === 429 || e.httpStatus >= 500) return true;
  return e.code !== undefined && RETRYABLE_CODES.has(e.code);
}

/** Espera antes del reintento n (1, 4, 9, 16 minutos). */
export const backoffMs = (attempt: number) => attempt * attempt * 60_000;

interface OrgContext {
  org: Organization;
  phoneId: string | null;
  token: string | null;
  templates: Map<string, Template | null>;
  /** Mes en curso (hora de la clínica) y mensajes ya enviados en él */
  month: string;
  sent: number;
}

type Outcome = { status: 'sent'; wamid: string } | { status: 'failed' | 'cancelled' | 'skipped'; reason: string } | { status: 'retry'; reason: string };

/**
 * Cada minuto envía lo que ya toca de la parrilla de las organizaciones
 * activas. Cada envío se toma con una transacción (estado `sending` y un
 * plazo), así dos instancias no envían lo mismo. Solo corre con
 * DISPATCH_ENABLED=true: local y producción comparten la base y un backend
 * local no debe enviar mensajes.
 */
@Injectable()
export class DispatcherService implements OnModuleInit {
  private readonly logger = new Logger(DispatcherService.name);
  private running = false;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
    private readonly enrollments: EnrollmentsService,
    private readonly appointments: AppointmentsService,
    private readonly usage: UsageService,
  ) {}

  get enabled() {
    return process.env.DISPATCH_ENABLED === 'true';
  }

  /** DISPATCH_ORG_IDS (separados por coma) limita el envío a esas organizaciones, p. ej. la de demo en local. */
  get onlyOrgs(): Set<string> | null {
    const ids = (process.env.DISPATCH_ORG_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }

  onModuleInit() {
    const only = this.onlyOrgs;
    this.logger.log(
      !this.enabled
        ? 'Despachador apagado (falta DISPATCH_ENABLED=true)'
        : only
          ? `Despachador encendido (cada minuto) solo para: ${[...only].join(', ')}`
          : 'Despachador encendido (cada minuto)',
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const active = await this.firebase.db.collection(COL.organizations).where('status', '==', 'active').select().get();
      const only = this.onlyOrgs;
      for (const doc of active.docs) {
        if (only && !only.has(doc.id)) continue;
        try {
          await this.dispatchOrg(doc.id, new Date());
        } catch (e) {
          this.logger.error(`Despacho ${doc.id}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private outbox(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId).collection(COL.outbox);
  }

  async dispatchOrg(orgId: string, now: Date) {
    await this.releaseExpiredLeases(orgId, now);
    const due = await this.outbox(orgId)
      .where('queue_at', '<=', Timestamp.fromDate(now))
      .orderBy('queue_at')
      .limit(BATCH)
      .get();
    if (due.empty) return;

    let ctx: OrgContext | null = null;
    for (const doc of due.docs) {
      const item = await this.claim(doc.ref, now);
      if (!item) continue;
      ctx ??= await this.loadContext(orgId, now);
      const outcome = await this.send(ctx, doc.id, item, now);
      if (outcome.status === 'sent') {
        ctx.sent++;
        await this.usage.countMessage(orgId, ctx.month);
      }
      await this.finish(orgId, doc.ref, item, outcome, now);
    }
  }

  /**
   * "Enviar ahora" de la clínica: sale en el momento, sin esperar al
   * despachador (que en local está apagado). Si Meta pide reintentar, queda
   * programado como cualquier otro envío.
   */
  async dispatchNow(orgId: string, id: string) {
    const now = new Date();
    const ref = this.outbox(orgId).doc(id);
    const item = await this.claim(ref, now);
    if (!item) return; // ya lo tomó el despachador
    const ctx = await this.loadContext(orgId, now);
    const outcome = await this.send(ctx, id, item, now);
    if (outcome.status === 'sent') await this.usage.countMessage(orgId, ctx.month);
    await this.finish(orgId, ref, item, outcome, now);
  }

  /** Toma el envío si sigue programado y vencido. */
  private async claim(ref: FirebaseFirestore.DocumentReference, now: Date) {
    return this.firebase.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      if (!d || d.status !== 'scheduled' || !d.queue_at || d.queue_at.toMillis() > now.getTime()) return null;
      tx.update(ref, {
        status: 'sending',
        queue_at: FieldValue.delete(),
        lease_until: Timestamp.fromMillis(now.getTime() + LEASE_MS),
        attempts: FieldValue.increment(1),
      });
      return { ...d, attempts: (d.attempts ?? 0) + 1 };
    });
  }

  private async loadContext(orgId: string, now: Date): Promise<OrgContext> {
    const [org, conn, secrets] = await Promise.all([
      this.orgs.get(orgId),
      this.store.raw(orgId),
      this.store.getSecrets(orgId),
    ]);
    const month = this.usage.monthOf(now, org.timezone);
    return {
      org,
      phoneId: conn.phone_number_id ?? null,
      token: secrets.access_token ?? null,
      templates: new Map(),
      month,
      sent: await this.usage.messagesSent(orgId, month),
    };
  }

  private async send(ctx: OrgContext, id: string, item: FirebaseFirestore.DocumentData, now: Date): Promise<Outcome> {
    const orgRef = this.firebase.db.collection(COL.organizations).doc(ctx.org.id);
    if (now.getTime() - item.send_at.toMillis() > STALE_MS) {
      return { status: 'skipped', reason: 'Vencido: no se envió a tiempo' };
    }
    const patient = (await orgRef.collection(COL.patients).doc(item.patient_id).get()).data();
    if (!patient) return { status: 'cancelled', reason: 'El paciente ya no existe' };
    if (patient.opted_out) return { status: 'cancelled', reason: 'El paciente se dio de baja' };

    let enrollment = null;
    if (item.appointment_id) {
      const appt = (await orgRef.collection(COL.appointments).doc(item.appointment_id).get()).data();
      if (!appt || appt.status !== 'scheduled') return { status: 'cancelled', reason: 'La cita ya no está agendada' };
      enrollment = appointmentContext(appt as any);
    } else if (item.enrollment_id) {
      enrollment = (await orgRef.collection(COL.enrollments).doc(item.enrollment_id).get()).data() ?? null;
      if (!enrollment || enrollment.status !== 'active') return { status: 'cancelled', reason: 'Inscripción cancelada' };
    } else {
      enrollment = await this.appointments.manualContext(ctx.org.id, ctx.org.timezone, item.patient_id);
    }

    if (!ctx.templates.has(item.template_key)) {
      ctx.templates.set(item.template_key, await this.templates.byKey({ orgId: ctx.org.id }, item.template_key));
    }
    const template = ctx.templates.get(item.template_key);
    if (!template) return { status: 'failed', reason: `La plantilla "${item.template_key}" ya no existe` };
    const approved = template.approved;
    if (!approved) return { status: 'failed', reason: 'La plantilla no tiene una versión aprobada en Meta' };
    if (!ctx.phoneId || !ctx.token) return { status: 'failed', reason: 'WhatsApp no está conectado' };
    // Límite mensual: lo que pase de ahí queda omitido (la clínica puede reenviarlo si se sube el límite)
    const limit = ctx.org.monthly_message_limit;
    if (limit !== null && ctx.sent >= limit) {
      return { status: 'skipped', reason: `Se alcanzó el límite de ${limit} mensajes del mes` };
    }

    let components: any[];
    try {
      components = buildSendComponents({
        variables: approved.variables,
        values: variableValues({ org: ctx.org, patient: patient as any, enrollment: enrollment as any }),
        buttons: approved.buttons,
        payloadFor: (i) => outboxButtonPayload(id, i),
      });
    } catch (e) {
      return { status: 'failed', reason: (e as Error).message };
    }

    try {
      const res = await this.graph.post(`/${ctx.phoneId}/messages`, ctx.token, {
        messaging_product: 'whatsapp',
        to: patient.phone,
        type: 'template',
        template: { name: approved.meta_name, language: { code: approved.language }, components },
      });
      const wamid = res.messages?.[0]?.id;
      if (!wamid) return { status: 'failed', reason: 'Meta no devolvió el id del mensaje' };
      return { status: 'sent', wamid };
    } catch (e) {
      const reason = (e as Error).message;
      if (isRetryable(e) && item.attempts < MAX_ATTEMPTS) return { status: 'retry', reason };
      return { status: 'failed', reason };
    }
  }

  private async finish(
    orgId: string,
    ref: FirebaseFirestore.DocumentReference,
    item: FirebaseFirestore.DocumentData,
    outcome: Outcome,
    now: Date,
  ) {
    const base = { lease_until: FieldValue.delete() };
    if (outcome.status === 'sent') {
      await ref.update({
        ...base,
        status: 'sent',
        status_reason: null,
        wamid: outcome.wamid,
        sent_at: FieldValue.serverTimestamp(),
        delivery_status: 'accepted',
      });
      // El estado lo pone el webhook (puede llegar antes que esta escritura)
      await this.firebase.db
        .collection(COL.organizations)
        .doc(orgId)
        .collection(COL.messages)
        .doc(outcome.wamid)
        .set(
          {
            direction: 'out',
            kind: 'outbox',
            outbox_id: ref.id,
            patient_id: item.patient_id,
            enrollment_id: item.enrollment_id ?? null,
            appointment_id: item.appointment_id ?? null,
            to: item.phone,
            type: 'template',
            template_key: item.template_key,
            created_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      if (item.enrollment_id) await this.enrollments.completeIfDone(orgId, item.enrollment_id);
    } else if (outcome.status === 'retry') {
      const next = Timestamp.fromMillis(now.getTime() + backoffMs(item.attempts));
      await ref.update({ ...base, status: 'scheduled', queue_at: next, status_reason: `Reintento: ${outcome.reason}` });
    } else {
      await ref.update({ ...base, status: outcome.status, status_reason: outcome.reason });
      if (item.enrollment_id) await this.enrollments.completeIfDone(orgId, item.enrollment_id);
    }
  }

  /**
   * Un envío que quedó en `sending` con el plazo vencido (el proceso se cayó a
   * mitad) no se reintenta solo: pudo haber salido. Queda fallido para que la
   * clínica revise antes de reenviarlo.
   */
  private async releaseExpiredLeases(orgId: string, now: Date) {
    const snap = await this.outbox(orgId).where('lease_until', '<=', Timestamp.fromDate(now)).limit(20).get();
    for (const doc of snap.docs) {
      if (doc.get('status') !== 'sending') {
        await doc.ref.update({ lease_until: FieldValue.delete() });
        continue;
      }
      await doc.ref.update({
        status: 'failed',
        status_reason: 'El envío se interrumpió y no se sabe si salió: revisa antes de reenviar',
        lease_until: FieldValue.delete(),
      });
    }
  }
}
