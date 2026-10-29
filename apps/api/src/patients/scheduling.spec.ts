import {
  buildMetaTemplate,
  buildSendComponents,
  computeSendAt,
  formatLongDate,
  formatTime12,
  normalizePatientPhone,
  orderedSteps,
  outboxButtonPayload,
  parseOutboxButtonPayload,
  validateProtocol,
  validateTemplate,
  type TemplateContent,
} from '@genon/shared';
import { EXAMPLE_PROTOCOLS, EXAMPLE_TEMPLATES } from '../templates/library-examples';
import { MetaApiError } from '../meta/graph.client';
import { backoffMs, isRetryable } from './dispatcher.service';
import { missingVariables, variableValues } from './variables';

const TZ = 'America/Bogota';

describe('computeSendAt', () => {
  it('convierte la hora local de Bogotá (UTC-5) a UTC', () => {
    const r = computeSendAt({ referenceDate: '2026-11-04', dayOffset: 1, time: '09:00', timeZone: TZ, blockedWeekdays: [] });
    expect(r.date).toBe('2026-11-05');
    expect(r.at.toISOString()).toBe('2026-11-05T14:00:00.000Z');
    expect(r.shifted).toBe(false);
  });

  it('antes del procedimiento corre hacia atrás el día bloqueado', () => {
    // 2026-11-09 es lunes: el día -1 es domingo 8 → sábado 7
    const r = computeSendAt({ referenceDate: '2026-11-09', dayOffset: -1, time: '10:00', timeZone: TZ, blockedWeekdays: [0] });
    expect(r.date).toBe('2026-11-07');
    expect(r.shifted).toBe(true);
  });

  it('después del procedimiento corre hacia adelante', () => {
    // 2026-11-07 es sábado: el día +1 es domingo 8 → lunes 9
    const r = computeSendAt({ referenceDate: '2026-11-07', dayOffset: 1, time: '09:00', timeZone: TZ, blockedWeekdays: [0] });
    expect(r.date).toBe('2026-11-09');
    expect(r.shifted).toBe(true);
  });
});

describe('formatos', () => {
  it('fecha larga y hora de 12 horas en español', () => {
    expect(formatLongDate('2026-11-09')).toBe('lunes 9 de noviembre');
    expect(formatTime12('14:30')).toMatch(/^2:30\s?p\.\s?m\.$/);
  });
});

describe('normalizePatientPhone', () => {
  it('agrega el 57 a celulares colombianos de 10 dígitos', () => {
    expect(normalizePatientPhone('300 123 4567')).toBe('573001234567');
    expect(normalizePatientPhone('+57 300 123 4567')).toBe('573001234567');
    expect(normalizePatientPhone('+1 (305) 555-0100')).toBe('13055550100');
    expect(normalizePatientPhone('6015551234')).toBeNull();
  });
});

describe('biblioteca de ejemplo', () => {
  it.each(EXAMPLE_TEMPLATES.map((t) => [t.key, t]))('la plantilla %s cumple las reglas de Meta', (_, t) => {
    expect(validateTemplate(t as TemplateContent)).toEqual([]);
  });

  it('los protocolos usan plantillas que existen', () => {
    const keys = new Set(EXAMPLE_TEMPLATES.map((t) => t.key!));
    for (const p of EXAMPLE_PROTOCOLS) {
      const steps = p.steps.map((s, i) => ({ ...s, id: `s${i}` }));
      expect(validateProtocol({ ...p, steps }, keys)).toEqual([]);
    }
  });
});

