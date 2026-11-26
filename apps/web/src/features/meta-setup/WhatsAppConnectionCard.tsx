import { Alert, Badge, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconBrandWhatsapp } from '@tabler/icons-react';
import { metaRequiredSteps } from '@genon/shared';
import { useMetaConnection } from '../../services/metaSetup';
import { EmbeddedSignupButton } from './EmbeddedSignupButton';
import { PaymentMethodNotice, SIGNUP_GUIDE } from './steps/SignupStep';
import { Facts, Guide } from './ui';

/**
 * Conexión de WhatsApp vista por el administrador de la clínica: estado del
 * número y, con el Registro insertado, el botón para conectarlo con su propio
 * Facebook. El resto del asistente lo maneja Gen.iality.
 */
export function WhatsAppConnectionCard({ orgId }: { orgId: string }) {
  const { data: conn, isLoading } = useMetaConnection(orgId);
  if (isLoading || !conn) return <Loader size="sm" />;

  const ready = metaRequiredSteps(conn.mode).every((k) => conn.steps[k].status === 'done');
  const connected = conn.steps.signup.status === 'done' || (conn.mode === 'manual' && conn.has_access_token);
  const canSelfConnect = conn.mode === 'embedded' && conn.platform.embedded_signup_available;
  const problem = conn.steps.signup.status === 'error' ? conn.steps.signup.message : null;

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconBrandWhatsapp size={22} />
          <Title order={4}>WhatsApp</Title>
        </Group>
        <Badge color={ready ? 'teal' : connected ? 'yellow' : 'gray'} variant="light">
          {ready ? 'Conectado' : connected ? 'Configuración en curso' : 'Sin conectar'}
        </Badge>
      </Group>

      {problem && (
        <Alert color="red" mb="sm">
          {problem}
        </Alert>
      )}

      <Facts
        rows={[
          ['Número', conn.display_phone_number],
          ['Nombre visible', conn.verified_name],
          ['Cuenta de WhatsApp', conn.waba_name],
        ]}
      />

      {canSelfConnect && !connected && (
        <Stack gap={0}>
          <Text size="sm" mb="xs">
            Conecta el WhatsApp de la clínica con Meta. Ten a mano el teléfono del número para recibir el código.
          </Text>
          <Guide items={SIGNUP_GUIDE} />
          <EmbeddedSignupButton orgId={orgId} conn={conn} w="fit-content" />
        </Stack>
      )}

      {canSelfConnect && connected && (
        <Stack>
          {!ready && (
            <Text size="sm" c="dimmed">
              Gen.iality está terminando la configuración (registro del número, mensaje de prueba y plantillas).
            </Text>
          )}
          <PaymentMethodNotice />
          <EmbeddedSignupButton orgId={orgId} conn={conn} w="fit-content" variant="subtle" size="xs" label="Volver a conectar" />
        </Stack>
      )}

      {!canSelfConnect && !ready && (
        <Text size="sm" c="dimmed">
          Gen.iality está configurando la conexión de WhatsApp de la clínica.
        </Text>
      )}
    </Paper>
  );
}
