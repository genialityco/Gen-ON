import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const key = randomBytes(32).toString('base64');

  beforeEach(() => {
    process.env.SECRETS_KEY = key;
  });

  it('cifra y descifra', () => {
    const c = new CryptoService();
    const enc = c.encrypt('EAAG-token');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('EAAG');
    expect(c.decrypt(enc)).toBe('EAAG-token');
  });

  it('falla con otra clave o si se altera el texto', () => {
    const enc = new CryptoService().encrypt('secreto');
    process.env.SECRETS_KEY = randomBytes(32).toString('base64');
    expect(() => new CryptoService().decrypt(enc)).toThrow();
    process.env.SECRETS_KEY = key;
    const parts = enc.split(':');
    parts[3] = Buffer.from('otro').toString('base64');
    expect(() => new CryptoService().decrypt(parts.join(':'))).toThrow();
  });

  it('exige una clave de 32 bytes', () => {
    process.env.SECRETS_KEY = 'corta';
    expect(() => new CryptoService()).toThrow('SECRETS_KEY');
  });
});
