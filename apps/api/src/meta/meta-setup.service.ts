import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  CompanyStepInput,
  MetaPhoneNumberOption,
  MetaTokenInfo,
  MetaWabaOption,
  StepStatus,
  VerificationStepInput,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { COL } from '../common/firestore';
import { MetaApiError, MetaGraphClient } from './graph.client';
import { MetaConnectionStore } from './meta-connection.store';
import { normalizePhone } from './signature';

const REQUIRED_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];
const PHONE_FIELDS =
  'id,display_phone_number,verified_name,name_status,quality_rating,code_verification_status,platform_type,status,messaging_limit_tier';
const PHONE_FIELDS_MIN = 'id,display_phone_number,verified_name,quality_rating,code_verification_status';
/** Avisar si el token vence antes de esto */
const TOKEN_WARN_DAYS = 60;

const digitsOnly = (v: string) => /^\d{5,25}$/.test(v);

/** verification_status de Meta → estado del paso de verificación */
function verificationStep(status: string | null): { status: StepStatus; message: string | null } {
  switch (status) {
    case 'verified':
      return { status: 'done', message: null };
    case 'pending':
    case 'pending_submission':
    case 'pending_need_more_info':
      return { status: 'in_review', message: `Meta: ${status}` };
    case 'failed':
    case 'rejected':
    case 'revoked':
      return { status: 'error', message: `Meta: ${status}` };
    default:
      return { status: 'pending', message: status ? `Meta: ${status}` : null };
  }
}

/**
 * Acciones del asistente de conexión con Meta (ver META_SETUP_STEPS). Cada
 * acción guarda lo que se ingresó, lo valida contra la Graph API cuando se
 * puede y deja el estado del paso; los errores de Meta quedan en el paso y
 * además se devuelven al frontend.
 */
@Injectable()
export class MetaSetupService {
  private readonly logger = new Logger(MetaSetupService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
  ) {}

  async view(orgId: string, includeSecrets: boolean) {
    await this.orgs.get(orgId);
    if (includeSecrets) await this.store.ensureVerifyToken(orgId);
    return this.store.view(orgId, includeSecrets);
  }

  // ---- 1. Empresa ----

