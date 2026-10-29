import { useState } from 'react';
import { Alert, Badge, Button, Divider, Group, Loader, PinInput, Radio, Stack, Text, TextInput } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { PhoneStepInput, RegisterPhoneInput, RequestCodeInput, TestMessageInput, VerifyCodeInput } from '@genon/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { metaKeys, useMetaAction, usePhoneNumbers } from '../../../services/metaSetup';
import { useSyncTemplates } from '../../../services/library';
import { errorMessage, notifyError, notifySuccess } from '../../../lib/api';
import { Actions, CopyField, Facts, Guide, MetaLink, StepHeader, fmtDate, type StepProps } from '../ui';

const QUALITY_COLORS: Record<string, string> = { GREEN: 'teal', YELLOW: 'yellow', RED: 'red' };

function NeedsToken({ conn }: Pick<StepProps, 'conn'>) {
  if (conn.has_access_token) return null;
  return (
    <Alert color="gray" icon={<IconInfoCircle />} mb="md">
      Primero carga el token del usuario del sistema (paso 5).
    </Alert>
  );
}

// ---- 6. Cuenta de WhatsApp y número ----

export function PhoneStep({ orgId, conn }: StepProps) {
  const phones = usePhoneNumbers(orgId, conn.has_access_token);
  const select = useMetaAction<PhoneStepInput>(orgId, 'put', 'phone');
  const refresh = useMetaAction(orgId, 'post', 'phone/refresh');
  const [choice, setChoice] = useState(conn.phone_number_id ? `${conn.waba_id}:${conn.phone_number_id}` : '');

  return (
    <Stack gap={0}>
      <StepHeader title="Cuenta de WhatsApp y número">
        Puede ser el número actual de la clínica o uno nuevo. Debe poder recibir un SMS o una llamada.
      </StepHeader>
      <Guide
        items={[
          <>
            Si el número está en la app de WhatsApp o WhatsApp Business, hay que <b>eliminar esa cuenta</b>{' '}
            desde el teléfono antes de agregarlo (se pierde el historial del teléfono).
          </>,
          <>
            En el <MetaLink href="https://business.facebook.com/wa/manage/phone-numbers/">administrador de WhatsApp</MetaLink>,{' '}
            <b>Agregar número</b> con el nombre visible de la clínica (debe parecerse al nombre del negocio).
          </>,
          <>Volver aquí, actualizar la lista y elegirlo.</>,
        ]}
      />
      <NeedsToken conn={conn} />
      <Facts
        rows={[
          ['Cuenta de WhatsApp', conn.waba_name && `${conn.waba_name} (${conn.waba_id})`],
          ['Número', conn.display_phone_number],
          ['Nombre visible', conn.verified_name && `${conn.verified_name} · ${conn.name_status ?? ''}`],
          [
            'Calidad',
            conn.quality_rating && (
              <Badge color={QUALITY_COLORS[conn.quality_rating] ?? 'gray'} variant="light">
                {conn.quality_rating}
              </Badge>
            ),
          ],
          ['Límite de envíos', conn.messaging_limit_tier],
        ]}
      />

      {phones.isFetching ? (
        <Loader size="sm" />
      ) : phones.isError ? (
        <Alert color="red">{errorMessage(phones.error)}</Alert>
      ) : phones.data && !phones.data.length ? (
        <Text size="sm" c="dimmed">
          El token no tiene acceso a ninguna cuenta de WhatsApp. Revisa los activos asignados al usuario del sistema.
        </Text>
      ) : (
        <Radio.Group value={choice} onChange={setChoice}>
          <Stack gap="sm">
            {phones.data?.map((w) => (
              <div key={w.id}>
                <Text size="sm" fw={600} mb={4}>
                  {w.name ?? 'Cuenta'} · {w.id}
                </Text>
                {!w.phone_numbers.length && (
                  <Text size="sm" c="dimmed">
                    Sin números
                  </Text>
                )}
                <Stack gap={6}>
                  {w.phone_numbers.map((p) => (
                    <Radio
                      key={p.id}
                      value={`${w.id}:${p.id}`}
                      label={`${p.display_phone_number} — ${p.verified_name ?? 'sin nombre'}`}
                      description={[p.name_status, p.platform_type, p.code_verification_status]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Stack>
              </div>
            ))}
          </Stack>
        </Radio.Group>
      )}

      <Actions>
        <Button
          disabled={!choice}
          loading={select.isPending}
          onClick={() => {
            const [waba_id, phone_number_id] = choice.split(':');
            select.mutate({ waba_id, phone_number_id });
          }}
        >
          Usar este número
        </Button>
        <Button variant="default" disabled={!conn.has_access_token} onClick={() => phones.refetch()}>
          Actualizar lista
        </Button>
        {conn.phone_number_id && (
          <Button variant="light" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            Releer estado
          </Button>
        )}
      </Actions>
    </Stack>
  );
}

// ---- 7. Registro del número ----

export function RegistrationStep({ orgId, conn }: StepProps) {
  const requestCode = useMetaAction<RequestCodeInput>(orgId, 'post', 'phone/request-code');
  const verifyCode = useMetaAction<VerifyCodeInput>(orgId, 'post', 'phone/verify-code');
  const register = useMetaAction<RegisterPhoneInput>(orgId, 'post', 'phone/register');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');

  const verified = conn.code_verification_status === 'VERIFIED';
  const registered = conn.platform_type === 'CLOUD_API';

  if (!conn.phone_number_id) {
    return (
      <>
        <StepHeader title="Registro del número" />
        <Alert color="gray">Primero elige el número (paso 6).</Alert>
      </>
    );
  }

  return (
    <Stack gap={0}>
      <StepHeader title="Registro del número">
        Se confirma que el número es de la clínica y se registra en la API de WhatsApp con un PIN de
        verificación en dos pasos.
      </StepHeader>
      <Facts
        rows={[
          ['Número', conn.display_phone_number],
          ['Verificación del número', conn.code_verification_status],
          ['Plataforma', conn.platform_type],
          ['Estado', conn.phone_status],
        ]}
      />

      {!verified && (
        <>
          <Text fw={500} size="sm" mb="xs">
            1. Verificar el número
          </Text>
          <Group mb="sm">
            <Button variant="light" loading={requestCode.isPending} onClick={() => requestCode.mutate({ method: 'SMS' })}>
              Enviar código por SMS
            </Button>
            <Button variant="default" loading={requestCode.isPending} onClick={() => requestCode.mutate({ method: 'VOICE' })}>
              Por llamada
            </Button>
          </Group>
          <Group align="end">
            <Stack gap={4}>
              <Text size="sm">Código recibido</Text>
              <PinInput length={6} type="number" value={code} onChange={setCode} />
            </Stack>
            <Button disabled={code.length !== 6} loading={verifyCode.isPending} onClick={() => verifyCode.mutate({ code })}>
              Verificar
            </Button>
          </Group>
          <Divider my="lg" />
        </>
      )}

      <Text fw={500} size="sm" mb="xs">
        {verified ? '' : '2. '}Registrar en la API
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Elige un PIN de 6 dígitos (verificación en dos pasos). Queda guardado cifrado; se necesita si el
        número se vuelve a registrar o se migra.
      </Text>
      <Group align="end">
        <Stack gap={4}>
          <Text size="sm">PIN</Text>
          <PinInput length={6} type="number" mask value={pin} onChange={setPin} />
        </Stack>
        <Button disabled={pin.length !== 6} loading={register.isPending} onClick={() => register.mutate({ pin })}>
          {registered ? 'Registrar de nuevo' : 'Registrar'}
        </Button>
      </Group>
    </Stack>
  );
}

// ---- 8. Webhook ----

export function WebhookStep({ orgId, conn }: StepProps) {
  const configure = useMetaAction(orgId, 'post', 'webhook/configure-app');
  const subscribe = useMetaAction(orgId, 'post', 'webhook/subscribe-waba');
  const rotate = useMetaAction(orgId, 'post', 'webhook/rotate-token');
  const w = conn.webhook;
  const local = /localhost|127\.0\.0\.1/.test(w.callback_url);

  return (
    <Stack gap={0}>
      <StepHeader title="Webhook">
        Por aquí llegan las respuestas de los pacientes y los estados de entrega. Cada organización tiene
        su propia URL y su propio token, y cada evento se valida con la firma de su app.
      </StepHeader>
      {local && (
        <Alert color="yellow" mb="md">
          La API está en una URL local: Meta no puede llegar a ella. Usa la URL publicada (PUBLIC_API_URL)
          o un túnel para probar.
        </Alert>
      )}
      <Stack gap="sm" mb="md">
        <CopyField label="URL de devolución de llamada" value={w.callback_url} />
        <CopyField label="Token de verificación" value={w.verify_token} />
      </Stack>
      <Facts
        rows={[
          ['URL verificada por Meta', fmtDate(w.verified_at) ?? 'No'],
          ['Webhook de la app configurado', fmtDate(w.app_subscribed_at) ?? 'No'],
          ['App suscrita a la cuenta', fmtDate(w.waba_subscribed_at) ?? 'No'],
          ['Último evento recibido', fmtDate(w.last_event_at)],
        ]}
      />

      <Text fw={500} size="sm">
        Automático
      </Text>
      <Actions>
        <Button loading={configure.isPending} disabled={!conn.has_app_secret} onClick={() => configure.mutate()}>
          1. Configurar webhook de la app
        </Button>
        <Button
          loading={subscribe.isPending}
          disabled={!conn.waba_id || !conn.has_access_token}
          onClick={() => subscribe.mutate()}
        >
          2. Suscribir la cuenta de WhatsApp
        </Button>
      </Actions>

      <Text fw={500} size="sm" mt="lg">
        Manual (si el automático falla)
      </Text>
      <Guide
        items={[
          <>
            En la app: <b>WhatsApp → Configuración → Webhook → Editar</b>, pegar la URL y el token de arriba.
          </>,
          <>
            En <b>Campos del webhook</b>, suscribirse a <b>messages</b>.
          </>,
          <>Después, el botón 2 de arriba para suscribir la cuenta de WhatsApp.</>,
        ]}
      />
      <Button variant="subtle" color="red" w="fit-content" loading={rotate.isPending} onClick={() => rotate.mutate()}>
        Generar otro token de verificación
      </Button>
    </Stack>
  );
}

// ---- 9. Mensaje de prueba ----

export function TestStep({ orgId, conn }: StepProps) {
  const send = useMetaAction<TestMessageInput>(orgId, 'post', 'test');
  const [to, setTo] = useState(conn.test.to ?? '');
  const [template, setTemplate] = useState('hello_world');
  const [language, setLanguage] = useState('en_US');

  return (
    <Stack gap={0}>
      <StepHeader title="Mensaje de prueba">
        Se envía una plantilla aprobada a un número de prueba y se espera la confirmación de entrega por
        el webhook. Así se comprueban el envío y la recepción de eventos.
      </StepHeader>
      <Facts
        rows={[
          ['Enviado a', conn.test.to],
          ['Enviado', fmtDate(conn.test.sent_at)],
          ['Estado', conn.test.status],
          ['Error', conn.test.error],
        ]}
      />
      <Group align="end" grow>
        <TextInput label="Número (con indicativo)" placeholder="573001234567" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        <TextInput label="Plantilla" value={template} onChange={(e) => setTemplate(e.currentTarget.value)} />
        <TextInput label="Idioma" value={language} onChange={(e) => setLanguage(e.currentTarget.value)} />
      </Group>
      <Actions>
        <Button
          disabled={!to.trim() || conn.steps.registration.status !== 'done'}
          loading={send.isPending}
          onClick={() => send.mutate({ to, template, language })}
        >
          Enviar prueba
        </Button>
      </Actions>
    </Stack>
  );
}

// ---- 10. Plantillas ----

export function TemplatesStep({ orgId, conn }: StepProps) {
  const sync = useSyncTemplates(orgId);
  const qc = useQueryClient();
  return (
    <Stack gap={0}>
      <StepHeader title="Plantillas">
        Los mensajes de los protocolos deben estar aprobados por Meta. El paso queda listo con la primera plantilla
        aprobada; los cambios de estado llegan solos por el webhook.
      </StepHeader>
      <Guide
        items={[
          <>En el panel de la clínica, <b>Protocolos → Copiar de la biblioteca</b> (trae sus plantillas en borrador).</>,
          <>Un profesional de la salud revisa cada texto y se registra su validación.</>,
          <><b>Enviar a Meta</b> cada plantilla. La revisión suele tardar minutos, a veces hasta 24 horas.</>,
        ]}
      />
      <Actions>
        <Button component={Link} to={`/org/${orgId}/templates`} variant="light">
          Abrir plantillas de la clínica
        </Button>
        <Button
          variant="default"
          disabled={!conn.waba_id}
          loading={sync.isPending}
          onClick={() =>
            sync.mutate(undefined, {
              onSuccess: (r) => {
                notifySuccess(`${r.updated} de ${r.total} plantillas actualizadas desde Meta`);
                qc.invalidateQueries({ queryKey: metaKeys.connection(orgId) });
              },
              onError: notifyError,
            })
          }
        >
          Sincronizar con Meta
        </Button>
      </Actions>
    </Stack>
  );
}
