import { ConflictException } from '@nestjs/common';
import { EmbeddedSignupService } from './embedded-signup.service';
import { MetaApiError } from './graph.client';

function setup(opts: { wabaIds?: string[]; owner?: string | null; platformType?: string; registerFails?: boolean } = {}) {
  const raw: Record<string, any> = { platform_type: opts.platformType ?? null };
  const steps: Record<string, { status: string; message: string | null }> = {};
  const secrets: Record<string, string> = {};
  const calls: string[] = [];

  const store = {
    raw: async () => raw,
    update: async (_: string, patch: Record<string, unknown>) => Object.assign(raw, patch),
    setStep: async (_: string, key: string, status: string, message: string | null = null) => {
      steps[key] = { status, message };
    },
    setSecret: async (_: string, key: string, value: string) => {
      secrets[key] = value;
    },
    getSecrets: async () => secrets,
    orgForWaba: async () => opts.owner ?? null,
    setRoute: async (_: string, waba: string) => calls.push(`route:${waba}`),
    mode: (d: any) => d.mode ?? 'embedded',
  };
  const graph = {
    exchangeCode: async () => 'BUSINESS_TOKEN',
    get: async (path: string) => {
      if (path.endsWith('/phone_numbers')) return { data: [{ id: 'PN1' }] };
      return { id: '55555555', name: 'Clínica Demo', owner_business_info: { id: '77777777', name: 'Clínica Demo SAS' } };
    },
  };
  const metaSetup = {
    inspectToken: async () => ({
      info: {
        type: 'SYSTEM_USER',
        app_id: '1',
        expires_at: null,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        waba_ids: opts.wabaIds ?? ['55555555'],
        checked_at: 'x',
      },
      warnings: [],
    }),
    refreshBusiness: async () => calls.push('business'),
    subscribeWaba: async () => calls.push('subscribe'),
    refreshPhone: async () => calls.push('phone'),
    register: async (_: string, pin: string) => {
      calls.push(`register:${pin.length}`);
      if (opts.registerFails) throw new MetaApiError('PIN incorrecto', 400);
    },
  };
  const platform = { require: () => ({ appId: '1', appSecret: 's', configId: 'c' }) };
  const orgs = { get: async () => ({}) };

  const service = new EmbeddedSignupService(orgs as any, store as any, graph as any, platform as any, metaSetup as any);
  return { service, raw, steps, secrets, calls };
}

describe('EmbeddedSignupService.complete', () => {
  it('guarda el token, suscribe la cuenta y registra el número', async () => {
    const { service, raw, steps, secrets, calls } = setup();
    await service.complete('org', { code: 'CODE_1234567', waba_id: '55555555', phone_number_id: 'PN1' });

    expect(secrets.access_token).toBe('BUSINESS_TOKEN');
    expect(raw).toMatchObject({ mode: 'embedded', waba_id: '55555555', phone_number_id: 'PN1', business_id: '77777777' });
    expect(steps.signup.status).toBe('done');
    expect(calls).toEqual(['route:55555555', 'subscribe', 'phone', 'register:6']);
  });

  it('sin evento del navegador usa la única cuenta y el único número', async () => {
    const { service, raw } = setup();
    await service.complete('org', { code: 'CODE_1234567' });
    expect(raw).toMatchObject({ waba_id: '55555555', phone_number_id: 'PN1' });
  });

  it('no vuelve a registrar un número que ya está en la API', async () => {
    const { service, calls } = setup({ platformType: 'CLOUD_API' });
    await service.complete('org', { code: 'CODE_1234567', waba_id: '55555555', phone_number_id: 'PN1' });
    expect(calls.some((c) => c.startsWith('register'))).toBe(false);
  });

  it('si el registro falla deja el aviso para ingresar el PIN', async () => {
    const { service, steps } = setup({ registerFails: true });
    await service.complete('org', { code: 'CODE_1234567', waba_id: '55555555', phone_number_id: 'PN1' });
    expect(steps.registration.status).toBe('error');
    expect(steps.registration.message).toContain('PIN');
  });

  it('rechaza una cuenta conectada a otra organización', async () => {
    const { service, steps } = setup({ owner: 'otra' });
    await expect(service.complete('org', { code: 'CODE_1234567', waba_id: '55555555' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(steps.signup.status).toBe('error');
  });

  it('rechaza una cuenta que no está en el acceso concedido', async () => {
    const { service, steps } = setup();
    await expect(service.complete('org', { code: 'CODE_1234567', waba_id: '99999999' })).rejects.toThrow(
      'no incluye la cuenta',
    );
    expect(steps.signup.status).toBe('error');
  });

  it('con varias cuentas y sin evento pide elegir solo una', async () => {
    const { service } = setup({ wabaIds: ['11111111', '22222222'] });
    await expect(service.complete('org', { code: 'CODE_1234567' })).rejects.toThrow('varias cuentas');
  });
});

describe('EmbeddedSignupService.applyAccountUpdate', () => {
  it('marca la conexión cuando la clínica quita el acceso', async () => {
    const { service, raw, steps } = setup();
    raw.waba_id = '55555555';
    await service.applyAccountUpdate('org', { event: 'PARTNER_APP_UNINSTALLED', waba_info: { waba_id: '55555555' } });
    expect(steps.signup.status).toBe('error');
    expect(steps.webhook.status).toBe('error');
  });

  it('ignora otros eventos y otras cuentas', async () => {
    const { service, raw, steps } = setup();
    raw.waba_id = '55555555';
    await service.applyAccountUpdate('org', { event: 'PARTNER_ADDED', waba_info: { waba_id: '55555555' } });
    await service.applyAccountUpdate('org', { event: 'PARTNER_REMOVED', waba_info: { waba_id: '12341234' } });
    expect(steps.signup).toBeUndefined();
  });
});
