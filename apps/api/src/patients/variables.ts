import { formatLongDate, formatTime12, type Organization } from '@genon/shared';

export interface VariableContext {
  org: Pick<Organization, 'name' | 'contact_phone' | 'address' | 'city'>;
  patient: { first_name: string; last_name: string };
  enrollment?: {
    reference_date: string;
    reference_time: string | null;
    procedure: string | null;
    professional: string | null;
    protocol_procedure?: string | null;
  } | null;
}

/** Valores de las variables de las plantillas ({{nombre}}, {{fecha}}…). */
export function variableValues({ org, patient, enrollment }: VariableContext): Record<string, string | null> {
  const first = patient.first_name.trim().split(/\s+/)[0] || null;
  const address = [org.address, org.city].filter(Boolean).join(', ') || null;
  return {
    nombre: first,
    nombre_completo: `${patient.first_name} ${patient.last_name}`.trim() || null,
    clinica: org.name || null,
    procedimiento: enrollment?.procedure || enrollment?.protocol_procedure || null,
    fecha: enrollment?.reference_date ? formatLongDate(enrollment.reference_date) : null,
    hora: enrollment?.reference_time ? formatTime12(enrollment.reference_time) : null,
    profesional: enrollment?.professional || null,
    telefono_clinica: org.contact_phone || null,
    direccion: address,
  };
}

const LABELS: Record<string, string> = {
  procedimiento: 'el procedimiento',
  fecha: 'la fecha',
  hora: 'la hora',
  profesional: 'el profesional',
  telefono_clinica: 'el teléfono de la clínica',
  direccion: 'la dirección de la clínica',
};

/** Variables usadas que quedarían sin valor, en texto para el usuario. */
export function missingVariables(used: string[], values: Record<string, string | null>): string[] {
  return used.filter((v) => !values[v]).map((v) => LABELS[v] ?? `{{${v}}}`);
}
