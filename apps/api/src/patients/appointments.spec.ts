import { reminderLabel, reminderSendAt, validateAppointment, type AppointmentInput } from '@genon/shared';

const org = { timezone: 'America/Bogota', blocked_weekdays: [0] }; // sin envíos los domingos

const appt = (patch: Partial<AppointmentInput> = {}): AppointmentInput => ({
  date: '2026-11-10',
  time: '15:30',
  reminders: [{ template_key: 'cita', timing: { kind: 'days', days: 1, time: '09:00' } }],
  ...patch,
});

describe('recordatorios de citas', () => {
  it('N días antes a una hora fija, en la hora de la clínica', () => {
    const r = reminderSendAt({ date: '2026-11-10', time: '15:30' }, { kind: 'days', days: 1, time: '09:00' }, org);
    expect(r.at.toISOString()).toBe('2026-11-09T14:00:00.000Z');
    expect(r.shifted).toBe(false);
  });

  it('N horas antes de la cita', () => {
    const r = reminderSendAt({ date: '2026-11-10', time: '15:30' }, { kind: 'hours', hours: 2 }, org);
    expect(r.at.toISOString()).toBe('2026-11-10T18:30:00.000Z');
  });

  it('un día sin envíos antes de la cita se adelanta', () => {
    // Cita el lunes 9: el recordatorio de 1 día antes caería domingo → sábado
    const r = reminderSendAt({ date: '2026-11-09', time: '10:00' }, { kind: 'days', days: 1, time: '09:00' }, org);
    expect(r.at.toISOString()).toBe('2026-11-07T14:00:00.000Z');
    expect(r.shifted).toBe(true);
  });

  it('el mismo día no se corre aunque la cita sea en día bloqueado', () => {
    const r = reminderSendAt({ date: '2026-11-08', time: '10:00' }, { kind: 'days', days: 0, time: '07:00' }, org);
    expect(r.at.toISOString()).toBe('2026-11-08T12:00:00.000Z');
  });

  it('valida fecha, hora y recordatorios', () => {
    expect(validateAppointment(appt())).toEqual([]);
    expect(validateAppointment(appt({ reminders: [] }))).toEqual([]);
    expect(validateAppointment(appt({ date: '10/11/2026' }))).toContain('Fecha inválida');
    expect(validateAppointment(appt({ reminders: [{ template_key: 'cita', timing: { kind: 'hours', hours: 0 } }] }))).toHaveLength(1);
    expect(
      validateAppointment(appt({ reminders: [{ template_key: 'cita', timing: { kind: 'days', days: 0, time: '16:00' } }] })),
    ).toEqual(['El recordatorio del mismo día debe salir antes de la hora de la cita']);
    expect(validateAppointment(appt({ reminders: [{ template_key: '', timing: { kind: 'days', days: 1, time: '09:00' } }] }))).toHaveLength(1);
    const six = Array.from({ length: 6 }, () => ({ template_key: 'cita', timing: { kind: 'hours' as const, hours: 1 } }));
    expect(validateAppointment(appt({ reminders: six }))).toContain('Máximo 5 recordatorios por cita');
  });

  it('etiquetas', () => {
    expect(reminderLabel({ kind: 'days', days: 1, time: '09:00' })).toBe('1 día antes, 09:00');
    expect(reminderLabel({ kind: 'days', days: 0, time: '07:00' })).toBe('El mismo día, 07:00');
    expect(reminderLabel({ kind: 'hours', hours: 2 })).toBe('2 horas antes');
  });
});