  async saveCompany(orgId: string, input: CompanyStepInput) {
    await this.orgs.get(orgId);
    const data = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, String(v ?? '').trim()]),
    );
    await this.orgs.updateCompany(orgId, data);
    await this.store.setStep(orgId, 'company', 'done');
  }

  // ---- 2 y 3. Portafolio comercial y verificación ----

  async saveBusiness(orgId: string, businessId: string) {
    const id = businessId.trim();
    if (!digitsOnly(id)) throw new BadRequestException('El identificador del portafolio son solo números');
    await this.store.update(orgId, { business_id: id, business_name: null });
    const { access_token } = await this.store.getSecrets(orgId);
    if (access_token) return this.refreshBusiness(orgId);
    await this.store.setStep(orgId, 'business', 'pending', 'Se valida al cargar el token (paso 5)');
  }

  /** Lee nombre y estado de verificación del portafolio con el token del usuario del sistema. */
  async refreshBusiness(orgId: string) {
    const d = await this.store.raw(orgId);
    const token = await this.requireToken(orgId);
    if (!d.business_id) throw new BadRequestException('Falta el identificador del portafolio (paso 2)');
    try {
      const b = await this.graph.get(`/${d.business_id}`, token, {
        fields: 'id,name,verification_status',
      });
      const verification = b.verification_status ?? null;
      await this.store.update(orgId, {
        business_name: b.name ?? null,
        business_verification_status: verification,
      });
      await this.store.setStep(orgId, 'business', 'done');
      const v = verificationStep(verification);
      await this.store.setStep(orgId, 'verification', v.status, v.message);
    } catch (e) {
      await this.failStep(orgId, 'business', e);
    }
  }

  /** Para cuando el token no puede leer la verificación (falta business_management). */
  async saveVerification(orgId: string, input: VerificationStepInput) {
    await this.store.setStep(orgId, 'verification', input.status, input.message?.trim() || null);
  }

  // ---- 4. App ----

  async saveApp(orgId: string, appId: string, appSecret?: string) {
    const id = appId.trim();
    if (!digitsOnly(id)) throw new BadRequestException('El identificador de la app son solo números');
    const secret = appSecret?.trim() || (await this.store.getSecrets(orgId)).app_secret;
    if (!secret) throw new BadRequestException('Falta la clave secreta de la app');

    try {
      const app = await this.graph.get(`/${id}`, MetaGraphClient.appToken(id, secret), {
        fields: 'id,name',
      });
      await this.store.setSecret(orgId, 'app_secret', secret);
      await this.store.update(orgId, { app_id: id, app_name: app.name ?? null });
      await this.store.setStep(orgId, 'app', 'done');
    } catch (e) {
      await this.failStep(orgId, 'app', e);
    }
  }

  // ---- 5. Usuario del sistema y token ----

  async saveToken(orgId: string, accessToken: string) {
    const token = accessToken.trim();
    const d = await this.store.raw(orgId);
    const { app_secret } = await this.store.getSecrets(orgId);
    if (!d.app_id || !app_secret) throw new BadRequestException('Primero configura la app (paso 4)');

    let info: MetaTokenInfo;
    const warnings: string[] = [];
    try {
      const res = await this.graph.get('/debug_token', MetaGraphClient.appToken(d.app_id, app_secret), {
        input_token: token,
      });
      const t = res.data ?? {};
      if (!t.is_valid) throw new MetaApiError(t.error?.message || 'El token no es válido', 400);
      if (String(t.app_id) !== String(d.app_id)) {
        throw new MetaApiError('El token es de otra app: genéralo con la app del paso 4', 400);
      }
      const scopes: string[] = t.scopes ?? [];
      const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
      if (missing.length) {
        throw new MetaApiError(`Al token le faltan permisos: ${missing.join(', ')}`, 400);
      }
      const wabaIds = new Set<string>();
      for (const g of t.granular_scopes ?? []) {
        if (g.scope === 'whatsapp_business_management') {
          for (const id of g.target_ids ?? []) wabaIds.add(String(id));
        }
      }
      const expiresAt = t.expires_at ? new Date(t.expires_at * 1000) : null;
      if (t.type !== 'SYSTEM_USER') {
        warnings.push('No es un token de usuario del sistema');
      }
      if (expiresAt && expiresAt.getTime() - Date.now() < TOKEN_WARN_DAYS * 86_400_000) {
        warnings.push(`Vence el ${expiresAt.toISOString().slice(0, 10)}: genera uno que no venza`);
      }
      if (!scopes.includes('business_management')) {
        warnings.push('Sin business_management no se puede leer la verificación del negocio');
      }
      info = {
        type: t.type ?? null,
        app_id: String(t.app_id),
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        scopes,
        waba_ids: [...wabaIds],
        checked_at: new Date().toISOString(),
      };
    } catch (e) {
      await this.failStep(orgId, 'system_user', e);
      return;
    }

    await this.store.setSecret(orgId, 'access_token', token);
    await this.store.update(orgId, { token: info });
    await this.store.setStep(orgId, 'system_user', 'done', warnings.join(' · ') || null);

    if (d.business_id) {
      await this.refreshBusiness(orgId).catch((e) =>
        this.logger.warn(`Portafolio ${orgId}: ${(e as Error).message}`),
      );
    }
  }

  // ---- 6. Cuenta de WhatsApp y número ----

  async listPhoneNumbers(orgId: string): Promise<MetaWabaOption[]> {
    const token = await this.requireToken(orgId);
    const d = await this.store.raw(orgId);

    let wabas: { id: string; name: string | null }[] = (d.token?.waba_ids ?? []).map((id: string) => ({
      id,
      name: null,
    }));
    if (!wabas.length && d.business_id) {
      const res = await this.graph.get(`/${d.business_id}/owned_whatsapp_business_accounts`, token, {
        fields: 'id,name',
      });
      wabas = (res.data ?? []).map((w: any) => ({ id: String(w.id), name: w.name ?? null }));
    }

    const out: MetaWabaOption[] = [];
    for (const w of wabas) {
      const [info, phones] = await Promise.all([
        w.name ? Promise.resolve({ name: w.name }) : this.graph.get(`/${w.id}`, token, { fields: 'id,name' }),
        this.getWabaPhones(w.id, token),
      ]);
      out.push({ id: w.id, name: info.name ?? null, phone_numbers: phones });
    }
    return out;
  }

  async selectPhone(orgId: string, wabaId: string, phoneNumberId: string) {
    const token = await this.requireToken(orgId);
    const phones = await this.getWabaPhones(wabaId, token);
    if (!phones.some((p) => p.id === phoneNumberId)) {
      throw new BadRequestException('Ese número no pertenece a la cuenta de WhatsApp elegida');
    }
    const waba = await this.graph.get(`/${wabaId}`, token, { fields: 'id,name' });
    await this.store.update(orgId, {
      waba_id: wabaId,
      waba_name: waba.name ?? null,
      phone_number_id: phoneNumberId,
      webhook: { waba_subscribed_at: null },
    });
    await this.refreshPhone(orgId);
  }

  /** Relee el número y deja los pasos 6 y 7 según lo que diga Meta. */
  async refreshPhone(orgId: string) {
    const token = await this.requireToken(orgId);
    const d = await this.store.raw(orgId);
    if (!d.phone_number_id) throw new BadRequestException('Primero elige el número (paso 6)');
    const p = await this.getPhone(d.phone_number_id, token);
    await this.store.update(orgId, {
      display_phone_number: p.display_phone_number,
      verified_name: p.verified_name,
      name_status: p.name_status,
      quality_rating: p.quality_rating,
      code_verification_status: p.code_verification_status,
      platform_type: p.platform_type,
      phone_status: p.status,
      messaging_limit_tier: p.messaging_limit_tier ?? null,
    });

    const nameMsg =
      p.name_status === 'DECLINED'
        ? 'Meta rechazó el nombre visible: cámbialo en el administrador de WhatsApp'
        : p.name_status === 'PENDING_REVIEW'
          ? 'El nombre visible está en revisión'
          : null;
    await this.store.setStep(orgId, 'phone', p.name_status === 'DECLINED' ? 'error' : 'done', nameMsg);

    if (p.platform_type === 'CLOUD_API' && (!p.status || p.status === 'CONNECTED')) {
      await this.store.setStep(orgId, 'registration', 'done');
    } else if (p.code_verification_status && p.code_verification_status !== 'VERIFIED') {
      await this.store.setStep(orgId, 'registration', 'pending', 'Falta verificar el número con el código');
    } else {
      await this.store.setStep(orgId, 'registration', 'pending', 'Falta registrar el número en la API');
    }
  }

  // ---- 7. Registro del número ----

  async requestCode(orgId: string, method: 'SMS' | 'VOICE') {
    const { token, phoneId } = await this.requirePhone(orgId);
    try {
      await this.graph.post(`/${phoneId}/request_code`, token, { code_method: method, language: 'es' });
      await this.store.setStep(orgId, 'registration', 'in_review', `Código enviado por ${method}`);
    } catch (e) {
      await this.failStep(orgId, 'registration', e);
    }
  }

  async verifyCode(orgId: string, code: string) {
    const { token, phoneId } = await this.requirePhone(orgId);
    try {
      await this.graph.post(`/${phoneId}/verify_code`, token, { code: code.trim() });
    } catch (e) {
      await this.failStep(orgId, 'registration', e);
    }
    await this.refreshPhone(orgId);
  }

  async register(orgId: string, pin: string) {
    if (!/^\d{6}$/.test(pin)) throw new BadRequestException('El PIN son 6 dígitos');
    const { token, phoneId } = await this.requirePhone(orgId);
    try {
      await this.graph.post(`/${phoneId}/register`, token, { messaging_product: 'whatsapp', pin });
      await this.store.setSecret(orgId, 'pin', pin);
    } catch (e) {
      await this.failStep(orgId, 'registration', e);
    }
    await this.refreshPhone(orgId);
  }

  // ---- 8. Webhook ----

  async rotateVerifyToken(orgId: string) {
    await this.store.rotateVerifyToken(orgId);
    await this.store.update(orgId, { webhook: { verified_at: null } });
    await this.updateWebhookStep(orgId);
  }

  /**
   * Configura el webhook de la app (URL, verify token, campo `messages`).
   * Meta hace la verificación GET durante esta llamada, así que la API debe
   * estar publicada en PUBLIC_API_URL.
   */
  async configureAppWebhook(orgId: string) {
    const d = await this.store.raw(orgId);
    const { app_secret } = await this.store.getSecrets(orgId);
    if (!d.app_id || !app_secret) throw new BadRequestException('Primero configura la app (paso 4)');
    const verifyToken = await this.store.ensureVerifyToken(orgId);
    try {
      await this.graph.post(
        `/${d.app_id}/subscriptions`,
        MetaGraphClient.appToken(d.app_id, app_secret),
        undefined,
        {
          object: 'whatsapp_business_account',
          callback_url: this.store.callbackUrl(orgId),
          verify_token: verifyToken,
          fields: 'messages,message_template_status_update',
          include_values: true,
        },
      );
      await this.store.update(orgId, { webhook: { app_subscribed_at: FieldValue.serverTimestamp() } });
    } catch (e) {
      await this.failStep(orgId, 'webhook', e);
    }
    await this.updateWebhookStep(orgId);
  }

  /** Suscribe la app a la cuenta de WhatsApp: sin esto no llegan los eventos. */
  async subscribeWaba(orgId: string) {
    const token = await this.requireToken(orgId);
    const d = await this.store.raw(orgId);
    if (!d.waba_id) throw new BadRequestException('Primero elige la cuenta de WhatsApp (paso 6)');
    try {
      await this.graph.post(`/${d.waba_id}/subscribed_apps`, token);
      await this.store.update(orgId, { webhook: { waba_subscribed_at: FieldValue.serverTimestamp() } });
    } catch (e) {
      await this.failStep(orgId, 'webhook', e);
    }
    await this.updateWebhookStep(orgId);
  }

  /** Lo llama el webhook cuando Meta verifica la URL con el token correcto. */
  async markWebhookVerified(orgId: string) {
    await this.store.update(orgId, { webhook: { verified_at: FieldValue.serverTimestamp() } });
    await this.updateWebhookStep(orgId);
  }

  async updateWebhookStep(orgId: string) {
    const w = (await this.store.raw(orgId)).webhook ?? {};
    if (w.verified_at && w.waba_subscribed_at) {
      await this.store.setStep(orgId, 'webhook', 'done');
    } else {
      const missing = [
        !w.verified_at && 'verificación de la URL',
        !w.waba_subscribed_at && 'suscripción de la cuenta de WhatsApp',
      ].filter(Boolean);
      await this.store.setStep(orgId, 'webhook', 'pending', `Falta: ${missing.join(' y ')}`);
    }
  }

  // ---- 9. Mensaje de prueba ----

  async sendTest(orgId: string, rawTo: string, template = 'hello_world', language = 'en_US') {
    const to = normalizePhone(rawTo);
    if (!to) throw new BadRequestException('Número inválido: incluye el indicativo del país (57...)');
    const { token, phoneId } = await this.requirePhone(orgId);

    let wamid: string;
    try {
      const res = await this.graph.post(`/${phoneId}/messages`, token, {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template, language: { code: language } },
      });
      wamid = res.messages?.[0]?.id;
      if (!wamid) throw new MetaApiError('Meta no devolvió el id del mensaje', 502);
    } catch (e) {
      await this.store.update(orgId, { test: { to, wamid: null, error: (e as Error).message } });
      await this.failStep(orgId, 'test', e);
      return;
    }

    await this.firebase.db
      .collection(COL.organizations)
      .doc(orgId)
      .collection(COL.messages)
      .doc(wamid)
      .set(
        {
          direction: 'out',
          kind: 'test',
          to,
          type: 'template',
          template_name: template,
          status: 'accepted',
          created_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    await this.store.update(orgId, {
      test: { to, wamid, sent_at: FieldValue.serverTimestamp(), error: null },
    });
    await this.store.setStep(orgId, 'test', 'in_review', 'Esperando la confirmación de entrega por el webhook');
  }

  // ---- Apoyo ----

  private async requireToken(orgId: string): Promise<string> {
    const { access_token } = await this.store.getSecrets(orgId);
    if (!access_token) throw new BadRequestException('Primero carga el token (paso 5)');
    return access_token;
  }

  private async requirePhone(orgId: string) {
    const token = await this.requireToken(orgId);
    const d = await this.store.raw(orgId);
    if (!d.phone_number_id) throw new BadRequestException('Primero elige el número (paso 6)');
    return { token, phoneId: d.phone_number_id as string };
  }

  private async getWabaPhones(wabaId: string, token: string): Promise<MetaPhoneNumberOption[]> {
    const res = await this.withFieldFallback((fields) =>
      this.graph.get(`/${wabaId}/phone_numbers`, token, { fields }),
    );
    return (res.data ?? []).map((p: any) => this.toPhone(p));
  }

  private async getPhone(phoneId: string, token: string) {
    const p = await this.withFieldFallback((fields) => this.graph.get(`/${phoneId}`, token, { fields }));
    return { ...this.toPhone(p), messaging_limit_tier: p.messaging_limit_tier ?? null };
  }

  /** Si Meta deja de reconocer algún campo (#100), se reintenta con los básicos. */
  private async withFieldFallback<T>(fn: (fields: string) => Promise<T>): Promise<T> {
    try {
      return await fn(PHONE_FIELDS);
    } catch (e) {
      if (e instanceof MetaApiError && e.code === 100) return fn(PHONE_FIELDS_MIN);
      throw e;
    }
  }

  private toPhone(p: any): MetaPhoneNumberOption {
    return {
      id: String(p.id),
      display_phone_number: p.display_phone_number,
      verified_name: p.verified_name ?? null,
      name_status: p.name_status ?? null,
      quality_rating: p.quality_rating ?? null,
      code_verification_status: p.code_verification_status ?? null,
      platform_type: p.platform_type ?? null,
      status: p.status ?? null,
    };
  }

  /** Deja el error en el paso y lo propaga al frontend. */
  private async failStep(orgId: string, key: Parameters<MetaConnectionStore['setStep']>[1], e: unknown): Promise<never> {
    const msg = (e as Error).message;
    await this.store.setStep(orgId, key, 'error', msg);
    throw e;
  }
}
