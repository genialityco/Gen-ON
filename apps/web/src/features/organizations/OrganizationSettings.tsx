import { Button, Paper, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ORG_STATUS_LABELS, type Organization, type UpdateOrganizationInput } from '@genon/shared';
import { useUpdateOrganization } from '../../services/organizations';
import { notifyError, notifySuccess } from '../../lib/api';
import { kindOptions, planOptions } from '../../pages/admin/OrganizationsPage';

const statusOptions = Object.entries(ORG_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export function OrganizationSettings({ org }: { org: Organization }) {
  const update = useUpdateOrganization(org.id);
  const form = useForm<UpdateOrganizationInput>({
    initialValues: {
      name: org.name,
      kind: org.kind,
      plan: org.plan,
      status: org.status,
      timezone: org.timezone,
    },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      notifySuccess('Organización actualizada');
    } catch (e) {
      notifyError(e);
    }
  });

  return (
    <Paper withBorder p="md" maw={720}>
      <form onSubmit={submit}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Nombre comercial" {...form.getInputProps('name')} />
            <Select label="Tipo" data={kindOptions} allowDeselect={false} {...form.getInputProps('kind')} />
            <Select label="Plan" data={planOptions} allowDeselect={false} {...form.getInputProps('plan')} />
            <Select
              label="Estado"
              description="Activa: ya puede enviar mensajes a pacientes"
              data={statusOptions}
              allowDeselect={false}
              {...form.getInputProps('status')}
            />
            <TextInput label="Zona horaria" {...form.getInputProps('timezone')} />
          </SimpleGrid>
          <Button type="submit" loading={update.isPending} w="fit-content">
            Guardar
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
