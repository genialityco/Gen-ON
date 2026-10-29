import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  buildMetaTemplate,
  metaTemplateName,
  slugKey,
  validateTemplate,
  type Template,
  type TemplateButton,
  type TemplateContent,
  type TemplateInput,
  type TemplateMetaStatus,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull, type Scope } from '../common/firestore';
import { MetaGraphClient } from '../meta/graph.client';
import { MetaConnectionStore } from '../meta/meta-connection.store';

const CONTENT_FIELDS: (keyof TemplateContent)[] = ['header', 'body', 'footer', 'buttons', 'category', 'language'];

/** Deja los botones con la forma esperada (lo que llega del cliente es libre). */
function cleanButtons(raw: unknown): TemplateButton[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((b: any) => {
    if (b?.type === 'URL') return { type: 'URL', text: String(b.text ?? '').trim(), url: String(b.url ?? '').trim() };
    const a = b?.action ?? {};
    const type = ['none', 'confirm', 'reply', 'alert', 'opt_out'].includes(a.type) ? a.type : 'none';
    return {
      type: 'QUICK_REPLY',
      text: String(b?.text ?? '').trim(),
      action: {
        type,
        reply_text: a.reply_text ? String(a.reply_text).trim() : null,
        alert_level: type === 'alert' && ['info', 'warning', 'urgent'].includes(a.alert_level) ? a.alert_level : null,
      },
    };
  });
}

