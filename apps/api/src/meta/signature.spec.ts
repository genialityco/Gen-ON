import { createHmac } from 'crypto';
import { isValidMetaSignature, normalizePhone, safeEqual } from './signature';

describe('isValidMetaSignature', () => {
  const secret = 'app-secret';
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const sign = (b: Buffer, s = secret) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;

  it('acepta la firma correcta', () => {
    expect(isValidMetaSignature(body, sign(body), secret)).toBe(true);
  });

  it('rechaza otra clave, otro cuerpo, sin cabecera o con formato inválido', () => {
    expect(isValidMetaSignature(body, sign(body, 'otra'), secret)).toBe(false);
    expect(isValidMetaSignature(Buffer.from('{}'), sign(body), secret)).toBe(false);
    expect(isValidMetaSignature(body, undefined, secret)).toBe(false);
    expect(isValidMetaSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(isValidMetaSignature(body, 'sha256=zz', secret)).toBe(false);
    expect(isValidMetaSignature(undefined, sign(body), secret)).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compara textos de cualquier largo', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('deja solo dígitos y valida el largo', () => {
    expect(normalizePhone('+57 300 123 4567')).toBe('573001234567');
    expect(normalizePhone('0573001234567')).toBe('573001234567');
    expect(normalizePhone('12345')).toBeNull();
  });
});
