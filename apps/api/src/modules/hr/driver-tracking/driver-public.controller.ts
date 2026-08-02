import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DriverFieldIngestService } from './driver-field-ingest.service.js';
import { verifyDriverToken } from './driver-link.util.js';
import { DriverShiftService } from './driver-shift.service.js';
import { FieldPingSchema } from './driver-tracking.schema.js';

/**
 * Haydovchi PAROLSIZ magic-link endpointlari — `@UseGuards` YO'Q (public). Auth =
 * HMAC-token o'zi (driver-link.util); accountId + employeeId token ICHIDAN olinadi
 * (URL'дан EMAS) ⇒ cross-tenant yo'q. FAQAT o'z GPS-ping + smenasi (boshqa hech narsa).
 * Haydovchi telefon-brauzerда linkni ochib, joylashuv oqimini + smenani boshqaradi.
 */
@Controller('p/driver')
export class DriverPublicController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DriverFieldIngestService) private readonly ingest: DriverFieldIngestService,
    @Inject(DriverShiftService) private readonly shifts: DriverShiftService,
  ) {}

  private resolve(token: string): { accountId: string; employeeId: string } {
    const r = verifyDriverToken(token);
    if (!r) throw new NotFoundException('Havola yaroqsiz');
    return r;
  }

  /** Haydovchi ko'rinishi — ism + joriy smena holati. */
  @Get(':token')
  async view(@Param('token') token: string) {
    const { accountId, employeeId } = this.resolve(token);
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId, archived: false },
      select: { id: true, name: true, trackingMode: true },
    });
    if (!emp || emp.trackingMode !== 'field') throw new NotFoundException('Haydovchi topilmadi');
    const shift = await this.shifts.current(accountId, employeeId);
    return { employeeId: emp.id, name: emp.name, shift };
  }

  /** GPS-ping — brauzer joylashuvi (field-ingest). */
  @Post(':token/ping')
  async ping(@Param('token') token: string, @Body() body: unknown) {
    const { accountId, employeeId } = this.resolve(token);
    return this.ingest.ingestField(accountId, employeeId, FieldPingSchema.parse(body));
  }

  /** Smenani boshlash. */
  @Post(':token/shift/start')
  async shiftStart(@Param('token') token: string) {
    const { accountId, employeeId } = this.resolve(token);
    return this.shifts.start(accountId, employeeId);
  }

  /** Smenani tugatish. */
  @Post(':token/shift/end')
  async shiftEnd(@Param('token') token: string) {
    const { accountId, employeeId } = this.resolve(token);
    return this.shifts.end(accountId, employeeId);
  }
}