/**
 * Plantillas de una organización (con su ciclo en Meta) o de la biblioteca
 * global (solo contenido, se copian a las organizaciones).
 *
 * Una plantilla enviada a Meta no se edita en sitio: al cambiar el contenido
 * vuelve a borrador con versión nueva y la aprobada (`approved`) sigue
 * usándose hasta que se apruebe la nueva.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
  ) {}

  col(scope: Scope) {
    const db = this.firebase.db;
    return scope === 'library'
      ? db.collection(COL.libraryTemplates)
      : db.collection(COL.organizations).doc(scope.orgId).collection(COL.templates);
  }

  toTemplate(id: string, d: FirebaseFirestore.DocumentData): Template {
    return {
      id,
      key: d.key,
      label: d.label,
      category: d.category ?? 'UTILITY',
      language: d.language ?? 'es',
      header: d.header ?? '',
      body: d.body ?? '',
      footer: d.footer ?? '',
      buttons: d.buttons ?? [],
      version: d.version ?? 1,
      clinical_validated_by: d.clinical_validated_by ?? null,
      clinical_validated_at: isoOrNull(d.clinical_validated_at),
      meta_status: d.meta_status ?? 'DRAFT',
      meta_name: d.meta_name ?? null,
      meta_id: d.meta_id ?? null,
      meta_category: d.meta_category ?? null,
      rejected_reason: d.rejected_reason ?? null,
      meta_variables: d.meta_variables ?? [],
      submitted_at: isoOrNull(d.submitted_at),
      approved: d.approved ? { ...d.approved, approved_at: isoOrNull(d.approved.approved_at) } : null,
      synced_at: isoOrNull(d.synced_at),
      created_at: isoOrNull(d.created_at),
      updated_at: isoOrNull(d.updated_at),
    };
  }

  async list(scope: Scope): Promise<Template[]> {
    const snap = await this.col(scope).orderBy('key').get();
    return snap.docs.map((d) => this.toTemplate(d.id, d.data()));
  }

  async get(scope: Scope, id: string): Promise<Template> {
    const doc = await this.col(scope).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Plantilla no encontrada');
    return this.toTemplate(doc.id, doc.data()!);
  }

  async byKey(scope: Scope, key: string): Promise<Template | null> {
    const snap = await this.col(scope).where('key', '==', key).limit(1).get();
    return snap.empty ? null : this.toTemplate(snap.docs[0].id, snap.docs[0].data());
  }

  async keys(scope: Scope): Promise<Set<string>> {
    const snap = await this.col(scope).select('key').get();
    return new Set(snap.docs.map((d) => d.get('key') as string));
  }

  async create(scope: Scope, input: TemplateInput, extra: Record<string, unknown> = {}): Promise<Template> {
    const key = slugKey(input.key || input.label || '');
    if (!key) throw new BadRequestException('La plantilla necesita una clave');
    if (await this.byKey(scope, key)) throw new ConflictException(`Ya existe una plantilla "${key}"`);
    const ref = this.col(scope).doc();
    const validatedBy = input.clinical_validated_by?.trim() || null;
    await ref.set({
      key,
      label: String(input.label || key).trim(),
      category: input.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
      language: input.language || 'es',
      header: String(input.header ?? '').trim(),
      body: String(input.body ?? '').trim(),
      footer: String(input.footer ?? '').trim(),
      buttons: cleanButtons(input.buttons),
      version: 1,
      clinical_validated_by: validatedBy,
      clinical_validated_at: validatedBy ? FieldValue.serverTimestamp() : null,
      meta_status: 'DRAFT',
      approved: null,
      has_approved: false,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      ...extra,
    });
    return this.get(scope, ref.id);
  }

  async update(scope: Scope, id: string, input: TemplateInput): Promise<Template> {
    const t = await this.get(scope, id);
    const next: Partial<TemplateContent> = {};
    if (input.label !== undefined) next.label = String(input.label).trim();
    if (input.header !== undefined) next.header = String(input.header).trim();
    if (input.body !== undefined) next.body = String(input.body).trim();
    if (input.footer !== undefined) next.footer = String(input.footer).trim();
    if (input.buttons !== undefined) next.buttons = cleanButtons(input.buttons);
    if (input.category === 'UTILITY' || input.category === 'MARKETING') next.category = input.category;
    if (input.language) next.language = input.language;

    const contentChanged = CONTENT_FIELDS.some(
      (k) => next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(t[k]),
    );
    const patch: Record<string, unknown> = { ...next, updated_at: FieldValue.serverTimestamp() };

    // La validación clínica es del texto: si cambia, hay que validarlo de nuevo
    const validatedBy = input.clinical_validated_by?.trim();
    if (validatedBy) {
      patch.clinical_validated_by = validatedBy;
      patch.clinical_validated_at = FieldValue.serverTimestamp();
    } else if (contentChanged || input.clinical_validated_by === null) {
      patch.clinical_validated_by = null;
      patch.clinical_validated_at = null;
    }

    if (contentChanged && scope !== 'library' && t.meta_status !== 'DRAFT') {
      Object.assign(patch, {
        version: t.version + 1,
        meta_status: 'DRAFT',
        meta_id: null,
        meta_name: null,
        meta_category: null,
        rejected_reason: null,
        submitted_at: null,
      });
    }
    await this.col(scope).doc(id).update(patch);
    return this.get(scope, id);
  }

  async remove(scope: Scope, id: string, usedInProtocols: (key: string) => Promise<string[]>) {
    const t = await this.get(scope, id);
    const used = await usedInProtocols(t.key);
    if (used.length) {
      throw new ConflictException(`La usan estos protocolos: ${used.join(', ')}`);
    }
    await this.col(scope).doc(id).delete();
  }

  // ---- Meta (solo organizaciones) ----

  private async metaAccess(orgId: string) {
    const [conn, { access_token }] = await Promise.all([this.store.raw(orgId), this.store.getSecrets(orgId)]);
    if (!conn.waba_id || !access_token) {
      throw new BadRequestException('La organización aún no tiene la cuenta de WhatsApp conectada');
    }
    return { wabaId: conn.waba_id as string, token: access_token };
  }

  /** Envía la plantilla a revisión de Meta. */
  async submit(orgId: string, id: string): Promise<Template> {
    const t = await this.get({ orgId }, id);
    if (t.meta_status !== 'DRAFT' && t.meta_status !== 'REJECTED') {
      throw new BadRequestException('La plantilla ya está en Meta. Edítala para crear una versión nueva.');
    }
    if (!t.clinical_validated_by) {
      throw new BadRequestException('Falta la validación clínica: indica qué profesional revisó el texto.');
    }
    const errors = validateTemplate(t);
    if (errors.length) throw new BadRequestException(errors.join(' '));
    const { wabaId, token } = await this.metaAccess(orgId);

    // Un nombre rechazado no se puede reutilizar: se sube de versión
    const version = t.meta_status === 'REJECTED' ? t.version + 1 : t.version;
    const metaName = metaTemplateName(t.key, version);
    const { payload, variables } = buildMetaTemplate(t, metaName);
    const res = await this.graph.post(`/${wabaId}/message_templates`, token, payload);

    const status = String(res.status || 'PENDING').toUpperCase() as TemplateMetaStatus;
    const patch: Record<string, unknown> = {
      version,
      meta_name: metaName,
      meta_id: res.id ?? null,
      meta_status: status,
      meta_category: res.category ?? t.category,
      meta_variables: variables,
      rejected_reason: null,
      submitted_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    if (status === 'APPROVED') {
      patch.approved = this.approvedSnapshot(t, metaName, variables, version);
      patch.has_approved = true;
    }
    await this.col({ orgId }).doc(id).update(patch);
    await this.updateSetupStep(orgId);
    return this.get({ orgId }, id);
  }

  /** Trae de Meta estado, categoría y motivo de rechazo de las plantillas enviadas. */
  async sync(orgId: string) {
    const { wabaId, token } = await this.metaAccess(orgId);
    const remote: any[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.graph.get(`/${wabaId}/message_templates`, token, {
        fields: 'id,name,status,category,language,rejected_reason',
        limit: 200,
        ...(after ? { after } : {}),
      });
      remote.push(...(res.data ?? []));
      after = res.paging?.next ? res.paging?.cursors?.after : undefined;
      if (!after) break;
    }
    const byName = new Map(remote.map((r) => [`${r.name}:${r.language}`, r]));
    const snap = await this.col({ orgId }).where('meta_name', '!=', null).get();
    let updated = 0;
    for (const doc of snap.docs) {
      const t = this.toTemplate(doc.id, doc.data());
      const r = byName.get(`${t.meta_name}:${t.language}`);
      if (!r) continue;
      await this.applyRemoteStatus(orgId, t, {
        status: String(r.status).toUpperCase() as TemplateMetaStatus,
        id: r.id,
        category: r.category,
        reason: r.rejected_reason,
      });
      updated++;
    }
    await this.updateSetupStep(orgId);
    return { updated, total: snap.size, remote: remote.length };
  }

  /** Evento `message_template_status_update` del webhook. */
  async applyWebhookStatus(orgId: string, value: any) {
    const id = value?.message_template_id ? String(value.message_template_id) : null;
    if (!id) return;
    const snap = await this.col({ orgId }).where('meta_id', '==', id).limit(1).get();
    if (snap.empty) return;
    const doc = snap.docs[0];
    await this.applyRemoteStatus(orgId, this.toTemplate(doc.id, doc.data()), {
      status: String(value.event).toUpperCase() as TemplateMetaStatus,
      id,
      reason: value.reason,
    });
    await this.updateSetupStep(orgId);
  }

  private async applyRemoteStatus(
    orgId: string,
    t: Template,
    r: { status: TemplateMetaStatus; id?: string; category?: string; reason?: string },
  ) {
    const patch: Record<string, unknown> = {
      meta_status: r.status,
      rejected_reason: r.reason && r.reason !== 'NONE' ? r.reason : null,
      synced_at: FieldValue.serverTimestamp(),
    };
    if (r.id) patch.meta_id = r.id;
    if (r.category) patch.meta_category = r.category;
    if (r.status === 'APPROVED' && t.approved?.meta_name !== t.meta_name) {
      patch.approved = this.approvedSnapshot(t, t.meta_name!, t.meta_variables, t.version);
      patch.has_approved = true;
    }
    await this.col({ orgId }).doc(t.id).update(patch);
  }

  private approvedSnapshot(t: Template, metaName: string, variables: string[], version: number) {
    return {
      meta_name: metaName,
      language: t.language,
      header: t.header,
      body: t.body,
      footer: t.footer,
      variables,
      buttons: t.buttons,
      version,
      approved_at: Timestamp.now(),
    };
  }

  /** Paso 10 del asistente: listo cuando hay al menos una plantilla aprobada. */
  private async updateSetupStep(orgId: string) {
    const snap = await this.col({ orgId }).where('has_approved', '==', true).limit(1).get();
    if (snap.empty) {
      await this.store.setStep(orgId, 'templates', 'pending', 'Aún no hay plantillas aprobadas');
    } else {
      await this.store.setStep(orgId, 'templates', 'done');
    }
  }
}
