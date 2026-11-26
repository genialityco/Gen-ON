import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { EmbeddedSignupInput } from '@genon/shared';
import { OrganizationsService } from '../organizations/organizations.service';
import { MetaApiError, MetaGraphClient } from './graph.client';
import { MetaConnectionStore } from './meta-connection.store';
import { MetaPlatform } from './meta-platform';
import { MetaSetupService } from './meta-setup.service';

/** Eventos de account_update en los que la clínica le quitó el acceso a la app. */
const ACCESS_REMOVED = new Set(['PARTNER_APP_UNINSTALLED', 'PARTNER_REMOVED']);

/**
 * Registro insertado de Meta (Gen.iality como proveedor de tecnología).
 *
 * En el navegador, la clínica entra con su Facebook (FB.login con la
 * configuración META_ES_CONFIG_ID) y elige o crea su portafolio, su cuenta
 * de WhatsApp y su número. Meta devuelve un código y, por postMessage, los
 * identificadores. Aquí se completa lo que le toca al proveedor:
 *
 * 1. Cambiar el código por el token del negocio (vale 5 minutos).
 * 2. Revisar el token y la cuenta de WhatsApp a la que da acceso.
 * 3. Suscribir la app a la cuenta (webhook de la plataforma).
 * 4. Registrar el número en la API con un PIN de verificación en dos pasos.
 *
 * El método de pago lo agrega la clínica en el administrador de WhatsApp.
 */
@Injectable()
export class EmbeddedSignupService {
  private readonly logger = new Logger(EmbeddedSignupService.name);

  constructor(
    private readonly orgs: OrganizationsService,
    private readonly store: MetaConnectionStore,
    private readonly graph: MetaGraphClient,
    private readonly platform: MetaPlatform,
    private readonly setup: MetaSetupService,
  ) {}

  async complete(orgId: string, input: EmbeddedSignupInput) {
    await this.orgs.get(orgId);
    const { appId, appSecret } = this.platform.require();
    const previous = await this.store.raw(orgId);

    // 1 y 2. Token del negocio y cuenta de WhatsApp
    let token: string;
    let wabaId: string;
    let tokenInfo: Awaited<ReturnType<MetaSetupService['inspectToken']>>;
    try {
      token = await this.graph.exchangeCode(appId, appSecret, input.code.trim());
      tokenInfo = await this.setup.inspectToken(token, appId, appSecret);
      wabaId = this.pickWaba(input.waba_id, tokenInfo.info.waba_ids);
    } catch (e) {
      return this.fail(orgId, e);
    }

    const owner = await this.store.orgForWaba(wabaId);
    if (owner && owner !== orgId) {
      const msg = 'Esa cuenta de WhatsApp ya está conectada a otra organización de Gen.ON';
      await this.store.setStep(orgId, 'signup', 'error', msg);
      throw new ConflictException(msg);
    }

    let waba: any;
    let phoneId: string | null;
    try {
      waba = await this.graph.get(`/${wabaId}`, token, { fields: 'id,name,owner_business_info' });
      phoneId = input.phone_number_id?.trim() || (await this.singlePhone(wabaId, token));
    } catch (e) {
      return this.fail(orgId, e);
    }

    await this.store.setSecret(orgId, 'access_token', token);
    const changedNumber = previous.phone_number_id !== phoneId;
    await this.store.update(orgId, {
      mode: 'embedded',
      app_id: appId,
      app_name: null,
      token: tokenInfo.info,
      business_id: input.business_id?.trim() || waba.owner_business_info?.id || null,
      business_name: waba.owner_business_info?.name ?? null,
      waba_id: wabaId,
      waba_name: waba.name ?? null,
      phone_number_id: phoneId,
      webhook: { waba_subscribed_at: null },
      // La prueba anterior era de otro número
      ...(changedNumber ? { test: { to: null, wamid: null, sent_at: null, error: null } } : {}),
    });
    if (changedNumber) await this.store.setStep(orgId, 'test', 'pending');
    await this.store.setStep(orgId, 'signup', 'done', tokenInfo.warnings.join(' · ') || null);
    await this.store.setRoute(orgId, wabaId, previous.waba_id);

    // Verificación del negocio: solo si el token tiene business_management
    if (tokenInfo.info.scopes.includes('business_management')) {
      await this.setup.refreshBusiness(orgId).catch((e) => this.logger.warn(`Portafolio ${orgId}: ${(e as Error).message}`));
    }

    // 3. Webhook
    await this.setup.subscribeWaba(orgId).catch((e) => this.logger.warn(`Suscripción ${orgId}: ${(e as Error).message}`));

    // 4. Número
    if (!phoneId) {
      await this.store.setStep(orgId, 'phone', 'pending', 'Elige el número de la cuenta de WhatsApp');
      return;
    }
    await this.setup.refreshPhone(orgId);
    if ((await this.store.raw(orgId)).platform_type !== 'CLOUD_API') {
      await this.registerPhone(orgId);
    }
  }

