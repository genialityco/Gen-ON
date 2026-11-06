import { Timestamp } from 'firebase-admin/firestore';
import { ChatService } from './chat.service';

describe('ChatService.send', () => {
  function setup({ plan = 'adherencia', lastInboundHoursAgo = 2 as number | null, optedOut = false } = {}) {
    const sent: any[] = [];
    const empty = { docs: [] };
    const query = { select: () => ({ get: async () => empty }) };
    const contactDoc = {
      get: async () => ({
        get: () => (lastInboundHoursAgo === null ? undefined : Timestamp.fromMillis(Date.now() - lastInboundHoursAgo * 3_600_000)),
      }),
    };
    const sub = { doc: () => contactDoc, where: () => query };
    const batch = { set: jest.fn(), update: jest.fn(), commit: jest.fn() };
    const firebase = { db: { collection: () => ({ doc: () => ({ collection: () => sub }) }), batch: () => batch } };
    const orgs = { get: async () => ({ id: 'org', plan, status: 'active' }) };
    const templates = { list: async () => [] };
    const store = { raw: async () => ({ phone_number_id: 'pn' }), getSecrets: async () => ({ access_token: 'tk' }) };
    const graph = {
      post: async (_p: string, _t: string, body: any) => {
        sent.push(body);
        return { messages: [{ id: 'wamid.1' }] };
      },
    };
    const patients = { get: async () => ({ id: 'p1', phone: '573001112233', opted_out: optedOut }) };
    const service = new ChatService(firebase as any, orgs as any, templates as any, store as any, graph as any, patients as any);
    const user = { uid: 'u1', email: 'ana@clinica.co', name: 'Ana', role: null };
    return { service, sent, batch, user };
  }

  it('envía el texto dentro de la ventana de 24 h y lo guarda', async () => {
    const { service, sent, batch, user } = setup();
    await service.send('org', 'p1', '  Hola María  ', user);
    expect(sent).toEqual([expect.objectContaining({ to: '573001112233', type: 'text', text: { body: 'Hola María', preview_url: false } })]);
    expect(batch.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'chat', sent_by_name: 'Ana' }), { merge: true });
  });

  it('con la ventana cerrada pide una plantilla', async () => {
    for (const hours of [30, null]) {
      const { service, sent, user } = setup({ lastInboundHoursAgo: hours });
      await expect(service.send('org', 'p1', 'Hola', user)).rejects.toThrow('plantilla');
      expect(sent).toEqual([]);
    }
  });

  it('no envía en el plan Esencial ni a pacientes dados de baja', async () => {
    const esencial = setup({ plan: 'esencial' });
    await expect(esencial.service.send('org', 'p1', 'Hola', esencial.user)).rejects.toThrow('plan Adherencia');
    const baja = setup({ optedOut: true });
    await expect(baja.service.send('org', 'p1', 'Hola', baja.user)).rejects.toThrow('baja');
  });
});
