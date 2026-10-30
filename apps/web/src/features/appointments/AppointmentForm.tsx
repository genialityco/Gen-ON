import { useState } from 'react';
import { ActionIcon, Alert, Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
  MAX_REMINDERS,
  formatTime12,
  patientFullName,
  reminderSendAt,
  validateAppointment,
  type Appointment,
  type AppointmentInput,
  type Organization,
  type Patient,
  type ReminderTiming,
  type Template,
} from '@genon/shared';
import { useSaveAppointment, type AppointmentResult } from '../../services/patients';
import { notifyError, notifySuccess } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';

interface ReminderDraft {
  template_key: string | null;
  unit: 'days' | 'hours';
  amount: number;
  time: string;
}

interface Props {
  org: Organization;
  templates: Template[];
  /** Para elegir el paciente (desde la agenda o la parrilla) */
  patients?: Patient[];
  patientId?: string;
  /** Cita a editar */
  appointment?: Appointment;
  onDone: (r: AppointmentResult) => void;
}

/** Plantilla sugerida para recordar una cita. */
function defaultTemplate(templates: Template[]): string | null {
  const usable = templates.filter((t) => t.approved);
  const list = usable.length ? usable : templates;
  return (list.find((t) => /recordatorio|cita/i.test(`${t.key} ${t.label}`)) ?? list[0])?.key ?? null;
}

const toDraft = (t: { template_key: string; timing: ReminderTiming }): ReminderDraft =>
  t.timing.kind === 'hours'
    ? { template_key: t.template_key, unit: 'hours', amount: t.timing.hours, time: '' }
    : { template_key: t.template_key, unit: 'days', amount: t.timing.days, time: t.timing.time };

const toTiming = (r: ReminderDraft): ReminderTiming =>
  r.unit === 'hours' ? { kind: 'hours', hours: r.amount } : { kind: 'days', days: r.amount, time: r.time };

