import { Alert, Badge, Button, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconBrandWhatsapp, IconCalendarEvent, IconInfoCircle, IconUserPlus } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { MESSAGE_LIMIT_WARN, ORG_STATUS_LABELS, PLANS, addDays, zonedTime } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useMetaConnection } from '../../services/metaSetup';
import { useOutbox, useUsage } from '../../services/patients';
import { money, todayIn } from '../../lib/format';

export function ClinicHomePage() {
  const orgId = useOrgId();
  const { data: org, isLoading } = useOrganization(orgId);
  const { data: conn } = useMetaConnection(orgId);
  const { data: usage } = useUsage(orgId);
  const tz = org?.timezone ?? 'America/Bogota';
  const today = todayIn(tz);
  const { data: todayItems = [] } = useOutbox(
    orgId,
    zonedTime(today, '00:00', tz).toISOString(),
    zonedTime(addDays(today, 1), '00:00', tz).toISOString(),
  );

  if (isLoading || !org) return <Loader />;
  const plan = PLANS[org.plan];
  const connected = conn?.steps.test.status === 'done';
  const pending = todayItems.filter((i) => i.status === 'scheduled').length;
  const sent = todayItems.filter((i) => i.status === 'sent').length;
  const problems = todayItems.filter((i) => i.status === 'failed' || i.delivery_status === 'failed').length;
  const responses = todayItems.filter((i) => i.response).length;
  const limit = usage?.message_limit ?? null;
  const limitShare = usage && limit !== null ? usage.messages_sent / Math.max(1, limit) : 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={2}>{org.name}</Title>
          <Badge variant="light">{ORG_STATUS_LABELS[org.status]}</Badge>
        </Group>
        <Button component={Link} to={`/org/${orgId}/patients`} leftSection={<IconUserPlus size={16} />}>
          Pacientes
        </Button>
      </Group>

      {org.status === 'setup' && (
        <Alert icon={<IconInfoCircle />} color="yellow">
          Gen.iality está terminando de configurar la cuenta de WhatsApp. Puedes registrar pacientes y protocolos; los
          mensajes empiezan a salir cuando la organización esté activa.
        </Alert>
      )}

      {usage && limit !== null && limitShare >= MESSAGE_LIMIT_WARN && (
        <Alert icon={<IconInfoCircle />} color={limitShare >= 1 ? 'red' : 'orange'}>
          {limitShare >= 1
            ? `Se alcanzó el límite de ${limit.toLocaleString('es-CO')} mensajes de este mes: los envíos programados no saldrán hasta el próximo mes. Para ampliarlo, contacta a Gen.iality.`
            : `Van ${usage.messages_sent.toLocaleString('es-CO')} de ${limit.toLocaleString('es-CO')} mensajes de este mes.`}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Paper withBorder p="md">
          <Group gap="xs" mb="xs">
            <IconCalendarEvent size={18} />
            <Text fw={600}>Hoy</Text>
          </Group>
          <Text size="xl" fw={700}>
            {sent}{' '}
            <Text span size="sm" c="dimmed" fw={400}>
              enviados · {pending} por enviar
            </Text>
          </Text>
          <Text size="sm" c="dimmed">
            {responses} respuestas{problems ? ` · ${problems} con problemas` : ''}
          </Text>
          <Button component={Link} to={`/org/${orgId}/schedule`} variant="subtle" size="xs" px={0} mt="xs">
            Ver parrilla
          </Button>
        </Paper>

        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Pacientes nuevos este mes
          </Text>
          {usage ? (
            <>
              <Text size="xl" fw={700}>
                {usage.new_patients}{' '}
                <Text span size="sm" c="dimmed" fw={400}>
                  de {usage.included} incluidos
                </Text>
              </Text>
              <Progress value={Math.min(100, (usage.new_patients / Math.max(1, usage.included)) * 100)} mt={6} />
              {usage.extra > 0 && (
                <Text size="xs" c="orange" mt={6}>
                  {usage.extra} adicionales · {money(usage.extra * plan.extra_patient_fee)} + IVA
                </Text>
              )}
            </>
          ) : (
            <Loader size="xs" />
          )}
          <Text size="xs" c="dimmed" mt={6}>
            Plan {plan.label}
          </Text>
        </Paper>

        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Mensajes este mes
          </Text>
          {usage ? (
            <>
              <Text size="xl" fw={700}>
                {usage.messages_sent.toLocaleString('es-CO')}{' '}
                <Text span size="sm" c="dimmed" fw={400}>
                  {limit === null ? 'enviados' : `de ${limit.toLocaleString('es-CO')}`}
                </Text>
              </Text>
              {limit !== null && (
                <Progress
                  value={Math.min(100, limitShare * 100)}
                  color={limitShare >= 1 ? 'red' : limitShare >= MESSAGE_LIMIT_WARN ? 'orange' : undefined}
                  mt={6}
                />
              )}
              <Text size="xs" c="dimmed" mt={6}>
                {limit === null ? 'Sin límite mensual' : `Quedan ${Math.max(0, limit - usage.messages_sent).toLocaleString('es-CO')}`}
              </Text>
            </>
          ) : (
            <Loader size="xs" />
          )}
        </Paper>

        <Paper withBorder p="md">
          <Group gap="xs" mb="xs">
            <IconBrandWhatsapp size={18} />
            <Text fw={600}>WhatsApp</Text>
          </Group>
          {conn?.display_phone_number ? (
            <>
              <Text>{conn.display_phone_number}</Text>
              <Text size="sm" c="dimmed">
                {conn.verified_name} · {connected ? 'Conectado' : 'En configuración'}
              </Text>
            </>
          ) : (
            <Text c="dimmed">Sin número conectado aún</Text>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
