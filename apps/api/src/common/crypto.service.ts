import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';

const PREFIX = 'v1';

/**
 * Cifra los secretos de Meta (token del usuario del sistema, clave de la
 * app) con AES-256-GCM antes de guardarlos en Firestore. Formato:
 * v1:<iv>:<tag>:<texto cifrado>, en base64.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    this.key = CryptoService.parseKey(process.env.SECRETS_KEY);
  }

  static parseKey(raw: string | undefined): Buffer {
    const key = Buffer.from(raw ?? '', 'base64');
    if (key.length !== 32) {
      throw new Error('SECRETS_KEY debe ser de 32 bytes en base64');
    }
    return key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv, tag, data].map((p) => (typeof p === 'string' ? p : p.toString('base64'))).join(':');
  }

  decrypt(payload: string): string {
    const [prefix, iv, tag, data] = payload.split(':');
    if (prefix !== PREFIX || !iv || !tag || !data) throw new Error('Secreto con formato inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  randomToken(bytes = 24): string {
    return randomBytes(bytes).toString('base64url');
  }
}
