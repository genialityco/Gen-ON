import { Button, Code, PasswordInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import type {
  AppStepInput,
  CompanyStepInput,
  StepStatus,
  TokenStepInput,
} from '@genon/shared';
import { useMetaAction } from '../../../services/metaSetup';
import { Actions, Facts, Guide, MetaLink, StepHeader, fmtDate, type StepProps } from '../ui';

// ---- 1. Empresa ----

export function CompanyStep({ orgId, org }: StepProps) {
  const save = useMetaAction<CompanyStepInput>(orgId, 'put', 'company');
  const form = useForm<CompanyStepInput>({
    initialValues: {
      legal_name: org.legal_name ?? '',
      nit: org.nit ?? '',
      website: org.website ?? '',
      contact_name: org.contact_name ?? '',
      contact_email: org.contact_email ?? '',
      contact_phone: org.contact_phone ?? '',
      address: org.address ?? '',
      city: org.city ?? '',
    },
    validate: {
      legal_name: (v) => (v.trim() ? null : 'Obligatorio'),
      nit: (v) => (/^[0-9.\-\s]{5,20}$/.test(v) ? null : 'NIT inválido'),
      website: (v) => (/^https?:\/\/\S+\.\S+/.test(v) ? null : 'Debe empezar por https://'),
      contact_email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Correo inválido'),
    },
  });

  return (
    <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
      <StepHeader title="Datos de la empresa">
        Meta verifica el negocio con estos datos: deben coincidir con el RUT y la Cámara de Comercio. El
        sitio web debe mostrar la razón social o el NIT.
      </StepHeader>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Razón social" {...form.getInputProps('legal_name')} />
        <TextInput label="NIT" placeholder="900123456-7" {...form.getInputProps('nit')} />
        <TextInput label="Sitio web" placeholder="https://" {...form.getInputProps('website')} />
        <TextInput label="Ciudad" {...form.getInputProps('city')} />
        <TextInput label="Dirección" {...form.getInputProps('address')} />
        <TextInput label="Contacto (nombre)" {...form.getInputProps('contact_name')} />
        <TextInput label="Contacto (correo)" {...form.getInputProps('contact_email')} />
        <TextInput label="Contacto (teléfono)" {...form.getInputProps('contact_phone')} />
      </SimpleGrid>
      <Actions>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </Actions>
    </form>
  );
}

// ---- 2. Portafolio comercial ----

export function BusinessStep({ orgId, conn }: StepProps) {
  const save = useMetaAction<{ business_id: string }>(orgId, 'put', 'business');
  const refresh = useMetaAction(orgId, 'post', 'business/refresh');
  const [businessId, setBusinessId] = useState(conn.business_id ?? '');

  return (
    <Stack gap={0}>
      <StepHeader title="Portafolio comercial de Meta">
        La clínica es dueña de su portafolio (antes Business Manager); Gen.iality entra como
        administrador para configurarlo.
      </StepHeader>
      <Guide
        items={[
          <>
            Si la clínica no tiene portafolio, que lo cree con su cuenta personal de Facebook en{' '}
            <MetaLink href="https://business.facebook.com/overview">business.facebook.com</MetaLink>, con
            la razón social exacta.
          </>,
          <>
            En <b>Configuración → Usuarios → Personas</b>, que agregue a la persona de Gen.iality con
            acceso total (administrador).
          </>,
          <>
            Copia el <b>identificador del portafolio</b> desde{' '}
            <MetaLink href="https://business.facebook.com/settings/info">Configuración → Información del negocio</MetaLink>.
          </>,
        ]}
      />
      <Facts rows={[['Nombre en Meta', conn.business_name]]} />
      <TextInput
        label="Identificador del portafolio comercial"
        placeholder="123456789012345"
        value={businessId}
        onChange={(e) => setBusinessId(e.currentTarget.value)}
      />
      <Actions>
        <Button loading={save.isPending} disabled={!businessId.trim()} onClick={() => save.mutate({ business_id: businessId })}>
          Guardar
        </Button>
        {conn.has_access_token && conn.business_id && (
          <Button variant="light" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            Validar con Meta
          </Button>
        )}
      </Actions>
    </Stack>
  );
}

// ---- 3. Verificación del negocio ----

export function VerificationStep({ orgId, conn }: StepProps) {
  const refresh = useMetaAction(orgId, 'post', 'business/refresh');
  const save = useMetaAction<{ status: StepStatus; message?: string }>(orgId, 'put', 'verification');
  const [status, setStatus] = useState<StepStatus>(
    conn.steps.verification.status === 'error' ? 'pending' : conn.steps.verification.status,
  );
  const [note, setNote] = useState('');

  return (
    <Stack gap={0}>
      <StepHeader title="Verificación del negocio">
        Sin verificar se puede empezar, pero con un límite bajo de destinatarios por día y sin poder
        cambiar libremente el nombre visible. Meta suele tardar de 2 a 10 días hábiles.
      </StepHeader>
      <Guide
        items={[
          <>
            En{' '}
            <MetaLink href="https://business.facebook.com/settings/security">Configuración → Centro de seguridad</MetaLink>,
            iniciar la verificación.
          </>,
          <>Documentos: RUT, Certificado de Cámara de Comercio (reciente) y un recibo o extracto con la dirección.</>,
          <>Verificar el dominio o el teléfono de contacto cuando Meta lo pida.</>,
        ]}
      />
      <Facts rows={[['Estado en Meta', conn.business_verification_status]]} />
      {conn.has_access_token && conn.business_id && (
        <Actions>
          <Button variant="light" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            Consultar estado en Meta
          </Button>
        </Actions>
      )}
      <Text size="sm" fw={500} mt="lg" mb={4}>
        Marcar a mano (si el token no puede leer la verificación)
      </Text>
      <SegmentedControl
        value={status}
        onChange={(v) => setStatus(v as StepStatus)}
        data={[
          { value: 'pending', label: 'Sin iniciar' },
          { value: 'in_review', label: 'En revisión' },
          { value: 'done', label: 'Verificado' },
        ]}
        w="fit-content"
      />
      <Textarea mt="sm" label="Nota" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Actions>
        <Button loading={save.isPending} onClick={() => save.mutate({ status, message: note })}>
          Guardar estado
        </Button>
      </Actions>
    </Stack>
  );
}

// ---- 4. App ----

export function AppStep({ orgId, conn }: StepProps) {
  const save = useMetaAction<AppStepInput>(orgId, 'put', 'app');
  const form = useForm<AppStepInput>({ initialValues: { app_id: conn.app_id ?? '', app_secret: '' } });

  return (
    <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
      <StepHeader title="App de Meta">
        Una app por clínica, dentro de su propio portafolio. De ella salen la clave para firmar el webhook
        y el token de envío.
      </StepHeader>
      <Guide
        items={[
          <>
            En <MetaLink href="https://developers.facebook.com/apps">developers.facebook.com/apps</MetaLink>,{' '}
            <b>Crear app</b>: caso de uso de WhatsApp (o <i>Otro → Negocio</i>) y asociarla al portafolio
            de la clínica.
          </>,
          <>Agregar el producto <b>WhatsApp</b> a la app.</>,
          <>
            En <b>Configuración de la app → Básica</b>: copiar el <b>identificador de la app</b> y la{' '}
            <b>clave secreta</b>. Completar la URL de la política de privacidad de la clínica.
          </>,
          <>Publicar la app (modo <b>activo</b>) cuando el resto esté listo; en desarrollo no llegan eventos reales.</>,
        ]}
      />
      <Facts rows={[['Nombre de la app', conn.app_name]]} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Identificador de la app" {...form.getInputProps('app_id')} />
        <PasswordInput
          label="Clave secreta de la app"
          placeholder={conn.has_app_secret ? 'Guardada (escribe para cambiarla)' : ''}
          {...form.getInputProps('app_secret')}
        />
      </SimpleGrid>
      <Actions>
        <Button type="submit" loading={save.isPending}>
          Validar y guardar
        </Button>
      </Actions>
    </form>
  );
}

// ---- 5. Usuario del sistema y token ----

export function SystemUserStep({ orgId, conn }: StepProps) {
  const save = useMetaAction<TokenStepInput>(orgId, 'put', 'token');
  const [token, setToken] = useState('');
  const t = conn.token;

  return (
    <Stack gap={0}>
      <StepHeader title="Usuario del sistema y token">
        El token de un usuario del sistema no depende de ninguna persona y puede no vencer. Se guarda
        cifrado y nunca se vuelve a mostrar.
      </StepHeader>
      <Guide
        items={[
          <>
            En{' '}
            <MetaLink href="https://business.facebook.com/settings/system-users">Configuración → Usuarios → Usuarios del sistema</MetaLink>,
            agregar uno con rol <b>Administrador</b> (ej. "Gen.ON").
          </>,
          <>
            <b>Asignar activos</b>: la app del paso 4 y la cuenta de WhatsApp, ambas con control total.
          </>,
          <>
            <b>Generar token</b> con la app del paso 4, caducidad <b>Nunca</b> y los permisos{' '}
            <Code>whatsapp_business_messaging</Code>, <Code>whatsapp_business_management</Code> y{' '}
            <Code>business_management</Code>.
          </>,
        ]}
      />
      <Facts
        rows={[
          ['Tipo', t?.type],
          ['Vence', t ? (t.expires_at ? fmtDate(t.expires_at) : 'Nunca') : null],
          ['Permisos', t?.scopes.join(', ')],
          ['Cuentas de WhatsApp', t?.waba_ids.length ? t.waba_ids.join(', ') : null],
          ['Validado', fmtDate(t?.checked_at ?? null)],
        ]}
      />
      <PasswordInput
        label="Token de acceso"
        placeholder={conn.has_access_token ? 'Guardado (pega uno nuevo para cambiarlo)' : 'EAA...'}
        value={token}
        onChange={(e) => setToken(e.currentTarget.value)}
        disabled={!conn.has_app_secret}
        description={!conn.has_app_secret ? 'Primero configura la app (paso 4)' : undefined}
      />
      <Actions>
        <Button
          loading={save.isPending}
          disabled={token.trim().length < 20}
          onClick={() => save.mutate({ access_token: token }, { onSuccess: () => setToken('') })}
        >
          Validar y guardar
        </Button>
      </Actions>
    </Stack>
  );
}
