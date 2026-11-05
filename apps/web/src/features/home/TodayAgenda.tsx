import { ActionIcon, Badge, Button, Divider, Group, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconUserX } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { APPOINTMENT_STATUS_LABELS, formatTime12, type AppointmentStatus, type HomeAppointment } from '@genon/shared';
import { useAppointmentStatus } from '../../services/patients';
import { APPOINTMENT_COLORS } from '../appointments/AppointmentCard';
import { notifyError } from '../../lib/api';
import { fmtDay } from '../../lib/format';

/** Citas de hoy con su confirmación y las de días anteriores sin marcar asistencia. */
export function TodayAgenda({ orgId, today, unmarked }: { orgId: string; today: HomeAppointment[]; unmarked: HomeAppointment[] }) {
  const active = today.filter((a) => a.status !== 'cancelled');
  const confirmed = active.filter((a) => a.reply?.confirmed).length;

  return (
    <Paper withBorder p="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Agenda de hoy</Text>
        <Button component={Link} to={`/org/${orgId}/appointments`} variant="subtle" size="xs" px={0}>
          Ver citas
        </Button>
      </Group>

      {!active.length ? (
        <Text size="sm" c="dimmed">
          Sin citas para hoy.
        </Text>
      ) : (
        <>
          <Text size="xs" c="dimmed" mb="xs">
            {active.length} citas · {confirmed} confirmadas
          </Text>
          <ScrollArea.Autosize mah={300} offsetScrollbars>
            <Stack gap="xs">
              {active.map((a) => (
                <AgendaRow key={a.id} orgId={orgId} appointment={a} />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}

      {unmarked.length > 0 && (
        <>
          <Divider my="sm" />
          <Text size="sm" fw={500} c="orange.8">
            Sin marcar asistencia ({unmarked.length})
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            Citas de días anteriores que siguen como agendadas
          </Text>
          <ScrollArea.Autosize mah={200} offsetScrollbars>
            <Stack gap="xs">
              {unmarked.map((a) => (
                <AgendaRow key={a.id} orgId={orgId} appointment={a} showDate />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}
    </Paper>
  );
}

function AgendaRow({ orgId, appointment: a, showDate }: { orgId: string; appointment: HomeAppointment; showDate?: boolean }) {
  const navigate = useNavigate();
  const setStatus = useAppointmentStatus(orgId);
  const change = (status: AppointmentStatus) => setStatus.mutate({ id: a.id, status }, { onError: notifyError });

  return (
    <Group wrap="nowrap" align="start" gap="sm">
      <Text size="sm" fw={600} w={showDate ? 110 : 64} style={{ flexShrink: 0 }}>
        {showDate ? `${fmtDay(a.date)} ${formatTime12(a.time)}` : formatTime12(a.time)}
      </Text>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500} truncate style={{ cursor: 'pointer' }} onClick={() => navigate(`/org/${orgId}/patients?p=${a.patient_id}`)}>
          {a.patient_name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {[a.reason, a.professional].filter(Boolean).join(' · ') || 'Sin motivo'}
        </Text>
        {a.status === 'scheduled' && <ReplyBadge appointment={a} />}
      </div>
      {a.status === 'scheduled' ? (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Asistió">
            <ActionIcon variant="light" color="teal" loading={setStatus.isPending} onClick={() => change('attended')}>
              <IconCheck size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="No asistió">
            <ActionIcon variant="light" color="orange" loading={setStatus.isPending} onClick={() => change('no_show')}>
              <IconUserX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : (
        <Badge variant="light" color={APPOINTMENT_COLORS[a.status]}>
          {APPOINTMENT_STATUS_LABELS[a.status]}
        </Badge>
      )}
    </Group>
  );
}

function ReplyBadge({ appointment: a }: { appointment: HomeAppointment }) {
  if (a.reply?.confirmed) {
    return (
      <Badge size="xs" variant="light" color="teal" mt={4}>
        Confirmó
      </Badge>
    );
  }
  if (a.reply) {
    return (
      <Badge size="xs" variant="light" color="grape" mt={4}>
        {a.reply.text}
      </Badge>
    );
  }
  if (!a.reminders.length) return null;
  return (
    <Badge size="xs" variant="light" color="gray" mt={4}>
      Sin confirmar
    </Badge>
  );
}
