import { existsSync } from 'node:fs';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { MTPROTO_ADAPTER, type MtprotoAdapter } from '../hr/hr-telegram-bridge/mtproto-adapter.js';
import { KECHKI_SMENA_CAPTION } from './broadcast-caption.util.js';

/**
 * Telegram video-tarqatma — FAZA 1a (2026-07-20).
 *
 * Hozircha FAQAT test-yuborish: videoni bir marta yuklaydi va BITTA raqamga
 * (egasining o'ziga) caption bilan yuboradi — egasi aniq ko'rinishni ko'rib
 * TASDIQLAGACH, keyingi fazada barcha ~1600 mijozga throttle bilan yuboriladi.
 *
 * Video yo'li `BROADCAST_VIDEO_PATH` env'dan (VPS diskida). Caption hozircha
 * qat'iy (`KECHKI_SMENA_CAPTION`) — bold-entity bilan, markdown escape'siz.
 */
@Injectable()
export class TelegramBroadcastService {
  private readonly logger = new Logger(TelegramBroadcastService.name);

  constructor(@Inject(MTPROTO_ADAPTER) private readonly mtproto: MtprotoAdapter) {}

  /** Raqamni faqat raqamlarga keltiradi (ImportContacts uchun). */
  private normalizePhone(raw: string): string {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (digits.length < 9) {
      throw new BadRequestException(`Telefon raqami noto'g'ri: "${raw}"`);
    }
    return digits;
  }

  private videoPath(): string {
    const p = process.env.BROADCAST_VIDEO_PATH;
    if (!p) throw new BadRequestException('BROADCAST_VIDEO_PATH env sozlanmagan');
    if (!existsSync(p)) throw new BadRequestException(`Video fayl topilmadi: ${p}`);
    return p;
  }

  /**
   * POSTER (thumbnail) yo'li — `BROADCAST_THUMB_PATH`. Berilmasa/topilmasa
   * `undefined` (video posterisz ketadi — QORA ko'rinishga qaytadi). JPEG,
   * ffmpeg bilan videoning rangli kadridan olinadi (≤320px, ≤200KB).
   */
  private thumbPath(): string | undefined {
    const p = process.env.BROADCAST_THUMB_PATH;
    if (p && existsSync(p)) return p;
    if (p) this.logger.warn(`BROADCAST_THUMB_PATH topilmadi: ${p} — poster'siz ketadi`);
    return undefined;
  }

  /**
   * TEST: videoni yuklab, bitta raqamga (preview) yuboradi. Natijani KUTADI —
   * darhol «yuborildi / xato» qaytaradi (fon-navbat emas).
   */
  async sendTest(
    accountId: string,
    phoneRaw: string,
  ): Promise<{
    ok: true;
    slot: number;
    messageId: string;
    to: string;
  }> {
    const phone = this.normalizePhone(phoneRaw);
    const filePath = this.videoPath();
    const thumbPath = this.thumbPath();

    this.logger.log(
      `Video-tarqatma TEST: yuklanmoqda (acc=${accountId}, ${filePath}, poster=${thumbPath ?? 'yo`q'})`,
    );
    const { ref, slot: upSlot } = await this.mtproto.uploadBroadcastVideo({
      accountId,
      filePath,
      thumbPath,
    });
    this.logger.log(`Video yuklandi (slot=${upSlot}), TEST yuborilmoqda → ${phone}`);

    const res = await this.mtproto.sendVideoByRef({
      accountId,
      toPhone: phone,
      ref,
      caption: KECHKI_SMENA_CAPTION.text,
      boldRanges: KECHKI_SMENA_CAPTION.bold,
      quoteRanges: KECHKI_SMENA_CAPTION.quote,
    });
    this.logger.log(`Video-tarqatma TEST yuborildi → ${phone} (slot=${res.slot})`);
    return { ok: true, slot: res.slot, messageId: res.messageId, to: phone };
  }
}
