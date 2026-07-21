import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MTPROTO_ADAPTER, type MtprotoAdapter } from '../hr/hr-telegram-bridge/mtproto-adapter.js';
import type { TgVideoRef } from '../hr/hr-telegram-bridge/telegram-client-factory.js';
import { KECHKI_SMENA_CAPTION } from './broadcast-caption.util.js';

const execFileAsync = promisify(execFile);

/**
 * Diskda saqlanadigan tarqatma holati — MIGRATSIYASIZ resumable (2026-07-21).
 * API restart/flood bo'lsa `cursorId` + `sentPhones` orqali davom etadi,
 * dublikat raqamlarga takror yubormaydi.
 */
interface BroadcastState {
  status: 'idle' | 'running' | 'done' | 'stopped' | 'halted';
  ref: TgVideoRef | null;
  videoMeta: { width: number; height: number; durationSec: number } | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  cursorId: string | null;
  sentPhones: string[];
  lastError: string | null;
  lastSentAt: string | null;
  startedAt: string;
  updatedAt: string;
}

/**
 * Telegram video-tarqatma (2026-07-20 test → 2026-07-21 ommaviy).
 *
 * XAVF: barcha mijozlarga egasining SHAXSIY raqamidan yuborish — Telegram
 * spam-blok qilishi mumkin. Yumshatish: ketma-ket (throttle 5–9s + jitter),
 * PEER_FLOOD/ban aniqlansa DARHOL to'xtaydi, kichik guruhdan boshlash (`limit`),
 * dublikat raqamga takror yubormaydi, resumable (diskда holat).
 *
 * Video/poster yo'li env'dan; caption qat'iy (`KECHKI_SMENA_CAPTION`).
 */
@Injectable()
export class TelegramBroadcastService {
  private readonly logger = new Logger(TelegramBroadcastService.name);
  /** Bir vaqtда bitta run — ikkinchi start'ni bloklaydi. */
  private running = false;
  private stopRequested = false;

