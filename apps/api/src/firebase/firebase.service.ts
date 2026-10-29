import { readFileSync } from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { App, cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * La credencial sale de FIREBASE_SERVICE_ACCOUNT (el JSON completo o en
 * base64, para App Platform) o de FIREBASE_SERVICE_ACCOUNT_PATH (ruta local).
 */
export function loadServiceAccount(env = process.env): ServiceAccount & { project_id?: string } {
  const inline = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inline) {
    const json = inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8');
    return JSON.parse(json);
  }
  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (path) return JSON.parse(readFileSync(path, 'utf8'));
  throw new Error('Falta FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_PATH');
}

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  readonly app: App;
  readonly db: Firestore;
  readonly auth: Auth;

  constructor() {
    const account = loadServiceAccount();
    this.app = getApps()[0] ?? initializeApp({ credential: cert(account) });
    this.db = getFirestore(this.app);
    this.db.settings({ ignoreUndefinedProperties: true });
    this.auth = getAuth(this.app);
    this.logger.log(`Firebase: proyecto ${account.project_id ?? account.projectId}`);
  }
}
