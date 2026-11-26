import { BadRequestException, Injectable } from '@nestjs/common';

export interface MetaPlatformCredentials {
  appId: string;
  appSecret: string;
  configId: string;
}

/**
 * App de Meta de Gen.iality como proveedor de tecnología (Tech Provider).
 * Con ella se hace el Registro insertado de todas las clínicas y le llegan
 * los eventos de sus cuentas de WhatsApp a un solo webhook.
 *
 * - META_APP_ID / META_APP_SECRET: Configuración de la app → Básica.
 * - META_ES_CONFIG_ID: Facebook Login for Business → Configuraciones, con la
 *   variante "Registro insertado de WhatsApp".
 * - META_WEBHOOK_VERIFY_TOKEN: el que se pega en WhatsApp → Configuración →
 *   Webhook de la app.
 */
@Injectable()
export class MetaPlatform {
  get appId() {
    return process.env.META_APP_ID?.trim() || null;
  }

  get appSecret() {
    return process.env.META_APP_SECRET?.trim() || null;
  }

  get configId() {
    return process.env.META_ES_CONFIG_ID?.trim() || null;
  }

  get verifyToken() {
    return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null;
  }

  get embeddedSignupAvailable() {
    return !!(this.appId && this.appSecret && this.configId);
  }

  get webhookCallbackUrl() {
    const base = (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/webhooks/meta`;
  }

  require(): MetaPlatformCredentials {
    if (!this.embeddedSignupAvailable) {
      throw new BadRequestException(
        'El Registro insertado no está configurado en la API (META_APP_ID, META_APP_SECRET y META_ES_CONFIG_ID)',
      );
    }
    return { appId: this.appId!, appSecret: this.appSecret!, configId: this.configId! };
  }
}