/** Cita con sus recordatorios: fecha, hora y uno o varios mensajes antes. */
export function AppointmentForm({ org, templates, patients, patientId, appointment, onDone }: Props) {
  const save = useSaveAppointment(org.id);
  const [patient, setPatient] = useState<string | null>(patientId ?? appointment?.patient_id ?? null);
  const [date, setDate] = useState<Date | null>(appointment ? dayjs(appointment.date).toDate() : null);
  const [time, setTime] = useState(appointment?.time ?? '');
  const [reason, setReason] = useState(appointment?.reason ?? '');
  const [professional, setProfessional] = useState(appointment?.professional ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [reminders, setReminders] = useState<ReminderDraft[]>(() =>
    appointment
      ? appointment.reminders.map(toDraft)
      : [{ template_key: defaultTemplate(templates), unit: 'days', amount: 1, time: org.default_send_time }],
  );

  const setReminder = (i: number, patch: Partial<ReminderDraft>) =>
    setReminders((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const input: AppointmentInput = {
    date: date ? dayjs(date).format('YYYY-MM-DD') : '',
    time,
    reason: reason.trim() || null,
    professional: professional.trim() || null,
    notes: notes.trim() || null,
    reminders: reminders.map((r) => ({ template_key: r.template_key ?? '', timing: toTiming(r) })),
  };
  const errors = date && time ? validateAppointment(input) : [];
  const ready = !!patient && !!date && !!time && !errors.length;

  const templateOptions = templates.map((t) => ({ value: t.key, label: t.approved ? t.label : `${t.label} (sin aprobar)` }));
  const patientOptions = (patients ?? [])
    .filter((p) => !p.opted_out)
    .map((p) => ({ value: p.id, label: `${patientFullName(p)} · +${p.phone}` }));

  const submit = () => {
    const payload = appointment
      ? { id: appointment.id, input }
      : { id: null, input: { ...input, patient_id: patient! } };
    save.mutate(payload, {
      onSuccess: (r) => {
        notifySuccess(
          r.scheduled
            ? `Cita guardada: ${r.scheduled} ${r.scheduled === 1 ? 'recordatorio programado' : 'recordatorios programados'}`
            : 'Cita guardada',
        );
        for (const w of r.warnings) notifications.show({ color: 'yellow', message: w, autoClose: 10_000 });
        onDone(r);
      },
      onError: notifyError,
    });
  };

  return (
    <Stack gap="sm">
      {patients && !appointment && (
        <Select label="Paciente" data={patientOptions} value={patient} onChange={setPatient} searchable nothingFoundMessage="Sin resultados" />
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <DatePickerInput label="Fecha de la cita" value={date} onChange={setDate} valueFormat="ddd D MMM YYYY" minDate={appointment ? undefined : new Date()} />
        <TimeInput label="Hora" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
        <TextInput label="Motivo o procedimiento" placeholder="Control, valoración, toxina…" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <TextInput label="Profesional" placeholder="Dra. Gómez" value={professional} onChange={(e) => setProfessional(e.currentTarget.value)} />
      </SimpleGrid>
      <Textarea label="Notas internas" description="No se envían al paciente" autosize minRows={1} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

      <Group justify="space-between" mt="xs">
        <Text fw={600} size="sm">
          Recordatorios por WhatsApp
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          disabled={reminders.length >= MAX_REMINDERS}
          onClick={() =>
            setReminders((list) => [...list, { template_key: defaultTemplate(templates), unit: 'hours', amount: 2, time: '' }])
          }
        >
          Agregar
        </Button>
      </Group>
      {!reminders.length && (
        <Text size="xs" c="dimmed">
          Sin recordatorios: la cita queda solo en la agenda.
        </Text>
      )}
      {reminders.map((r, i) => {
        const at = input.date && time && (r.unit === 'hours' || r.time) ? reminderSendAt({ date: input.date, time }, toTiming(r), org) : null;
        const past = at && at.at.getTime() < Date.now();
        return (
          <Paper key={i} withBorder p="xs">
            <Group align="end" gap="xs" wrap="wrap">
              <Select label="Plantilla" data={templateOptions} value={r.template_key} onChange={(v) => setReminder(i, { template_key: v })} w={220} size="xs" />
              <NumberInput
                label="Cuánto antes"
                min={r.unit === 'hours' ? 1 : 0}
                max={r.unit === 'hours' ? 72 : 30}
                value={r.amount}
                onChange={(v) => setReminder(i, { amount: Number(v) || 0 })}
                w={90}
                size="xs"
              />
              <Select
                label=" "
                data={[
                  { value: 'days', label: 'días antes' },
                  { value: 'hours', label: 'horas antes' },
                ]}
                value={r.unit}
                onChange={(v) =>
                  setReminder(i, v === 'hours' ? { unit: 'hours', amount: Math.max(1, r.amount) } : { unit: 'days', time: r.time || org.default_send_time })
                }
                allowDeselect={false}
                w={120}
                size="xs"
              />
              {r.unit === 'days' && (
                <TimeInput label="a las" value={r.time} onChange={(e) => setReminder(i, { time: e.currentTarget.value })} w={100} size="xs" />
              )}
              <ActionIcon variant="subtle" color="red" onClick={() => setReminders((list) => list.filter((_, j) => j !== i))} mb={4}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            {at && (
              <Text size="xs" c={past ? 'orange' : 'dimmed'} mt={4}>
                {past ? 'Ya pasó: no se programará' : `Sale el ${fmtDateTime(at.at.toISOString(), org.timezone)}`}
                {at.shifted && ' (se adelantó por un día sin envíos)'}
              </Text>
            )}
          </Paper>
        );
      })}
      {sameDayHint(reminders, time)}

      {errors.length > 0 && (
        <Alert color="red" p="xs">
          {errors.join(' · ')}
        </Alert>
      )}
      <Button w="fit-content" disabled={!ready} loading={save.isPending} onClick={submit}>
        {appointment ? 'Guardar cambios' : 'Agendar cita'}
      </Button>
    </Stack>
  );
}

/** Recordatorio de "0 días antes": aclara que sale el mismo día antes de la cita. */
function sameDayHint(reminders: ReminderDraft[], time: string) {
  if (!time || !reminders.some((r) => r.unit === 'days' && r.amount === 0)) return null;
  return (
    <Text size="xs" c="dimmed">
      "0 días antes" sale el mismo día de la cita, antes de las {formatTime12(time)}.
    </Text>
  );
}
