import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconRobot, IconSend } from '@tabler/icons-react';
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_INSTRUCTIONS_MAX,
  ASSISTANT_PAUSE_HOURS,
  KNOWLEDGE_MAX_CONTENT,
  hasFeature,
  type KnowledgeEntry,
  type Organization,
} from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useAssistantSettings, useAssistantTest, useKnowledge, useRemoveKnowledge, useSaveKnowledge } from '../../services/assistant';
import { PlanGate } from '../../features/plans/PlanGate';
import { errorMessage, notifyError, notifySuccess } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';

const EXAMPLES = ['Horario de atención', 'Cómo llegar y parqueadero', 'Medios de pago', 'Preparación antes del procedimiento', 'Cuidados después del procedimiento'];

/** Asistente con IA del plan IA Oráculo: activarlo, darle contenido aprobado y probarlo. */
export function AssistantPage() {
  const orgId = useOrgId();
  const { data: org } = useOrganization(orgId);
  if (!org) return <Loader />;
  return (
    <Stack maw={860}>
      <Group gap="xs">
        <IconRobot size={26} />
        <Title order={2}>Asistente IA</Title>
      </Group>
      <PlanGate org={org} feature="ai_assistant" what="El asistente con IA">
        <AssistantBody key={org.updated_at} org={org} />
      </PlanGate>
    </Stack>
  );
}

