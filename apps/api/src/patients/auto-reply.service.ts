import { Injectable, Logger } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { PLANS, isOptOutKeyword, optOutReply, type Organization } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';
import { MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';
import { PatientsService } from './patients.service';
import { OutboxService } from './outbox.service';
import { AlertNotifierService } from './alert-notifier.service';

interface ReplyMeta {
  kind: 'auto_reply' | 'opt_out';
  patient_id: string;
  outbox_id: string | null;
}

/**
 * Lo que pasa cuando el paciente contesta: la respuesta automática del botón
 * (planes con `auto_replies`), el aviso al equipo si el botón es una alerta
 * y la baja, por botón o escribiendo BAJA (en
 * todos los planes: la autorización de datos la promete). El paciente acaba
 * de escribir, así que la ventana de 24 h está abierta y se responde con texto
 * libre, sin plantilla.
 */
@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
    private readonly patients: PatientsService,
    private readonly outbox: OutboxService,
    private readonly notifier: AlertNotifierService,
  ) {}

  /** Botón de un envío de la parrilla. */
  async onButton(orgId: string, outboxId: string, index: number, from: string) {
    const item = (await this.outbox.col(orgId).doc(outboxId).get()).data();
    if (!item) return;
    const template = await this.templates.byKey({ orgId }, item.template_key);
    // La versión aprobada es la que se envió
    const button = (template?.approved?.buttons ?? template?.buttons ?? [])[index];
    const action = button?.action;
    if (!action || action.type === 'none') return;
    const org = await this.orgs.get(orgId);
    const meta: ReplyMeta = { kind: 'auto_reply', patient_id: item.patient_id, outbox_id: outboxId };

    if (action.type === 'opt_out') {
      const patient = await this.patients.get(orgId, item.patient_id);
      if (patient.opted_out) return;
      await this.patients.optOut(orgId, patient.id, `Tocó "${button.text}" en WhatsApp`);
      await this.send(org, from, action.reply_text || optOutReply(org.name), { ...meta, kind: 'opt_out' });
      return;
    }
    if (action.reply_text && PLANS[org.plan]?.features.auto_replies) {
      await this.send(org, from, action.reply_text, meta);
    }
    if (action.type === 'alert') {
      await this.notifier.notify(org, {
        patient: item.patient_name,
        button: button.text,
        step: item.step_label,
        level: action.alert_level ?? 'info',
      });
    }
  }

  /** Texto escrito por el paciente; true si era una baja. */
  async onText(orgId: string, from: string, text: string | null): Promise<boolean> {
    if (!isOptOutKeyword(text)) return false;
    const patient = await this.patients.findByPhone(orgId, from);
    if (!patient || patient.opted_out) return !!patient;
    await this.patients.optOut(orgId, patient.id, `Escribió "${text!.trim()}" en WhatsApp`);
    const org = await this.orgs.get(orgId);
    await this.send(org, from, optOutReply(org.name), { kind: 'opt_out', patient_id: patient.id, outbox_id: null });
    return true;
  }

  /** Envía el texto y lo deja en `messages`; si falla solo se registra (la baja ya quedó). */
  private async send(org: Organization, to: string, body: string, meta: ReplyMeta) {
    if (org.status === 'suspended') return;
    const [conn, secrets] = await Promise.all([this.store.raw(org.id), this.store.getSecrets(org.id)]);
    if (!conn.phone_number_id || !secrets.access_token) return;
    try {
      const res = await this.graph.post(`/${conn.phone_number_id}/messages`, secrets.access_token, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      });
      const wamid = res.messages?.[0]?.id;
      if (!wamid) return;
      await this.firebase.db
        .collection(COL.organizations)
        .doc(org.id)
        .collection(COL.messages)
        .doc(wamid)
        .set({ direction: 'out', ...meta, to, type: 'text', text: body, created_at: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      this.logger.warn(`Respuesta automática ${org.id} → ${to}: ${(e as Error).message}`);
    }
  }
}
