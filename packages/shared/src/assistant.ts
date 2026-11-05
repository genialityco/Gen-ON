/**
 * Asistente con IA (plan IA Oráculo): responde por WhatsApp lo que escriben
 * los pacientes usando solo el contenido aprobado por la clínica, y pasa la
 * conversación a una persona cuando hace falta.
 */
export interface AssistantSettings {
  enabled: boolean;
  /** Indicaciones de la clínica: tono, temas que no debe tocar, cómo presentarse */
  instructions: string;
  /** Lo que recibe el paciente cuando el asistente lo pasa a una persona */
  handoff_message: string;
}

export const DEFAULT_HANDOFF_MESSAGE =
  'Gracias por escribirnos. Una persona de nuestro equipo te responderá lo antes posible por este mismo chat.';

export const DEFAULT_ASSISTANT: AssistantSettings = {
  enabled: false,
  instructions: '',
  handoff_message: DEFAULT_HANDOFF_MESSAGE,
};

/** Respuestas del asistente por número y día; al pasarlas, pasa a una persona. */
export const ASSISTANT_DAILY_LIMIT = 15;
/** Horas que el asistente no responde a un número después de que la clínica le escribe o lo transfiere. */
export const ASSISTANT_PAUSE_HOURS = 12;

export const KNOWLEDGE_MAX_ENTRIES = 60;
export const KNOWLEDGE_MAX_CONTENT = 4000;
export const ASSISTANT_INSTRUCTIONS_MAX = 2000;

/** Contenido que el asistente puede usar; solo el aprobado llega a la IA. */
export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  approved: boolean;
  approved_by_name: string | null;
  approved_at: string | null;
  updated_at: string | null;
}

export interface KnowledgeInput {
  title: string;
  content: string;
  approved: boolean;
}

export interface AssistantSettingsInput {
  enabled?: boolean;
  instructions?: string;
  handoff_message?: string;
}

/** Decisión del modelo para un mensaje. */
export interface AssistantReply {
  reply: string;
  handoff: boolean;
  reason: string | null;
}

export interface AssistantTestInput {
  question: string;
}
