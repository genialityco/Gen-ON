import { useState } from 'react';
import { Badge, Button, Chip, Group, Loader, Paper, Select, Stack, TagsInput, Text, Textarea, Title } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {
  ALERT_LEVEL_LABELS,
  MAX_ALERT_NOTIFY_PHONES,
  TEMPLATE_STATUS_LABELS,
  WEEKDAY_LABELS,
  type AlertLevel,
  type Organization,
} from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { PlanGate } from '../../features/plans/PlanGate';
import { useAlertNotify, useOrganization, useUpdateSettings } from '../../services/organizations';
import { notifyError, notifySuccess } from '../../lib/api';

const NO_RESPONSE_OPTIONS = [
  { value: 'off', label: 'No avisar' },
  { value: '24', label: '24 horas' },
  { value: '48', label: '48 horas' },
  { value: '72', label: '72 horas' },
];
const LEVEL_OPTIONS = (['urgent', 'warning', 'info'] as AlertLevel[]).map((l) => ({
  value: l,
  label: l === 'info' ? 'Todas las alertas' : l === 'warning' ? `${ALERT_LEVEL_LABELS.warning} y urgentes` : 'Solo urgentes',
}));
const STATUS_COLORS: Partial<Record<string, string>> = { APPROVED: 'teal', PENDING: 'yellow', REJECTED: 'red' };

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
  const [noResponse, setNoResponse] = useState(org.no_response_hours === null ? 'off' : String(org.no_response_hours));
  const [phones, setPhones] = useState(org.alert_notify_phones.map((p) => `+${p}`));
  const [level, setLevel] = useState<AlertLevel>(org.alert_notify_level);

  const save = () =>
    update.mutate(
      {
        default_send_time: time,
        blocked_weekdays: blocked.map(Number),
        consent_text: consent,
        no_response_hours: noResponse === 'off' ? null : Number(noResponse),
        alert_notify_phones: phones,
        alert_notify_level: level,
      },
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

      <PlanGate org={org} feature="alerts" what="Las alertas para la clínica">
        <Paper withBorder p="md">
          <Stack>
            <Text fw={600}>Alertas</Text>
            <Select
              label="Sin respuesta"
              description="Un mensaje con botones que el paciente no contesta aparece en Requiere atención después de este plazo"
              data={NO_RESPONSE_OPTIONS}
              value={noResponse}
              onChange={(v) => v && setNoResponse(v)}
              allowDeselect={false}
              w={260}
            />
            <TagsInput
              label="Avisar por WhatsApp a"
              description={`Celulares del equipo (máx. ${MAX_ALERT_NOTIFY_PHONES}) que reciben las alertas de los botones en el momento. Escribe el número y presiona Enter.`}
              placeholder={phones.length < MAX_ALERT_NOTIFY_PHONES ? '3001234567' : undefined}
              value={phones}
              onChange={setPhones}
              maxTags={MAX_ALERT_NOTIFY_PHONES}
              clearable
            />
            <Select
              label="Desde el nivel"
              data={LEVEL_OPTIONS}
              value={level}
              onChange={(v) => v && setLevel(v as AlertLevel)}
              allowDeselect={false}
              w={260}
            />
            <AlertTemplateStatus org={org} />
          </Stack>
        </Paper>
      </PlanGate>

      <Button w="fit-content" onClick={save} loading={update.isPending}>
        Guardar
      </Button>
    </Stack>
  );
}

/** Plantilla con la que salen los avisos: Gen.ON la crea en Meta y hay que esperar la aprobación. */
function AlertTemplateStatus({ org }: { org: Organization }) {
  const action = useAlertNotify(org.id);
  const t = org.alert_template;
  const run = (a: 'activate' | 'refresh' | 'test', msg: string) =>
    action.mutate(a, { onSuccess: () => notifySuccess(msg), onError: notifyError });

  return (
    <Paper withBorder p="sm" bg="gray.0">
      <Stack gap="xs">
        <Group gap="xs">
          <Text size="sm" fw={500}>
            Plantilla de aviso
          </Text>
          {t ? (
            <Badge variant="light" color={STATUS_COLORS[t.status] ?? 'gray'}>
              {TEMPLATE_STATUS_LABELS[t.status] ?? t.status}
            </Badge>
          ) : (
            <Badge variant="light" color="gray">
              Sin activar
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          El aviso sale desde el WhatsApp de la clínica con una plantilla que Meta debe aprobar: «Alerta de Gen.ON en{' '}
          {org.name}: [paciente] respondió «[botón]» al mensaje «[mensaje]» (nivel [nivel])…».
        </Text>
        {t?.rejected_reason && (
          <Text size="xs" c="red">
            Motivo del rechazo: {t.rejected_reason}
          </Text>
        )}
        <Group gap="xs">
          {(!t || t.status === 'REJECTED') && (
            <Button size="xs" loading={action.isPending} onClick={() => run('activate', 'Plantilla enviada a Meta')}>
              {t ? 'Volver a enviar' : 'Activar avisos'}
            </Button>
          )}
          {t && t.status !== 'APPROVED' && t.status !== 'REJECTED' && (
            <Button size="xs" variant="default" loading={action.isPending} onClick={() => run('refresh', 'Estado actualizado')}>
              Revisar estado
            </Button>
          )}
          {t?.status === 'APPROVED' && (
            <Button
              size="xs"
              variant="default"
              loading={action.isPending}
              disabled={!org.alert_notify_phones.length}
              onClick={() => run('test', 'Aviso de prueba enviado')}
            >
              Enviar prueba
            </Button>
          )}
        </Group>
        {t?.status === 'APPROVED' && !org.alert_notify_phones.length && (
          <Text size="xs" c="dimmed">
            Agrega los celulares y guarda para enviar una prueba.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
