import { useEffect, useState } from 'react';
import { Alert, Button, type ButtonProps } from '@mantine/core';
import { IconBrandFacebook } from '@tabler/icons-react';
import type { MetaConnection } from '@genon/shared';
import { EmbeddedSignupCancelled, launchEmbeddedSignup, loadFacebookSdk } from '../../lib/facebookSdk';
import { useCompleteEmbeddedSignup } from '../../services/metaSetup';
import { errorMessage, notifySuccess } from '../../lib/api';

type Sdk = Awaited<ReturnType<typeof loadFacebookSdk>>;

/**
 * Botón del Registro insertado de Meta. Carga el SDK al mostrarse (FB.login
 * debe llamarse en el mismo clic para que el navegador no bloquee la ventana)
 * y, al terminar, envía el código a la API antes de que venza.
 */
export function EmbeddedSignupButton({
  orgId,
  conn,
  label,
  ...props
}: { orgId: string; conn: MetaConnection; label?: string } & ButtonProps) {
  const { platform } = conn;
  const complete = useCompleteEmbeddedSignup(orgId);
  const [sdk, setSdk] = useState<Sdk | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!platform.embedded_signup_available || !platform.app_id) return;
    loadFacebookSdk(platform.app_id, platform.graph_version).then(setSdk, (e: Error) => setSdkError(e.message));
  }, [platform.embedded_signup_available, platform.app_id, platform.graph_version]);

  if (!platform.embedded_signup_available) {
    return (
      <Alert color="gray">
        El Registro insertado no está configurado en la API (META_APP_ID, META_APP_SECRET y META_ES_CONFIG_ID).
      </Alert>
    );
  }

  const start = () => {
    if (!sdk || !platform.config_id) return;
    setError(null);
    setPopupOpen(true);
    launchEmbeddedSignup(sdk, platform.config_id)
      .then((result) => complete.mutateAsync(result))
      .then(() => notifySuccess('WhatsApp conectado con Meta'))
      .catch((e) => {
        if (e instanceof EmbeddedSignupCancelled) setError(e.message);
        else setError(errorMessage(e));
      })
      .finally(() => setPopupOpen(false));
  };

  return (
    <>
      {(sdkError || error) && (
        <Alert color={error && !sdkError ? 'yellow' : 'red'} mb="sm">
          {sdkError || error}
        </Alert>
      )}
      <Button
        leftSection={<IconBrandFacebook size={18} />}
        onClick={start}
        disabled={!sdk}
        loading={popupOpen || complete.isPending}
        {...props}
      >
        {label ?? 'Conectar con Facebook'}
      </Button>
    </>
  );
}
