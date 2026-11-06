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
  /**
   * Usar la ficha de seguimiento: alergias, medicamentos que toma y las
   * indicaciones para el paciente de las notas compartidas (no el texto
   * interno de las notas).
   */
  use_clinical: boolean;
}

export const DEFAULT_HANDOFF_MESSAGE =
  'Gracias por escribirnos. Una persona de nuestro equipo te responderá lo antes posible por este mismo chat.';

export const DEFAULT_ASSISTANT: AssistantSettings = {
  enabled: false,
  instructions: '',
  handoff_message: DEFAULT_HANDOFF_MESSAGE,
  use_clinical: false,
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
  /** Si aplica a un procedimiento ("rinoplastia"): solo se usa con pacientes de ese procedimiento */
  procedure: string | null;
  approved: boolean;
  approved_by_name: string | null;
  approved_at: string | null;
  updated_at: string | null;
}

export interface KnowledgeInput {
  title: string;
  content: string;
  procedure?: string | null;
  approved: boolean;
}

export interface AssistantSettingsInput {
  enabled?: boolean;
  instructions?: string;
  handoff_message?: string;
  use_clinical?: boolean;
}

/** Decisión del modelo para un mensaje. */
export interface AssistantReply {
  reply: string;
  handoff: boolean;
  reason: string | null;
}

/** Prueba desde la configuración: la conversación hasta ahora y, si se elige, el paciente que "escribe". */
export interface AssistantTestInput {
  messages: { role: 'user' | 'model'; text: string }[];
  patient_id?: string | null;
}

export interface AssistantTestResult extends AssistantReply {
  urgent: boolean;
  /** Lo que la IA sabe del paciente elegido (vacío sin paciente) */
  context: string[];
}

/** Coincidencia flexible entre el procedimiento de un tema y los del paciente. */
export function matchesProcedure(topic: string, procedures: string[]): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const t = norm(topic);
  return !!t && procedures.some((p) => {
    const n = norm(p);
    return !!n && (n.includes(t) || t.includes(n));
  });
}
