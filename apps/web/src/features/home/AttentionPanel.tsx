import { Badge, Button, Group, Paper, ScrollArea, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconClockHour4, IconMessageCircle, IconSend } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { ALERT_LEVEL_LABELS, ATTENTION_DAYS, type AttentionItem } from '@genon/shared';
import { useResolveAttention } from '../../services/home';
import { notifyError } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';

const ALERT_COLORS = { urgent: 'red', warning: 'orange', info: 'blue' } as const;

function look(i: AttentionItem) {
  if (i.kind === 'alert') {
    const level = i.level ?? 'info';
    return { color: ALERT_COLORS[level], icon: <IconAlertTriangle size={16} />, label: ALERT_LEVEL_LABELS[level] };
  }
  if (i.kind === 'failed') return { color: 'red', icon: <IconSend size={16} />, label: 'No enviado' };
  if (i.kind === 'no_response') return { color: 'yellow', icon: <IconClockHour4 size={16} />, label: 'Sin respuesta' };
  return { color: 'grape', icon: <IconMessageCircle size={16} />, label: i.count > 1 ? `Escribió (${i.count})` : 'Escribió' };
}

/** Alertas de los botones, envíos fallidos y mensajes de pacientes sin atender. */
export function AttentionPanel({ orgId, items, tz }: { orgId: string; items: AttentionItem[]; tz: string }) {
  const navigate = useNavigate();
  const resolve = useResolveAttention(orgId);

  return (
    <Paper withBorder p="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Requiere atención</Text>
        {items.length > 0 && <Badge color="red">{items.length}</Badge>}
      </Group>

      {!items.length ? (
        <Group gap="xs" c="dimmed">
          <IconCircleCheck size={18} />
          <Text size="sm">Nada pendiente de los últimos {ATTENTION_DAYS} días.</Text>
        </Group>
      ) : (
        <ScrollArea.Autosize mah={440} offsetScrollbars>
          <Stack gap="xs">
            {items.map((i) => {
              const { color, icon, label } = look(i);
              const busy = resolve.isPending && resolve.variables?.id === i.id;
              return (
                <Group key={`${i.kind}:${i.id}`} wrap="nowrap" align="start" gap="sm">
                  <ThemeIcon variant="light" color={color} size="md" mt={2}>
                    {icon}
                  </ThemeIcon>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text
                        size="sm"
                        fw={500}
                        truncate
                        style={{ cursor: i.patient_id ? 'pointer' : undefined }}
                        onClick={i.patient_id ? () => navigate(`/org/${orgId}/patients?p=${i.patient_id}${i.kind === 'inbound' ? '&t=chat' : ''}`) : undefined}
                      >
                        {i.name}
                      </Text>
                      <Badge size="xs" variant="light" color={color}>
                        {label}
                      </Badge>
                    </Group>
                    <Text size="sm" lineClamp={2}>
                      {i.kind === 'alert' ? `Tocó "${i.text}"` : i.text}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {[i.context, fmtDateTime(i.at, tz)].filter(Boolean).join(' · ')}
                    </Text>
                  </div>
                  <Button
                    size="compact-xs"
                    variant="default"
                    loading={busy}
                    onClick={() => resolve.mutate({ kind: i.kind, id: i.id }, { onError: notifyError })}
                  >
                    Atendido
                  </Button>
                </Group>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
