import { Button, NumberInput, Paper, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ORG_STATUS_LABELS, type Organization, type UpdateOrganizationInput } from '@genon/shared';
import { useUpdateOrganization } from '../../services/organizations';
import { notifyError, notifySuccess } from '../../lib/api';
import { kindOptions, planOptions } from '../../pages/admin/OrganizationsPage';

const statusOptions = Object.entries(ORG_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export function OrganizationSettings({ org }: { org: Organization }) {
  const update = useUpdateOrganization(org.id);
  const form = useForm<Omit<UpdateOrganizationInput, 'monthly_message_limit'> & { monthly_message_limit: number | string }>({
    initialValues: {
      name: org.name,
      kind: org.kind,
      plan: org.plan,
      status: org.status,
      timezone: org.timezone,
      monthly_message_limit: org.monthly_message_limit ?? '',
    },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      const limit = values.monthly_message_limit;
      await update.mutateAsync({ ...values, monthly_message_limit: limit === '' ? null : Number(limit) });
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
            <NumberInput
              label="Límite de mensajes por mes"
              description="Vacío = sin límite. Al llegar al límite, los envíos del resto del mes quedan omitidos."
              placeholder="Sin límite"
              min={0}
              max={1_000_000}
              allowDecimal={false}
              allowNegative={false}
              thousandSeparator="."
              decimalSeparator=","
              {...form.getInputProps('monthly_message_limit')}
            />
          </SimpleGrid>
          <Button type="submit" loading={update.isPending} w="fit-content">
            Guardar
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