function AssistantBody({ org }: { org: Organization }) {
  const settings = useAssistantSettings(org.id);
  const { data: knowledge = [], isLoading } = useKnowledge(org.id, hasFeature(org.plan, 'ai_assistant'));
  const [instructions, setInstructions] = useState(org.assistant.instructions);
  const [handoff, setHandoff] = useState(org.assistant.handoff_message);
  const [editing, setEditing] = useState<KnowledgeEntry | 'new' | null>(null);
  const approved = knowledge.filter((k) => k.approved).length;

  const toggle = (enabled: boolean) =>
    settings.mutate(
      { enabled },
      { onSuccess: () => notifySuccess(enabled ? 'Asistente activado' : 'Asistente apagado'), onError: notifyError },
    );
  const saveSettings = () =>
    settings.mutate({ instructions, handoff_message: handoff }, { onSuccess: () => notifySuccess('Guardado'), onError: notifyError });

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Responde por WhatsApp lo que escriben los pacientes, las 24 horas, usando solo el contenido aprobado de esta página.
        No da diagnósticos ni indicaciones médicas: ante síntomas de alarma remite a urgencias, y cuando no sabe la respuesta o
        el paciente pide una persona, pasa la conversación al equipo (aparece en Requiere atención y se avisa por WhatsApp a los
        celulares de Configuración → Alertas).
      </Text>

      <Paper withBorder p="md">
        <Group justify="space-between">
          <div>
            <Text fw={600}>Responder automáticamente</Text>
            <Text size="xs" c="dimmed">
              {approved} temas aprobados. Se pausa {ASSISTANT_PAUSE_HOURS} h con un paciente cuando alguien del equipo le
              escribe o cuando lo pasa a una persona; máximo {ASSISTANT_DAILY_LIMIT} respuestas por paciente al día.
            </Text>
          </div>
          <Switch
            size="md"
            checked={org.assistant.enabled}
            onChange={(e) => toggle(e.currentTarget.checked)}
            disabled={settings.isPending || (!org.assistant.enabled && !approved)}
          />
        </Group>
        {!approved && (
          <Text size="xs" c="orange" mt="xs">
            Aprueba al menos un tema antes de activarlo.
          </Text>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <div>
            <Text fw={600}>Contenido aprobado</Text>
            <Text size="xs" c="dimmed">
              Lo único que el asistente puede responder. Solo se usan los temas marcados como aprobados.
            </Text>
          </div>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            Agregar tema
          </Button>
        </Group>
        {isLoading ? (
          <Loader size="sm" />
        ) : !knowledge.length ? (
          <Text size="sm" c="dimmed">
            Aún no hay temas. Ideas: {EXAMPLES.join(', ')}.
          </Text>
        ) : (
          <Stack gap="xs">
            {knowledge.map((k) => (
              <Card key={k.id} withBorder padding="sm" style={{ cursor: 'pointer' }} onClick={() => setEditing(k)}>
                <Group justify="space-between" wrap="nowrap" align="start">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500}>
                      {k.title}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {k.content}
                    </Text>
                  </div>
                  {k.approved ? (
                    <Badge variant="light" color="teal" style={{ flexShrink: 0 }}>
                      Aprobado
                    </Badge>
                  ) : (
                    <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
                      Borrador
                    </Badge>
                  )}
                </Group>
                {k.approved && k.approved_by_name && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Aprobó {k.approved_by_name} · {fmtDateTime(k.approved_at, org.timezone)}
                  </Text>
                )}
              </Card>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Text fw={600}>Indicaciones</Text>
          <Textarea
            label="Tono y cómo presentarse (opcional)"
            description="Por ejemplo: «Preséntate como Sol, la asistente virtual de la clínica. Trata de usted.» No puede cambiar las reglas de seguridad."
            autosize
            minRows={3}
            maxLength={ASSISTANT_INSTRUCTIONS_MAX}
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
          />
          <Textarea
            label="Mensaje al pasar a una persona"
            description="Se envía cuando el asistente no puede responder y no redactó su propio mensaje."
            autosize
            minRows={2}
            maxLength={500}
            value={handoff}
            onChange={(e) => setHandoff(e.currentTarget.value)}
          />
          <Button w="fit-content" onClick={saveSettings} loading={settings.isPending}>
            Guardar indicaciones
          </Button>
        </Stack>
      </Paper>

      <TestBox orgId={org.id} />

      <KnowledgeModal orgId={org.id} editing={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function TestBox({ orgId }: { orgId: string }) {
  const test = useAssistantTest(orgId);
  const [question, setQuestion] = useState('');
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text fw={600}>Probar</Text>
        <Text size="xs" c="dimmed">
          Escribe como si fueras un paciente. Usa las indicaciones y el contenido aprobado guardados; no envía nada.
        </Text>
        <Group align="end" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="¿Cuál es el horario del sábado?"
            value={question}
            onChange={(e) => setQuestion(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && question.trim() && test.mutate(question)}
          />
          <Button leftSection={<IconSend size={16} />} loading={test.isPending} disabled={!question.trim()} onClick={() => test.mutate(question)}>
            Preguntar
          </Button>
        </Group>
        {test.isError && <Alert color="red">{errorMessage(test.error)}</Alert>}
        {test.data && (
          <Paper p="sm" bg="teal.0" radius="md">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {test.data.reply || '(sin texto: enviaría el mensaje de transferencia)'}
            </Text>
            {test.data.handoff && (
              <Group gap="xs" mt="xs">
                <Badge color={test.data.urgent ? 'red' : 'orange'} variant="light">
                  {test.data.urgent ? 'Urgente · pasa a una persona' : 'Pasa a una persona'}
                </Badge>
                {test.data.reason && (
                  <Text size="xs" c="dimmed">
                    {test.data.reason}
                  </Text>
                )}
              </Group>
            )}
          </Paper>
        )}
      </Stack>
    </Paper>
  );
}

function KnowledgeModal({ orgId, editing, onClose }: { orgId: string; editing: KnowledgeEntry | 'new' | null; onClose: () => void }) {
  return (
    <Modal opened={!!editing} onClose={onClose} title={editing === 'new' ? 'Nuevo tema' : 'Editar tema'} size="lg">
      {editing && <KnowledgeForm key={editing === 'new' ? 'new' : editing.id} orgId={orgId} entry={editing === 'new' ? null : editing} onDone={onClose} />}
    </Modal>
  );
}

function KnowledgeForm({ orgId, entry, onDone }: { orgId: string; entry: KnowledgeEntry | null; onDone: () => void }) {
  const save = useSaveKnowledge(orgId);
  const remove = useRemoveKnowledge(orgId);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [approved, setApproved] = useState(entry?.approved ?? false);
  const changed = !!entry && (entry.title !== title.trim() || entry.content !== content.trim());

  const submit = () =>
    save.mutate(
      { id: entry?.id ?? null, input: { title, content, approved } },
      { onSuccess: () => (notifySuccess('Tema guardado'), onDone()), onError: notifyError },
    );
  const confirmRemove = () =>
    modals.openConfirmModal({
      title: 'Eliminar tema',
      children: <Text size="sm">El asistente dejará de usar este contenido.</Text>,
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(entry!.id, { onSuccess: onDone, onError: notifyError }),
    });

  return (
    <Stack>
      <TextInput label="Tema" placeholder="Horario de atención" value={title} onChange={(e) => setTitle(e.currentTarget.value)} maxLength={120} />
      <Textarea
        label="Contenido"
        description="Escribe la información tal como el asistente la puede decir. Sin datos de pacientes."
        autosize
        minRows={5}
        maxLength={KNOWLEDGE_MAX_CONTENT}
        value={content}
        onChange={(e) => setContent(e.currentTarget.value)}
      />
      <Checkbox
        label="Revisé este contenido y lo apruebo para que el asistente lo use"
        description={changed && entry?.approved ? 'Cambiaste el texto: al guardar quedará aprobado por ti.' : undefined}
        checked={approved}
        onChange={(e) => setApproved(e.currentTarget.checked)}
      />
      <Group justify="space-between">
        {entry ? (
          <Button variant="subtle" color="red" onClick={confirmRemove} loading={remove.isPending}>
            Eliminar
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={submit} loading={save.isPending} disabled={title.trim().length < 2 || content.trim().length < 2}>
          Guardar
        </Button>
      </Group>
    </Stack>
  );
}
