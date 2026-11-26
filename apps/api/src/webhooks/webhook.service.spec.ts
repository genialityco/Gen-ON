import { inboundSummary, nextStatus, splitByWaba } from './webhook.service';

describe('nextStatus', () => {
  it('avanza y nunca retrocede', () => {
    expect(nextStatus(undefined, 'sent')).toBe('sent');
    expect(nextStatus('sent', 'delivered')).toBe('delivered');
    expect(nextStatus('read', 'delivered')).toBe('read');
    expect(nextStatus('read', 'failed')).toBe('failed');
  });
});

describe('inboundSummary', () => {
  it('texto', () => {
    expect(inboundSummary({ type: 'text', text: { body: 'Hola' } })).toEqual({ text: 'Hola', reply: null });
  });

  it('botón de plantilla', () => {
    expect(inboundSummary({ type: 'button', button: { payload: 'confirm', text: 'Confirmo' } })).toEqual({
      text: 'Confirmo',
      reply: { id: 'confirm', title: 'Confirmo' },
    });
  });

  it('respuesta interactiva', () => {
    const m = { type: 'interactive', interactive: { button_reply: { id: 'pain', title: 'Tengo dolor' } } };
    expect(inboundSummary(m)).toEqual({ text: 'Tengo dolor', reply: { id: 'pain', title: 'Tengo dolor' } });
  });

  it('imagen con texto', () => {
    expect(inboundSummary({ type: 'image', image: { caption: 'Así va' } })).toEqual({ text: 'Así va', reply: null });
  });
});

describe('splitByWaba', () => {
  it('agrupa por cuenta de WhatsApp (entry.id)', () => {
    const body = {
      entry: [
        { id: '111', time: 1, changes: [{ field: 'messages', value: { a: 1 } }, { field: 'messages', value: { a: 2 } }] },
        { id: '222', time: 1, changes: [{ field: 'messages', value: { b: 1 } }] },
      ],
    };
    const out = splitByWaba(body);
    expect([...out.keys()]).toEqual(['111', '222']);
    expect(out.get('111')![0].changes).toHaveLength(2);
    expect(out.get('222')![0].changes[0].value).toEqual({ b: 1 });
  });

  it('account_update usa la cuenta del cliente de waba_info', () => {
    const body = {
      entry: [
        {
          id: '999',
          time: 2,
          changes: [{ field: 'account_update', value: { event: 'PARTNER_APP_UNINSTALLED', waba_info: { waba_id: '333' } } }],
        },
      ],
    };
    expect([...splitByWaba(body).keys()]).toEqual(['333']);
  });

  it('cuerpo vacío o sin identificador', () => {
    expect(splitByWaba(undefined).size).toBe(0);
    expect(splitByWaba({ entry: [{ changes: [{ field: 'messages', value: {} }] }] }).size).toBe(0);
  });
});
