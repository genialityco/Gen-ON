import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  META_SETUP_STEPS,
  type MessageDeliveryStatus,
  type MetaConnection,
  type MetaSetupStepKey,
  type StepState,
  type StepStatus,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { CryptoService } from '../common/crypto.service';
import { COL, META_CONNECTION_DOC, isoOrNull, toPlain } from '../common/firestore';

export type SecretKey = 'app_secret' | 'access_token' | 'verify_token' | 'pin';

/**
 * Conexión de Meta de una organización. Los datos públicos van en
 * organizations/{orgId}/meta_connection/main (los miembros pueden leerlos);
 * los secretos, cifrados, en org_secrets/{orgId} (solo el backend).
 */
@Injectable()
export class MetaConnectionStore {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly crypto: CryptoService,
  ) {}

  ref(orgId: string) {
    return this.firebase.db
      .collection(COL.organizations)
      .doc(orgId)
      .collection(COL.metaConnection)
      .doc(META_CONNECTION_DOC);
  }

  private secretsRef(orgId: string) {
    return this.firebase.db.collection(COL.orgSecrets).doc(orgId);
  }

  callbackUrl(orgId: string) {
    const base = (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/webhooks/meta/${orgId}`;
  }

  async raw(orgId: string): Promise<FirebaseFirestore.DocumentData> {
    return (await this.ref(orgId).get()).data() ?? {};
  }

  async update(orgId: string, patch: Record<string, unknown>) {
    await this.ref(orgId).set(
      { ...patch, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  async setStep(orgId: string, key: MetaSetupStepKey, status: StepStatus, message: string | null = null) {
    await this.update(orgId, {
      steps: { [key]: { status, message, updated_at: FieldValue.serverTimestamp() } },
    });
  }

  async getSecrets(orgId: string): Promise<Partial<Record<SecretKey, string>>> {
    const data = (await this.secretsRef(orgId).get()).data() ?? {};
    const out: Partial<Record<SecretKey, string>> = {};
    for (const key of ['app_secret', 'access_token', 'verify_token', 'pin'] as SecretKey[]) {
      if (data[key]) out[key] = this.crypto.decrypt(data[key]);
    }
    return out;
  }

  async setSecret(orgId: string, key: SecretKey, value: string) {
    await this.secretsRef(orgId).set(
      { [key]: this.crypto.encrypt(value), updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  /** El verify token se crea la primera vez que se necesita. */
  async ensureVerifyToken(orgId: string): Promise<string> {
    const { verify_token } = await this.getSecrets(orgId);
    if (verify_token) return verify_token;
    return this.rotateVerifyToken(orgId);
  }

  async rotateVerifyToken(orgId: string): Promise<string> {
    const token = this.crypto.randomToken();
    await this.setSecret(orgId, 'verify_token', token);
    return token;
  }

  async view(orgId: string, includeVerifyToken: boolean): Promise<MetaConnection> {
    const [d, secrets] = await Promise.all([this.raw(orgId), this.getSecrets(orgId)]);
    const steps = {} as Record<MetaSetupStepKey, StepState>;
    for (const { key } of META_SETUP_STEPS) {
      const s = d.steps?.[key];
      steps[key] = {
        status: s?.status ?? 'pending',
        message: s?.message ?? null,
        updated_at: isoOrNull(s?.updated_at),
      };
    }

    let testStatus: MessageDeliveryStatus | null = null;
    if (d.test?.wamid) {
      const msg = await this.firebase.db
        .collection(COL.organizations)
        .doc(orgId)
        .collection(COL.messages)
        .doc(d.test.wamid)
        .get();
      testStatus = msg.data()?.status ?? null;
    }

    return {
      org_id: orgId,
      steps,
      business_id: d.business_id ?? null,
      business_name: d.business_name ?? null,
      business_verification_status: d.business_verification_status ?? null,
      app_id: d.app_id ?? null,
      app_name: d.app_name ?? null,
      has_app_secret: !!secrets.app_secret,
      has_access_token: !!secrets.access_token,
      token: d.token ? toPlain(d.token) : null,
      waba_id: d.waba_id ?? null,
      waba_name: d.waba_name ?? null,
      phone_number_id: d.phone_number_id ?? null,
      display_phone_number: d.display_phone_number ?? null,
      verified_name: d.verified_name ?? null,
      name_status: d.name_status ?? null,
      quality_rating: d.quality_rating ?? null,
      code_verification_status: d.code_verification_status ?? null,
      platform_type: d.platform_type ?? null,
      phone_status: d.phone_status ?? null,
      messaging_limit_tier: d.messaging_limit_tier ?? null,
      webhook: {
        callback_url: this.callbackUrl(orgId),
        verify_token: includeVerifyToken ? secrets.verify_token ?? null : null,
        verified_at: isoOrNull(d.webhook?.verified_at),
        app_subscribed_at: isoOrNull(d.webhook?.app_subscribed_at),
        waba_subscribed_at: isoOrNull(d.webhook?.waba_subscribed_at),
        last_event_at: isoOrNull(d.webhook?.last_event_at),
      },
      test: {
        to: d.test?.to ?? null,
        wamid: d.test?.wamid ?? null,
        sent_at: isoOrNull(d.test?.sent_at),
        status: testStatus,
        error: d.test?.error ?? null,
      },
      updated_at: isoOrNull(d.updated_at),
    };
  }
}
