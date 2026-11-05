import { localDate } from '@genon/shared';
import { AssistantService } from './assistant.service';
import { conversationTurns, systemPrompt } from './prompt';

describe('prompt del asistente', () => {
  const org = {
    name: 'Clínica Sol',
    address: 'Calle 100 # 15-20',
    city: 'Bogotá',
    contact_phone: '601 555 1234',
    website: null,
    assistant: { enabled: true, instructions: 'Tutea al paciente.', handoff_message: 'Te escribimos pronto.' },
  };

  it('lleva los datos de la clínica, el contenido aprobado y las reglas', () => {
    const text = systemPrompt({
      org,
      knowledge: [{ title: 'Horario', content: 'Lunes a viernes de 7 a. m. a 6 p. m.' }],
      patient: { first_name: 'Ana', context: ['Próxima cita: lunes 3 de noviembre, 9:00 a. m.'] },
      now: 'martes 4 de noviembre de 2026, 10:00 a. m.',
    });
    expect(text).toContain('Dirección: Calle 100 # 15-20, Bogotá');
    expect(text).toContain('## Horario\nLunes a viernes');
    expect(text).toContain('Primer nombre: Ana');
    expect(text).toContain('No des diagnósticos');
    expect(text).toContain('Tutea al paciente.');
  });

  it('sin contenido aprobado pide pasar todo a una persona', () => {
    expect(systemPrompt({ org, knowledge: [], patient: null, now: 'hoy' })).toContain('sin contenido: pasa a una persona');
  });

  it('une mensajes seguidos y termina en el paciente', () => {
    expect(
      conversationTurns([
        { role: 'model', text: '[Plantilla]' },
        { role: 'user', text: 'Hola' },
        { role: 'user', text: '¿A qué hora abren?' },
        { role: 'model', text: 'A las 7.' },
        { role: 'user', text: '¿Y el sábado?' },
        { role: 'model', text: 'pendiente' },
      ]),
    ).toEqual([
      { role: 'user', text: 'Hola\n¿A qué hora abren?' },
      { role: 'model', text: 'A las 7.' },
      { role: 'user', text: '¿Y el sábado?' },
    ]);
  });
});

describe('AssistantService.handle', () => {
  function setup({ plan = 'oraculo', enabled = true, decision = { reply: 'Abrimos a las 7.', handoff: false } as any, pausedMs = 0, count = 0 } = {}) {
    const sent: any[] = [];
    const updates: any[] = [];
    const sets: any[] = [];
    const notices: any[] = [];
    const now = Date.now();
    const docs = (list: any[]) => ({ docs: list.map(([id, data]) => ({ id, data: () => data })) });
    const collections: Record<string, any> = {
      wa_contacts: { doc: () => ({ get: async () => ({ data: () => ({ assistant_paused_until: pausedMs ? { toMillis: () => now + pausedMs } : undefined, assistant_day: localDate(new Date(), 'America/Bogota'), assistant_count: count }) }) }) },
      messages: {
        where: (field: string) => ({
          select: () => ({
            get: async () =>
              field === 'from'
                ? docs([['m1', { direction: 'in', text: '¿A qué hora abren?', type: 'text', received_at: { toMillis: () => now - 1000 }, handled: false }]])
                : docs([]),
          }),
        }),
        doc: (id: string) => ({ id }),
      },
      assistant_knowledge: { get: async () => docs([['k1', { title: 'Horario', content: '7 a. m.', approved: true }]]) },
      appointments: { where: () => ({ get: async () => docs([]) }) },
      enrollments: { where: () => ({ get: async () => docs([]) }) },
    };
    const batch = { set: (...a: any[]) => sets.push(a), update: (...a: any[]) => updates.push(a), commit: async () => undefined };
    const firebase = { db: { collection: () => ({ doc: () => ({ collection: (name: string) => collections[name] }) }), batch: () => batch } };
    const org = {
      id: 'org',
      name: 'Clínica Sol',
      plan,
      status: 'active',
      timezone: 'America/Bogota',
      assistant: { enabled, instructions: '', handoff_message: 'Una persona te escribirá.' },
    };
    const orgs = { get: async () => org };
    const patients = { findByPhone: async () => ({ id: 'p1', first_name: 'Ana', last_name: 'Ruiz', opted_out: false }) };
    const notifier = { notify: async (_o: any, n: any) => notices.push(n) };
    const store = { raw: async () => ({ phone_number_id: 'pn' }), getSecrets: async () => ({ access_token: 'tk' }) };
    const graph = {
      post: async (_p: string, _t: string, body: any) => {
        sent.push(body);
        return { messages: [{ id: 'wamid.1' }] };
      },
    };
    const gemini = { configured: true, json: jest.fn(async () => decision) };
    const service = new AssistantService(firebase as any, orgs as any, patients as any, notifier as any, store as any, graph as any, gemini as any);
    service.debounceMs = 0;
    return { service, sent, updates, sets, notices, gemini };
  }

  it('responde con la IA y deja atendido el mensaje', async () => {
    const { service, sent, updates } = setup();
    await service.handle('org', '573001112233', 'm1');
    expect(sent[0].text.body).toBe('Abrimos a las 7.');
    expect(updates).toEqual([[{ id: 'm1' }, expect.objectContaining({ handled: true, handled_by: 'assistant' })]]);
  });

  it('al pasar a una persona avisa al equipo, marca la transferencia y se pausa', async () => {
    const { service, sent, updates, sets, notices } = setup({ decision: { reply: '', handoff: true, reason: 'Quiere agendar', urgent: false } });
    await service.handle('org', '573001112233', 'm1');
    expect(sent[0].text.body).toBe('Una persona te escribirá.');
    expect(updates).toEqual([[{ id: 'm1' }, { handoff: true, handoff_reason: 'Quiere agendar' }]]);
    expect(sets.some(([, data]) => data.assistant_paused_until)).toBe(true);
    expect(notices[0]).toEqual(expect.objectContaining({ patient: 'Ana Ruiz', level: 'warning' }));
  });

  it('no responde sin el plan, apagado, en pausa o si llegó otro mensaje después', async () => {
    for (const s of [setup({ plan: 'adherencia' }), setup({ enabled: false }), setup({ pausedMs: 60_000 })]) {
      await s.service.handle('org', '573001112233', 'm1');
      expect(s.sent).toEqual([]);
      expect(s.gemini.json).not.toHaveBeenCalled();
    }
    const newer = setup();
    await newer.service.handle('org', '573001112233', 'm0');
    expect(newer.sent).toEqual([]);
  });

  it('después del límite diario pasa a una persona sin llamar a la IA', async () => {
    const { service, gemini, notices } = setup({ count: 99 });
    await service.handle('org', '573001112233', 'm1');
    expect(gemini.json).not.toHaveBeenCalled();
    expect(notices).toHaveLength(1);
  });
});
