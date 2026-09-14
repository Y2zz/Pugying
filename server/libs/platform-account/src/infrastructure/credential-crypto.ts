import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function resolveKey(): Buffer {
  const secret = process.env.PLATFORM_CREDENTIAL_SECRET?.trim();
  if (!secret) {
    throw new Error('PLATFORM_CREDENTIAL_SECRET is required');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptCredentialPayload(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, resolveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptCredentialPayload(cipherText: string): string {
  const [ivB64, tagB64, dataB64] = cipherText.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid credential cipher format');
  }
  const decipher = createDecipheriv(
    ALGO,
    resolveKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
