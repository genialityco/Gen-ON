import { inboundSummary, nextStatus } from './webhook.service';

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
