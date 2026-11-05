import type { MessageDeliveryStatus } from './meta-setup';

/** Horas desde el último mensaje del paciente en que se le puede escribir sin plantilla (regla de Meta). */
export const CHAT_WINDOW_HOURS = 24;
export const CHAT_MAX_LENGTH = 4096;

/**
 * - patient: lo escribió o tocó el paciente
 * - outbox: plantilla de la parrilla (protocolo, cita o envío manual)
 * - chat: texto que escribió alguien de la clínica
 * - auto_reply / opt_out: respuesta automática de Gen.ON
 * - test: mensaje de prueba del asistente
 */
export type ChatMessageKind = 'patient' | 'outbox' | 'chat' | 'auto_reply' | 'opt_out' | 'test';

export interface ChatMessage {
  id: string;
  direction: 'in' | 'out';
  kind: ChatMessageKind;
  /** Texto; en las plantillas, null (se muestra `template_label`) */
  text: string | null;
  template_label: string | null;
  /** Botón que tocó el paciente */
  reply: string | null;
  at: string;
  status: MessageDeliveryStatus | null;
  /** chat: quién de la clínica lo escribió */
  sent_by_name: string | null;
}

export interface PatientConversation {
  messages: ChatMessage[];
  /** Hasta cuándo se puede escribir sin plantilla; null = ventana cerrada */
  window_until: string | null;
}

export interface SendChatInput {
  text: string;
}