  constructor(
    @Inject(MTPROTO_ADAPTER) private readonly mtproto: MtprotoAdapter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  // ─── util ────────────────────────────────────────────────────────────

  /** Raqamni faqat raqamlarga keltiradi; noto'g'ri bo'lsa null (skip). */
  private normalizePhoneSafe(raw: string | null): string | null {
    const digits = (raw ?? '').replace(/\D/g, '');
    return digits.length >= 9 ? digits : null;
  }

  private normalizePhone(raw: string): string {
    const p = this.normalizePhoneSafe(raw);
    if (!p) throw new BadRequestException(`Telefon raqami noto'g'ri: "${raw}"`);
    return p;
  }

  private videoPath(): string {
    const p = process.env.BROADCAST_VIDEO_PATH;
    if (!p) throw new BadRequestException('BROADCAST_VIDEO_PATH env sozlanmagan');
    if (!existsSync(p)) throw new BadRequestException(`Video fayl topilmadi: ${p}`);
    return p;
  }

  private thumbPath(): string | undefined {
    const p = process.env.BROADCAST_THUMB_PATH;
    if (p && existsSync(p)) return p;
    if (p) this.logger.warn(`BROADCAST_THUMB_PATH topilmadi: ${p} — poster'siz ketadi`);
    return undefined;
  }

  private statePath(): string {
    return process.env.BROADCAST_STATE_PATH ?? '/root/broadcast_state.json';
  }

  /** Throttle: base (env yoki 5000ms) + tasodifiy jitter (0–4000ms). */
  private throttleMs(): number {
    const base = Number(process.env.BROADCAST_THROTTLE_MS) || 5000;
    return base + Math.floor(Math.random() * 4000);
  }

  private async probeVideo(
    filePath: string,
  ): Promise<{ width: number; height: number; durationSec: number } | undefined> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration',
        '-of',
        'json',
        filePath,
      ]);
      const j = JSON.parse(stdout) as {
        streams?: { width?: number; height?: number }[];
        format?: { duration?: string };
      };
      const s = j.streams?.[0] ?? {};
      const width = Number(s.width) || 0;
      const height = Number(s.height) || 0;
      const durationSec = Math.round(Number(j.format?.duration ?? 0)) || 0;
      if (width > 0 && height > 0) return { width, height, durationSec };
      return undefined;
    } catch (e) {
      this.logger.warn(`ffprobe xato: ${(e as Error).message} — video atributsiz`);
      return undefined;
    }
  }

  private loadState(): BroadcastState | null {
    const p = this.statePath();
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as BroadcastState;
    } catch (e) {
      this.logger.warn(`Holat faylini o'qib bo'lmadi: ${(e as Error).message}`);
      return null;
    }
  }

  private saveState(s: BroadcastState): void {
    s.updatedAt = new Date().toISOString();
    try {
      writeFileSync(this.statePath(), JSON.stringify(s));
    } catch (e) {
      this.logger.error(`Holat faylini yozib bo'lmadi: ${(e as Error).message}`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  // ─── TEST (bitta raqam) ──────────────────────────────────────────────

  async sendTest(
    accountId: string,
    phoneRaw: string,
  ): Promise<{ ok: true; slot: number; messageId: string; to: string }> {
    const phone = this.normalizePhone(phoneRaw);
    const filePath = this.videoPath();
    const thumbPath = this.thumbPath();
    const videoMeta = await this.probeVideo(filePath);

    const { ref, slot: upSlot } = await this.mtproto.uploadBroadcastVideo({
      accountId,
      filePath,
      thumbPath,
      videoMeta,
    });
    this.logger.log(`Video-tarqatma TEST yuklandi (slot=${upSlot}) → ${phone}`);
    const res = await this.mtproto.sendVideoByRef({
      accountId,
      toPhone: phone,
      ref,
      caption: KECHKI_SMENA_CAPTION.text,
      boldRanges: KECHKI_SMENA_CAPTION.bold,
      quoteRanges: KECHKI_SMENA_CAPTION.quote,
    });
    return { ok: true, slot: res.slot, messageId: res.messageId, to: phone };
  }

  // ─── OMMAVIY (barcha mijozlar) ───────────────────────────────────────

  /** Joriy holatni qaytaradi (progress kuzatish). */
  getStatus(): BroadcastState | { status: 'none' } {
    return this.loadState() ?? { status: 'none' };
  }

  /** Ishlayotgan tarqatmani to'xtatadi (holat saqlanadi — keyin davom etsa bo'ladi). */
  stop(): { ok: true } {
    this.stopRequested = true;
    const s = this.loadState();
    if (s && s.status === 'running') {
      s.status = 'stopped';
      this.saveState(s);
    }
    return { ok: true };
  }

  /**
   * Tarqatmani BOSHLAYDI/DAVOM ETTIRADI — shu run'да ko'pi bilan `limit` ta
   * REAL yuborish (sent+failed, dup-skip hisoblanmaydi), keyin to'xtaydi
   * (`idle`). Kichik guruhdan boshlash uchun: avval limit=15 → tekshir →
   * keyin limit=2000 (qolgani). Fon'да ishlaydi — `getStatus` bilan kuzat.
   */
  async startRun(
    accountId: string,
    limit: number,
  ): Promise<{ started: boolean; reason?: string; status: BroadcastState | { status: string } }> {
    if (this.running) {
      return { started: false, reason: 'already_running', status: this.getStatus() };
    }
    // Video/poster/o'lchamни OLDINDAN tekshiramiz (xato bo'lsa run boshlamaymiz).
    const filePath = this.videoPath();
    const thumbPath = this.thumbPath();
    const videoMeta = await this.probeVideo(filePath);

    this.running = true;
    this.stopRequested = false;
    // Fon'da — javobni kutmaymiz.
    void this.runLoop(accountId, limit, filePath, thumbPath, videoMeta).catch((e: Error) => {
      this.logger.error(`Tarqatma runLoop xatosi: ${e.message}`);
      this.running = false;
    });
    return { started: true, status: this.getStatus() };
  }

  private async runLoop(
    accountId: string,
    limit: number,
    filePath: string,
    thumbPath: string | undefined,
    videoMeta: { width: number; height: number; durationSec: number } | undefined,
  ): Promise<void> {
    let state = this.loadState();
    if (!state) {
      const total = await this.prisma.client.counterparty.count({
        where: { accountId, archived: false, phone: { not: null } },
      });
      state = {
        status: 'running',
        ref: null,
        videoMeta: videoMeta ?? null,
        total,
        sent: 0,
        failed: 0,
        skipped: 0,
        cursorId: null,
        sentPhones: [],
        lastError: null,
        lastSentAt: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    state.status = 'running';
    this.saveState(state);

    // Videoni BIR MARTA yuklaymiz (holatда ref bo'lmasa).
    if (!state.ref) {
      this.logger.log('Tarqatma: video yuklanmoqda (bir marta)…');
      const { ref } = await this.mtproto.uploadBroadcastVideo({
        accountId,
        filePath,
        thumbPath,
        videoMeta,
      });
      state.ref = ref;
      this.saveState(state);
    }

    const sentSet = new Set(state.sentPhones);
    let attempts = 0; // REAL Telegram urinishlar (sent+failed) — limit shunga

    try {
      while (attempts < limit) {
        if (this.stopRequested) {
          // 'halted' (spam-blok) ni saqlaymiz — u to'xtashдан ko'ra muhimroq signal.
          if (state.status !== 'halted') state.status = 'stopped';
          break;
        }
        // Keyingi sahifa (cursorдан keyin, telefonli, arxiv emas).
        const page = await this.prisma.client.counterparty.findMany({
          where: {
            accountId,
            archived: false,
            phone: { not: null },
            ...(state.cursorId ? { id: { gt: state.cursorId } } : {}),
          },
          orderBy: { id: 'asc' },
          take: 30,
          select: { id: true, phone: true, name: true },
        });
        if (page.length === 0) {
          state.status = 'done';
          break;
        }
        for (const cp of page) {
          if (attempts >= limit || this.stopRequested) break;
          state.cursorId = cp.id;
          const phone = this.normalizePhoneSafe(cp.phone);
          if (!phone || sentSet.has(phone)) {
            state.skipped++;
            this.saveState(state);
            continue;
          }
          try {
            await this.mtproto.sendVideoByRef({
              accountId,
              toPhone: phone,
              ref: state.ref as TgVideoRef,
              caption: KECHKI_SMENA_CAPTION.text,
              boldRanges: KECHKI_SMENA_CAPTION.bold,
              quoteRanges: KECHKI_SMENA_CAPTION.quote,
            });
            sentSet.add(phone);
            state.sent++;
            state.lastSentAt = new Date().toISOString();
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            state.lastError = msg.slice(0, 300);
            // File-reference eskirgan bo'lsa — qayta yuklab, SHU raqamni qayta urinamiz.
            if (/FILE_REFERENCE|file reference/i.test(msg)) {
              this.logger.warn('File-reference eskirdi — video qayta yuklanmoqda…');
              try {
                const { ref } = await this.mtproto.uploadBroadcastVideo({
                  accountId,
                  filePath,
                  thumbPath,
                  videoMeta,
                });
                state.ref = ref;
                await this.mtproto.sendVideoByRef({
                  accountId,
                  toPhone: phone,
                  ref,
                  caption: KECHKI_SMENA_CAPTION.text,
                  boldRanges: KECHKI_SMENA_CAPTION.bold,
                  quoteRanges: KECHKI_SMENA_CAPTION.quote,
                });
                sentSet.add(phone);
                state.sent++;
                state.lastSentAt = new Date().toISOString();
              } catch (e2) {
                state.failed++;
                state.lastError = (e2 as Error).message?.slice(0, 300) ?? msg;
              }
            } else if (/PEER_FLOOD|USER_DEACTIVATED|FROZEN|SPAM|USER_RESTRICTED/i.test(msg)) {
              // Telegram akkauntni spam deb chekladi — DARHOL to'xtaymiz (yomonlashmasin).
              this.logger.error(`SPAM-BLOK aniqlandi (${msg}) — tarqatma TO'XTATILDI`);
              state.failed++;
              state.status = 'halted';
              this.stopRequested = true;
              this.saveState(state);
              break;
            } else {
              // Oddiy xato (raqam Telegram'да yo'q / privacy) — o'tkazamiz.
              state.failed++;
            }
          }
          sentSet.add(phone); // qayta urinmaslik uchun (muvaffaqiyatsiz bo'lsa ham)
          state.sentPhones = [...sentSet];
          attempts++;
          this.saveState(state);
          await this.sleep(this.throttleMs());
        }
      }
      if (state.status === 'running') state.status = 'idle';
    } finally {
      this.saveState(state);
      this.running = false;
    }
    this.logger.log(
      `Tarqatma run tugadi: status=${state.status} sent=${state.sent} failed=${state.failed} skipped=${state.skipped}`,
    );
  }
}
