import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Meta firma cada POST del webhook con la clave secreta de la app:
 * X-Hub-Signature-256: sha256=<hmac hex del cuerpo original>.
 */
export function isValidMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(header.slice(7), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Solo dígitos, sin ceros iniciales; 10 a 15 dígitos (con indicativo). */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw).replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
