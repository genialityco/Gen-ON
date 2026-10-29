import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { parseOutboxButtonPayload, type MessageDeliveryStatus } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, localDate } from '../common/firestore';
import { MetaConnectionStore } from '../meta/meta-connection.store';
import { MetaSetupService } from '../meta/meta-setup.service';
import { isValidMetaSignature, safeEqual } from '../meta/signature';
import { TemplatesService } from '../templates/templates.service';
import { OutboxService } from '../patients/outbox.service';

/** Un estado nunca retrocede (read no vuelve a delivered); failed siempre gana. */
const STATUS_RANK: Record<MessageDeliveryStatus, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function nextStatus(
  current: MessageDeliveryStatus | undefined,
  incoming: MessageDeliveryStatus,
): MessageDeliveryStatus {
  if (!current) return incoming;
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current;
}

/** Texto legible de un mensaje entrante (para la bandeja y el motor de respuestas). */
export function inboundSummary(m: any): { text: string | null; reply: { id: string; title: string } | null } {
  switch (m.type) {
    case 'text':
      return { text: m.text?.body ?? null, reply: null };
    case 'button':
      // Botón de respuesta rápida de una plantilla
      return { text: m.button?.text ?? null, reply: { id: m.button?.payload ?? '', title: m.button?.text ?? '' } };
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return { text: r?.title ?? null, reply: r ? { id: r.id, title: r.title } : null };
    }
    default:
      return { text: m[m.type]?.caption ?? null, reply: null };
  }
}

