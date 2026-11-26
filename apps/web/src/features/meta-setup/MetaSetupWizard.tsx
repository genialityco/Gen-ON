import { useEffect, useState } from 'react';
import { Alert, Grid, Loader, NavLink, Paper, Progress, SegmentedControl, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconClockHour4,
  type Icon,
} from '@tabler/icons-react';
import {
  META_CONNECTION_MODE_LABELS,
  STEP_STATUS_LABELS,
  metaRequiredSteps,
  metaStepsFor,
  type ConnectionModeInput,
  type MetaConnection,
  type MetaConnectionMode,
  type MetaSetupStepKey,
  type StepStatus,
} from '@genon/shared';
import { useMetaAction, useMetaConnection } from '../../services/metaSetup';
import { useOrganization } from '../../services/organizations';
import { STEP_COMPONENTS } from './steps';

const STATUS_ICON: Record<StepStatus, { icon: Icon; color: string }> = {
  pending: { icon: IconCircleDashed, color: 'gray' },
  in_review: { icon: IconClockHour4, color: 'yellow' },
  done: { icon: IconCircleCheck, color: 'teal' },
  error: { icon: IconAlertTriangle, color: 'red' },
};

/** Primer paso sin terminar: se abre ahí al entrar. */
function firstOpenStep(conn: MetaConnection): MetaSetupStepKey {
  return metaStepsFor(conn.mode).find((s) => conn.steps[s.key].status !== 'done')?.key ?? 'company';
}

/** Hay algo que llega por el webhook: se consulta cada pocos segundos. */
function waitingOnMeta(conn: MetaConnection) {
  return (
    conn.steps.test.status === 'in_review' ||
    (conn.mode === 'manual' && !!conn.webhook.app_subscribed_at && !conn.webhook.verified_at)
  );
}

export function MetaSetupWizard({ orgId }: { orgId: string }) {
  const [poll, setPoll] = useState(false);
  const { data: conn, isLoading } = useMetaConnection(orgId, { poll });
  const { data: org } = useOrganization(orgId);
  const setMode = useMetaAction<ConnectionModeInput>(orgId, 'put', 'mode');
  const [selected, setSelected] = useState<MetaSetupStepKey | null>(null);
  const shouldPoll = conn ? waitingOnMeta(conn) : false;
  useEffect(() => setPoll(shouldPoll), [shouldPoll]);

  if (isLoading || !conn || !org) return <Loader />;

  const steps = metaStepsFor(conn.mode);
  const required = metaRequiredSteps(conn.mode);
  const current = selected && steps.some((s) => s.key === selected) ? selected : firstOpenStep(conn);
  const done = required.filter((k) => conn.steps[k].status === 'done').length;
  const Step = STEP_COMPONENTS[current];
  const ready = done === required.length;

  return (
    <Grid gutter="lg">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="xs">
          <Stack gap={6} p="xs">
            <Text size="xs" c="dimmed">
              Forma de conexión
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={conn.mode}
              disabled={setMode.isPending}
              onChange={(v) => {
                setSelected(null);
                setMode.mutate({ mode: v as MetaConnectionMode });
              }}
              data={(['embedded', 'manual'] as const).map((m) => ({
                value: m,
                label: m === 'embedded' ? 'Registro insertado' : 'Manual',
              }))}
            />
            <Text size="sm" fw={500} mt={4}>
              {done} de {required.length} pasos obligatorios
            </Text>
            <Progress value={(done / required.length) * 100} size="sm" />
          </Stack>
          {steps.map((s, i) => {
            const state = conn.steps[s.key];
            const { icon: StatusIcon, color } = STATUS_ICON[state.status];
            return (
              <NavLink
                key={s.key}
                active={s.key === current}
                onClick={() => setSelected(s.key)}
                label={`${i + 1}. ${s.title}`}
                description={STEP_STATUS_LABELS[state.status]}
                leftSection={
                  <ThemeIcon variant="light" color={color} size="sm" radius="xl">
                    <StatusIcon size={14} />
                  </ThemeIcon>
                }
              />
            );
          })}
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 8 }}>
        <Stack>
          {conn.mode === 'manual' && conn.platform.embedded_signup_available && (
            <Alert color="blue" variant="light" title={META_CONNECTION_MODE_LABELS.embedded}>
              Gen.iality ya es proveedor de tecnología: las clínicas nuevas se conectan desde una ventana de Meta, sin
              app ni token propios. La conexión manual queda para las clínicas que ya tienen su app.
            </Alert>
          )}
          {ready && (
            <Alert color="teal" icon={<IconCircleCheck />} title="WhatsApp conectado">
              {conn.display_phone_number} ({conn.verified_name}) ya puede enviar mensajes.
              {org.status === 'setup' && ' Activa la organización en Configuración cuando esté lista.'}
            </Alert>
          )}
          {conn.steps[current].status === 'error' && conn.steps[current].message && (
            <Alert color="red" icon={<IconAlertTriangle />}>
              {conn.steps[current].message}
            </Alert>
          )}
          {conn.steps[current].status !== 'error' && conn.steps[current].message && (
            <Alert color="yellow" variant="light">
              {conn.steps[current].message}
            </Alert>
          )}
          <Paper withBorder p="lg">
            <Step orgId={orgId} conn={conn} org={org} />
          </Paper>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
