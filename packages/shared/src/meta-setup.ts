/**
 * Asistente de conexión de la cuenta de WhatsApp (Meta) de cada organización.
 *
 * Dos formas de conectar:
 * - `embedded` (recomendada): Registro insertado de Meta con la app de
 *   Gen.iality como proveedor de tecnología. La clínica entra con su Facebook,
 *   elige o crea su portafolio, su cuenta de WhatsApp y su número, y Gen.ON
 *   recibe un token del negocio. El webhook es uno solo para toda la plataforma.
 * - `manual`: la clínica tiene su propia app de Meta y Gen.iality carga el
 *   token de un usuario del sistema (clínicas conectadas antes de que
 *   Gen.iality fuera proveedor de tecnología). Meta no permite crear
 *   portafolios ni apps por API: esos pasos son guiados.
 */
export const META_CONNECTION_MODES = ['embedded', 'manual'] as const;
export type MetaConnectionMode = (typeof META_CONNECTION_MODES)[number];

export const META_CONNECTION_MODE_LABELS: Record<MetaConnectionMode, string> = {
  embedded: 'Registro insertado de Meta',
  manual: 'Manual con app propia',
};

const BOTH = ['embedded', 'manual'] as const;

export const META_SETUP_STEPS = [
  { key: 'company', title: 'Datos de la empresa', mode: 'form', flows: BOTH, required: true },
  { key: 'signup', title: 'Conectar WhatsApp', mode: 'auto', flows: ['embedded'], required: true },
  { key: 'business', title: 'Portafolio comercial', mode: 'guided', flows: ['manual'], required: true },
  { key: 'verification', title: 'Verificación del negocio', mode: 'guided', flows: BOTH, required: false },
  { key: 'app', title: 'App de Meta', mode: 'guided', flows: ['manual'], required: true },
  { key: 'system_user', title: 'Usuario del sistema y token', mode: 'guided', flows: ['manual'], required: true },
  { key: 'phone', title: 'Cuenta de WhatsApp y número', mode: 'auto', flows: BOTH, required: true },
  { key: 'registration', title: 'Registro del número', mode: 'auto', flows: BOTH, required: true },
  { key: 'webhook', title: 'Webhook', mode: 'auto', flows: BOTH, required: true },
  { key: 'test', title: 'Mensaje de prueba', mode: 'auto', flows: BOTH, required: true },
  { key: 'templates', title: 'Plantillas', mode: 'auto', flows: BOTH, required: false },
] as const;

export type MetaSetupStepKey = (typeof META_SETUP_STEPS)[number]['key'];
export type MetaSetupStepMode = (typeof META_SETUP_STEPS)[number]['mode'];
export type MetaSetupStep = (typeof META_SETUP_STEPS)[number];

/** Pasos que se muestran con una forma de conexión. */
export function metaStepsFor(mode: MetaConnectionMode): MetaSetupStep[] {
  return META_SETUP_STEPS.filter((s) => (s.flows as readonly string[]).includes(mode));
}

/** Pasos que deben estar listos para enviar mensajes a pacientes. */
export function metaRequiredSteps(mode: MetaConnectionMode): MetaSetupStepKey[] {
  return metaStepsFor(mode)
    .filter((s) => s.required)
    .map((s) => s.key);
}

export type StepStatus = 'pending' | 'in_review' | 'done' | 'error';

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  done: 'Listo',
  error: 'Con error',
};

export interface StepState {
  status: StepStatus;
  /** Detalle para mostrar: error de Meta, motivo de la revisión, etc. */
  message: string | null;
  updated_at: string | null;
}

export interface MetaTokenInfo {
  type: string | null;
  app_id: string | null;
  /** null = no vence */
  expires_at: string | null;
  scopes: string[];
  /** Cuentas de WhatsApp a las que el token tiene acceso */
  waba_ids: string[];
  checked_at: string | null;
}

export type MessageDeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';

/** Lo que el frontend ve de la conexión (nunca los secretos). */
export interface MetaConnection {
  org_id: string;
  mode: MetaConnectionMode;
  steps: Record<MetaSetupStepKey, StepState>;
  /** App de Gen.iality (proveedor de tecnología): lo que necesita el Registro insertado */
  platform: MetaPlatformInfo;

  business_id: string | null;
  business_name: string | null;
  /** verified | pending | not_verified | failed... tal como lo da Meta */
  business_verification_status: string | null;

  app_id: string | null;
  app_name: string | null;
  has_app_secret: boolean;

  has_access_token: boolean;
  token: MetaTokenInfo | null;

  waba_id: string | null;
  waba_name: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  /** Estado del nombre visible: APPROVED, PENDING_REVIEW, DECLINED... */
  name_status: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
  /** CLOUD_API cuando ya está registrado en la API */
  platform_type: string | null;
  phone_status: string | null;
  messaging_limit_tier: string | null;

  webhook: {
    callback_url: string;
    verify_token: string | null;
    verified_at: string | null;
    app_subscribed_at: string | null;
    waba_subscribed_at: string | null;
    last_event_at: string | null;
  };

  test: {
    to: string | null;
    wamid: string | null;
    sent_at: string | null;
    status: MessageDeliveryStatus | null;
    error: string | null;
  };

  updated_at: string | null;
}

export interface MetaPlatformInfo {
  /** La API tiene META_APP_ID, META_APP_SECRET y META_ES_CONFIG_ID */
  embedded_signup_available: boolean;
  app_id: string | null;
  /** Configuración de Facebook Login for Business (variante Registro insertado) */
  config_id: string | null;
  graph_version: string;
  /** Webhook de la plataforma, uno para todas las clínicas conectadas con el Registro insertado */
  webhook_callback_url: string;
  webhook_verified_at: string | null;
}

export interface MetaPhoneNumberOption {
  id: string;
  display_phone_number: string;
  verified_name: string | null;
  name_status: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
  platform_type: string | null;
  status: string | null;
}

export interface MetaWabaOption {
  id: string;
  name: string | null;
  phone_numbers: MetaPhoneNumberOption[];
}

/** Cuerpos de las acciones del asistente. */
export interface CompanyStepInput {
  legal_name: string;
  nit: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
}

export interface BusinessStepInput {
  business_id: string;
}

export interface VerificationStepInput {
  status: Extract<StepStatus, 'pending' | 'in_review' | 'done'>;
  message?: string;
}

export interface AppStepInput {
  app_id: string;
  /** Vacío al editar = se conserva el guardado */
  app_secret?: string;
}

export interface TokenStepInput {
  access_token: string;
}

export interface PhoneStepInput {
  waba_id: string;
  phone_number_id: string;
}

export interface RequestCodeInput {
  method: 'SMS' | 'VOICE';
}

export interface VerifyCodeInput {
  code: string;
}

export interface RegisterPhoneInput {
  /** PIN de verificación en dos pasos (6 dígitos) */
  pin: string;
}

export interface TestMessageInput {
  to: string;
  /** Plantilla aprobada (por defecto hello_world / en_US) */
  template?: string;
  language?: string;
}

export interface ConnectionModeInput {
  mode: MetaConnectionMode;
}

/** Lo que devuelve el Registro insertado en el navegador. */
export interface EmbeddedSignupInput {
  /** Código de FB.login (response_type: code); Meta deja cambiarlo por el token durante 5 min */
  code: string;
  /** Del evento WA_EMBEDDED_SIGNUP (FINISH); si no llegó, la API lo deduce del token */
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}
