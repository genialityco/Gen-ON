import { useState } from 'react';
import { ActionIcon, Badge, Button, Group, Loader, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCalendarPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { addDays, weekday, type Appointment } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useAppointments, usePatients } from '../../services/patients';
import { useTemplates } from '../../services/library';
import { AppointmentCard } from '../../features/appointments/AppointmentCard';
import { AppointmentForm } from '../../features/appointments/AppointmentForm';
import { fmtDay, todayIn } from '../../lib/format';

export const mondayOf = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));

/** Agenda de citas por semana; desde aquí se agendan con sus recordatorios. */
export function AppointmentsPage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const { data: org } = useOrganization(orgId);
  const tz = org?.timezone ?? 'America/Bogota';
  const today = todayIn(tz);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const { data: items = [], isLoading } = useAppointments(orgId, days[0], days[6]);

  if (!org) return <Loader />;
  const active = items.filter((a) => a.status !== 'cancelled');

  return (
    <Stack>
      <Group justify="space-between" align="end">
        <div>
          <Title order={2}>Citas</Title>
          <Text c="dimmed" size="sm">
            {fmtDay(days[0], { day: 'numeric', month: 'long' })} – {fmtDay(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </div>
        <Group gap="xs">
          <ActionIcon variant="default" size="lg" onClick={() => setMonday(addDays(monday, -7))}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Button variant="default" onClick={() => setMonday(mondayOf(today))}>
            Hoy
          </Button>
          <ActionIcon variant="default" size="lg" onClick={() => setMonday(addDays(monday, 7))}>
            <IconChevronRight size={18} />
          </ActionIcon>
          <Button leftSection={<IconCalendarPlus size={16} />} onClick={() => setEditing('new')}>
            Agendar cita
          </Button>
        </Group>
      </Group>

      <Group gap="xs">
        <Badge variant="light">{active.length} citas</Badge>
        <Badge variant="light" color="teal">
          {items.filter((a) => a.status === 'attended').length} asistieron
        </Badge>
        <Badge variant="light" color="orange">
          {items.filter((a) => a.status === 'no_show').length} no asistieron
        </Badge>
        {isLoading && <Loader size="xs" />}
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        {days.map((d) => {
          const list = items.filter((a) => a.date === d);
          return (
            <Paper key={d} withBorder p="sm" bg={d === today ? 'teal.0' : undefined}>
              <Text size="sm" fw={600} tt="capitalize" mb="xs" c={d === today ? 'teal.8' : undefined}>
                {fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })}
              </Text>
              {!list.length ? (
                <Text size="xs" c="dimmed">
                  Sin citas
                </Text>
              ) : (
                <Stack gap="xs">
                  {list.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      orgId={orgId}
                      appointment={a}
                      showPatient
                      onOpenPatient={() => navigate(`/org/${orgId}/patients?p=${a.patient_id}`)}
                      onEdit={() => setEditing(a)}
                    />
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </SimpleGrid>

      <NewAppointmentModal orgId={orgId} editing={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

/** Modal para agendar (eligiendo el paciente) o editar una cita. */
export function NewAppointmentModal({
  orgId,
  editing,
  onClose,
}: {
  orgId: string;
  editing: Appointment | 'new' | null;
  onClose: () => void;
}) {
  const { data: org } = useOrganization(orgId);
  const { data: patients = [] } = usePatients(orgId);
  const { data: templates = [] } = useTemplates({ orgId });
  return (
    <Modal opened={!!editing} onClose={onClose} title={editing === 'new' ? 'Agendar cita' : 'Editar cita'} size="lg">
      {editing && org && (
        <AppointmentForm
          org={org}
          templates={templates}
          patients={patients}
          appointment={editing === 'new' ? undefined : editing}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}
