import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { RuleConfigRow } from '../queue/work-item-rules.js';
import {
  MANAGER_THRESHOLDS,
  type ManagerThresholdKey,
  type ResolvedThreshold,
  resolveManagerThresholds,
} from './manager-thresholds.js';

/**
 * MK13 registrining YOZUV sirti (MK17 da qo'shildi).
 *
 * Registr 2026-08-09 da faqat o'qish uchun qurilgan edi — chegarani
 * o'zgartirishning yagona yo'li bazani qo'lda tahrirlash edi. MK17 «davr
 * sozlanadi» ni talab qiladi, shuning uchun yozuv shu yerda ochiladi.
 *
 * ## Nega alohida yozuvchi
 * `manager_rule_configs` bitta jadval, lekin uning uch **egasi** bor: MK06
 * navbat qoidalari (`ManagerQueueService`), MK10 SLA bosqichlari
 * (`ManagerSlaService`) va shu registr. Har biri O'Z kalitlarini validatsiya
 * qiladi va begonasiga tegmaydi — MK06 yozuvchisiga MK13 kalitlarini qo'shish
 * uning `MANAGER_RULES` registrini buzardi.
 *
 * ## O'qishda «jimgina rad», yozishda «baland ovozda rad»
 * `resolveManagerThresholds` noto'g'ri qatorni jimgina sukutga qaytaradi —
 * chunki o'qish hech qachon 500 bermasligi kerak. Yozishda esa aksincha:
 * operator noto'g'ri qiymat kiritsa, u DARHOL bilishi kerak.
 */
@Injectable()
export class ManagerThresholdsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<ResolvedThreshold[]> {
    const rows = await this.readRows(accountId);
    return [...resolveManagerThresholds(rows).values()];
  }

  async update(
    accountId: string,
    key: string,
    patch: { enabled?: boolean; value?: number },
    actorId: string,
  ): Promise<ResolvedThreshold[]> {
    const def = MANAGER_THRESHOLDS[key as ManagerThresholdKey];
    if (!def) throw new BadRequestException(`Noma'lum chegara: ${key}`);

    if (patch.value !== undefined) {
      if (!Number.isFinite(patch.value)) {
        throw new BadRequestException(`${key} qiymati raqam bo'lishi kerak`);
      }
      if (patch.value < def.min || patch.value > def.max) {
        throw new BadRequestException(
          `${key} qiymati ${def.min}–${def.max} oralig'ida bo'lishi kerak (${def.unit})`,
        );
      }
    }

    await this.prisma.client.managerRuleConfig.upsert({
      where: { accountId_ruleType: { accountId, ruleType: def.ruleType } },
      create: {
        accountId,
        ruleType: def.ruleType,
        enabled: patch.enabled ?? true,
        thresholdValue: patch.value ?? def.defaultValue,
        // 🔴 Birlik HAR DOIM registrdan — mijoz yuborgan birlik qabul
        // qilinmaydi, aks holda `percent` yozib `days` deb o'qish mumkin
        // bo'lardi (`per-unit-snapshot` bug-klassi).
        thresholdUnit: def.unit,
        updatedById: actorId,
      },
      update: {
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.value === undefined ? {} : { thresholdValue: patch.value }),
        thresholdUnit: def.unit,
        updatedById: actorId,
      },
    });

    return this.list(accountId);
  }

  private async readRows(accountId: string): Promise<RuleConfigRow[]> {
    const rows = await this.prisma.client.managerRuleConfig.findMany({
      where: {
        accountId,
        ruleType: { in: Object.keys(MANAGER_THRESHOLDS) },
      },
      select: {
        ruleType: true,
        enabled: true,
        thresholdValue: true,
        thresholdUnit: true,
        mode: true,
        severity: true,
      },
    });
    return rows as unknown as RuleConfigRow[];
  }
}
