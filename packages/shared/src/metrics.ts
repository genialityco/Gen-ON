/** Métricas de una organización entre dos fechas locales (ambas incluidas). */
export type MetricsGranularity = 'hour' | 'day' | 'month';

/** Rango máximo de una consulta de métricas. */
export const METRICS_MAX_DAYS = 366;

export interface MessageCounts {
  /** Aceptados por Meta */
  sent: number;
  delivered: number;
  read: number;
  responses: number;
  /** Falló el envío o no se entregó */
  failed: number;
}

export interface MetricsBucket extends MessageCounts {
  /** "09" (hora), "2026-10-29" (día) o "2026-10" (mes) */
  key: string;
}

export interface MetricsBreakdownRow extends MessageCounts {
  key: string;
  label: string;
  skipped: number;
}

export interface OrgMetrics {
  from: string;
  to: string;
  granularity: MetricsGranularity;
  messages: MessageCounts & {
    /** Aún programados dentro del rango */
    scheduled: number;
    skipped: number;
    cancelled: number;
    /** Respuestas con un botón de confirmar */
    confirmed: number;
    /** Sobre los enviados; null si no hubo envíos */
    delivery_rate: number | null;
    read_rate: number | null;
    response_rate: number | null;
  };
  patients: {
    new_patients: number;
    /** Pacientes distintos con al menos un mensaje enviado */
    contacted: number;
    opted_out: number;
  };
  appointments: {
    total: number;
    scheduled: number;
    attended: number;
    no_show: number;
    cancelled: number;
    /** asistieron / (asistieron + no asistieron) */
    attendance_rate: number | null;
    /** Citas cuyo recordatorio el paciente confirmó */
    confirmed: number;
  };
  /** Mensajes que escribieron los pacientes */
  inbound: number;
  /** Conversaciones cobradas por Meta, por categoría */
  billable: Record<string, number>;
  series: MetricsBucket[];
  by_protocol: MetricsBreakdownRow[];
  by_template: MetricsBreakdownRow[];
  responses: { text: string; count: number }[];
  failures: { reason: string; count: number }[];
}

export const rate = (part: number, total: number): number | null => (total > 0 ? part / total : null);

/** Granularidad según el largo del rango: un día por horas, hasta 62 días por día, si no por mes. */
export function metricsGranularity(days: number): MetricsGranularity {
  if (days <= 1) return 'hour';
  return days <= 62 ? 'day' : 'month';
}
