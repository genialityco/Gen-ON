/**
 * Plantillas de WhatsApp. El texto usa variables con nombre ({{nombre}},
 * {{procedimiento}}…); al enviarla a Meta se convierten a {{1}}…{{n}} y
 * `meta_variables` guarda ese orden para armar los envíos.
 */

export type TemplateCategory = 'UTILITY' | 'MARKETING';

/** Estados de Meta (DRAFT = todavía no se ha enviado a revisión). */
export type TemplateMetaStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION'
  | 'DELETED'
  | 'LIMIT_EXCEEDED';

export const TEMPLATE_STATUS_LABELS: Record<TemplateMetaStatus, string> = {
  DRAFT: 'Borrador',
  PENDING: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
  DISABLED: 'Deshabilitada',
  IN_APPEAL: 'En apelación',
  PENDING_DELETION: 'Por eliminar',
  DELETED: 'Eliminada',
  LIMIT_EXCEEDED: 'Límite excedido',
};

/**
 * Qué pasa cuando el paciente toca un botón de respuesta rápida:
 * - confirm: confirma (cita, indicación recibida)
 * - reply: responde automáticamente con `reply_text`
 * - alert: abre una alerta para la clínica (y responde si hay `reply_text`)
 * - opt_out: baja de los mensajes
 */
export type ButtonActionType = 'none' | 'confirm' | 'reply' | 'alert' | 'opt_out';
export type AlertLevel = 'info' | 'warning' | 'urgent';

export const BUTTON_ACTION_LABELS: Record<ButtonActionType, string> = {
  none: 'Solo registrar la respuesta',
  confirm: 'Confirmar',
  reply: 'Responder automáticamente',
  alert: 'Alerta para la clínica',
  opt_out: 'Dar de baja',
};

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  info: 'Informativa',
  warning: 'Atención',
  urgent: 'Urgente',
};

export interface ButtonAction {
  type: ButtonActionType;
  reply_text?: string | null;
  alert_level?: AlertLevel | null;
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL';
  /** Máx. 25 caracteres */
  text: string;
  /** URL: enlace fijo (instrucciones, ubicación, política de datos) */
  url?: string | null;
  /** QUICK_REPLY: qué hace al tocarlo */
  action?: ButtonAction | null;
}

export interface TemplateContent {
  label: string;
  category: TemplateCategory;
  language: string;
  /** Encabezado de texto opcional, sin variables */
  header: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}

export interface ApprovedTemplate {
  meta_name: string;
  language: string;
  body: string;
  header: string;
  footer: string;
  variables: string[];
  buttons: TemplateButton[];
  version: number;
  approved_at: string | null;
}

export interface Template extends TemplateContent {
  id: string;
  /** Identificador estable que usan los pasos de los protocolos */
  key: string;
  version: number;
  /** Profesional de la salud que validó el texto (requisito para enviarla a Meta) */
  clinical_validated_by: string | null;
  clinical_validated_at: string | null;
  meta_status: TemplateMetaStatus;
  meta_name: string | null;
  meta_id: string | null;
  /** Categoría final: Meta puede cambiarla si no corresponde al contenido */
  meta_category: string | null;
  rejected_reason: string | null;
  meta_variables: string[];
  submitted_at: string | null;
  /** Última versión aprobada: es la que se envía, aunque haya una nueva en revisión */
  approved: ApprovedTemplate | null;
  synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TemplateInput extends Partial<TemplateContent> {
  key?: string;
  clinical_validated_by?: string | null;
}

/** Variables disponibles; `example` se manda a Meta al crear la plantilla (lo exige). */
export const TEMPLATE_VARIABLES = [
  { key: 'nombre', label: 'Primer nombre del paciente', example: 'María' },
  { key: 'nombre_completo', label: 'Nombre completo del paciente', example: 'María Pérez' },
  { key: 'clinica', label: 'Nombre de la clínica', example: 'Clínica Dermasalud' },
  { key: 'procedimiento', label: 'Procedimiento', example: 'rinoplastia' },
  { key: 'fecha', label: 'Fecha del procedimiento o cita', example: 'lunes 3 de noviembre' },
  { key: 'hora', label: 'Hora del procedimiento o cita', example: '9:00 a. m.' },
  { key: 'profesional', label: 'Profesional a cargo', example: 'Dra. Gómez' },
  { key: 'telefono_clinica', label: 'Teléfono de la clínica', example: '601 555 1234' },
  { key: 'direccion', label: 'Dirección de la clínica', example: 'Calle 100 # 15-20' },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['key'];

const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Variables del texto en orden de aparición, sin repetir. */
export function extractVariables(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || '').matchAll(VAR_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Reemplaza las variables; las que no tienen valor quedan como «…». */
export function renderText(text: string, values: Record<string, string | null | undefined>): string {
  return String(text || '').replace(VAR_RE, (_, key) => {
    const v = values[key];
    return v === null || v === undefined || v === '' ? '…' : String(v);
  });
}

export const exampleValues: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.example]),
);

/** Meta rechaza parámetros con saltos de línea, tabulaciones o 4+ espacios seguidos. */
export function sanitizeParam(value: unknown, max = 300): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max);
}

/** Cuerpo con {{1}}…{{n}} y el orden de las variables. */
export function toPositional(body: string): { text: string; variables: string[] } {
  const variables = extractVariables(body);
  const text = String(body || '').replace(VAR_RE, (_, key) => `{{${variables.indexOf(key) + 1}}}`);
  return { text, variables };
}