describe('validateTemplate', () => {
  const base: TemplateContent = {
    label: 'x',
    category: 'UTILITY',
    language: 'es',
    header: '',
    body: 'Hola {{nombre}}, te esperamos mañana en la clínica.',
    footer: '',
    buttons: [],
  };

  it('detecta reglas de Meta', () => {
    expect(validateTemplate({ ...base, body: '{{nombre}} hola, te esperamos en la clínica.' })).toContain(
      'El texto no puede empezar con una variable (regla de Meta).',
    );
    expect(validateTemplate({ ...base, body: 'Hola, te esperamos {{nombre}}.' }).join()).toMatch(/terminar con una variable/);
    expect(validateTemplate({ ...base, body: 'Hola {{paciente}}, te esperamos mañana.' }).join()).toMatch(/desconocida/);
    expect(
      validateTemplate({ ...base, buttons: [{ type: 'URL', text: 'Ver', url: 'http://x.com' }] }).join(),
    ).toMatch(/https/);
    expect(
      validateTemplate({
        ...base,
        buttons: [
          { type: 'QUICK_REPLY', text: 'A', action: { type: 'none' } },
          { type: 'URL', text: 'B', url: 'https://x.com' },
          { type: 'QUICK_REPLY', text: 'C', action: { type: 'none' } },
        ],
      }).join(),
    ).toMatch(/agrupados/);
  });

  it('arma la plantilla para Meta con variables posicionales y ejemplos', () => {
    const { payload, variables } = buildMetaTemplate(
      { ...base, body: 'Hola {{nombre}}, tu cita es el {{fecha}}. Te esperamos, {{nombre}}, en la sede.' },
      'cita_v1',
    );
    expect(variables).toEqual(['nombre', 'fecha']);
    expect(payload.components[0]).toEqual({
      type: 'BODY',
      text: 'Hola {{1}}, tu cita es el {{2}}. Te esperamos, {{1}}, en la sede.',
      example: { body_text: [['María', 'lunes 3 de noviembre']] },
    });
  });
});

describe('envío', () => {
  it('componentes con parámetros y payload por botón', () => {
    const c = buildSendComponents({
      variables: ['nombre', 'fecha'],
      values: { nombre: 'Ana', fecha: 'lunes\n3' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sí' },
        { type: 'URL', text: 'Ver', url: 'https://x.com' },
      ],
      payloadFor: (i) => outboxButtonPayload('abc123', i),
    });
    expect(c[0].parameters).toEqual([
      { type: 'text', text: 'Ana' },
      { type: 'text', text: 'lunes 3' },
    ]);
    expect(c).toHaveLength(2); // el enlace fijo no lleva parámetros
    expect(c[1].parameters[0].payload).toBe('o:abc123:0');
    expect(parseOutboxButtonPayload('o:abc123:0')).toEqual({ outboxId: 'abc123', index: 0 });
    expect(parseOutboxButtonPayload('{"t":"wac"}')).toBeNull();
  });

  it('falla si falta un dato', () => {
    expect(() =>
      buildSendComponents({ variables: ['hora'], values: {}, buttons: [], payloadFor: () => '' }),
    ).toThrow('Faltan datos para: hora');
  });

  it('variables desde la clínica, el paciente y la inscripción', () => {
    const values = variableValues({
      org: { name: 'Dermasalud', contact_phone: '6015551234', address: 'Calle 100', city: 'Bogotá' },
      patient: { first_name: 'María José', last_name: 'Pérez' },
      enrollment: { reference_date: '2026-11-09', reference_time: '09:30', procedure: null, professional: null, protocol_procedure: 'rinoplastia' },
    });
    expect(values.nombre).toBe('María');
    expect(values.procedimiento).toBe('rinoplastia');
    expect(values.direccion).toBe('Calle 100, Bogotá');
    expect(missingVariables(['nombre', 'profesional', 'hora'], values)).toEqual(['el profesional']);
  });
});

describe('reintentos', () => {
  it('reintenta límites de velocidad y fallas del servidor, no errores de datos', () => {
    expect(isRetryable(new MetaApiError('rate', 400, 130429))).toBe(true);
    expect(isRetryable(new MetaApiError('server', 503))).toBe(true);
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryable(new MetaApiError('template does not exist', 404, 132001))).toBe(false);
    expect(isRetryable(new MetaApiError('invalid param', 400, 100))).toBe(false);
    expect(backoffMs(3)).toBe(9 * 60_000);
  });
});

describe('orderedSteps', () => {
  it('ordena por día y hora y omite los desactivados', () => {
    const s = (id: string, day_offset: number, time: string | null, enabled = true) => ({
      id,
      label: id,
      day_offset,
      time,
      template_key: 't',
      enabled,
    });
    const r = orderedSteps([s('a', 3, null), s('b', -1, '10:00'), s('c', 3, '08:00'), s('d', 0, null, false)], '09:00');
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
