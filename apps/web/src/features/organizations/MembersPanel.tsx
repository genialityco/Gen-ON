import { ActionIcon, Badge, Button, Group, Loader, Modal, Paper, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { ORG_ROLES, ROLE_LABELS, type AddMemberInput, type OrgRole } from '@genon/shared';
import { useAddMember, useMembers, useRemoveMember, useUpdateMemberRole } from '../../services/organizations';
import { auth } from '../../lib/firebase';
import { notifyError, notifySuccess } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';

const roleOptions = ORG_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function MembersPanel({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useMembers(orgId);
  const updateRole = useUpdateMemberRole(orgId);
  const remove = useRemoveMember(orgId);
  const [opened, { open, close }] = useDisclosure();

  const confirmRemove = (uid: string, email: string) =>
    modals.openConfirmModal({
      title: 'Quitar del equipo',
      children: <Text size="sm">{email} perderá el acceso a la plataforma.</Text>,
      labels: { confirm: 'Quitar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(uid, { onError: notifyError }),
    });

  return (
    <Stack maw={860}>
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          Administradores: gestionan el equipo y la configuración. Operadores: pacientes, alertas y
          conversaciones.
        </Text>
        <Button leftSection={<IconUserPlus size={16} />} onClick={open}>
          Agregar persona
        </Button>
      </Group>

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : !data?.length ? (
          <Text c="dimmed" p="md">
            Aún no hay personas en el equipo.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Persona</Table.Th>
                  <Table.Th w={200}>Rol</Table.Th>
                  <Table.Th w={50} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((m) => {
                  // El equipo Gen.iality asignado se gestiona en Usuarios
                  const self = m.uid === user?.uid;
                  if (m.role === 'staff') {
                    return (
                      <Table.Tr key={m.uid}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {m.name || m.email}
                          </Text>
                          {m.name && (
                            <Text size="xs" c="dimmed">
                              {m.email}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="grape">
                            {ROLE_LABELS.staff}
                          </Badge>
                        </Table.Td>
                        <Table.Td />
                      </Table.Tr>
                    );
                  }
                  return (
                    <Table.Tr key={m.uid}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {m.name || m.email}
                        </Text>
                        {m.name && (
                          <Text size="xs" c="dimmed">
                            {m.email}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={roleOptions}
                          value={m.role}
                          disabled={self}
                          allowDeselect={false}
                          onChange={(role) =>
                            role && updateRole.mutate({ uid: m.uid, role: role as OrgRole }, { onError: notifyError })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        {!self && (
                          <ActionIcon variant="subtle" color="red" onClick={() => confirmRemove(m.uid, m.email)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={opened} onClose={close} title="Agregar persona al equipo">
        <AddMemberForm orgId={orgId} onDone={close} />
      </Modal>
    </Stack>
  );
}

function AddMemberForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const add = useAddMember(orgId);
  const form = useForm<AddMemberInput>({
    initialValues: { email: '', name: '', role: 'operator' },
    validate: { email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Correo inválido') },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      const member = await add.mutateAsync(values);
      // Correo de Firebase para que defina su contraseña
      await sendPasswordResetEmail(auth, member.email).catch(() => undefined);
      notifySuccess(`${member.email} fue agregado. Le llegará un correo para definir su contraseña.`);
      onDone();
    } catch (e) {
      notifyError(e);
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Correo" {...form.getInputProps('email')} />
        <TextInput label="Nombre" {...form.getInputProps('name')} />
        <Select label="Rol" data={roleOptions} allowDeselect={false} {...form.getInputProps('role')} />
        <Button type="submit" loading={add.isPending}>
          Agregar
        </Button>
      </Stack>
    </form>
  );
}
