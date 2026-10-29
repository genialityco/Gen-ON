import { Badge, Button, Group, Loader, Modal, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  ORG_KIND_LABELS,
  ORG_STATUS_LABELS,
  PLAN_KEYS,
  PLANS,
  type CreateOrganizationInput,
  type OrgStatus,
} from '@genon/shared';
import { useCreateOrganization, useOrganizations } from '../../services/organizations';
import { notifyError } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';

export const STATUS_COLORS: Record<OrgStatus, string> = {
  setup: 'yellow',
  active: 'teal',
  suspended: 'gray',
};

export const kindOptions = Object.entries(ORG_KIND_LABELS).map(([value, label]) => ({ value, label }));
export const planOptions = PLAN_KEYS.map((k) => ({
  value: k,
  label: `${PLANS[k].label} · $${PLANS[k].monthly_fee.toLocaleString('es-CO')}/mes`,
}));

export function OrganizationsPage() {
  const { data, isLoading } = useOrganizations();
  const [opened, { open, close }] = useDisclosure();
  const navigate = useNavigate();
  const { role } = useAuth();

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Organizaciones</Title>
        {role === 'superadmin' && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            Nueva organización
          </Button>
        )}
      </Group>

      {isLoading ? (
        <Loader />
      ) : !data?.length ? (
        <Text c="dimmed">{role === 'superadmin' ? 'Aún no hay organizaciones.' : 'No tienes organizaciones asignadas.'}</Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((org) => (
                <Table.Tr
                  key={org.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                >
                  <Table.Td fw={500}>{org.name}</Table.Td>
                  <Table.Td>{ORG_KIND_LABELS[org.kind]}</Table.Td>
                  <Table.Td>{PLANS[org.plan]?.label ?? org.plan}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLORS[org.status]} variant="light">
                      {ORG_STATUS_LABELS[org.status]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={opened} onClose={close} title="Nueva organización">
        <CreateOrganizationForm
          onCreated={(id) => {
            close();
            navigate(`/admin/organizations/${id}/meta`);
          }}
        />
      </Modal>
    </Stack>
  );
}

function CreateOrganizationForm({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useCreateOrganization();
  const form = useForm<CreateOrganizationInput>({
    initialValues: { name: '', kind: 'clinic', plan: 'adherencia', timezone: 'America/Bogota' },
    validate: { name: (v) => (v.trim().length >= 2 ? null : 'Escribe el nombre') },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      const org = await create.mutateAsync(values);
      onCreated(org.id);
    } catch (e) {
      notifyError(e);
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Nombre comercial" placeholder="Clínica Dermasalud" {...form.getInputProps('name')} />
        <Select label="Tipo" data={kindOptions} allowDeselect={false} {...form.getInputProps('kind')} />
        <Select label="Plan" data={planOptions} allowDeselect={false} {...form.getInputProps('plan')} />
        <TextInput label="Zona horaria" {...form.getInputProps('timezone')} />
        <Button type="submit" loading={create.isPending}>
          Crear y conectar WhatsApp
        </Button>
      </Stack>
    </form>
  );
}
