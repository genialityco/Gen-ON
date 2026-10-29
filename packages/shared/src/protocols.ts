import { isHhmm } from './schedule';

/**
 * Protocolo de seguimiento: la secuencia de mensajes de un procedimiento o
 * tratamiento, contada desde la fecha de referencia (procedimiento o cita).
 */
export interface ProtocolStep {
  id: string;
  label: string;
  /** Días desde la fecha de referencia; negativos = antes */
  day_offset: number;
  /** HH:mm local; null = hora de envío por defecto de la clínica */
  time: string | null;
  template_key: string;
  enabled: boolean;
}

export interface Protocol {
  id: string;
  name: string;
  /** Texto para {{procedimiento}} si la inscripción no trae uno */
  procedure: string | null;
  description: string;
  steps: ProtocolStep[];
  active: boolean;
  /** Protocolo de la biblioteca del que se copió */
  source_library_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProtocolInput {
  name: string;
  procedure?: string | null;
  description?: string;
  steps: ProtocolStep[];
  active?: boolean;
}

export const MAX_STEPS = 30;

export function validateProtocol(p: Partial<ProtocolInput>, templateKeys?: Set<string>): string[] {
  const errors: string[] = [];
  if (!p.name?.trim()) errors.push('El protocolo necesita un nombre.');
  const steps = p.steps || [];
  if (steps.length > MAX_STEPS) errors.push(`Máximo ${MAX_STEPS} pasos.`);
  const ids = new Set<string>();
  steps.forEach((s, i) => {
    const n = `Paso ${i + 1}`;
    if (!s.id || ids.has(s.id)) errors.push(`${n}: identificador inválido o repetido.`);
    ids.add(s.id);
    if (!s.label?.trim()) errors.push(`${n}: falta el nombre.`);
    if (!Number.isInteger(s.day_offset) || Math.abs(s.day_offset) > 365) {
      errors.push(`${n}: el día debe ser un entero entre -365 y 365.`);
    }
    if (s.time !== null && s.time !== undefined && s.time !== '' && !isHhmm(s.time)) {
      errors.push(`${n}: hora inválida (HH:mm).`);
    }
    if (!s.template_key) errors.push(`${n}: falta la plantilla.`);
    else if (templateKeys && !templateKeys.has(s.template_key)) {
      errors.push(`${n}: la plantilla "${s.template_key}" no existe.`);
    }
  });
  return errors;
}

/** Pasos activos ordenados por día y hora. */
export function orderedSteps(steps: ProtocolStep[], defaultTime = '09:00'): ProtocolStep[] {
  return (steps || [])
    .filter((s) => s.enabled !== false)
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        a.s.day_offset - b.s.day_offset ||
        (a.s.time || defaultTime).localeCompare(b.s.time || defaultTime) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
}
