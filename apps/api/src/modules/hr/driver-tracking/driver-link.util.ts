import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Haydovchi PAROLSIZ magic-link tokeni — SAQLANMAYDI (migration YO'Q). Token
 * `<b64(accountId:employeeId)>.<hmac>` ko'rinishida; hmac = HMAC-SHA256 (kalit =
 * JWT_SECRET, purpose-prefixli) ⇒ soxtalashtirib bo'lmaydi va accountId/employeeId
 * token ICHIDAN olinadi (URL'дан EMAS) ⇒ cross-tenant yo'q. Faqat shu bitta
 * haydovchining GPS-ping + smenasi uchun amal qiladi (cheklangan blast-radius).
 * Bekor qilish: JWT_SECRET rotatsiyasi (barcha linklar) — v1 uchun yetarli.
 */
const PURPOSE = 'driver-link:v1';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET yo‘q — haydovchi-link imzolab bo‘lmaydi');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`${PURPOSE}:${payload}`).digest('base64url');
}

/** accountId + employeeId'дан barqaror (deterministik) haydovchi-token yasaydi. */
export function signDriverToken(accountId: string, employeeId: string): string {
  const payload = Buffer.from(`${accountId}:${employeeId}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Tokenni tekshiradi; to‘g‘ri bo‘lsa {accountId, employeeId}, aks holda null. */
export function verifyDriverToken(token: string): { accountId: string; employeeId: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  // Constant-time — timing-attack himoyasi.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const [accountId, employeeId] = decoded.split(':');
  if (!accountId || !employeeId) return null;
  return { accountId, employeeId };
}
