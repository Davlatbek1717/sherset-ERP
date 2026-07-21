import { execFile } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
  /** Kunlik-limit hisobi (ban-himoya, 2026-07-21). Eski state fayllarда yo'q → undefined. */
  sentToday?: number;
  sentTodayDate?: string; // YYYY-MM-DD (UTC)
}

/**
 * Telegram TO'XTATISH signallari — akkaunt-darajali (spam-blok, flood, yoki
 * SESSIYA O'LIMI: AUTH_KEY_UNREGISTERED / 401 / UNAUTHORIZED). Bularдан birortasi
 * chiqsa tarqatma DARHOL to'xtaydi va joriy qabul-qiluvchini "yuborilgan" deb
 * BELGILAMAYDI (qayta login'дан keyin davomда o'sha raqamdan boshlanadi).
 * Bu — 2026-07-21 ommaviy-yuborishда ~90 raqam "urinildi" deb kuyib ketgan
 * bug'ning tuzatilishi (session o'lganда permanent-fail deb belgilanardi).
 */
const BROADCAST_HALT_RE =
  /PEER_FLOOD|FLOOD_WAIT|USER_DEACTIVATED|FROZEN|SPAM|USER_RESTRICTED|AUTH_KEY|UNAUTHORIZED|SESSION_REVOKED|no_active_slot|not_configured|\b401\b/i;

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

  /**
   * Throttle: base (env `BROADCAST_THROTTLE_MS` yoki 15000ms) + tasodifiy jitter
   * (0–10000ms) → ~15–25s. Ban-himoya (2026-07-21): notanish raqamlarga shaxsiy
   * userbotdan yuborishда sekin tezlik SHART. mtproto-worker'ning per-send
   * throttle'i (~3s) ustiga qo'shiladi.
   */
  private throttleMs(): number {
    const base = Number(process.env.BROADCAST_THROTTLE_MS) || 15000;
    return base + Math.floor(Math.random() * 10000);
  }

  /**
   * Kunlik limit (ban-himoya, 2026-07-21): bir kunda ko'pi bilan shuncha REAL
   * yuborish. `limit` bitta-run cheklovi bo'lsa, bu — SUTKALIK cheklov (kimdir
   * limit=2000 chaqirsa ham). Default 30 (xavfsiz "kuniga bir necha o'nlab"),
   * `BROADCAST_DAILY_CAP` bilan sozlanadi. XAVF: oshirsangiz ban ehtimoli ortadi.
   */
  private dailyCap(): number {
    return Number(process.env.BROADCAST_DAILY_CAP) || 30;
  }

  private todayStr(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  }

  /** Bugun kunlik-limit to'lganmi? Yangi kun bo'lsa — yo'q (byudjet yangilanadi). */
  private dailyCapReached(state: BroadcastState): boolean {
    if (state.sentTodayDate !== this.todayStr()) return false;
    return (state.sentToday ?? 0) >= this.dailyCap();
  }

  /** Muvaffaqiyatli yuborishдан keyin bugungi hisobni +1 (kun o'zgarsa reset). */
  private bumpDaily(state: BroadcastState): void {
    const today = this.todayStr();
    if (state.sentTodayDate !== today) {
      state.sentTodayDate = today;
      state.sentToday = 0;
    }
    state.sentToday = (state.sentToday ?? 0) + 1;
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

  /**
   * Holatni o'qiydi. Fayl YO'Q → null (haqiqiy yangi run). Fayl BOR lekin buzuq
   * (masalan yozish paytida SIGKILL bo'lgan) → THROW: null qaytarish nolдан
   * qayta boshlashga (hammaga TAKROR yuborishga) olib kelardi — bu XAVFLI.
   */
  private loadState(): BroadcastState | null {
    const p = this.statePath();
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf8');
    try {
      return JSON.parse(raw) as BroadcastState;
    } catch (e) {
      throw new Error(
        `Tarqatma holat fayli buzuq (${p}) — nolдан qayta boshlash XAVFLI (hammaga takror ketardi). Qo'lда tekshiring: ${(e as Error).message}`,
      );
    }
  }

  /** ATOMIK yozish (tmp → rename): yarim-yozilgan buzuq fayl qolmasin. */
  private saveState(s: BroadcastState): void {
    s.updatedAt = new Date().toISOString();
    const p = this.statePath();
    try {
      writeFileSync(`${p}.tmp`, JSON.stringify(s));
      renameSync(`${p}.tmp`, p);
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
    force = false,
  ): Promise<{ started: boolean; reason?: string; status: BroadcastState | { status: string } }> {
    if (this.running) {
      return { started: false, reason: 'already_running', status: this.getStatus() };
    }
    // BUG-1 fix: `running`ни HAR QANDAY await'дан OLDIN egallaymiz — aks holda
    // ikki parallel start (double-click / retry) ikkalasi ham running=false
    // ko'rib, ikkita runLoop ishga tushirib, HAMMAGA IKKI MARTA yuborardi.
    this.running = true;
    try {
      const existing = this.loadState(); // buzuq bo'lsa throw (BUG-2)
      // BUG-4 fix: spam-blok (halted) bo'lsa — `force` bo'lmasa qayta boshlamaymiz
      // (akkauntni yana o'sha holatga qaytarmaslik uchun).
      if (existing?.status === 'halted' && !force) {
        this.running = false;
        return { started: false, reason: 'halted_needs_force', status: existing };
      }
      const filePath = this.videoPath();
      const thumbPath = this.thumbPath();
      const videoMeta = await this.probeVideo(filePath);
      this.stopRequested = false;
      // Fon'da — javobni kutmaymiz.
      void this.runLoop(accountId, limit, filePath, thumbPath, videoMeta).catch((e: Error) => {
        this.logger.error(`Tarqatma runLoop xatosi: ${e.message}`);
        this.running = false;
      });
      return { started: true, status: this.getStatus() };
    } catch (e) {
      this.running = false; // tekshiruv/validatsiya xatosida qulfни bo'shatamiz
      throw e;
    }
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
        sentToday: 0,
        sentTodayDate: this.todayStr(),
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
    let dailyCapHit = false;

    try {
      while (attempts < limit && !this.stopRequested && !dailyCapHit) {
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
          if (attempts >= limit || this.stopRequested || dailyCapHit) break;
          const phone = this.normalizePhoneSafe(cp.phone);
          // Yaroqsiz / allaqachon yuborilgan — HAQIQIY skip: cursor oldinga suriladi.
          if (!phone || sentSet.has(phone)) {
            state.cursorId = cp.id;
            state.skipped++;
            this.saveState(state);
            continue;
          }
          // Kunlik limit to'ldi — cursor'ni SURMAYMIZ (ertaga aynan shu raqamdan davom).
          if (this.dailyCapReached(state)) {
            dailyCapHit = true;
            state.lastError = `DAILY_CAP_REACHED (${this.dailyCap()}/kun)`;
            this.logger.warn(
              `Kunlik limit (${this.dailyCap()}) to'ldi — bugungi tarqatma to'xtadi (ertaga davom etadi)`,
            );
            break;
          }
          const outcome = await this.attemptSend(
            accountId,
            phone,
            state,
            filePath,
            thumbPath,
            videoMeta,
          );
          if (outcome === 'halt') {
            // Akkaunt-blok / sessiya-o'lim: cursor'ni SURMAYMIZ, raqamni KUYDIRMAYMIZ →
            // qayta login'дан keyin davomда aynan shu raqamdan boshlanadi (kuygan
            // ~90 raqam bug'ining tuzatilishi).
            this.logger.error(`TO'XTATISH signali — tarqatma TO'XTATILDI: ${state.lastError}`);
            state.status = 'halted';
            this.stopRequested = true;
            this.saveState(state);
            break;
          }
          // Terminal natija (sent | permfail): cursor oldinga, raqamni belgilaymiz.
          state.cursorId = cp.id;
          sentSet.add(phone);
          state.sentPhones = [...sentSet];
          if (outcome === 'sent') {
            state.sent++;
            this.bumpDaily(state);
            state.lastSentAt = new Date().toISOString();
          } else {
            state.failed++;
          }
          attempts++;
          this.saveState(state);
          await this.sleep(this.throttleMs());
        }
      }
      // Yakuniy status (halted/done allaqachon o'rnatilgan bo'lsa — tegilmaydi).
      if (state.status === 'running') {
        state.status = this.stopRequested ? 'stopped' : 'idle';
      }
    } finally {
      this.saveState(state);
      this.running = false;
    }
    this.logger.log(
      `Tarqatma run tugadi: status=${state.status} sent=${state.sent} failed=${state.failed} skipped=${state.skipped}`,
    );
  }

  /**
   * Bitta raqamga video-referensni yuboradi. Natija:
   *  - `sent`     — muvaffaqiyat
   *  - `permfail` — shu RAQAM Telegram'да yo'q / privacy → qayta urinilmaydi (kuydiriladi)
   *  - `halt`     — AKKAUNT-darajali blok (spam/flood/sessiya-o'lim) → tarqatma to'xtaydi,
   *                 raqam KUYDIRILMAYDI (qayta login'дан keyin davom etadi)
   * FILE_REFERENCE eskirса — videoni bir marta qayta yuklab, o'sha raqamni qayta urinadi.
   * `state.ref`/`state.lastError` mutatsiya qilinadi.
   */
  private async attemptSend(
    accountId: string,
    phone: string,
    state: BroadcastState,
    filePath: string,
    thumbPath: string | undefined,
    videoMeta: { width: number; height: number; durationSec: number } | undefined,
  ): Promise<'sent' | 'permfail' | 'halt'> {
    const send = (ref: TgVideoRef) =>
      this.mtproto.sendVideoByRef({
        accountId,
        toPhone: phone,
        ref,
        caption: KECHKI_SMENA_CAPTION.text,
        boldRanges: KECHKI_SMENA_CAPTION.bold,
        quoteRanges: KECHKI_SMENA_CAPTION.quote,
      });
    try {
      await send(state.ref as TgVideoRef);
      return 'sent';
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      state.lastError = msg.slice(0, 300);
      if (/FILE_REFERENCE|file reference/i.test(msg)) {
        // Referens eskirdi — videoni qayta yuklab, SHU raqamni qayta urinamiz.
        this.logger.warn('File-reference eskirdi — video qayta yuklanmoqda…');
        try {
          const { ref } = await this.mtproto.uploadBroadcastVideo({
            accountId,
            filePath,
            thumbPath,
            videoMeta,
          });
          state.ref = ref;
          this.saveState(state);
          await send(ref);
          return 'sent';
        } catch (e2) {
          const m2 = (e2 as Error).message ?? String(e2);
          state.lastError = m2.slice(0, 300);
          return BROADCAST_HALT_RE.test(m2) ? 'halt' : 'permfail';
        }
      }
      return BROADCAST_HALT_RE.test(msg) ? 'halt' : 'permfail';
    }
  }
}
