import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const env = process.env.HR_SESSION_KEY;
  if (!env) {
    throw new Error('HR_SESSION_KEY env variable not set');
  }
  const key = Buffer.from(env, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `HR_SESSION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

export function encryptHrSession(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard nonce length
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptHrSession(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid HR session ciphertext format (expected iv:cipher:tag)');
  }
  const [ivHex, encHex, tagHex] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}
