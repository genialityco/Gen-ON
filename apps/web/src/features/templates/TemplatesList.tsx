import { useState } from 'react';
import { ActionIcon, Badge, Button, Drawer, Group, Loader, Paper, Table, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconRefresh, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import type { Template } from '@genon/shared';
import { useDeleteTemplate, useSyncTemplates, useTemplates, type Scope } from '../../services/library';
import { notifyError, notifySuccess } from '../../lib/api';
import { TemplateEditor } from './TemplateEditor';
import { TemplateStatusBadge } from './TemplateStatusBadge';

export function TemplatesList({ scope, canEdit }: { scope: Scope; canEdit: boolean }) {
  const { data, isLoading } = useTemplates(scope);
  const remove = useDeleteTemplate(scope);
  const sync = useSyncTemplates(scope === 'library' ? '' : scope.orgId);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const org = scope !== 'library';

  const confirmRemove = (t: Template) =>
    modals.openConfirmModal({
      title: `Borrar "${t.label}"`,
      children: <Text size="sm">Se borra de la plataforma{org && t.meta_name ? ' (en Meta queda como está)' : ''}.</Text>,
      labels: { confirm: 'Borrar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(t.id, { onError: notifyError }),
    });

  const onSync = () =>
    sync.mutate(undefined, {
      onSuccess: (r) => notifySuccess(`${r.updated} de ${r.total} plantillas actualizadas desde Meta`),
      onError: notifyError,
    });

  return (
    <>
      <Group justify="flex-end" mb="sm">
        {org && canEdit && (
          <Button variant="default" leftSection={<IconRefresh size={16} />} loading={sync.isPending} onClick={onSync}>
            Sincronizar con Meta
          </Button>
        )}
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
            Nueva plantilla
          </Button>
        )}
      </Group>

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : !data?.length ? (
          <Text c="dimmed" p="md">
            Aún no hay plantillas.{org ? ' Copia un protocolo de la biblioteca para traer las suyas.' : ''}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Plantilla</Table.Th>
                  <Table.Th>Categoría</Table.Th>
                  {org && <Table.Th>Meta</Table.Th>}
                  <Table.Th>Validación clínica</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((t) => (
                  <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(t)}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {t.label}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {t.key}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{t.category === 'UTILITY' ? 'Utilidad' : 'Marketing'}</Text>
                      {t.meta_category && t.meta_category !== t.category && (
                        <Text size="xs" c="orange">
                          Meta: {t.meta_category}
                        </Text>
                      )}
                    </Table.Td>
                    {org && (
                      <Table.Td>
                        <Group gap={6}>
                          <TemplateStatusBadge t={t} />
                          {t.approved && t.meta_status !== 'APPROVED' && (
                            <Tooltip label={`Se envía la versión aprobada ${t.approved.version}`}>
                              <Badge variant="outline" color="teal">
                                v{t.approved.version} activa
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    )}
                    <Table.Td>
                      {t.clinical_validated_by ? (
                        <Group gap={4} wrap="nowrap">
                          <IconShieldCheck size={16} color="var(--mantine-color-teal-6)" />
                          <Text size="sm">{t.clinical_validated_by}</Text>
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Pendiente
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <ActionIcon variant="subtle" color="red" onClick={() => confirmRemove(t)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Drawer
        opened={!!editing}
        onClose={() => setEditing(null)}
        position="right"
        size="xl"
        title={editing === 'new' ? 'Nueva plantilla' : editing?.label}
      >
        {editing && (
          <TemplateEditor
            key={editing === 'new' ? 'new' : `${editing.id}:${editing.updated_at}`}
            scope={scope}
            template={editing === 'new' ? null : editing}
            canEdit={canEdit}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}
