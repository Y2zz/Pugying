import { decryptCredentialPayload, encryptCredentialPayload } from './credential-crypto';

describe('credential-crypto', () => {
  const ORIGINAL_PLATFORM_SECRET = process.env.PLATFORM_CREDENTIAL_SECRET;
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  afterEach(() => {
    if (ORIGINAL_PLATFORM_SECRET === undefined) {
      delete process.env.PLATFORM_CREDENTIAL_SECRET;
    } else {
      process.env.PLATFORM_CREDENTIAL_SECRET = ORIGINAL_PLATFORM_SECRET;
    }
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  it('round-trips a payload', () => {
    const plain = JSON.stringify({ cookies: [{ name: 'sid', value: 'abc' }] });

    const cipher = encryptCredentialPayload(plain);

    expect(cipher).not.toContain('abc');
    expect(decryptCredentialPayload(cipher)).toBe(plain);
  });

  it('produces iv.tag.data base64 segments', () => {
    const cipher = encryptCredentialPayload('hello');

    const parts = cipher.split('.');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(12);
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(16);
  });

  it('uses a random IV so identical payloads encrypt differently', () => {
    const first = encryptCredentialPayload('same-payload');
    const second = encryptCredentialPayload('same-payload');

    expect(first).not.toBe(second);
    expect(decryptCredentialPayload(first)).toBe('same-payload');
    expect(decryptCredentialPayload(second)).toBe('same-payload');
  });

  it('round-trips non-ASCII payloads', () => {
    const plain = '{"nickname":"抖音账号🎬"}';

    expect(decryptCredentialPayload(encryptCredentialPayload(plain))).toBe(plain);
  });

  it('falls back to JWT_SECRET when PLATFORM_CREDENTIAL_SECRET is unset', () => {
    delete process.env.PLATFORM_CREDENTIAL_SECRET;
    process.env.JWT_SECRET = 'jwt-only-secret';
    const cipher = encryptCredentialPayload('fallback-check');

    delete process.env.JWT_SECRET;
    process.env.PLATFORM_CREDENTIAL_SECRET = 'jwt-only-secret';

    expect(decryptCredentialPayload(cipher)).toBe('fallback-check');
  });

  it('prefers PLATFORM_CREDENTIAL_SECRET over JWT_SECRET', () => {
    process.env.PLATFORM_CREDENTIAL_SECRET = 'primary-secret';
    process.env.JWT_SECRET = 'other-secret';
    const cipher = encryptCredentialPayload('precedence-check');

    delete process.env.JWT_SECRET;

    expect(decryptCredentialPayload(cipher)).toBe('precedence-check');
  });

  it('fails to decrypt with a different secret', () => {
    process.env.PLATFORM_CREDENTIAL_SECRET = 'secret-one';
    const cipher = encryptCredentialPayload('secret-data');

    process.env.PLATFORM_CREDENTIAL_SECRET = 'secret-two';

    expect(() => decryptCredentialPayload(cipher)).toThrow();
  });

  it('rejects malformed cipher text', () => {
    expect(() => decryptCredentialPayload('not-a-cipher')).toThrow('Invalid credential cipher format');
    expect(() => decryptCredentialPayload('only.two')).toThrow('Invalid credential cipher format');
  });

  it('rejects tampered cipher text (auth tag mismatch)', () => {
    const cipher = encryptCredentialPayload('integrity-check');
    const [iv, tag, data] = cipher.split('.');
    const tampered = Buffer.from(data, 'base64');
    tampered[0] = tampered[0] ^ 0xff;

    expect(() => decryptCredentialPayload(`${iv}.${tag}.${tampered.toString('base64')}`)).toThrow();
  });
});