/** Clave estable: minúsculas, números y guion bajo. */
export function slugKey(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Nombre en Meta: no se puede reutilizar tras un rechazo, por eso lleva versión. */
export function metaTemplateName(key: string, version: number): string {
  return `${slugKey(key)}_v${version}`.slice(0, 512);
}

/**
 * Problemas que harían que Meta rechace la plantilla o que el envío falle.
 * Vacío = se puede enviar a revisión.
 */
export function validateTemplate(t: Partial<TemplateContent>): string[] {
  const errors: string[] = [];
  const body = String(t.body || '').trim();
  const known = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

  if (!body) errors.push('El texto no puede estar vacío.');
  if (body.length > 1024) errors.push('El texto supera 1024 caracteres.');
  if (/^\{\{/.test(body)) errors.push('El texto no puede empezar con una variable (regla de Meta).');
  if (/\}\}[\s.!?¿¡,;:]*$/.test(body)) errors.push('El texto no puede terminar con una variable (regla de Meta).');
  if (/\}\}\s*\{\{/.test(body)) errors.push('Dos variables no pueden ir seguidas.');
  for (const v of extractVariables(body)) {
    if (!known.has(v)) errors.push(`Variable desconocida: {{${v}}}.`);
  }
  const vars = extractVariables(body).length;
  const words = body.replace(VAR_RE, '').split(/\s+/).filter(Boolean).length;
  if (vars && words < vars * 3) {
    errors.push('Demasiadas variables para lo corto del texto (Meta lo rechaza).');
  }

  const header = String(t.header || '');
  if (header.length > 60) errors.push('El encabezado no puede pasar de 60 caracteres.');
  if (/\{\{/.test(header)) errors.push('El encabezado no puede tener variables.');
  const footer = String(t.footer || '');
  if (footer.length > 60) errors.push('El pie no puede pasar de 60 caracteres.');
  if (/\{\{/.test(footer)) errors.push('El pie no puede tener variables.');

  const buttons = t.buttons || [];
  if (buttons.length > 10) errors.push('Máximo 10 botones.');
  if (buttons.filter((b) => b.type === 'URL').length > 2) errors.push('Máximo 2 botones de enlace.');
  for (const b of buttons) {
    if (!b.text?.trim()) errors.push('Hay un botón sin texto.');
    else if (b.text.length > 25) errors.push(`El botón "${b.text}" supera 25 caracteres.`);
    if (b.type === 'URL' && !/^https:\/\/\S+\.\S+/.test(b.url || '')) {
      errors.push(`El botón "${b.text}" necesita un enlace https://.`);
    }
    if (b.type === 'QUICK_REPLY') {
      const a = b.action;
      if ((a?.type === 'reply' && !a.reply_text?.trim()) || (a?.reply_text && a.reply_text.length > 1024)) {
        errors.push(`El botón "${b.text}" necesita el texto de la respuesta (máx. 1024).`);
      }
      if (a?.type === 'alert' && !a.alert_level) errors.push(`El botón "${b.text}" necesita el nivel de la alerta.`);
    }
  }
  // Meta exige agrupar respuestas rápidas y enlaces: el tipo cambia a lo más una vez
  const changes = buttons.filter((b, i) => i > 0 && b.type !== buttons[i - 1].type).length;
  if (changes > 1) errors.push('Los botones de respuesta y los de enlace deben ir agrupados.');
  return errors;
}

/** Plantilla en el formato de creación de la API de Meta. */
export function buildMetaTemplate(t: TemplateContent, metaName: string) {
  const { text, variables } = toPositional(t.body);
  const components: any[] = [];
  if (t.header?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: t.header.trim() });
  components.push({
    type: 'BODY',
    text,
    ...(variables.length ? { example: { body_text: [variables.map((v) => exampleValues[v] ?? 'ejemplo')] } } : {}),
  });
  if (t.footer?.trim()) components.push({ type: 'FOOTER', text: t.footer.trim() });
  const buttons = (t.buttons || []).map((b) =>
    b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url } : { type: 'QUICK_REPLY', text: b.text },
  );
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });
  return {
    payload: { name: metaName, language: t.language || 'es', category: t.category || 'UTILITY', components },
    variables,
  };
}

/**
 * Componentes de un envío: valores del cuerpo en el orden de la plantilla y
 * payload de cada respuesta rápida. Lanza si falta el valor de una variable.
 */
export function buildSendComponents(params: {
  variables: string[];
  values: Record<string, string | null | undefined>;
  buttons: TemplateButton[];
  payloadFor: (index: number) => string;
}): any[] {
  const missing = params.variables.filter((v) => !params.values[v]);
  if (missing.length) throw new Error(`Faltan datos para: ${missing.join(', ')}`);
  const components: any[] = [];
  if (params.variables.length) {
    components.push({
      type: 'body',
      parameters: params.variables.map((v) => ({ type: 'text', text: sanitizeParam(params.values[v]) })),
    });
  }
  params.buttons.forEach((b, i) => {
    if (b.type === 'QUICK_REPLY') {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(i),
        parameters: [{ type: 'payload', payload: params.payloadFor(i) }],
      });
    }
  });
  return components;
}

/** Payload de los botones de un envío programado: o:<outboxId>:<índice>. */
export function outboxButtonPayload(outboxId: string, index: number) {
  return `o:${outboxId}:${index}`;
}

export function parseOutboxButtonPayload(payload: string | null | undefined) {
  const m = /^o:([A-Za-z0-9_-]+):(\d+)$/.exec(payload || '');
  return m ? { outboxId: m[1], index: Number(m[2]) } : null;
}
