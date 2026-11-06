import { ClinicalService } from './clinical.service';

describe('ClinicalService.importMany', () => {
  function setup(existingBackground: Record<string, string | null> | null = null) {
    const created: any[] = [];
    const records: Record<string, any> = {};
    const logs: any[] = [];
    const patientDocs = [
      { id: 'p1', data: { first_name: 'Ana', last_name: 'Ruiz', phone: '573001112233', document: '1.020.304.050' } },
      { id: 'p2', data: { first_name: 'Luis', last_name: 'Gil', phone: '573009998877', document: null } },
    ].map((p) => ({ id: p.id, get: (k: string) => (p.data as any)[k] }));

    const recordRef = (id: string) => ({
      id,
      collection: () => ({ doc: () => ({ id: 'h' }) }),
    });
    const collections: Record<string, any> = {
      patients: { select: () => ({ get: async () => ({ docs: patientDocs }) }) },
      clinical_notes: { doc: () => ({ id: `n${created.length}` }) },
      clinical_records: { doc: (id: string) => recordRef(id) },
      clinical_access: { add: async (d: any) => logs.push(d) },
      members: { doc: () => ({ get: async () => ({ get: () => 'Dra. Gómez' }) }) },
    };
    const db = {
      collection: () => ({ doc: () => ({ collection: (name: string) => collections[name] }) }),
      batch: () => ({ create: (_ref: any, data: any) => created.push(data), commit: async () => undefined }),
      runTransaction: async (fn: any) =>
        fn({
          get: async (ref: any) => ({
            exists: !!existingBackground,
            data: () => ({ background: existingBackground }),
            get: (k: string) => (k === 'background' ? existingBackground : undefined),
          }),
          create: () => undefined,
          set: (ref: any, data: any) => (records[ref.id] = data),
        }),
    };
    const service = new ClinicalService({ db } as any, {} as any);
    const user = { uid: 'u1', email: 'dra@clinica.co', name: 'Dra. Gómez', role: null };
    return { service, created, records, logs, user };
  }

  const row = (over: Record<string, unknown> = {}) => ({
    patient: '3001112233',
    date: '2026-11-04',
    kind: null,
    procedure: null,
    area: null,
    body: null,
    background: {},
    guidance: {},
    share_with_assistant: null,
    ...over,
  });

  it('crea la nota con indicaciones y busca por celular o documento', async () => {
    const { service, created, user } = setup();
    const r = await service.importMany(
      'org',
      {
        source: 'fichas.xlsx',
        rows: [
          row({ procedure: 'Rinoplastia', guidance: { instructions: 'Lavados nasales', next_control: '2026-11-18' } }),
          row({ patient: '1020304050', kind: 'control', body: 'Buena evolución' }),
        ],
      },
      user,
      'clinician',
    );
    expect(r).toEqual(expect.objectContaining({ notes: 2, errors: 0 }));
    expect(created[0]).toEqual(
      expect.objectContaining({
        patient_id: 'p1',
        kind: 'procedure',
        body: 'Importado desde Excel (fichas.xlsx)',
        share_with_assistant: true,
        guidance: expect.objectContaining({ instructions: 'Lavados nasales', next_control: '2026-11-18' }),
      }),
    );
    expect(created[1]).toEqual(expect.objectContaining({ patient_id: 'p1', kind: 'control', share_with_assistant: false }));
  });

  it('solo cambia los antecedentes que vienen en el archivo', async () => {
    const { service, records, created, user } = setup({ allergies: 'Ninguna', medications: 'Losartán', conditions: 'HTA', surgeries: null, habits: null });
    const r = await service.importMany('org', { source: 'x', rows: [row({ patient: '3009998877', date: null, background: { allergies: 'Penicilina' } })] }, user, 'clinician');
    expect(r.backgrounds).toBe(1);
    expect(created).toEqual([]);
    expect(records.p2.background).toEqual(expect.objectContaining({ allergies: 'Penicilina', medications: 'Losartán', conditions: 'HTA' }));
  });

  it('informa el error de cada fila sin detener las demás', async () => {
    const { service, created, user } = setup();
    const r = await service.importMany(
      'org',
      {
        source: 'x',
        rows: [
          row({ patient: '3000000000', body: 'x' }),
          row({ date: null, body: 'sin fecha' }),
          row({ body: null }),
          row({ kind: 'procedure', body: 'sin procedimiento' }),
          row({ guidance: { next_control: '18/11/2026' } }),
          row({ body: 'válida' }),
        ],
      },
      user,
      'clinician',
    );
    expect(r.rows.map((x) => x.status)).toEqual(['error', 'error', 'error', 'error', 'error', 'ok']);
    expect(r.rows[0].message).toContain('No hay un paciente');
    expect(created).toHaveLength(1);
  });
});
