import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import type { ActorRole } from './debt.service.js';
import { DebtService } from './debt.service.js';

/**
 * «Qarz undirish» controller — TZ v2.
 *
 * TZ §6 ruxsat matritsasi mavjud RBAC ustiga to'rtta entity bilan tushiriladi:
 *
 *   debt              view/create/delete — ro'yxat + YANGI QARZ BERISH (kassir)
 *   debt.update                          — izoh/keyingi sana (operator + kassir)
 *   debtpayment       create             — KASSADA naqd/terminal (faqat kassir)
 *   debtcardpayment   create             — KARTA screenshot   (faqat operator)
 *   debtreport        view               — kassirlar/operatorlar hisoboti
 *
 * Shu ajratma tufayli operator kassa to'lovini kirita OLMAYDI, kassir esa
 * screenshot to'lovini kirita olmaydi — TZ talabi mexanik kuchga ega
 * (ekranda yashirish emas, serverda bloklash).
 *
 * DIQQAT — marshrut tartibi: statik yo'llar (`summary`, `calls/today`,
 * `reports/*`) `:id` dan OLDIN e'lon qilingan; aks holda Nest ularni
 * `:id` param sifatida yutib yuboradi.
 */
@Controller('debts')
@UseGuards(JwtAuthGuard)
export class DebtController {
  constructor(
    @Inject(DebtService) private readonly service: DebtService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  /**
   * Muloqot yozuvidagi rolni RBAC'dan chiqaramiz (§3.4 — yozuvda rol ko'rinadi).
   * Ikkala huquq ham bo'lsa — bu rahbar/admin.
   */
  private async actorRole(userId: string): Promise<ActorRole> {
    const [cash, card] = await Promise.all([
      this.permissions.resolveScope(userId, 'debtpayment', 'create'),
      this.permissions.resolveScope(userId, 'debtcardpayment', 'create'),
    ]);
    const isCashier = cash !== 'NO';
    const isOperator = card !== 'NO';
    if (isCashier && isOperator) return 'admin';
    if (isCashier) return 'cashier';
    if (isOperator) return 'operator';
    return 'admin';
  }

  // ── §3.1 qarzdorlar ro'yxati ──────────────────────────────────────────────

  @Get()
  @RequirePermission({ entity: 'debt', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.list(user.accountId, q);
  }

  /** §4 — dashboard kartochkalari: umumiy qarzdorlik, muddati o'tgan, bugungi. */
  @Get('summary')
  @RequirePermission({ entity: 'debt', action: 'view' })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(user.accountId);
  }

  /** §3.5 — «Bugungi qo'ng'iroqlar» (muddati o'tganlar ham, `overdue` bayrog'i bilan). */
  @Get('calls/today')
  @RequirePermission({ entity: 'debt', action: 'view' })
  todayCalls(
    @CurrentUser() user: AuthenticatedUser,
    @Query('ownerId') ownerId?: string,
    @Query('includeOverdue') includeOverdue?: string,
  ) {
    return this.service.todayCalls(user.accountId, {
      ownerId: ownerId || undefined,
      includeOverdue: includeOverdue !== 'false',
    });
  }

  // ── §3.9 / §4 hisobotlar ──────────────────────────────────────────────────

  @Get('reports/cashiers')
  @RequirePermission({ entity: 'debtreport', action: 'view' })
  cashierReport(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.cashierReport(user.accountId, q);
  }

  @Get('reports/operators')
  @RequirePermission({ entity: 'debtreport', action: 'view' })
  operatorReport(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.operatorReport(user.accountId, q);
  }

  @Get('reports/payments')
  @RequirePermission({ entity: 'debtreport', action: 'view' })
  paymentsReport(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.paymentsReport(user.accountId, q);
  }

  /**
   * «To'lovlar lentasi» — aynan qaysi mijoz to'laganini ko'rsatadi.
   * Ruxsat: debt.view (hisobot EMAS — kassir ham o'z kiritganini ko'rishi
   * tabiiy; §3.8 umumiy-ko'rinish printsipi). Statik yo'l — ':id' dan OLDIN.
   */
  @Get('payments/feed')
  @RequirePermission({ entity: 'debt', action: 'view' })
  paymentsFeed(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.paymentsFeed(user.accountId, q);
  }

  // ── §3.2 mijoz profili ────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermission({ entity: 'debt', action: 'view' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  // ── §3.3 yangi qarz berish (KASSIR) ───────────────────────────────────────

  @Post()
  @RequirePermission({ entity: 'debt', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const role = await this.actorRole(user.sub);
    return this.service.create(user.accountId, user.sub, role, body);
  }

  // ── §3.4 muloqot yozuvi (operator + kassir) ───────────────────────────────

  @Post(':id/notes')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const role = await this.actorRole(user.sub);
    return this.service.addNote(user.accountId, user.sub, role, id, body);
  }

  // ── §3.6 kassada to'lov — naqd/terminal (FAQAT KASSIR) ────────────────────

  @Post(':id/payments')
  @RequirePermission({ entity: 'debtpayment', action: 'create' })
  addCashPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.addCashPayment(user.accountId, user.sub, id, body);
  }

  // ── §3.7 karta to'lovi — screenshot (FAQAT OPERATOR) ──────────────────────

  @Post(':id/card-payments')
  @RequirePermission({ entity: 'debtcardpayment', action: 'create' })
  addCardPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.addCardPayment(user.accountId, user.sub, id, body);
  }

  // ── soft-delete ───────────────────────────────────────────────────────────

  @Delete(':id')
  @RequirePermission({ entity: 'debt', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.accountId, id);
  }
}
