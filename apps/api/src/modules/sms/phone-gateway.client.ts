import { tryNormalizeUzPhone } from '../shared/phone.js';

/**
 * «Telefon-gateway» SMS provayderi — foydalanuvchining O'Z SIM-kartasi orqali
 * yuborish (Eskiz'ga pul to'lamasdan, SIM paketi doirasida bepul).
 *
 * Ishlash sxemasi: Android telefonda «SMS Gateway for Android» ilovasi (ochiq
 * kodli `sms-gate.app`) BULUT rejimida ishlaydi → biz bulut API'ga POST qilamiz →
 * bulut telefonga uzatadi → telefon SIM orqali real SMS yuboradi.
 *
 *   POST https://api.sms-gate.app/3rdparty/v1/messages
 *   Authorization: Basic base64(username:password)   (ilova bergan login/parol)
 *   Body: { "textMessage": { "text": "..." }, "phoneNumbers": ["+998..."] }
 *
 * Manba: https://docs.sms-gate.app/features/sending-messages/
 *
 * baseUrl konfiguratsiyalanadi (o'z-hosting yoki boshqa mos ilova uchun), lekin
 * standart — sms-gate.app'ning ochiq buluti.
 */
const CLOUD_BASE = 'https://api.sms-gate.app/3rdparty/v1';
const REQUEST_TIMEOUT_MS = 20_000;

export interface PhoneGatewayCredentials {
  username: string;
  password: string;
  /** Standart bulut o'rniga o'z-hosting URL (ixtiyoriy). `/messages`siz baza. */
  baseUrl?: string | null;
}

export interface PhoneGatewaySendArgs {
  phone: string;
  text: string;
}

export interface PhoneGatewaySendResult {
  /** Gateway xabar id'si (holatni keyin so'rash uchun). */
  id: string;
  raw: unknown;
}

export class PhoneGatewayApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

function baseOf(creds: PhoneGatewayCredentials): string {
  return (creds.baseUrl?.trim() || CLOUD_BASE).replace(/\/+$/, '');
}

function basicAuth(creds: PhoneGatewayCredentials): string {
  return Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
}

/** SIM-gateway E.164 kutadi (`+998...`); kontragent telefoni allaqachon shunday. */
export function toE164(phone: string): string {
  const canonical = tryNormalizeUzPhone(phone);
  if (canonical) return canonical; // +998...
  const digits = phone.replace(/[^0-9]/g, '');
  return phone.trim().startsWith('+') ? `+${digits}` : digits ? `+${digits}` : phone;
}

/** Bitta SMS yuboradi. Muvaffaqiyatда gateway xabar id'sini qaytaradi. */
export async function phoneGatewaySend(
  creds: PhoneGatewayCredentials,
  args: PhoneGatewaySendArgs,
): Promise<PhoneGatewaySendResult> {
  const res = await fetch(`${baseOf(creds)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth(creds)}`,
    },
    body: JSON.stringify({
      textMessage: { text: args.text },
      phoneNumbers: [toE164(args.phone)],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await safeJson(res)) as Record<string, unknown>;
  if (!res.ok) {
    throw new PhoneGatewayApiError(
      res.status,
      `Telefon-gateway HTTP ${res.status}: ${(json.message as string) ?? 'xato'}`,
      json,
    );
  }
  const id = (json.id as string | undefined) ?? '';
  return { id, raw: json };
}

/**
 * Ulanishni tekshirish — login/parol to'g'riligini SMS yubormasdan sinaydi.
 * `GET /device` auth TALAB QILADI (soxta login/parol → 401), shuning uchun
 * `/health`dan farqli o'laroq haqiqatan credential'ni tekshiradi + ulangan
 * telefon(lar)ni ko'rsatadi. (Manba: sms-gate.app 3rdparty API.)
 */
export async function phoneGatewayCheck(
  creds: PhoneGatewayCredentials,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${baseOf(creds)}/device`, {
      headers: { Authorization: `Basic ${basicAuth(creds)}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Login yoki parol xato' };
    }
    if (res.ok) {
      const json = (await safeJson(res)) as unknown;
      const count = Array.isArray(json) ? json.length : undefined;
      return {
        ok: true,
        message:
          count === 0
            ? "Login OK, lekin ulangan telefon YO'Q — ilovada bulut rejimini yoqing"
            : `Ulanish OK${count ? ` · ${count} telefon` : ''}`,
      };
    }
    return { ok: false, message: `Gateway HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message ?? 'Ulanish xatosi' };
  }
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
