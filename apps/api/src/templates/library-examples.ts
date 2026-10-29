import type { ProtocolInput, TemplateInput } from '@genon/shared';

/**
 * Ejemplos de la biblioteca. Son un punto de partida: cada texto debe
 * revisarlo y validarlo un profesional de la salud antes de enviarlo a Meta.
 */
export const EXAMPLE_TEMPLATES: TemplateInput[] = [
  {
    key: 'preop_indicaciones',
    label: 'Indicaciones previas al procedimiento',
    header: 'Indicaciones para tu procedimiento',
    body: 'Hola {{nombre}}, te recordamos que tu {{procedimiento}} en {{clinica}} es el {{fecha}} a las {{hora}}. Ten presentes las indicaciones de tu profesional: ayuno si te lo indicaron, llegar 30 minutos antes y venir con un acompañante. ¿Tienes alguna duda?',
    footer: 'Responde con una opción',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Todo claro', action: { type: 'confirm' } },
      {
        type: 'QUICK_REPLY',
        text: 'Tengo dudas',
        action: {
          type: 'alert',
          alert_level: 'warning',
          reply_text: 'Gracias por avisarnos. Alguien de nuestro equipo te escribirá pronto.',
        },
      },
    ],
  },
  {
    key: 'post_dia1',
    label: '¿Cómo te sientes? (día siguiente)',
    body: 'Hola {{nombre}}, ¿cómo te sientes hoy después de tu {{procedimiento}}? Elige una opción para que nuestro equipo sepa cómo va tu recuperación.',
    footer: 'Si es una emergencia, llama al 123',
    buttons: [
      {
        type: 'QUICK_REPLY',
        text: 'Me siento bien',
        action: { type: 'reply', reply_text: '¡Qué bueno! Sigue las indicaciones de cuidado y escríbenos si necesitas algo.' },
      },
      {
        type: 'QUICK_REPLY',
        text: 'Tengo molestias',
        action: {
          type: 'alert',
          alert_level: 'warning',
          reply_text: 'Gracias por contarnos. Nuestro equipo revisará tu caso y te contactará.',
        },
      },
      {
        type: 'QUICK_REPLY',
        text: 'Necesito ayuda',
        action: {
          type: 'alert',
          alert_level: 'urgent',
          reply_text: 'Un profesional te contactará lo antes posible. Si es una emergencia, acude a urgencias o llama al 123.',
        },
      },
    ],
  },
  {
    key: 'post_cuidados',
    label: 'Recordatorio de cuidados',
    body: 'Hola {{nombre}}, recuerda seguir las indicaciones de cuidado de tu {{procedimiento}}: toma los medicamentos a la hora indicada, evita el sol y el esfuerzo físico, y mantén la zona limpia. Si notas algo fuera de lo normal, escríbenos.',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Entendido', action: { type: 'confirm' } },
      { type: 'QUICK_REPLY', text: 'Tengo una duda', action: { type: 'alert', alert_level: 'info' } },
    ],
  },
  {
    key: 'control_recordatorio',
    label: 'Agendar control',
    body: 'Hola {{nombre}}, ya es momento de tu cita de control después de tu {{procedimiento}} en {{clinica}}. ¿Quieres que te contactemos para programarla?',
    buttons: [
      {
        type: 'QUICK_REPLY',
        text: 'Sí, por favor',
        action: { type: 'alert', alert_level: 'info', reply_text: 'Listo, te escribiremos para agendar tu control.' },
      },
      { type: 'QUICK_REPLY', text: 'Ya la tengo', action: { type: 'confirm' } },
    ],
  },
  {
    key: 'satisfaccion',
    label: 'Encuesta de satisfacción',
    body: 'Hola {{nombre}}, en {{clinica}} queremos saber cómo fue tu experiencia con tu {{procedimiento}}. ¿Qué tan satisfecho o satisfecha estás con la atención?',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Muy satisfecho(a)', action: { type: 'reply', reply_text: '¡Gracias! Nos alegra mucho haberte acompañado.' } },
      { type: 'QUICK_REPLY', text: 'Satisfecho(a)', action: { type: 'reply', reply_text: 'Gracias por tu respuesta.' } },
      {
        type: 'QUICK_REPLY',
        text: 'Poco satisfecho(a)',
        action: { type: 'alert', alert_level: 'info', reply_text: 'Gracias por contarnos. Alguien del equipo te escribirá para conocer tu experiencia.' },
      },
    ],
  },
  {
    key: 'cita_recordatorio',
    label: 'Recordatorio de cita',
    body: 'Hola {{nombre}}, te recordamos tu cita en {{clinica}} el {{fecha}} a las {{hora}}. ¿Nos confirmas tu asistencia, por favor?',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirmo', action: { type: 'confirm' } },
      {
        type: 'QUICK_REPLY',
        text: 'Necesito cambiarla',
        action: { type: 'alert', alert_level: 'info', reply_text: 'Gracias por avisar. Te escribiremos para reprogramarla.' },
      },
    ],
  },
];

const step = (label: string, day_offset: number, template_key: string, time: string | null = null) => ({
  id: '',
  label,
  day_offset,
  time,
  template_key,
  enabled: true,
});

export const EXAMPLE_PROTOCOLS: ProtocolInput[] = [
  {
    name: 'Cirugía con recuperación',
    procedure: 'cirugía',
    description: 'Cirugías y procedimientos con incapacidad o recuperación de varios días.',
    steps: [
      step('Indicaciones previas', -1, 'preop_indicaciones', '10:00'),
      step('¿Cómo te sientes?', 1, 'post_dia1', '09:00'),
      step('Cuidados', 3, 'post_cuidados'),
      step('Agendar control', 7, 'control_recordatorio', '10:00'),
      step('Satisfacción', 30, 'satisfaccion', '11:00'),
    ],
  },
  {
    name: 'Procedimiento estético ambulatorio',
    procedure: 'procedimiento',
    description: 'Toxina botulínica, rellenos, peelings y otros procedimientos ambulatorios.',
    steps: [
      step('Indicaciones previas', -1, 'preop_indicaciones', '10:00'),
      step('¿Cómo te sientes?', 1, 'post_dia1', '09:00'),
      step('Agendar control', 14, 'control_recordatorio', '10:00'),
      step('Satisfacción', 30, 'satisfaccion', '11:00'),
    ],
  },
  {
    name: 'Recordatorio de cita',
    procedure: 'cita',
    description: 'Confirmación de asistencia dos días antes de la cita.',
    steps: [step('Confirmar asistencia', -2, 'cita_recordatorio', '10:00')],
  },
];
