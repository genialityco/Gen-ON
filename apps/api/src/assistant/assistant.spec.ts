import { localDate, matchesProcedure } from '@genon/shared';
import { buildPatientContext } from './patient-context';
import { AssistantService } from './assistant.service';
import { conversationTurns, systemPrompt } from './prompt';

describe('prompt del asistente', () => {
  const org = {
    name: 'Clínica Sol',
    address: 'Calle 100 # 15-20',
    city: 'Bogotá',
    contact_phone: '601 555 1234',
    website: null,
    assistant: { enabled: true, instructions: 'Tutea al paciente.', handoff_message: 'Te escribimos pronto.', use_clinical: false },
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
      outbox: { where: () => ({ get: async () => docs([]) }) },
    };
    const batch = { set: (...a: any[]) => sets.push(a), update: (...a: any[]) => updates.push(a), commit: async () => undefined };
    const firebase = { db: { collection: () => ({ doc: () => ({ collection: (name: string) => collections[name] }) }), batch: () => batch } };
    const org = {
      id: 'org',
      name: 'Clínica Sol',
      plan,
      status: 'active',
      timezone: 'America/Bogota',
      assistant: { enabled, instructions: '', handoff_message: 'Una persona te escribirá.', use_clinical: false },
    };
    const orgs = { get: async () => org };
    const patients = { findByPhone: async () => ({ id: 'p1', first_name: 'Ana', last_name: 'Ruiz', phone: '573001112233', email: null, opted_out: false }) };
    const notifier = { notify: async (_o: any, n: any) => notices.push(n) };
    const store = { raw: async () => ({ phone_number_id: 'pn' }), getSecrets: async () => ({ access_token: 'tk' }) };
    const graph = {
      post: async (_p: string, _t: string, body: any) => {
        sent.push(body);
        return { messages: [{ id: 'wamid.1' }] };
      },
    };
    const gemini = { configured: true, json: jest.fn(async () => decision) };
    const templates = { list: async () => [] };
    const service = new AssistantService(
      firebase as any,
      orgs as any,
      patients as any,
      notifier as any,
      store as any,
      graph as any,
      gemini as any,
      templates as any,
      { forAssistant: async () => null } as any,
    );
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

describe('contexto del paciente', () => {
  const record = {
    patient: { first_name: 'Ana María', last_name: 'Ruiz', phone: '573001112233', email: 'ana@correo.com' },
    appointments: [
      { date: '2026-11-10', time: '09:00', reason: 'Control de rinoplastia', professional: 'Dr. Mejía', status: 'scheduled' as const },
      { date: '2026-10-12', time: '07:30', reason: 'Rinoplastia', professional: 'Dr. Mejía', status: 'attended' as const },
      { date: '2026-11-04', time: '10:00', reason: 'Valoración', professional: null, status: 'no_show' as const },
    ],
    enrollments: [
      { protocol_name: 'Cirugía con recuperación', procedure: 'rinoplastia', professional: 'Dr. Mejía', reference_date: '2026-10-12', reference_time: '07:30', status: 'active' },
      { protocol_name: 'Otro', procedure: 'peeling', professional: null, reference_date: '2026-09-01', reference_time: null, status: 'cancelled' },
    ],
    received: [{ date: '2026-10-13', label: 'Día 1', text: 'Hola Ana, mantén la cabeza elevada y no te suenes la nariz.' }],
    scheduled: ['2026-11-12', '2026-11-19'],
  };

  it('incluye sus citas, procedimientos e indicaciones recibidas', () => {
    const ctx = buildPatientContext(record, '2026-11-06', '2026-11-0610:00');
    const text = ctx.context.join('\n');
    expect(ctx.first_name).toBe('Ana');
    expect(text).toContain('Celular registrado: +573001112233 · Correo: ana@correo.com');
    expect(text).toMatch(/Citas próximas:\n- martes 10 de noviembre \(en 4 días\), 9:00 a\. m\., Control de rinoplastia, con Dr\. Mejía/);
    expect(text).toContain('No asistió');
    expect(text).toContain('rinoplastia: lunes 12 de octubre (hace 25 días)');
    expect(text).not.toContain('peeling');
    expect(text).toContain('no te suenes la nariz');
    expect(text).toContain('Próximos mensajes programados: 2');
    expect(ctx.procedures).toEqual(expect.arrayContaining(['rinoplastia', 'Control de rinoplastia']));
  });

  it('con la ficha compartida incluye alergias e indicaciones del profesional, sin el texto interno', () => {
    const ctx = buildPatientContext(
      {
        ...record,
        clinical: {
          allergies: 'Penicilina',
          medications: null,
          notes: [
            {
              date: '2026-11-03',
              kind: 'control' as const,
              procedure: 'Rinoplastia',
              area: 'Nariz',
              author: 'Dr. Mejía',
              guidance: { instructions: 'Lavados nasales 3 veces al día.', medications: 'Acetaminofén 500 mg cada 8 h por 3 días', restrictions: 'No usar gafas hasta el 1 de diciembre', warning_signs: 'Sangrado que no para en 10 minutos', next_control: '2026-11-17' },
            },
          ],
        },
      },
      '2026-11-06',
      '2026-11-0610:00',
    );
    const text = ctx.context.join('\n');
    expect(text).toContain('Alergias registradas: Penicilina');
    expect(text).toContain('Control: Rinoplastia (Nariz) · Dr. Mejía');
    expect(text).toContain('Medicamentos formulados: Acetaminofén 500 mg cada 8 h por 3 días');
    expect(text).toContain('Signos de alarma: Sangrado que no para en 10 minutos');
    expect(text).toContain('Próximo control sugerido: martes 17 de noviembre (en 11 días)');
  });

  it('los temas de un procedimiento coinciden sin importar tildes ni mayúsculas', () => {
    expect(matchesProcedure('Rinoplastia', ['control de rinoplastia'])).toBe(true);
    expect(matchesProcedure('blefaroplastia', ['rinoplastia'])).toBe(false);
  });
});
