import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  ApplyBonusFineRuleInput,
  CreateBonusFineRuleInput,
  UpdateBonusFineRuleInput,
} from './hr-bonus-fine-rule.schema.js';

/**
 * Reusable bonus/fine rule library. Admins define rules once and apply
 * them to employees with one click — `applyRule` writes a ledger row with
 * source='rule' and ruleId set, closing the 4th of 5 bonus/fine sources
 * (manual=P5a, rule=here, auto_task + auto_expire=P3).
 */
@Injectable()
export class HrBonusFineRuleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    return this.prisma.client.hrBonusFineRule.findMany({
      where: { accountId, deletedAt: null }, // soft-deleted rules hidden (§13.11)
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(accountId: string, input: CreateBonusFineRuleInput) {
    return this.prisma.client.hrBonusFineRule.create({
      data: {
        accountId,
        name: input.name,
        kind: input.kind,
        amountMinor: BigInt(input.amountMinor),
        condition: (input.condition ?? { type: 'checkbox' }) as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(accountId: string, id: string, input: UpdateBonusFineRuleInput) {
    await this.findOne(accountId, id);
    return this.prisma.client.hrBonusFineRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.amountMinor !== undefined && { amountMinor: BigInt(input.amountMinor) }),
        ...(input.condition !== undefined && {
          condition: (input.condition ?? { type: 'checkbox' }) as Prisma.InputJsonValue,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(accountId, id);
    // Soft-delete (§13.11): the rule is hidden from the list but the row
    // survives so past ledger entries' ruleId FK stays valid (source='rule').
    await this.prisma.client.hrBonusFineRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Apply a rule to an employee → creates a ledger entry (source='rule').
   * The amount + kind are copied from the rule snapshot at apply-time, so
   * later rule edits don't retroactively change historical ledger rows.
   */
  async applyRule(accountId: string, actingUserId: string, input: ApplyBonusFineRuleInput) {
    const rule = await this.findOne(accountId, input.ruleId);
    if (rule.deletedAt) throw new BadRequestException("O'chirilgan qoidani qo'llab bo'lmaydi");
    if (!rule.isActive) {
      throw new BadRequestException("Faol bo'lmagan qoidani qo'llab bo'lmaydi");
    }
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: input.employeeId, accountId, archived: false },
      select: { id: true, name: true },
    });
    if (!emp) throw new BadRequestException('Xodim topilmadi');

    return this.prisma.client.hrBonusFineLog.create({
      data: {
        accountId,
        employeeId: input.employeeId,
        employeeName: emp.name, // snapshot (§13.17)
        kind: rule.kind,
        source: 'rule',
        amountMinor: rule.amountMinor,
        reason: input.reason ?? rule.name,
        ruleId: rule.id,
        createdById: actingUserId,
      },
    });
  }

  private async findOne(accountId: string, id: string) {
    const rule = await this.prisma.client.hrBonusFineRule.findFirst({
      where: { id, accountId },
    });
    if (!rule) throw new NotFoundException('Qoida topilmadi');
    return rule;
  }
}
