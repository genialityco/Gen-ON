import { AlertNotifierService } from './alert-notifier.service';

describe('AlertNotifierService.notify', () => {
  const notice = { patient: 'Ana Ruiz', button: 'Tengo dolor', step: 'Control', level: 'urgent' as const };

  function setup(org: Record<string, unknown> = {}, status = 'APPROVED') {
    const sent: any[] = [];
    const msgDoc = { set: jest.fn() };
    const firebase = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => msgDoc }), update: jest.fn() }) }) } };
    const store = { raw: async () => ({ waba_id: 'w', phone_number_id: 'pn' }), getSecrets: async () => ({ access_token: 'tk' }) };
    const graph = {
      post: async (_p: string, _t: string, body: any) => {
        sent.push(body);
        return { messages: [{ id: `wamid.${sent.length}` }] };
      },
      get: async () => ({ data: [] }),
    };
    const fullOrg = {
      id: 'org',
      name: 'Clínica Sol',
      plan: 'adherencia',
      status: 'active',
      alert_notify_phones: ['573001112233', '573004445566'],
      alert_notify_level: 'warning',
      alert_template: { meta_name: 'genon_aviso_alerta_v1', meta_id: '1', version: 1, status, rejected_reason: null },
      ...org,
    };
    const orgs = { get: async () => fullOrg };
    const service = new AlertNotifierService(firebase as any, orgs as any, store as any, graph as any);
    return { service, sent, org: fullOrg as any };
  }

  it('avisa a cada celular con los datos de la alerta', async () => {
    const { service, sent, org } = setup();
    await service.notify(org, notice);
    expect(sent.map((s) => s.to)).toEqual(['573001112233', '573004445566']);
    expect(sent[0].template.components[0].parameters.map((p: any) => p.text)).toEqual(['Clínica Sol', 'Ana Ruiz', 'Tengo dolor', 'Control', 'Urgente']);
  });

  it('no avisa por debajo del nivel mínimo', async () => {
    const { service, sent, org } = setup({ alert_notify_level: 'urgent' });
    await service.notify(org, { ...notice, level: 'warning' });
    expect(sent).toEqual([]);
  });

  it('no avisa sin plantilla aprobada ni en el plan Esencial', async () => {
    const pending = setup({}, 'PENDING');
    await pending.service.notify(pending.org, notice);
    expect(pending.sent).toEqual([]);

    const esencial = setup({ plan: 'esencial' });
    await esencial.service.notify(esencial.org, notice);
    expect(esencial.sent).toEqual([]);
  });
});
