import { ActionIcon, Badge, Card, Group, Menu, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconBell, IconCheck, IconDots, IconPencil, IconUserX, IconX } from '@tabler/icons-react';
import {
  APPOINTMENT_STATUS_LABELS,
  formatTime12,
  reminderLabel,
  type Appointment,
  type AppointmentStatus,
} from '@genon/shared';
import { useAppointmentStatus } from '../../services/patients';
import { notifyError } from '../../lib/api';
import { fmtDay } from '../../lib/format';

export const APPOINTMENT_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'blue',
  attended: 'teal',
  no_show: 'orange',
  cancelled: 'gray',
};

interface Props {
  orgId: string;
  appointment: Appointment;
  /** Muestra el paciente (en la agenda) */
  showPatient?: boolean;
  onOpenPatient?: () => void;
  onEdit?: () => void;
}

export function AppointmentCard({ orgId, appointment: a, showPatient, onOpenPatient, onEdit }: Props) {
  const setStatus = useAppointmentStatus(orgId);
  const change = (status: AppointmentStatus) => setStatus.mutate({ id: a.id, status }, { onError: notifyError });
  const cancel = () =>
    modals.openConfirmModal({
      title: 'Cancelar cita',
      children: <Text size="sm">Los recordatorios que no han salido se cancelan.</Text>,
      labels: { confirm: 'Cancelar cita', cancel: 'Volver' },
      confirmProps: { color: 'red' },
      onConfirm: () => change('cancelled'),
    });

  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" wrap="nowrap" align="start">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} style={{ cursor: onOpenPatient ? 'pointer' : undefined }} onClick={onOpenPatient}>
            {showPatient ? `${formatTime12(a.time)} · ${a.patient_name}` : `${fmtDay(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${formatTime12(a.time)}`}
          </Text>
          <Text size="xs" c="dimmed">
            {[a.reason, a.professional].filter(Boolean).join(' · ') || 'Sin motivo'}
          </Text>
          {a.reminders.length > 0 && (
            <Group gap={4} mt={4}>
              <IconBell size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                {a.reminders.map((r) => reminderLabel(r.timing)).join(' · ')}
              </Text>
            </Group>
          )}
          {a.notes && (
            <Text size="xs" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
              {a.notes}
            </Text>
          )}
        </div>
        <Group gap={4} wrap="nowrap">
          <Badge variant="light" color={APPOINTMENT_COLORS[a.status]}>
            {APPOINTMENT_STATUS_LABELS[a.status]}
          </Badge>
          {a.status === 'scheduled' && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm" loading={setStatus.isPending}>
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {onEdit && (
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
                    Editar o reprogramar
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<IconCheck size={14} />} onClick={() => change('attended')}>
                  Asistió
                </Menu.Item>
                <Menu.Item leftSection={<IconUserX size={14} />} onClick={() => change('no_show')}>
                  No asistió
                </Menu.Item>
                <Menu.Item leftSection={<IconX size={14} />} color="red" onClick={cancel}>
                  Cancelar cita
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
    </Card>
  );
}
