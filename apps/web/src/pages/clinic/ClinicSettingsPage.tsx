import { useState } from 'react';
import { Button, Chip, Group, Loader, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { WEEKDAY_LABELS } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization, useUpdateSettings } from '../../services/organizations';
import { notifyError, notifySuccess } from '../../lib/api';

export function ClinicSettingsPage() {
  const orgId = useOrgId();
  const { data: org } = useOrganization(orgId);
  if (!org) return <Loader />;
  return <SettingsForm key={org.updated_at} org={org} />;
}

function SettingsForm({ org }: { org: NonNullable<ReturnType<typeof useOrganization>['data']> }) {
  const update = useUpdateSettings(org.id);
  const [time, setTime] = useState(org.default_send_time);
  const [blocked, setBlocked] = useState(org.blocked_weekdays.map(String));
  const [consent, setConsent] = useState(org.consent_text);

  const save = () =>
    update.mutate(
      { default_send_time: time, blocked_weekdays: blocked.map(Number), consent_text: consent },
      { onSuccess: () => notifySuccess('Configuración guardada'), onError: notifyError },
    );

  return (
    <Stack maw={760}>
      <Title order={2}>Configuración</Title>

      <Paper withBorder p="md">
        <Stack>
          <Text fw={600}>Envíos</Text>
          <TimeInput
            label="Hora por defecto"
            description="Para los pasos de protocolo que no tienen hora"
            value={time}
            onChange={(e) => setTime(e.currentTarget.value)}
            w={200}
          />
          <div>
            <Text size="sm" fw={500}>
              Días sin envíos
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              Lo que cae en estos días se corre: antes del procedimiento al día anterior, después al siguiente.
            </Text>
            <Chip.Group multiple value={blocked} onChange={setBlocked}>
              <Group gap="xs">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <Chip key={d} value={String(d)} size="sm">
                    {WEEKDAY_LABELS[d]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>
          <Text size="xs" c="dimmed">
            Zona horaria: {org.timezone}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <div>
            <Text fw={600}>Autorización de tratamiento de datos</Text>
            <Text size="xs" c="dimmed">
              Versión {org.consent_version}. Al cambiar el texto sube la versión; cada paciente conserva el texto que
              aceptó. {'{{clinica}}'} se reemplaza por el nombre de la clínica.
            </Text>
          </div>
          <Textarea autosize minRows={4} value={consent} onChange={(e) => setConsent(e.currentTarget.value)} />
        </Stack>
      </Paper>

      <Button w="fit-content" onClick={save} loading={update.isPending}>
        Guardar
      </Button>
    </Stack>
  );
}
