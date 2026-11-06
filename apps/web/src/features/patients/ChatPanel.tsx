import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, ScrollArea, Stack, Text, Textarea } from '@mantine/core';
import { IconCheck, IconChecks, IconHandFinger, IconSend, IconTemplate } from '@tabler/icons-react';
import {
  CHAT_MAX_LENGTH,
  CHAT_WINDOW_HOURS,
  PLANS,
  localDate,
  type ChatMessage,
  type Organization,
  type Patient,
} from '@genon/shared';
import { useConversation, useSendChat } from '../../services/patients';
import { errorMessage } from '../../lib/api';
import { fmtDateTime, fmtDay, fmtTime } from '../../lib/format';

const KIND_LABELS: Partial<Record<ChatMessage['kind'], string>> = {
  auto_reply: 'Respuesta automática',
  opt_out: 'Confirmación de baja',
  test: 'Mensaje de prueba',
  assistant: 'Asistente IA',
};

/** WhatsApp uno a uno: la conversación completa y, con la ventana de 24 h abierta, responder. */
export function ChatPanel({ org, patient, onSendTemplate }: { org: Organization; patient: Patient; onSendTemplate: () => void }) {
  const { data, isLoading } = useConversation(org.id, patient.id);
  const send = useSendChat(org.id, patient.id);
  const [text, setText] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [count]);

  if (isLoading || !data) return <Loader size="sm" />;
  const allowed = PLANS[org.plan].features.one_to_one;
  const open = !!data.window_until;
  const submit = () => send.mutate(text, { onSuccess: () => setText('') });

  return (
    <Stack gap="sm">
      <Paper withBorder bg="gray.0">
        <ScrollArea h={380} viewportRef={viewport} p="sm">
          {!data.messages.length ? (
            <Text size="sm" c="dimmed" ta="center" mt="xl">
              Aún no hay mensajes con este paciente.
            </Text>
          ) : (
            <Stack gap={6}>
              {data.messages.map((m, i) => {
                const prev = data.messages[i - 1];
                const day = localDate(new Date(m.at), org.timezone);
                const newDay = !prev || localDate(new Date(prev.at), org.timezone) !== day;
                return (
                  <Box key={m.id}>
                    {newDay && (
                      <Text size="xs" c="dimmed" ta="center" my={4}>
                        {fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}
                      </Text>
                    )}
                    <Bubble message={m} tz={org.timezone} />
                  </Box>
                );
              })}
            </Stack>
          )}
        </ScrollArea>
      </Paper>

      {patient.opted_out ? (
        <Alert color="red" p="xs">
          El paciente se dio de baja: no se le pueden enviar mensajes.
        </Alert>
      ) : !allowed ? (
        <Alert color="gray" p="xs">
          Los mensajes uno a uno son parte del plan Adherencia.
        </Alert>
      ) : !open ? (
        <Alert color="yellow" p="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              WhatsApp solo deja escribir libremente {CHAT_WINDOW_HOURS} h después del último mensaje del paciente. Para
              retomar la conversación envíale una plantilla.
            </Text>
            <Button size="xs" variant="white" onClick={onSendTemplate}>
              Enviar plantilla
            </Button>
          </Group>
        </Alert>
      ) : (
        <Stack gap={4}>
          <Group align="end" wrap="nowrap">
            <Textarea
              style={{ flex: 1 }}
              autosize
              minRows={1}
              maxRows={5}
              maxLength={CHAT_MAX_LENGTH}
              placeholder="Escribe un mensaje"
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button leftSection={<IconSend size={16} />} onClick={submit} loading={send.isPending} disabled={!text.trim()}>
              Enviar
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Puedes escribirle hasta las {fmtDateTime(data.window_until, org.timezone)}. Enter envía; Shift+Enter, salto de línea.
          </Text>
          {send.isError && (
            <Text size="xs" c="red">
              {errorMessage(send.error)}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function Bubble({ message: m, tz }: { message: ChatMessage; tz: string }) {
  const out = m.direction === 'out';
  const label = KIND_LABELS[m.kind] ?? (m.kind === 'chat' && m.sent_by_name ? m.sent_by_name : null);
  return (
    <Group justify={out ? 'flex-end' : 'flex-start'}>
      <Paper
        px="sm"
        py={6}
        radius="md"
        maw="80%"
        bg={out ? 'teal.0' : 'white'}
        withBorder={!out}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {label && (
          <Text size="xs" c="dimmed" fw={500}>
            {label}
          </Text>
        )}
        {m.template_label && (
          <Group gap={4} wrap="nowrap">
            <IconTemplate size={14} />
            <Text size="sm" fs="italic">
              {m.template_label}
            </Text>
          </Group>
        )}
        {m.reply && (
          <Badge color="grape" variant="light" leftSection={<IconHandFinger size={12} />}>
            {m.reply}
          </Badge>
        )}
        {m.text && <Text size="sm">{m.text}</Text>}
        <Group gap={4} justify="flex-end" mt={2}>
          <Text size="10px" c="dimmed">
            {fmtTime(m.at, tz)}
          </Text>
          {out && <DeliveryTicks status={m.status} />}
        </Group>
      </Paper>
    </Group>
  );
}

function DeliveryTicks({ status }: { status: ChatMessage['status'] }) {
  if (status === 'failed') {
    return (
      <Text size="10px" c="red">
        No entregado
      </Text>
    );
  }
  if (status === 'read') return <IconChecks size={14} color="var(--mantine-color-blue-6)" />;
  if (status === 'delivered') return <IconChecks size={14} color="var(--mantine-color-dimmed)" />;
  return <IconCheck size={14} color="var(--mantine-color-dimmed)" />;
}
