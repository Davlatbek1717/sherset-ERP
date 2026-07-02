import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { buildCronExpr } from '../hr-shared/cron-builder.util.js';
import { HR_TZ } from '../hr-shared/tz.util.js';
import { HrTaskSendService } from '../hr-task-send/hr-task-send.service.js';
import type { ScheduleConfig } from '../hr-task-template/hr-task-template.schema.js';

/**
 * Per-template dynamic cron registry. APScheduler ekvivalenti (yangibolim).
 *
 * - Boot scan: register all active scheduled templates.
 * - Template create/update/setActive/delete → register/unregister hooks.
 * - Each fired cron calls HrTaskSendService.dispatchTemplate(triggeredBy='scheduled').
 */
@Injectable()
export class HrTemplateSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(HrTemplateSchedulerService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SchedulerRegistry) private readonly registry: SchedulerRegistry,
    @Inject(HrTaskSendService) private readonly sendService: HrTaskSendService,
  ) {}

  async onModuleInit(): Promise<void> {
    const active = await this.prisma.client.hrTaskTemplate.findMany({
      where: { triggerType: 'scheduled', isActive: true },
      select: { id: true, accountId: true, scheduleConfig: true },
    });
    let ok = 0;
    for (const tpl of active) {
      try {
        this.register(tpl.id, tpl.accountId, tpl.scheduleConfig as ScheduleConfig | null);
        ok++;
      } catch (e) {
        this.logger.error(`Failed to register HR template ${tpl.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`HR scheduler: registered ${ok}/${active.length} active templates`);
  }

  /** Idempotent. Unregisters existing job then registers fresh if cfg provided. */
  register(templateId: string, accountId: string, cfg: ScheduleConfig | null): void {
    this.unregister(templateId);
    if (!cfg) return;
    const expr = buildCronExpr(cfg);
    const job = CronJob.from({
      cronTime: expr,
      timeZone: HR_TZ,
      onTick: () => {
        void this.sendService
          .dispatchTemplate(accountId, templateId, { triggeredBy: 'scheduled' })
          .catch((e) => {
            this.logger.error(
              `Scheduled dispatch failed (tpl=${templateId}): ${(e as Error).message}`,
            );
          });
      },
      start: true,
    });
    this.registry.addCronJob(this.jobName(templateId), job);
  }

  unregister(templateId: string): void {
    const name = this.jobName(templateId);
    if (this.registry.doesExist('cron', name)) {
      this.registry.deleteCronJob(name);
    }
  }

  private jobName(templateId: string): string {
    return `hr-template-${templateId}`;
  }
}
