import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import type { ActorRole } from './debt.service.js';
import { DebtService } from './debt.service.js';
import { PosDebtPaymentService } from './pos-debt-payment.service.js';

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
    @Inject(PosDebtPaymentService) private readonly pos: PosDebtPaymentService,
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

  /**
   * §3.5 — «Bugungi qo'ng'iroqlar» (muddati o'tganlar ham, `overdue` bayrog'i bilan).
   * `?dayOffset=1` — «Ertaga qo'ng'iroq qilinishi kerak bo'lganlar»
   * (MASTER-TODO #139: `/debts/calls/tomorrow` sahifasi shunga tayanadi).
   */
  @Get('calls/today')
  @RequirePermission({ entity: 'debt', action: 'view' })
  todayCalls(
    @CurrentUser() user: AuthenticatedUser,
    @Query('ownerId') ownerId?: string,
    @Query('includeOverdue') includeOverdue?: string,
    @Query('dayOffset') dayOffset?: string,
  ) {
    // Number('') === 0, Number(undefined) === NaN → ikkalasi ham 0 ga tushadi.
    // CLAMP majburiy: cheklanmagan qiymat (`?dayOffset=1e15`) `new Date(...)`ni
    // Invalid Date qiladi → `toISOString()` RangeError tashlaydi → 500.
    // Jonli tasdiqlangan (2026-07-28). ±366 kun — real oyna uchun yetarli.
    const raw = Number(dayOffset);
    const offset = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    return this.service.todayCalls(user.accountId, {
      ownerId: ownerId || undefined,
      includeOverdue: includeOverdue !== 'false',
      dayOffset: Math.max(-366, Math.min(366, offset)),
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

  // ── Qarzdorlar ro'yxati PDF (2026-07-12) — joriy filtr holati bilan ───────

  /**
   * GET /debts/print/pdf?scope=...&counterpartyGroupId=...&heading=Elektriklar
   * Joriy tab/filtr bo'yicha BARCHA qarzdorlar bitta PDF jadvalda.
   * Statik yo'l — ':id' dan OLDIN.
   */
  @Get('print/pdf')
  @RequirePermission({ entity: 'debt', action: 'print' })
  @Header('Content-Type', 'application/pdf')
  async printPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const { heading, ...filter } = q;
    const pdf = await this.service.printPdf(
      user.accountId,
      filter,
      typeof heading === 'string' && heading.length > 0 ? heading.slice(0, 60) : null,
    );
    const date = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="qarzdorlar-${date}.pdf"`).send(pdf);
  }

  /**
   * POST varianti — CHECKBOX bilan belgilangan qarzlar PDF'i (2026-07-12).
   * Body: { ids: uuid[], heading?, ...filter }. ids berilsa scope chetlab
   * o'tiladi (service) — aynan tanlanganlar chiqadi.
   */
  @Post('print/pdf')
  @RequirePermission({ entity: 'debt', action: 'print' })
  @Header('Content-Type', 'application/pdf')
  async printPdfSelected(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const { heading, ...filter } = body ?? {};
    const pdf = await this.service.printPdf(
      user.accountId,
      filter,
      typeof heading === 'string' && heading.length > 0 ? heading.slice(0, 60) : null,
    );
    const date = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="qarzdorlar-${date}.pdf"`).send(pdf);
  }

  /**
   * OMMAVIY eslatma — checkbox bilan tanlangan qarzdorlarga SMS yoki Telegram.
   * Statik yo'l — `:id` dan OLDIN e'lon qilingan (aks holda Nest `reminders`ni
   * `:id` deb yutadi).
   */
  @Post('reminders/bulk')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async sendBulkReminders(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.sendBulkReminders(user.accountId, user.sub, body);
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

  // ── «Qo'ng'iroq qilindi» + natija (operator/kassir — debt.update) ─────────

  @Post(':id/call')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async markCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const role = await this.actorRole(user.sub);
    return this.service.markCall(user.accountId, user.sub, role, id, body);
  }

  /**
   * QO'LDA Telegram qarz-eslatmasi — qarzdorlar ro'yxatidagi qatordan yuboriladi.
   * Qarzi bor mijozga tartibli eslatma xabari ketadi (yopiq qarzga yuborilmaydi).
   */
  @Post(':id/telegram-reminder')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async sendTelegramReminder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.sendTelegramReminder(user.accountId, id);
  }

  // ── MUAMMOLI MIJOZ belgisini qo'yish/yechish (2026-07-14) ─────────────────
  //
  // Qo'ng'iroq modalidan tashqari alohida yo'l: «Muammoli qarzdorlar»
  // sahifasidan muammoni hal bo'ldi deb yopish (yoki qo'shimcha sabab yozish).

  @Post(':id/problem')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async setProblem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const role = await this.actorRole(user.sub);
    return this.service.setProblem(user.accountId, user.sub, role, id, body);
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

  // ── TO'LOVNI QAYTARISH — storno (2026-07-16) ──────────────────────────────
  //
  // Marshrut darajasida `debt.update` yetadi (operator ham, kassir ham kiradi);
  // ASOSIY himoya servis ichida: faqat to'lovni KIRITGAN xodim yoki RAHBAR
  // (ikkala to'lov huquqi bor = admin) qaytara oladi. Sabab majburiy — schema.

  @Post(':id/payments/:paymentId/reverse')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async reversePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    const role = await this.actorRole(user.sub);
    return this.service.reversePayment(user.accountId, user.sub, role, id, paymentId, body);
  }

  // ── QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16) ───────────────────────
  //
  // Xato qo'yilgan natija («to'ladi/qisman/to'lamadi/qayta qo'ng'iroq»)
  // qaytariladi; natija to'lov yaratgan bo'lsa, to'lov ham bitta tranzaksiyada
  // storno bo'ladi. Himoya storno bilan bir xil: marshrutda `debt.update`,
  // servisda «faqat yozuv muallifi yoki rahbar» tekshiruvi. Sabab majburiy.

  @Post(':id/notes/:noteId/cancel')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async cancelCallNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() body: unknown,
  ) {
    const role = await this.actorRole(user.sub);
    return this.service.cancelCallNote(user.accountId, user.sub, role, id, noteId, body);
  }

  // ── soft-delete ───────────────────────────────────────────────────────────

  @Delete(':id')
  @RequirePermission({ entity: 'debt', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.accountId, id);
  }

  // ── POS «Qarz to'lovi» oynasi (kassa TZ §7.2) ─────────────────────────────

  /** Oyna ochilganda: qoldiq, eng eski qarz sanasi, ochiq qarzlar ro'yxati. */
  @Get('pos/summary/:counterpartyId')
  posSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId') counterpartyId: string,
  ) {
    return this.pos.summary(user.accountId, counterpartyId);
  }

  /**
   * To'lovni FIFO bo'yicha taqsimlab yozadi va PKO uchun ma'lumot qaytaradi.
   * Kassir qaysi qarzga tushishini tanlamaydi — eng eskisidan yopiladi (Q9).
   */
  /** PKO chekini qayta chop etish (kassir yo'qotdi / printer tiqildi). */
  @Get('pos/receipt/:batchId')
  posReceipt(@CurrentUser() user: AuthenticatedUser, @Param('batchId') batchId: string) {
    return this.pos.receipt(user.accountId, batchId);
  }

  /**
   * Faza Q10 (AUTH-07): `debtpayment.create` — kassa to'lovi bilan AYNAN bir xil
   * ruxsat (`POST :id/payments`). Ilgari bu yo'l ruxsatsiz edi, ya'ni TZ §3.6
   * ajratmasi («operator kassa to'lovini kirita OLMAYDI») POS oynasi orqali
   * chetlab o'tilardi — pul harakati RBAC'siz yozilardi.
   */
  @Post('pos/pay')
  @RequirePermission({ entity: 'debtpayment', action: 'create' })
  posPay(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    // Validatsiya SERVISDA — bu controllerdagi qolgan hamma endpoint
    // shu konventsiyada (xom `body` uzatiladi).
    return this.pos.pay(user.accountId, user.sub, body);
  }
}
