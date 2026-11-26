import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_RANK,
  PLANS,
  metaTemplateName,
  sanitizeParam,
  type AlertLevel,
  type AlertTemplateState,
  type Organization,
  type TemplateMetaStatus,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { MetaApiError, MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';

/**
 * Plantilla de aviso al equipo: la crea Gen.ON en la cuenta de WhatsApp de la
 * clínica (no se edita desde Plantillas). Los celulares del equipo no han
 * escrito, así que el aviso tiene que ir con plantilla aprobada.
 */
const KEY = 'genon_aviso_alerta';
const BODY =
  'Alerta de Gen.ON en {{1}}: {{2}} respondió «{{3}}» al mensaje «{{4}}» (nivel {{5}}). Revisa «Requiere atención» en Gen.ON para hacer el seguimiento.';
const EXAMPLE = ['Clínica Sol', 'María Pérez', 'Tengo dolor', 'Control día 3', 'Urgente'];
const LANGUAGE = 'es';

export interface AlertNotice {
  patient: string;
  button: string;
  step: string;
  level: AlertLevel;
}

@Injectable()
export class AlertNotifierService {
  private readonly logger = new Logger(AlertNotifierService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
  ) {}

  private async access(orgId: string) {
    const [conn, { access_token }] = await Promise.all([this.store.raw(orgId), this.store.getSecrets(orgId)]);
    if (!conn.waba_id || !conn.phone_number_id || !access_token) {
      throw new BadRequestException('La organización aún no tiene la cuenta de WhatsApp conectada');
    }
    return { wabaId: conn.waba_id as string, phoneId: conn.phone_number_id as string, token: access_token };
  }

  private async save(orgId: string, state: AlertTemplateState) {
    await this.firebase.db.collection(COL.organizations).doc(orgId).update({ alert_template: state, updated_at: FieldValue.serverTimestamp() });
    return state;
  }

  /** Crea la plantilla en Meta (o la vuelve a crear con otra versión si la rechazaron). */
  async activate(orgId: string): Promise<AlertTemplateState> {
    const org = await this.orgs.get(orgId);
    const current = org.alert_template;
    if (current && current.status !== 'REJECTED') return this.refresh(orgId);
    const { wabaId, token } = await this.access(orgId);
    const version = (current?.version ?? 0) + 1;
    const name = metaTemplateName(KEY, version);
    try {
      const res = await this.graph.post(`/${wabaId}/message_templates`, token, {
        name,
        language: LANGUAGE,
        category: 'UTILITY',
        components: [{ type: 'BODY', text: BODY, example: { body_text: [EXAMPLE] } }],
      });
      return this.save(orgId, {
        meta_name: name,
        meta_id: res.id ?? null,
        version,
        status: String(res.status || 'PENDING').toUpperCase() as TemplateMetaStatus,
        rejected_reason: null,
      });
    } catch (e) {
      // Ya existe con ese nombre (p. ej. se activó antes sin guardar): se adopta
      const remote = e instanceof MetaApiError ? await this.find(wabaId, token, name) : null;
      if (!remote) throw e;
      return this.save(orgId, { meta_name: name, meta_id: remote.id, version, status: remote.status, rejected_reason: remote.reason });
    }
  }

  /** Trae el estado de Meta si todavía no está aprobada. */
  async refresh(orgId: string): Promise<AlertTemplateState> {
    const org = await this.orgs.get(orgId);
    const current = org.alert_template;
    if (!current) throw new BadRequestException('Los avisos por WhatsApp no están activados');
    if (current.status === 'APPROVED') return current;
    const { wabaId, token } = await this.access(orgId);
    const remote = await this.find(wabaId, token, current.meta_name);
    if (!remote) return current;
    return this.save(orgId, { ...current, meta_id: remote.id, status: remote.status, rejected_reason: remote.reason });
  }

  private async find(wabaId: string, token: string, name: string) {
    const res = await this.graph.get(`/${wabaId}/message_templates`, token, { name, fields: 'id,name,status,language,rejected_reason' });
    const r = (res.data ?? []).find((t: any) => t.name === name && t.language === LANGUAGE);
    return r
      ? { id: String(r.id), status: String(r.status).toUpperCase() as TemplateMetaStatus, reason: r.rejected_reason && r.rejected_reason !== 'NONE' ? r.rejected_reason : null }
      : null;
  }

  /** Evento `message_template_status_update` del webhook, si es la plantilla de aviso. */
  async applyWebhookStatus(orgId: string, value: any) {
    const org = await this.orgs.get(orgId);
    const current = org.alert_template;
    if (!current?.meta_id || String(value?.message_template_id) !== current.meta_id) return;
    await this.save(orgId, {
      ...current,
      status: String(value.event).toUpperCase() as TemplateMetaStatus,
      rejected_reason: value.reason && value.reason !== 'NONE' ? value.reason : null,
    });
  }

  /** Avisa al equipo una alerta de botón si el plan, el nivel y la plantilla lo permiten. */
  async notify(org: Organization, notice: AlertNotice) {
    if (!PLANS[org.plan]?.features.alerts || org.status === 'suspended' || !org.alert_notify_phones.length) return;
    if (ALERT_LEVEL_RANK[notice.level] < ALERT_LEVEL_RANK[org.alert_notify_level]) return;
    let template = org.alert_template;
    if (!template) return;
    if (template.status !== 'APPROVED') template = await this.refresh(org.id);
    if (template.status !== 'APPROVED') return;
    await this.sendAll(org, template, notice);
  }

  /** Aviso de prueba a los celulares configurados. */
  async test(orgId: string) {
    const org = await this.orgs.get(orgId);
    if (!org.alert_notify_phones.length) throw new BadRequestException('Agrega al menos un celular para las alertas');
    const template = org.alert_template && (await this.refresh(orgId));
    if (template?.status !== 'APPROVED') throw new BadRequestException('La plantilla de aviso todavía no está aprobada por Meta');
    const results = await this.sendAll(org, template, { patient: 'Paciente de prueba', button: 'Prueba', step: 'Aviso de prueba', level: org.alert_notify_level });
    const failed = results.filter((r) => r.error);
    if (failed.length === results.length) throw new BadRequestException(failed[0].error);
    return { sent: results.length - failed.length, failed };
  }

  private async sendAll(org: Organization, template: AlertTemplateState, notice: AlertNotice) {
    const { phoneId, token } = await this.access(org.id);
    const values = [org.name, notice.patient, notice.button, notice.step, ALERT_LEVEL_LABELS[notice.level]];
    const results: { phone: string; error: string | null }[] = [];
    for (const phone of org.alert_notify_phones) {
      try {
        const res = await this.graph.post(`/${phoneId}/messages`, token, {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template.meta_name,
            language: { code: LANGUAGE },
            components: [{ type: 'body', parameters: values.map((v) => ({ type: 'text', text: sanitizeParam(v, 120) })) }],
          },
        });
        const wamid = res.messages?.[0]?.id;
        if (wamid) {
          await this.firebase.db
            .collection(COL.organizations)
            .doc(org.id)
            .collection(COL.messages)
            .doc(wamid)
            .set({ direction: 'out', kind: 'staff_alert', to: phone, type: 'template', template_key: KEY, created_at: FieldValue.serverTimestamp() }, { merge: true });
        }
        results.push({ phone, error: null });
      } catch (e) {
        this.logger.warn(`Aviso de alerta ${org.id} → ${phone}: ${(e as Error).message}`);
        results.push({ phone, error: (e as Error).message });
      }
    }
    return results;
  }
}
