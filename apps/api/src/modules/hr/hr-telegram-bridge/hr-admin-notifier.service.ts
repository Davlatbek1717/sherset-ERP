import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  HR_EVENT,
  type HrTaskLogDeadlineExpiredEvent,
  type HrTaskLogFinalizedEvent,
} from '../hr-shared/hr-events.types.js';
import { formatMinor } from './template-render.util.js';

const TZ = 'Asia/Tashkent';
const BOT_API_TIMEOUT_MS = 10_000;

/**
 * Admin Telegram notifier — yangibolim spec §10 (`admin_notifier.py`) 1:1.
 *
 * Distinct from the MTProto customer path (gramjs outbox): this pushes a
 * COMBINED "task done → bonus/fine" message to the workspace ADMIN's Telegram
 * via the Bot API (https://api.telegram.org/bot{token}/sendMessage), Markdown.
 *
 * Event-driven (listens to the same HR_TASK_LOG_* domain events the FSM
 * already emits) rather than called inline — so it runs out-of-band and can
 * NEVER break the source document flow (spec §13.12). All errors swallowed.
 *
 * Gated on env HR_ADMIN_BOT_TOKEN + HR_ADMIN_CHAT_ID (single admin channel,
 * matching the spec's single settings.admin_chat_id). Absent ⇒ no-op (dormant
 * until an admin wires a bot, like the Noop MTProto adapter). NOTE: this is a
 * single-tenant admin channel; a multi-tenant deployment would need per-account
 * bot config — out of scope here, documented.
 */
@Injectable()
export class HrAdminNotifier {
  private readonly logger = new Logger(HrAdminNotifier.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @OnEvent(HR_EVENT.HR_TASK_LOG_FINALIZED, { async: true, promisify: true })
  async onTaskFinalized(payload: HrTaskLogFinalizedEvent): Promise<void> {
    try {
      const log = await this.loadLog(payload.accountId, payload.taskLogId);
      if (!log) return;
      const { bonusMinor, fineMinor } = await this.sumLedger(payload.accountId, payload.taskLogId);
      await this.sendViaBot(this.buildTaskAnsweredText(log, bonusMinor, fineMinor));
    } catch (e) {
      this.logger.warn(`admin notify (finalized) failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(HR_EVENT.HR_TASK_LOG_DEADLINE_EXPIRED, { async: true, promisify: true })
  async onTaskExpired(payload: HrTaskLogDeadlineExpiredEvent): Promise<void> {
    try {
      const log = await this.loadLog(payload.accountId, payload.taskLogId);
      if (!log) return;
      const { fineMinor } = await this.sumLedger(payload.accountId, payload.taskLogId);
      await this.sendViaBot(this.buildTaskExpiredText(log, fineMinor));
    } catch (e) {
      this.logger.warn(`admin notify (expired) failed: ${(e as Error).message}`);
    }
  }

  // ── data ────────────────────────────────────────────────────────────

  private async loadLog(accountId: string, taskLogId: string) {
    return this.prisma.client.hrTaskLog.findFirst({
      where: { id: taskLogId, accountId },
      select: {
        status: true,
        responseText: true,
        answeredAt: true,
        template: { select: { title: true } },
        employee: { select: { name: true } },
      },
    });
  }

  /** Sum the auto bonus/fine ledger rows finalize created for this task log. */
  private async sumLedger(
    accountId: string,
    taskLogId: string,
  ): Promise<{ bonusMinor: bigint; fineMinor: bigint }> {
    const rows = await this.prisma.client.hrBonusFineLog.findMany({
      where: { accountId, taskLogId },
      select: { kind: true, amountMinor: true },
    });
    let bonusMinor = 0n;
    let fineMinor = 0n;
    for (const r of rows) {
      if (r.kind === 'bonus') bonusMinor += r.amountMinor;
      else if (r.kind === 'fine') fineMinor += r.amountMinor;
    }
    return { bonusMinor, fineMinor };
  }

  // ── message builders (spec §10.3, AYNAN) ────────────────────────────

  private buildTaskAnsweredText(log: LoadedLog, bonusMinor: bigint, fineMinor: bigint): string {
    const isNo = log.status === 'answered_no';
    const hasBonus = bonusMinor > 0n;
    const hasFine = fineMinor > 0n;
    const header = hasBonus
      ? '✅ *Vazifa bajarildi → Bonus*'
      : hasFine
        ? '❌ *Vazifa bajarilmadi → Jarima*'
        : isNo
          ? '❌ *Vazifa bajarilmadi*'
          : '✅ *Vazifa bajarildi*';
    const resp = log.responseText || '(matnsiz)';
    const lines = [
      header,
      '',
      `📋 ${log.template?.title ?? '—'}`,
      `👤 ${log.employee?.name ?? '—'}`,
      `💬 ${resp}`,
    ];
    if (hasBonus) lines.push(`💰 *Bonus:* ${fmtAmount(bonusMinor)}`);
    else if (hasFine) lines.push(`💰 *Jarima:* ${fmtAmount(fineMinor)}`);
    lines.push(`🕐 ${fmtDt(log.answeredAt)}`);
    return lines.join('\n');
  }

  private buildTaskExpiredText(log: LoadedLog, fineMinor: bigint): string {
    const hasFine = fineMinor > 0n;
    const header = hasFine ? '❌ *Vazifa bajarilmadi → Jarima*' : '❌ *Vazifa bajarilmadi*';
    const resp = log.responseText || 'Vaqt tugadi — avtomatik';
    const lines = [
      header,
      '',
      `📋 ${log.template?.title ?? '—'}`,
      `👤 ${log.employee?.name ?? '—'}`,
      `💬 ${resp}`,
    ];
    if (hasFine) lines.push(`💰 *Jarima:* ${fmtAmount(fineMinor)}`);
    lines.push(`🕐 ${fmtDt(log.answeredAt)}`);
    return lines.join('\n');
  }

  // ── transport ───────────────────────────────────────────────────────

  /** POST to the Telegram Bot API. No-op (warn) when not configured. */
  async sendViaBot(text: string): Promise<void> {
    const token = process.env.HR_ADMIN_BOT_TOKEN;
    const chatId = process.env.HR_ADMIN_CHAT_ID;
    if (!token || !chatId) {
      this.logger.warn('Admin bot not configured (HR_ADMIN_BOT_TOKEN/CHAT_ID) — skip');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BOT_API_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Bot API ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface LoadedLog {
  status: string;
  responseText: string | null;
  answeredAt: Date | null;
  template: { title: string } | null;
  employee: { name: string } | null;
}

/** tiyin (BigInt) → "50 000 so'm" (spec §10.2 _fmt_amount). */
function fmtAmount(minor: bigint | null | undefined): string {
  return `${formatMinor(minor ?? 0n)} so'm`;
}

/** Date → "dd-MM-yyyy HH:mm" (Asia/Tashkent), or "—". */
function fmtDt(dt: Date | null | undefined): string {
  if (!dt) return '—';
  try {
    return formatInTimeZone(new Date(dt), TZ, 'dd-MM-yyyy HH:mm');
  } catch {
    return '—';
  }
}
