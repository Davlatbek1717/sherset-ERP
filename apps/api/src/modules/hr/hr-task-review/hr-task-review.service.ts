import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HrTaskSendService } from '../hr-task-send/hr-task-send.service.js';
import type { ReviewListFilter } from './hr-task-review.schema.js';

@Injectable()
export class HrTaskReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrTaskSendService) private readonly sendService: HrTaskSendService,
  ) {}

  /**
   * Pending review queue. Admin sees all; checkers see only logs whose
   * template designates them as the checker (template.checkerId === reviewerId).
   */
  async listPending(
    accountId: string,
    reviewerId: string,
    isAdmin: boolean,
    filter: ReviewListFilter,
  ) {
    const where: Record<string, unknown> = {
      accountId,
      status: 'pending_review',
    };
    if (!isAdmin) {
      where.template = { is: { checkerId: reviewerId } };
    }
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.templateId) where.templateId = filter.templateId;

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.hrTaskLog.findMany({
        where,
        orderBy: { sentAt: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: {
          template: {
            select: {
              id: true,
              title: true,
              responseType: true,
              rewardMinor: true,
              fineMinor: true,
              checkerId: true,
            },
          },
          employee: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.hrTaskLog.count({ where }),
    ]);
    return { rows, total, page: filter.page, limit: filter.limit };
  }

  async approve(
    accountId: string,
    taskLogId: string,
    reviewerId: string,
    isAdmin: boolean,
    comment: string | null,
  ) {
    return this.transition(accountId, taskLogId, reviewerId, isAdmin, 'approved', comment);
  }

  async reject(
    accountId: string,
    taskLogId: string,
    reviewerId: string,
    isAdmin: boolean,
    comment: string,
  ) {
    return this.transition(accountId, taskLogId, reviewerId, isAdmin, 'rejected', comment);
  }

  /**
   * FSM transition: pending_review → approved | rejected.
   * Atomic guard via updateMany to defeat concurrent reviewer race.
   * Then delegates side-effects (bonus/fine + chain + event) to send.finalize().
   */
  private async transition(
    accountId: string,
    taskLogId: string,
    reviewerId: string,
    isAdmin: boolean,
    newStatus: 'approved' | 'rejected',
    comment: string | null,
  ) {
    const log = await this.prisma.client.hrTaskLog.findFirst({
      where: { id: taskLogId, accountId },
      include: {
        template: {
          select: {
            id: true,
            checkerId: true,
            title: true,
            rewardMinor: true,
            fineMinor: true,
          },
        },
      },
    });
    if (!log) throw new NotFoundException('Tekshiruv ostidagi vazifa topilmadi');
    if (log.status !== 'pending_review') {
      throw new BadRequestException(`Bu vazifa tekshiruv ostida emas (${log.status})`);
    }
    if (reviewerId === log.employeeId) {
      throw new ForbiddenException("O'z vazifangizni tekshira olmaysiz");
    }
    if (!isAdmin && log.template.checkerId !== reviewerId) {
      throw new ForbiddenException('Siz bu vazifaning belgilangan tekshiruvchisi emassiz');
    }

    const upd = await this.prisma.client.hrTaskLog.updateMany({
      where: { id: log.id, status: 'pending_review' },
      data: {
        status: newStatus,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    });
    if (upd.count === 0) {
      throw new BadRequestException(
        'Bu vazifa boshqa tekshiruvchi tomonidan allaqachon tekshirildi',
      );
    }

    await this.sendService.finalize(
      accountId,
      log.id,
      newStatus,
      log.templateId,
      log.employeeId,
      reviewerId,
      'review',
    );

    return this.prisma.client.hrTaskLog.findUnique({
      where: { id: log.id },
      include: {
        template: { select: { id: true, title: true } },
        employee: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }
}
