import { useState } from 'react';
import { ActionIcon, Badge, Button, Card, Drawer, Group, Loader, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconBook, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import { dayOffsetLabel, orderedSteps, type Protocol } from '@genon/shared';
import { useCopyProtocol, useDeleteProtocol, useProtocols, useTemplates, type Scope } from '../../services/library';
import { notifyError, notifySuccess } from '../../lib/api';
import { ProtocolEditor, type SendDefaults } from './ProtocolEditor';

interface Props {
  scope: Scope;
  canEdit: boolean;
  defaults: SendDefaults;
}

export function ProtocolsList({ scope, canEdit, defaults }: Props) {
  const { data, isLoading } = useProtocols(scope);
  const { data: templates = [] } = useTemplates(scope);
  const remove = useDeleteProtocol(scope);
  const [editing, setEditing] = useState<Protocol | 'new' | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const org = scope !== 'library';

  const confirmRemove = (p: Protocol) =>
    modals.openConfirmModal({
      title: `Borrar "${p.name}"`,
      children: <Text size="sm">Las plantillas se conservan.</Text>,
      labels: { confirm: 'Borrar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(p.id, { onError: notifyError }),
    });

  return (
    <>
      <Group justify="flex-end" mb="sm">
        {org && canEdit && (
          <Button variant="default" leftSection={<IconBook size={16} />} onClick={() => setCopyOpen(true)}>
            Copiar de la biblioteca
          </Button>
        )}
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
            Nuevo protocolo
          </Button>
        )}
      </Group>

      {isLoading ? (
        <Loader />
      ) : !data?.length ? (
        <Text c="dimmed">Aún no hay protocolos.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {data.map((p) => (
            <Card key={p.id} withBorder style={{ cursor: 'pointer' }} onClick={() => setEditing(p)}>
              <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text fw={600} truncate>
                  {p.name}
                </Text>
                <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                  {!p.active && (
                    <Badge color="gray" variant="light">
                      Inactivo
                    </Badge>
                  )}
                  {canEdit && (
                    <ActionIcon variant="subtle" color="red" onClick={() => confirmRemove(p)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
              {p.description && (
                <Text size="sm" c="dimmed" lineClamp={2} mb="xs">
                  {p.description}
                </Text>
              )}
              <Group gap={4}>
                {orderedSteps(p.steps, defaults.default_send_time).map((s) => (
                  <Badge key={s.id} variant="light" color={s.day_offset < 0 ? 'blue' : 'teal'} size="sm">
                    {dayOffsetLabel(s.day_offset)}
                  </Badge>
                ))}
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Drawer
        opened={!!editing}
        onClose={() => setEditing(null)}
        position="right"
        size="xl"
        title={editing === 'new' ? 'Nuevo protocolo' : editing?.name}
      >
        {editing && (
          <ProtocolEditor
            key={editing === 'new' ? 'new' : `${editing.id}:${editing.updated_at}`}
            scope={scope}
            protocol={editing === 'new' ? null : editing}
            templates={templates}
            defaults={defaults}
            canEdit={canEdit}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>

      {org && (
        <Modal opened={copyOpen} onClose={() => setCopyOpen(false)} title="Copiar de la biblioteca" size="lg">
          <CopyFromLibrary orgId={scope.orgId} onDone={() => setCopyOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function CopyFromLibrary({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { data, isLoading } = useProtocols('library');
  const copy = useCopyProtocol(orgId);

  const onCopy = async (id: string) => {
    try {
      const p = await copy.mutateAsync(id);
      notifySuccess(`"${p.name}" copiado. Sus plantillas quedan en borrador: valídalas y envíalas a Meta.`);
      onDone();
    } catch (e) {
      notifyError(e);
    }
  };

  if (isLoading) return <Loader />;
  if (!data?.length) return <Text c="dimmed">La biblioteca está vacía.</Text>;
  return (
    <Stack>
      {data.map((p) => (
        <Card key={p.id} withBorder>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={600}>{p.name}</Text>
              <Text size="sm" c="dimmed">
                {p.description}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {orderedSteps(p.steps).map((s) => `${dayOffsetLabel(s.day_offset)}: ${s.label}`).join(' · ')}
              </Text>
            </div>
            <Button size="xs" leftSection={<IconCopy size={14} />} loading={copy.isPending} onClick={() => onCopy(p.id)}>
              Copiar
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
