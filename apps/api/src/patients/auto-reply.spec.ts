import { isOptOutKeyword } from '@genon/shared';
import { AutoReplyService } from './auto-reply.service';

describe('isOptOutKeyword', () => {
  it('reconoce la baja escrita sola', () => {
    for (const t of ['BAJA', ' baja. ', 'Stop', 'Darme de baja', 'no quiero más mensajes']) {
      expect(isOptOutKeyword(t)).toBe(true);
    }
  });

  it('no da de baja por mencionarla en una frase', () => {
    for (const t of ['¿Cómo me doy de baja?', 'la baja de peso va bien', 'hola', '', null]) {
      expect(isOptOutKeyword(t)).toBe(false);
    }
  });
});

describe('AutoReplyService', () => {
  const button = (action: any) => ({ type: 'QUICK_REPLY', text: 'Botón', action });

  function setup({ action, plan = 'adherencia', optedOut = false }: { action?: any; plan?: string; optedOut?: boolean }) {
    const sent: any[] = [];
    const optOuts: string[] = [];
    const msgDoc = { set: jest.fn() };
    const firebase = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => msgDoc }) }) }) } };
    const orgs = { get: async () => ({ id: 'org', name: 'Clínica Sol', plan, status: 'active' }) };
    const templates = { byKey: async () => ({ approved: { buttons: [button(action)] } }) };
    const store = { raw: async () => ({ phone_number_id: 'pn' }), getSecrets: async () => ({ access_token: 'tk' }) };
    const graph = {
      post: async (_path: string, _token: string, body: any) => {
        sent.push(body);
        return { messages: [{ id: `wamid.${sent.length}` }] };
      },
    };
    const patient = { id: 'p1', opted_out: optedOut };
    const patients = {
      get: async () => patient,
      findByPhone: async (_o: string, phone: string) => (phone === '573001112233' ? patient : null),
      optOut: async (_o: string, id: string) => optOuts.push(id),
    };
    const outbox = {
      col: () => ({ doc: () => ({ get: async () => ({ data: () => ({ patient_id: 'p1', patient_name: 'Ana Ruiz', step_label: 'Control', template_key: 'k' }) }) }) }),
    };
    const notices: any[] = [];
    const notifier = { notify: async (_org: any, n: any) => notices.push(n) };
    const service = new AutoReplyService(
      firebase as any,
      orgs as any,
      templates as any,
      store as any,
      graph as any,
      patients as any,
      outbox as any,
      notifier as any,
    );
    return { service, sent, optOuts, notices };
  }

  it('responde el texto del botón', async () => {
    const { service, sent } = setup({ action: { type: 'reply', reply_text: '¡Bien!' } });
    await service.onButton('org', 'o1', 0, '573001112233');
    expect(sent).toEqual([expect.objectContaining({ to: '573001112233', type: 'text', text: { body: '¡Bien!', preview_url: false } })]);
  });

  it('un botón de alerta avisa al equipo con su nivel', async () => {
    const { service, notices } = setup({ action: { type: 'alert', alert_level: 'urgent' } });
    await service.onButton('org', 'o1', 0, '573001112233');
    expect(notices).toEqual([{ patient: 'Ana Ruiz', button: 'Botón', step: 'Control', level: 'urgent' }]);
  });

  it('el plan Esencial no tiene respuestas automáticas', async () => {
    const { service, sent } = setup({ action: { type: 'reply', reply_text: '¡Bien!' }, plan: 'esencial' });
    await service.onButton('org', 'o1', 0, '573001112233');
    expect(sent).toEqual([]);
  });

  it('el botón de baja da de baja y confirma, en cualquier plan', async () => {
    const { service, sent, optOuts } = setup({ action: { type: 'opt_out' }, plan: 'esencial' });
    await service.onButton('org', 'o1', 0, '573001112233');
    expect(optOuts).toEqual(['p1']);
    expect(sent[0].text.body).toContain('Clínica Sol');
  });

  it('escribir BAJA da de baja al paciente de ese número', async () => {
    const { service, sent, optOuts } = setup({});
    expect(await service.onText('org', '573001112233', 'BAJA')).toBe(true);
    expect(optOuts).toEqual(['p1']);
    expect(sent).toHaveLength(1);
  });

  it('no repite la baja ni responde a números que no son pacientes', async () => {
    const already = setup({ optedOut: true });
    await already.service.onText('org', '573001112233', 'baja');
    expect(already.optOuts).toEqual([]);
    expect(already.sent).toEqual([]);

    const stranger = setup({});
    expect(await stranger.service.onText('org', '579999999999', 'baja')).toBe(false);
    expect(stranger.sent).toEqual([]);
  });
});
