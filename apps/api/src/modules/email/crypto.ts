import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM cipher for SMTP password storage.
 *
 * Format: base64( iv:12bytes || authTag:16bytes || cipher:Nbytes )
 *
 * Key derivation: scrypt(EMAIL_ENCRYPTION_KEY env var, "moysklad-email") → 32 bytes.
 *
 * EMAIL_ENCRYPTION_KEY MUST be set in production. In dev we fall back to
 * a hard-coded constant so first-time-setup works without env config; the
 * service logs a warning at boot when the fallback is used. Rotation
 * should be done by re-saving every EmailConfig (which re-encrypts under
 * the new key).
 */
const DEV_FALLBACK_KEY = 'dev-only-change-me-in-production';
const KEY_SALT = 'moysklad-email-v1';
const ALG = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const passphrase = process.env.EMAIL_ENCRYPTION_KEY ?? DEV_FALLBACK_KEY;
  if (passphrase === DEV_FALLBACK_KEY && process.env.NODE_ENV === 'production') {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY env var must be set in production — refusing to start with dev fallback',
    );
  }
  cachedKey = scryptSync(passphrase, KEY_SALT, 32);
  return cachedKey;
}

export function encryptPassword(plain: string): string {
  if (plain.length === 0) throw new Error('encryptPassword: empty input');
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptPassword(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) throw new Error('decryptPassword: ciphertext too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const key = deriveKey();
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Test-only helper to reset the cached key — used when tests rotate
 * the EMAIL_ENCRYPTION_KEY env var to verify ciphertexts re-decrypt
 * correctly under the new key.
 */
export function _resetKeyCache(): void {
  cachedKey = null;
}
