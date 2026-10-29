import { localDate, localTime } from '@genon/shared';

/** Fechas y horas siempre en la zona horaria de la clínica. */
export const fmtTime = (iso: string, tz: string) => localTime(new Date(iso), tz);

export const fmtDateTime = (iso: string | null, tz: string) =>
  iso
    ? new Intl.DateTimeFormat('es-CO', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : '';

export const fmtDay = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

export const todayIn = (tz: string) => localDate(new Date(), tz);

export const money = (n: number) => `$${n.toLocaleString('es-CO')}`;
