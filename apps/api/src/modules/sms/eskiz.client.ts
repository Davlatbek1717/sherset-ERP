import { tryNormalizeUzPhone } from '../shared/phone.js';

/**
 * Eskiz.uz SMS provider client.
 *
 * Eskiz exposes a JWT-bearer auth flow:
 *   1. POST /api/auth/login {email, password} → { data: { token } }
 *   2. POST /api/message/sms/send {mobile_phone, message, from?} with
 *      Authorization: Bearer <token>
 *
 * Tokens last ~30 days; on 401 we re-auth and retry once.
 *
 * Real production credentials needed (Eskiz portal account ~$5/oy
 * test mode). Without credentials, calls fail fast at auth — caller
 * surfaces the error to the SmsLog row.
 */
const ESKIZ_BASE = 'https://notify.eskiz.uz/api';
const REQUEST_TIMEOUT_MS = 15_000;

export interface EskizCredentials {
  email: string;
  password: string;
}

export interface EskizSendArgs {
  mobilePhone: string;
  message: string;
  /** Optional sender alphanumeric ID. */
  from?: string;
}

export interface EskizSendResult {
  /** Provider message ID (Eskiz returns it on accept). */
  id: string;
  status: string;
  /** Raw response payload (for log/audit). */
  raw: unknown;
}

export class EskizApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

/** Issue a fresh bearer token via /auth/login. */
export async function eskizLogin(creds: EskizCredentials): Promise<string> {
  const res = await fetch(`${ESKIZ_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await safeJson(res)) as { data?: { token?: string }; message?: string };
  if (!res.ok || !json.data?.token) {
    throw new EskizApiError(
      res.status,
      `Eskiz login HTTP ${res.status}: ${json.message ?? 'no token in response'}`,
      json,
    );
  }
  return json.data.token;
}

/**
 * Send a single SMS. Returns the Eskiz message ID on success.
 * On 401 the caller should re-authenticate via eskizLogin and retry once.
 */
export async function eskizSend(token: string, args: EskizSendArgs): Promise<EskizSendResult> {
  const body: Record<string, unknown> = {
    mobile_phone: normalizePhone(args.mobilePhone),
    message: args.message,
  };
  if (args.from) body.from = args.from;

  const res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await safeJson(res)) as Record<string, unknown>;
  if (!res.ok) {
    throw new EskizApiError(
      res.status,
      `Eskiz send HTTP ${res.status}: ${(json.message as string) ?? 'unknown error'}`,
      json,
    );
  }
  // Eskiz returns either `{id, status}` or `{data: {id, status}}` depending
  // on tier; tolerate both shapes.
  const inner = (json.data as Record<string, unknown> | undefined) ?? json;
  const id = (inner.id as string | undefined) ?? '';
  const status = (inner.status as string | undefined) ?? 'submitted';
  return { id, status, raw: json };
}

/** Verify token + balance without sending — used for test-connection. */
export async function eskizGetUser(token: string): Promise<{ ok: boolean; balance?: number }> {
  const res = await fetch(`${ESKIZ_BASE}/auth/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { ok: false };
  const json = (await safeJson(res)) as { data?: { balance?: number } };
  return { ok: true, balance: json.data?.balance };
}

/**
 * Eskiz expects `998901234567` (12 digits, no `+`). We delegate to the
 * shared UZ normaliser so a phone arriving from Counterparty (already
 * canonical `+998...`) or ad-hoc input (`90 123 45 67`) both end up as
 * the same wire string.
 *
 * Falls back to a digit-strip when the number isn't a recognised UZ
 * mobile — Eskiz itself will reject the request, surfacing a real error
 * rather than us silently sending to a bogus number.
 */
export function normalizePhone(phone: string): string {
  const canonical = tryNormalizeUzPhone(phone);
  if (canonical) return canonical.slice(1); // drop leading +
  return phone.replace(/[^0-9]/g, '');
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      const text = await res.text();
      return { message: text.slice(0, 500) };
    } catch {
      return {};
    }
  }
}