  /**
   * Registra el número con un PIN nuevo (o el que ya se había guardado). Si el
   * número ya tenía verificación en dos pasos con otro PIN, Meta lo rechaza:
   * queda el aviso y se ingresa ese PIN en el paso de registro.
   */
  private async registerPhone(orgId: string) {
    const pin = (await this.store.getSecrets(orgId)).pin ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await this.setup.register(orgId, pin);
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`Registro del número ${orgId}: ${msg}`);
      await this.store.setStep(
        orgId,
        'registration',
        'error',
        `No se pudo registrar automáticamente (${msg}). Si el número ya tenía verificación en dos pasos, ingresa ese PIN.`,
      );
    }
  }

  /**
   * account_update del webhook de la plataforma: si la clínica le quita el
   * acceso a la app en Meta, la conexión deja de servir.
   */
  async applyAccountUpdate(orgId: string, value: any) {
    const event = String(value?.event ?? '');
    if (!ACCESS_REMOVED.has(event)) return;
    const d = await this.store.raw(orgId);
    const wabaId = value?.waba_info?.waba_id;
    if (this.store.mode(d) !== 'embedded' || (wabaId && String(wabaId) !== d.waba_id)) return;
    this.logger.warn(`Organización ${orgId}: Meta avisó ${event}`);
    await this.store.update(orgId, { webhook: { waba_subscribed_at: null } });
    await this.store.setStep(orgId, 'signup', 'error', 'La clínica le quitó el acceso a Gen.ON en Meta: vuelve a conectar WhatsApp');
    await this.store.setStep(orgId, 'webhook', 'error', 'La cuenta de WhatsApp ya no está suscrita');
  }

  /** La cuenta que eligió la clínica; si el evento no llegó, la única del token. */
  private pickWaba(fromClient: string | undefined, fromToken: string[]): string {
    const id = fromClient?.trim();
    if (id) {
      if (!/^\d{5,25}$/.test(id)) throw new BadRequestException('Identificador de cuenta de WhatsApp inválido');
      if (fromToken.length && !fromToken.includes(id)) {
        throw new MetaApiError('El acceso concedido no incluye la cuenta de WhatsApp elegida', 400);
      }
      return id;
    }
    if (fromToken.length === 1) return fromToken[0];
    throw new MetaApiError(
      fromToken.length
        ? 'Se concedió acceso a varias cuentas de WhatsApp: vuelve a conectar eligiendo solo una'
        : 'Meta no devolvió ninguna cuenta de WhatsApp: vuelve a intentarlo',
      400,
    );
  }

  private async singlePhone(wabaId: string, token: string): Promise<string | null> {
    const res = await this.graph.get(`/${wabaId}/phone_numbers`, token, { fields: 'id' });
    const ids = (res.data ?? []).map((p: any) => String(p.id));
    return ids.length === 1 ? ids[0] : null;
  }

  private async fail(orgId: string, e: unknown): Promise<never> {
    await this.store.setStep(orgId, 'signup', 'error', (e as Error).message);
    throw e;
  }
}
