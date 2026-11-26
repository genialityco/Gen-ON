/**
 * SDK de JavaScript de Facebook para el Registro insertado de WhatsApp
 * (Gen.iality como proveedor de tecnología, configuración v4).
 *
 * FB.login abre una ventana emergente: hay que llamarlo directamente en el
 * clic, así que el SDK se carga antes (al mostrar el botón).
 */

interface FacebookSdk {
  init(params: Record<string, unknown>): void;
  login(callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (sdk) return sdk;
  sdk = new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/es_LA/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      sdk = null;
      script.remove();
      reject(new Error('No se pudo cargar el SDK de Facebook. Revisa la conexión o desactiva el bloqueador de anuncios.'));
    };
    document.body.appendChild(script);
  });
  return sdk;
}

export interface EmbeddedSignupResult {
  code: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}

export class EmbeddedSignupCancelled extends Error {
  constructor(readonly step: string | null) {
    super(step ? `Se cerró el registro de Meta en el paso «${step}»` : 'Se cerró el registro de Meta sin terminar');
  }
}

/** Mensajes del Registro insertado: solo de facebook.com. */
const FACEBOOK_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*facebook\.com$/;

/** Cuánto esperar el evento con los identificadores después de recibir el código. */
const SESSION_WAIT_MS = 3000;

/**
 * Abre el Registro insertado. Meta entrega dos cosas por canales distintos y
 * sin orden fijo: el código (callback de FB.login) y los identificadores de la
 * cuenta y el número (postMessage WA_EMBEDDED_SIGNUP). Se resuelve con el
 * código y lo que haya llegado del evento; si el evento no llega, la API
 * deduce la cuenta a partir del token.
 */
export function launchEmbeddedSignup(fb: FacebookSdk, configId: string): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let session: Omit<EmbeddedSignupResult, 'code'> | null = null;
    let cancelStep: string | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      settled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
    const finish = () => {
      if (settled || !code) return;
      cleanup();
      resolve({ code, ...(session ?? {}) });
    };

    function onMessage(event: MessageEvent) {
      if (!FACEBOOK_ORIGIN.test(event.origin)) return;
      let data: any;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      const info = data.data ?? {};
      if (typeof data.event === 'string' && data.event.startsWith('FINISH')) {
        session = {
          waba_id: info.waba_id ? String(info.waba_id) : undefined,
          phone_number_id: info.phone_number_id ? String(info.phone_number_id) : undefined,
          business_id: info.business_id ? String(info.business_id) : undefined,
        };
        finish();
      } else if (data.event === 'CANCEL') {
        cancelStep = info.current_step ?? null;
      } else if (data.event === 'ERROR' && !settled) {
        cleanup();
        reject(new Error(`Meta: ${info.error_message || 'error en el registro'}`));
      }
    }

    window.addEventListener('message', onMessage);

    // El callback de FB.login no puede ser async (el SDK lo rechaza)
    fb.login(
      (response) => {
        if (settled) return;
        code = response?.authResponse?.code ?? null;
        if (!code) {
          cleanup();
          reject(new EmbeddedSignupCancelled(cancelStep));
          return;
        }
        if (session) finish();
        else timer = setTimeout(finish, SESSION_WAIT_MS);
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        // Igual que el enlace de la configuración en Meta: v4 y eventos de sesión v3
        extras: { setup: {}, sessionInfoVersion: '3', version: 'v4' },
      },
    );
  });
}
