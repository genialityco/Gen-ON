/**
 * Horarios: las fechas de los protocolos se piensan en la hora local de la
 * clínica; aquí se convierten a instantes UTC.
 */

/** YYYY-MM-DD en la zona horaria. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

/** HH:mm en la zona horaria. */
export function localTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - date.getTime();
}

/** Instante UTC de una fecha y hora locales en la zona. */
export function zonedTime(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Dos pasadas por si el desfase cambia justo ese día
  let result = guess - zoneOffsetMs(new Date(guess), timeZone);
  result = guess - zoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isHhmm = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Cuándo sale un paso: `dayOffset` días desde la fecha de referencia (la del
 * procedimiento o la cita), a la hora del paso. Si cae en un día bloqueado se
 * corre: hacia atrás si es antes del procedimiento (una indicación previa no
 * puede llegar tarde) y hacia adelante si es después.
 */
export function computeSendAt(params: {
  referenceDate: string;
  dayOffset: number;
  time: string;
  timeZone: string;
  blockedWeekdays: number[];
}): { date: string; at: Date; shifted: boolean } {
  const blocked = new Set(params.blockedWeekdays || []);
  const direction = params.dayOffset < 0 ? -1 : 1;
  let date = addDays(params.referenceDate, params.dayOffset);
  let shifted = false;
  for (let i = 0; i < 7 && blocked.has(weekday(date)); i++) {
    date = addDays(date, direction);
    shifted = true;
  }
  return { date, at: zonedTime(date, params.time, params.timeZone), shifted };
}

/** "lunes 3 de noviembre" */
export function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(',', '');
}

/** "9:00 a. m." */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

/** "Día -1", "Día 0 (procedimiento)", "Día +7" */
export function dayOffsetLabel(offset: number): string {
  if (offset === 0) return 'Día 0';
  return `Día ${offset > 0 ? '+' : ''}${offset}`;
}
