import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import {
  type DigestSummary,
  resolveDigestRecipients,
  summarizePieceDigest,
} from './piece-flag-policy.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';

/** Signal `piecetracking` ni KO'RA oladigan xodimlarga boradi (K-Q9). */
const DIGEST_ENTITY = 'piecetracking';
const DIGEST_ACTION = 'view';

/** Bildirishnomada eng katta farqlar qatori uchun hisobot chegarasi. */
const DIGEST_ROW_LIMIT = 50;

export interface DigestRunResult {
  summary: DigestSummary;
  recipients: number;
  notified: boolean;
}

/**
 * K6/5 — KUNLIK SVERKA HISOBOTI va uning signali.
 *
 * «Farq chiqsa katta omborchiga signal» degan band shu yerda. Ish bo'linishi
 * ataylab: HISOBOT allaqachon bor (K1 — `GET /stock-pieces/reconciliation` va
 * `/reports/piece-reconciliation` sahifasi), bu servis esa uni har kuni bir
 * marta O'QIYDI va farq bo'lsa bildirishnoma yuboradi.
 *
 * 🔴 **Bir bayt ham yozmaydi** (qoldiqqa ham, reyestrga ham): yagona yozuv —
 * `notifications` jadvali, u ham `NotificationService.emit` orqali va u
 * xatoni yutadi. Ya'ni bu faza 2026-08-24 hodisasining sinfiga (qoldiq
 * mexanizmi) umuman kirmaydi.
 *
 * 🔴 **Farq yo'q — xabar ham yo'q** (`summarizePieceDigest`). Har kunlik
 * «hammasi joyida» xabari signalni «bo'ri keldi» ga aylantirardi.
 */
@Injectable()
export class StockPieceDigestService {
  private readonly logger = new Logger(StockPieceDigestService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockPieceReconcileService) private readonly recon: StockPieceReconcileService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /**
   * Bitta hisob uchun kunlik sverka. Chaqiruvchi — cron (va qo'lda sinov).
   * Xato OTILADI: cron uni hisob kesimida yutadi va qolgan hisoblar davom etadi.
   */
  async runForAccount(accountId: string): Promise<DigestRunResult> {
    const report = await this.recon.reconcile(accountId, {
      onlyDiff: true,
      limit: DIGEST_ROW_LIMIT,
    });
    const summary = summarizePieceDigest(report);

    if (!summary.shouldNotify) {
      return { summary, recipients: 0, notified: false };
    }

    const recipients = await this.recipients(accountId);
    for (const employeeId of recipients) {
      await this.notifications.emit(
        accountId,
        employeeId,
        'piece_reconciliation_diff',
        summary.title,
        summary.body,
        'PieceReconciliation',
        null,
      );
    }

    if (recipients.length === 0) {
      // Farq BOR, lekin uni ko'radigan odam yo'q — bu ham nosozlik (ruxsat
      // hech kimga berilmagan). Jim qolmaslik uchun log'ga chiqadi.
      this.logger.warn(
        `Bo'lak sverkasi[${accountId}]: ${summary.diffBuckets} farq, lekin ` +
          `\`${DIGEST_ENTITY}.${DIGEST_ACTION}\` ruxsati bo'lgan xodim YO'Q`,
      );
    }

    return { summary, recipients: recipients.length, notified: recipients.length > 0 };
  }

  /**
   * Qabul qiluvchilar: rol qatlami + xodim OVERRIDE qatlami (MK26 — override
   * G'OLIB, `scope='NO'` esa ataylab taqiq). Qaror sof funksiyada
   * (`resolveDigestRecipients`), bu yerda faqat ikki so'rov.
   */
  private async recipients(accountId: string): Promise<string[]> {
    const [roleLinks, overrides] = await Promise.all([
      this.prisma.client.employeeRole.findMany({
        where: {
          // `Employee` da yumshoq o'chirish YO'Q — `archived` yagona filtr.
          employee: { accountId, archived: false },
          role: {
            accountId,
            permissions: { some: { entity: DIGEST_ENTITY, action: DIGEST_ACTION } },
          },
        },
        select: {
          employeeId: true,
          role: {
            select: {
              permissions: {
                where: { entity: DIGEST_ENTITY, action: DIGEST_ACTION },
                select: { scope: true },
              },
            },
          },
        },
      }),
      this.prisma.client.employeePermission.findMany({
        where: { accountId, entity: DIGEST_ENTITY, action: DIGEST_ACTION },
        select: { employeeId: true, scope: true },
      }),
    ]);

    const roleGrants = roleLinks.flatMap((link) =>
      link.role.permissions.map((p) => ({ employeeId: link.employeeId, scope: p.scope })),
    );
    return resolveDigestRecipients({ roleGrants, overrides });
  }
}
