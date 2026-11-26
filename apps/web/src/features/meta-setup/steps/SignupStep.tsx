import { Alert, Stack } from '@mantine/core';
import { IconCreditCard } from '@tabler/icons-react';
import { EmbeddedSignupButton } from '../EmbeddedSignupButton';
import { Facts, Guide, MetaLink, StepHeader, fmtDate, type StepProps } from '../ui';

/** Qué le va a pedir Meta a la clínica en la ventana del Registro insertado. */
export const SIGNUP_GUIDE = [
  <>
    Entrar con el Facebook de una persona que <b>administre el portafolio comercial</b> de la clínica (o crear
    uno nuevo con la razón social exacta).
  </>,
  <>Elegir o crear la cuenta de WhatsApp Business y escribir el nombre visible de la clínica.</>,
  <>
    Agregar el número y confirmarlo con el código por SMS o llamada. Si ese número está en la app de WhatsApp,
    primero hay que <b>eliminar esa cuenta</b> desde el teléfono.
  </>,
  <>Aceptar los permisos para Gen.ON y terminar. Gen.ON hace el resto: webhook y registro del número.</>,
];

export function PaymentMethodNotice() {
  return (
    <Alert color="blue" variant="light" icon={<IconCreditCard />} title="Método de pago en Meta">
      Meta cobra los mensajes directamente a la clínica. Sin una tarjeta en el{' '}
      <MetaLink href="https://business.facebook.com/wa/manage/home/">administrador de WhatsApp</MetaLink> (Configuración
      de pagos) los recordatorios no salen.
    </Alert>
  );
}

// ---- Conectar WhatsApp (Registro insertado) ----

export function SignupStep({ orgId, conn }: StepProps) {
  const connected = conn.steps.signup.status === 'done';
  const t = conn.token;
  return (
    <Stack gap={0}>
      <StepHeader title="Conectar WhatsApp">
        Gen.iality es proveedor de tecnología de Meta: la clínica conecta su cuenta de WhatsApp desde una ventana de
        Meta, sin crear apps ni tokens. Lo puede hacer el administrador de la clínica desde su Configuración o
        alguien de Gen.iality con acceso al portafolio de la clínica.
      </StepHeader>
      <Guide items={SIGNUP_GUIDE} />
      <Facts
        rows={[
          ['Portafolio', conn.business_name ? `${conn.business_name} (${conn.business_id})` : conn.business_id],
          ['Cuenta de WhatsApp', conn.waba_name ? `${conn.waba_name} (${conn.waba_id})` : conn.waba_id],
          ['Número', conn.display_phone_number],
          ['Token', t ? (t.expires_at ? `Vence el ${fmtDate(t.expires_at)}` : 'No vence') : null],
        ]}
      />
      <EmbeddedSignupButton
        orgId={orgId}
        conn={conn}
        w="fit-content"
        variant={connected ? 'light' : 'filled'}
        label={connected ? 'Volver a conectar' : 'Conectar con Facebook'}
      />
      {connected && (
        <Stack mt="md">
          <PaymentMethodNotice />
        </Stack>
      )}
    </Stack>
  );
}
