import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { OUTBOX_STATUS_LABELS, addDays, weekday, zonedTime, type OutboxItem } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useOutbox } from '../../services/patients';
import { OutboxBadges } from '../../features/patients/OutboxBadges';
import { OutboxActions } from '../../features/patients/OutboxActions';
import { fmtDay, fmtTime, todayIn } from '../../lib/format';

const mondayOf = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  ...Object.entries(OUTBOX_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  { value: 'responded', label: 'Con respuesta' },
];

function summarize(items: OutboxItem[]) {
  const sent = items.filter((i) => i.status === 'sent');
  return {
    scheduled: items.filter((i) => i.status === 'scheduled').length,
    sent: sent.length,
    read: sent.filter((i) => i.delivery_status === 'read').length,
    failed: items.filter((i) => i.status === 'failed' || i.delivery_status === 'failed').length,
    responded: items.filter((i) => i.response).length,
  };
}

/** Parrilla: lo programado y lo enviado, por semana, en la hora de la clínica. */
export function SchedulePage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const { data: org } = useOrganization(orgId);
  const tz = org?.timezone ?? 'America/Bogota';
  const today = todayIn(tz);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [status, setStatus] = useState('all');
  const [protocol, setProtocol] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedTime(monday, '00:00', tz).toISOString();
  const to = zonedTime(addDays(monday, 7), '00:00', tz).toISOString();
  const { data: items = [], isLoading } = useOutbox(orgId, from, to);

  const protocolOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const i of items) names.set(i.protocol_id ?? 'manual', i.protocol_name ?? 'Envíos manuales');
    return [...names].map(([value, label]) => ({ value, label }));
  }, [items]);

  const visible = items.filter(
    (i) =>
      (status === 'all' || (status === 'responded' ? !!i.response : i.status === status)) &&
      (!protocol || (i.protocol_id ?? 'manual') === protocol),
  );
  const byDay = new Map<string, OutboxItem[]>(days.map((d) => [d, []]));
  for (const i of visible) byDay.get(i.local_date)?.push(i);
  const s = summarize(items);

  if (!org) return <Loader />;

  return (
    <Stack>
      <Group justify="space-between" align="end">
        <div>
          <Title order={2}>Parrilla</Title>
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
        </Group>
      </Group>

      <Group gap="xs">
        <Badge variant="light" color="blue">
          {s.scheduled} programados
        </Badge>
        <Badge variant="light" color="teal">
          {s.sent} enviados
        </Badge>
        <Badge variant="light" color="green">
          {s.read} leídos
        </Badge>
        <Badge variant="light" color="grape">
          {s.responded} con respuesta
        </Badge>
        {s.failed > 0 && (
          <Badge variant="light" color="red">
            {s.failed} con problemas
          </Badge>
        )}
        {isLoading && <Loader size="xs" />}
      </Group>

      <Group gap="xs">
        <Select size="xs" data={statusOptions} value={status} onChange={(v) => setStatus(v ?? 'all')} allowDeselect={false} w={200} />
        <Select
          size="xs"
          placeholder="Todos los protocolos"
          data={protocolOptions}
          value={protocol}
          onChange={setProtocol}
          clearable
          w={240}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4, xl: 7 }} spacing="xs">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          const blocked = org.blocked_weekdays.includes(weekday(d));
          return (
            <Paper key={d} withBorder p="xs" bg={isToday ? 'teal.0' : blocked ? 'gray.0' : undefined} mih={120}>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={600} tt="capitalize" c={isToday ? 'teal.8' : undefined}>
                  {fmtDay(d)}
                </Text>
                {list.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {list.length}
                  </Text>
                )}
              </Group>
              {blocked && !list.length && (
                <Text size="xs" c="dimmed">
                  Sin envíos
                </Text>
              )}
              <Stack gap={6}>
                {list.map((i) => (
                  <Paper key={i.id} withBorder p={6} radius="sm">
                    <Group justify="space-between" wrap="nowrap" gap={4} align="start">
                      <UnstyledButton onClick={() => navigate(`/org/${orgId}/patients?p=${i.patient_id}`)} style={{ minWidth: 0 }}>
                        <Text size="xs" fw={600}>
                          {fmtTime(i.sent_at ?? i.send_at, tz)} · {i.patient_name}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {i.step_label}
                          {i.protocol_name ? ` · ${i.protocol_name}` : ' · manual'}
                        </Text>
                      </UnstyledButton>
                      <OutboxActions orgId={orgId} item={i} onOpenPatient={() => navigate(`/org/${orgId}/patients?p=${i.patient_id}`)} />
                    </Group>
                    <OutboxBadges item={i} />
                  </Paper>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