/**
 * Eventos del webhook de Meta de cada organización: valida la firma con la
 * clave de su app, guarda el evento crudo y aplica estados de entrega,
 * mensajes entrantes y cambios de estado de las plantillas. Meta puede
 * repetir eventos: todo es idempotente.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly store: MetaConnectionStore,
    private readonly setup: MetaSetupService,
    private readonly templates: TemplatesService,
    private readonly outbox: OutboxService,
  ) {}

  private org(orgId: string) {
    return this.firebase.db.collection(COL.organizations).doc(orgId);
  }

  async verify(orgId: string, mode: string, token: string, challenge: string): Promise<string> {
    const { verify_token } = await this.store.getSecrets(orgId);
    if (mode !== 'subscribe' || !verify_token || !token || !safeEqual(token, verify_token)) {
      throw new ForbiddenException('Verify token inválido');
    }
    await this.setup.markWebhookVerified(orgId);
    this.logger.log(`Webhook verificado: ${orgId}`);
    return challenge;
  }

  async receive(orgId: string, rawBody: Buffer | undefined, signature: string | undefined, body: any) {
    const { app_secret } = await this.store.getSecrets(orgId);
    if (!app_secret) throw new NotFoundException('Organización sin app configurada');
    if (!isValidMetaSignature(rawBody, signature, app_secret)) {
      throw new ForbiddenException('Firma inválida');
    }

    // Primero el evento crudo: si esto falla, Meta reintenta
    const eventRef = await this.org(orgId).collection(COL.webhookEvents).add({
      body,
      received_at: FieldValue.serverTimestamp(),
      processed: false,
    });

    try {
      await this.process(orgId, body);
      await eventRef.update({ processed: true });
    } catch (e) {
      this.logger.error(`Webhook ${orgId}: ${(e as Error).message}`);
      await eventRef.update({ processed: false, error: (e as Error).message });
    }
  }

  private async process(orgId: string, body: any) {
    const [orgSnap, conn] = await Promise.all([this.org(orgId).get(), this.store.raw(orgId)]);
    const timezone = orgSnap.data()?.timezone || 'America/Bogota';

    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'message_template_status_update') {
          await this.templates.applyWebhookStatus(orgId, change.value);
          continue;
        }
        if (change.field !== 'messages') continue; // el resto queda en webhook_events
        const value = change.value ?? {};
        const phoneId = value.metadata?.phone_number_id;
        if (conn.phone_number_id && phoneId && phoneId !== conn.phone_number_id) {
          this.logger.warn(`Webhook ${orgId}: evento de otro número (${phoneId})`);
          continue;
        }
        for (const s of value.statuses ?? []) {
          await this.applyStatus(orgId, timezone, s, conn.test?.wamid);
        }
        const names = new Map<string, string>(
          (value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]),
        );
        for (const m of value.messages ?? []) {
          await this.saveInbound(orgId, timezone, m, names.get(m.from) ?? null);
        }
      }
    }
    await this.store.update(orgId, { webhook: { last_event_at: FieldValue.serverTimestamp() } });
  }

  private async applyStatus(orgId: string, timezone: string, s: any, testWamid?: string) {
    const status = s.status as MessageDeliveryStatus;
    if (!(status in STATUS_RANK) || !s.id) return;
    const at = Timestamp.fromMillis(Number(s.timestamp) * 1000 || Date.now());
    const msgRef = this.org(orgId).collection(COL.messages).doc(s.id);
    const statsRef = this.org(orgId).collection(COL.statsDaily).doc(localDate(at.toDate(), timezone));

    const final = await this.firebase.db.runTransaction(async (tx) => {
      const current = (await tx.get(msgRef)).data();
      if (current?.statuses?.[status]) return null; // repetido
      const resolved = nextStatus(current?.status, status);
      const patch: Record<string, unknown> = {
        status: resolved,
        statuses: { [status]: at },
        recipient: s.recipient_id ?? current?.recipient ?? null,
        updated_at: FieldValue.serverTimestamp(),
      };
      if (s.errors?.length) patch.errors = s.errors;
      const stats: Record<string, unknown> = { date: statsRef.id, [status]: FieldValue.increment(1) };
      if (s.pricing && !current?.pricing) {
        patch.pricing = s.pricing;
        if (s.pricing.billable !== false && s.pricing.category) {
          stats.billable = { [s.pricing.category]: FieldValue.increment(1) };
        }
      }
      tx.set(msgRef, patch, { merge: true });
      tx.set(statsRef, stats, { merge: true });
      // La parrilla muestra el estado de entrega de cada envío
      if (current?.outbox_id) {
        const err = s.errors?.[0];
        tx.set(
          this.outbox.col(orgId).doc(current.outbox_id),
          {
            delivery_status: resolved,
            ...(status === 'failed' ? { status_reason: err?.title || err?.message || 'No entregado' } : {}),
          },
          { merge: true },
        );
      }
      return resolved;
    });

    if (final && testWamid && s.id === testWamid) {
      if (final === 'failed') {
        const err = s.errors?.[0];
        await this.store.setStep(orgId, 'test', 'error', err?.title || err?.message || 'Mensaje fallido');
      } else if (final === 'delivered' || final === 'read') {
        await this.store.setStep(orgId, 'test', 'done');
      }
    }
  }

  private async saveInbound(orgId: string, timezone: string, m: any, contactName: string | null) {
    if (!m.id || !m.from) return;
    const at = Timestamp.fromMillis(Number(m.timestamp) * 1000 || Date.now());
    const { text, reply } = inboundSummary(m);
    const msgRef = this.org(orgId).collection(COL.messages).doc(m.id);
    const statsRef = this.org(orgId).collection(COL.statsDaily).doc(localDate(at.toDate(), timezone));
    // Último mensaje del contacto: abre la ventana de 24 h para mensajes libres
    const contactRef = this.org(orgId).collection(COL.waContacts).doc(m.from);
    const outboxReply = parseOutboxButtonPayload(reply?.id);

    const isNew = await this.firebase.db.runTransaction(async (tx) => {
      if ((await tx.get(msgRef)).exists) return false;
      tx.set(msgRef, {
        direction: 'in',
        from: m.from,
        contact_name: contactName,
        type: m.type,
        text,
        reply,
        outbox_id: outboxReply?.outboxId ?? null,
        context_wamid: m.context?.id ?? null,
        received_at: at,
        raw: m,
        handled: false,
        created_at: FieldValue.serverTimestamp(),
      });
      tx.set(statsRef, { date: statsRef.id, inbound: FieldValue.increment(1) }, { merge: true });
      tx.set(contactRef, { wa_id: m.from, name: contactName, last_inbound_at: at }, { merge: true });
      return true;
    });

    if (isNew && outboxReply) {
      await this.outbox.recordResponse(orgId, outboxReply.outboxId, outboxReply.index, reply?.title ?? '', at);
    }
  }
}
