import { Inject, Injectable, Logger } from '@nestjs/common';
import { decryptHrSession } from '../hr/hr-shared/crypto.util.js';
import { normalizeTelegramPhone } from '../hr/hr-shared/phone-normalize.util.js';
import { HrTelegramAccountService } from '../hr/hr-telegram-account/hr-telegram-account.service.js';
import {
  TELEGRAM_CLIENT_FACTORY,
  type TelegramClientFactory,
  isGramjsFloodError,
  isUnresolvablePeerError,
} from '../hr/hr-telegram-bridge/telegram-client-factory.js';

/**
 * Kontragent Telegram profilini AVTOMATIK topish (2026-07-17 talab: «kontragent
 * raqamida telegram bo'lsa avtomatik qidirib topa olishi kerak va shu profil
 * chiqishi kerak»).
 *
 * Ulangan RAQAM (slot-1 userbot sessiyasi) orqali MTProto `getEntity(phone)` —
 * telefon Telegram'da bo'lsa ism/username qaytadi, bo'lmasa found:false
 * («Контакт не найден в Telegram»). Qisqa-muddatli klient (connect → getEntity →
 * disconnect) va 5-daqiqalik in-memory kesh — worker'ning send-klientiga xalaqit
 * bermaydi, FLOOD_WAIT'dan himoya. ALOHIDA fayl: mtproto-bridge fayllariga
 * tegmaydi (parallel sessiya o'shalarni tahrirlayapti).
 */
export interface TelegramContactProfile {
  /** Ulangan (faol) raqam bormi — yo'q bo'lsa panel «raqam ulang» deydi. */
  available: boolean;
  /** Shu telefon Telegram'da topildimi. */
  found: boolean;
  name?: string;
  username?: string;
}

@Injectable()
export class TelegramLookupService {
  private readonly logger = new Logger(TelegramLookupService.name);
  private readonly cache = new Map<string, { at: number; val: TelegramContactProfile }>();
  private static readonly TTL_MS = 5 * 60_000;

  constructor(
    @Inject(TELEGRAM_CLIENT_FACTORY) private readonly factory: TelegramClientFactory,
    @Inject(HrTelegramAccountService) private readonly accounts: HrTelegramAccountService,
  ) {}

  async lookup(
    accountId: string,
    rawPhone: string | null | undefined,
  ): Promise<TelegramContactProfile> {
    let phone: string | null = null;
    try {
      phone = normalizeTelegramPhone(rawPhone ?? null);
    } catch {
      phone = null;
    }
    if (!phone) return { available: true, found: false };

    // Ulangan raqam (slot-1 faol sessiya). Yo'q bo'lsa — lookup imkonsiz.
    const acct = await this.accounts.findActiveBySlot(accountId, 1);
    if (!acct || !acct.sessionEncrypted) return { available: false, found: false };

    const key = `${accountId}:${phone}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TelegramLookupService.TTL_MS) return hit.val;

    let apiHash: string;
    let sessionString: string;
    try {
      apiHash = decryptHrSession(acct.apiHashEncrypted);
      sessionString = decryptHrSession(acct.sessionEncrypted);
    } catch (e) {
      this.logger.warn(`Telegram lookup: kredensial dekript xato: ${(e as Error).message}`);
      return { available: false, found: false };
    }

    const client = this.factory.createClient({ apiId: acct.apiId, apiHash, sessionString });
    let result: TelegramContactProfile;
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        return { available: false, found: false };
      }
      const entity = await client.getEntity(phone);
      result = { available: true, found: true, ...extractProfile(entity) };
    } catch (e) {
      if (isUnresolvablePeerError(e)) {
        // Telefon Telegram'da yo'q / maxfiylik — «Kontakt topilmadi».
        result = { available: true, found: false };
      } else if (isGramjsFloodError(e)) {
        this.logger.warn(`Telegram lookup FLOOD_WAIT ${e.seconds}s acc=${accountId}`);
        result = { available: true, found: false };
      } else {
        this.logger.warn(`Telegram lookup xato acc=${accountId}: ${(e as Error).message}`);
        result = { available: true, found: false };
      }
    } finally {
      await client.disconnect().catch(() => {});
    }
    this.cache.set(key, { at: Date.now(), val: result });
    return result;
  }
}

/** gramjs User/Chat entity'sidan ism + username ajratadi (duck-typed). */
function extractProfile(entity: unknown): { name?: string; username?: string } {
  if (typeof entity !== 'object' || entity === null) return {};
  const e = entity as {
    firstName?: string;
    lastName?: string;
    username?: string;
    title?: string;
  };
  const name = [e.firstName, e.lastName].filter(Boolean).join(' ') || e.title || undefined;
  return { name: name || undefined, username: e.username || undefined };
}
