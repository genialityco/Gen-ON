/**
 * Asistente de conexión de la cuenta de WhatsApp (Meta) de cada organización.
 * Cada clínica tiene su propio portafolio comercial y su propia app de Meta;
 * Gen.iality la configura. Meta no permite crear portafolios ni apps por API,
 * así que esos pasos son guiados y la plataforma valida lo que se ingresa; el
 * resto (número, registro, webhook, prueba) se hace desde aquí.
 */
export const META_SETUP_STEPS = [
  { key: 'company', title: 'Datos de la empresa', mode: 'form' },
  { key: 'business', title: 'Portafolio comercial', mode: 'guided' },
  { key: 'verification', title: 'Verificación del negocio', mode: 'guided' },
  { key: 'app', title: 'App de Meta', mode: 'guided' },
  { key: 'system_user', title: 'Usuario del sistema y token', mode: 'guided' },
  { key: 'phone', title: 'Cuenta de WhatsApp y número', mode: 'auto' },
  { key: 'registration', title: 'Registro del número', mode: 'auto' },
  { key: 'webhook', title: 'Webhook', mode: 'auto' },
  { key: 'test', title: 'Mensaje de prueba', mode: 'auto' },
  { key: 'templates', title: 'Plantillas', mode: 'auto' },
] as const;

export type MetaSetupStepKey = (typeof META_SETUP_STEPS)[number]['key'];
export type MetaSetupStepMode = (typeof META_SETUP_STEPS)[number]['mode'];

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
  steps: Record<MetaSetupStepKey, StepState>;

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
