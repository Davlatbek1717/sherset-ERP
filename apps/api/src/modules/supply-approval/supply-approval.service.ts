import { randomBytes } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Faza E: taminotchi magic-link amal muddati — 14 kun. */
const SUPPLIER_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
import { decryptPassword } from '../email/crypto.js';
import { SupplyService } from '../supply/supply.service.js';
import { tgAnswerCallbackQuery, tgEditMessageText } from '../telegram/telegram.client.js';
import {
  type InlineKeyboard,
  confirmKeyboard,
  doubleConfirmKeyboard,
  parseCallbackData,
} from './supply-approval.callback.js';
import {
  type ActorType,
  type ApprovalStage,
  diffAdjustments,
  rejectTarget,
} from './supply-approval.fsm.js';
import { OmborchiConfirmSchema, RejectSchema } from './supply-approval.schema.js';

/**
 * Qabul-tasdiqlash workflow — yupqa I/O qatlam (2026-07-29 spec). Bosqich-o'tish
 * qoidalari `supply-approval.fsm.ts`da (pure, test qilingan). Bu yer faqat:
 * atomik bosqich-da'vosi (optimistik updateMany), audit-event yozish, va admin
 * tasdig'ida mavjud `SupplyService.transition(...,'post')` orqali stock oshirish.
 */
@Injectable()
export class SupplyApprovalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SupplyService) private readonly supply: SupplyService,
  ) {}

  /** Joriy bosqich + event-tarixi (yangisi birinchi). */
  async getApproval(accountId: string, supplyId: string) {
    const s = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { approvalStage: true, state: true, applicable: true },
    });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const events = await this.prisma.client.supplyApprovalEvent.findMany({
      where: { accountId, supplyId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      stage: s.approvalStage as ApprovalStage,
      state: s.state,
      applicable: s.applicable,
      events,
    };
  }

  /** Atomik bosqich-da'vosi — updateMany joriy bosqichga gate. count 0 → 409/404. */
  private async claim(accountId: string, supplyId: string, from: ApprovalStage, to: ApprovalStage) {
    const res = await this.prisma.client.supply.updateMany({
      where: { id: supplyId, accountId, approvalStage: from, deletedAt: null },
      data: { approvalStage: to },
    });
    if (res.count === 0) {
      const exists = await this.prisma.client.supply.findFirst({
        where: { id: supplyId, accountId, deletedAt: null },
        select: { approvalStage: true },
      });
      if (!exists) throw new NotFoundException('Qabul topilmadi');
      throw new ConflictException(
        `Bosqich '${from}' emas (joriy: '${exists.approvalStage}') — o'tish bekor`,
      );
    }
  }

  private logEvent(
    accountId: string,
    supplyId: string,
    fromStage: ApprovalStage,
    toStage: ApprovalStage,
    action: string,
    actorType: ActorType,
    actorId: string | null,
    reason?: string,
  ) {
    return this.prisma.client.supplyApprovalEvent.create({
      data: {
        accountId,
        supplyId,
        fromStage,
        toStage,
        action,
        actorType,
        actorId,
        reason: reason ?? null,
      },
    });
  }

  /** Egasi taminotchiga yuboradi (none → awaiting_supplier). Faza B: shu yerda Excel+Telegram. */
  async send(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'none', 'awaiting_supplier');
    // Approval STOCK'ni GATE qiladi: tovar omborga FAQAT admin tasdig'ida kirishi kerak,
    // yaratilishда emas. «Проведено» (posted) bilan yaratilgan qabul stock'ni allaqachon
    // kommit qilgan — uni SHU YERDA unpost qilamiz (posted→draft, erta stock qaytariladi)
    // ki tovar haqiqatda qachon kirishini approval-flow boshqarsin. `adminConfirm` oxirida
    // draft'ni qayta post qiladi (stock o'shanда qo'shiladi). Rad etilsa — draft qoladi,
    // stock kirmaydi. Draft bo'lsa — hech narsa qilinmaydi.
    try {
      const s = await this.prisma.client.supply.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { state: true },
      });
      if (s?.state === 'posted') {
        await this.supply.transition(accountId, userId, id, 'unpost'); // posted→draft, stock reverse
      }
    } catch (e) {
      // unpost yiqilsa — bosqich-da'vosini qaytar (yuborish bekor).
      await this.prisma.client.supply.updateMany({
        where: { id, accountId },
        data: { approvalStage: 'none' },
      });
      throw e;
    }
    await this.logEvent(accountId, id, 'none', 'awaiting_supplier', 'send', 'system', userId);
    // Faza B: inline-tugmali xabar taminotchiga (non-fatal — holat allaqachon o'zgardi).
    await this.dispatchToSupplier(accountId, id).catch(() => {});
    return this.getApproval(accountId, id);
  }

  /** Omborchi sanaydi + kerak bo'lsa tuzatadi (delivering → awaiting_admin). Atomik. */
  async omborchiConfirm(accountId: string, userId: string, id: string, raw: unknown) {
    const dto = OmborchiConfirmSchema.parse(raw);
    const positions = await this.prisma.client.supplyPosition.findMany({
      where: { supplyId: id, accountId },
      select: { id: true, quantity: true },
    });
    const detail = diffAdjustments(
      positions.map((p) => ({ id: p.id, quantity: p.quantity.toString() })),
      dto.adjustments,
    );
    await this.prisma.client.$transaction(async (tx) => {
      for (const d of detail) {
        await tx.supplyPosition.update({ where: { id: d.positionId }, data: { quantity: d.now } });
      }
      const res = await tx.supply.updateMany({
        where: { id, accountId, approvalStage: 'delivering', deletedAt: null },
        data: { approvalStage: 'awaiting_admin' },
      });
      if (res.count === 0) throw new ConflictException("Bosqich 'delivering' emas");
      await tx.supplyApprovalEvent.create({
        data: {
          accountId,
          supplyId: id,
          fromStage: 'delivering',
          toStage: 'awaiting_admin',
          action: 'omborchi_ok',
          actorType: 'omborchi',
          actorId: userId,
          detail: detail.length ? (detail as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
    });
    // Faza D3: omborchi tasdiqladi → adminlarga yakuniy-tasdiq xabari (non-fatal).
    await this.dispatchToAdmin(accountId, id).catch(() => {});
    return this.getApproval(accountId, id);
  }

  /** Admin yakuniy tasdiq (awaiting_admin → completed) + stock post (agar hali draft). */
  async adminConfirm(accountId: string, userId: string, id: string) {
    await this.claim(accountId, id, 'awaiting_admin', 'completed');
    try {
      // «Проведено» (applicable=true) bilan yaratilgan qabul approval-flow BOSHLANISHIDAN
      // OLDIN posted bo'ladi — stock allaqachon kommit. Faqat hali DRAFT qabulni post
      // qilamiz; posted qabulni qayta post qilish «O'tkazilmaydi: posted → posted»
      // (supply.transition guard, supply.service:1206) — admin-confirm shu sabab «ishlamas»
      // edi (supply #00018 awaiting_admin'da qotib qolgan edi).
      const cur = await this.prisma.client.supply.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { state: true },
      });
      if (cur?.state === 'draft') {
        await this.supply.transition(accountId, userId, id, 'post'); // draft→posted + stock
      }
    } catch (e) {
      // rollback the stage claim so admin can retry
      await this.prisma.client.supply.updateMany({
        where: { id, accountId },
        data: { approvalStage: 'awaiting_admin' },
      });
      throw e;
    }
    await this.logEvent(accountId, id, 'awaiting_admin', 'completed', 'admin_ok', 'admin', userId);
    return this.getApproval(accountId, id);
  }

  /** Omborchi/admin ERP'dan rad etadi — joriy bosqichdan oldingisiga, sabab bilan. */
  async reject(
    accountId: string,
    userId: string,
    id: string,
    raw: unknown,
    actorType: ActorType = 'omborchi',
  ) {
    const dto = RejectSchema.parse(raw);
    const s = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { approvalStage: true },
    });
    if (!s) throw new NotFoundException('Qabul topilmadi');
    const from = s.approvalStage as ApprovalStage;
    const to = rejectTarget(from);
    await this.claim(accountId, id, from, to);
    await this.logEvent(accountId, id, from, to, 'reject', actorType, userId, dto.reason);
    return this.getApproval(accountId, id);
  }

  /** Faza B (Telegram callback) chaqiradi — taminotchi tasdiq/rad. */
  async applySupplierDecision(accountId: string, id: string, approve: boolean, reason?: string) {
    if (approve) {
      await this.claim(accountId, id, 'awaiting_supplier', 'delivering');
      await this.logEvent(
        accountId,
        id,
        'awaiting_supplier',
        'delivering',
        'supplier_ok',
        'supplier',
        null,
      );
      // Faza D2: qabul omborga keldi → omborchilarga inline-tugmali xabar (non-fatal).
      await this.dispatchToOmborchi(accountId, id).catch(() => {});
    } else {
      await this.claim(accountId, id, 'awaiting_supplier', 'none');
      await this.logEvent(
        accountId,
        id,
        'awaiting_supplier',
        'none',
        'reject',
        'supplier',
        null,
        reason,
      );
    }
    return this.getApproval(accountId, id);
  }

  // =========================================================================
  // Faza E (2026-07-30): taminotchi PAROLSIZ magic-link — tasdiq/rad.
  // Token supply+role+agentга bog'langan + muddatli. Public endpoint FAQAT
  // applySupplierDecision chaqiradi (CRUD YO'Q). accountId token-qatordан olinadi.
  // =========================================================================

  /** Taminotchi uchun bir-martalik capability-token + public URL yaratadi (14 kun). */
  async issueSupplierLink(
    accountId: string,
    supplyId: string,
  ): Promise<{ token: string; url: string }> {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { agentId: true },
    });
    if (!supply) throw new NotFoundException('Qabul topilmadi');
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + SUPPLIER_LINK_TTL_MS);
    await this.prisma.client.supplyApprovalLink.create({
      data: { accountId, supplyId, token, role: 'supplier', agentId: supply.agentId, expiresAt },
    });
    const base = process.env.APP_BASE_URL || 'https://erp.sherset.uz';
    return { token, url: `${base}/p/qabul/${token}` };
  }

  /** Token → yaroqli link (muddat tekshiriladi) yoki null. */
  private async loadValidLink(token: string) {
    const link = await this.prisma.client.supplyApprovalLink.findUnique({ where: { token } });
    if (!link || link.expiresAt.getTime() < Date.now()) return null;
    return link;
  }

  /** Public (token-auth): taminotchi ko'radigan qabul ko'rinishi. */
  async getPublicSupplyView(token: string) {
    const link = await this.loadValidLink(token);
    if (!link) throw new NotFoundException("Havola yaroqsiz yoki muddati o'tgan");
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: link.supplyId, accountId: link.accountId, deletedAt: null },
      select: {
        name: true,
        currency: true,
        sumMinor: true,
        approvalStage: true,
        agent: { select: { name: true } },
        positions: {
          orderBy: { position: 'asc' },
          select: { quantity: true, priceMinor: true, product: { select: { name: true } } },
        },
      },
    });
    if (!supply) throw new NotFoundException('Qabul topilmadi');
    return {
      name: supply.name,
      agentName: supply.agent?.name ?? null,
      stage: supply.approvalStage as ApprovalStage,
      currency: supply.currency,
      sumMinor: supply.sumMinor.toString(),
      positions: supply.positions.map((p) => ({
        product: p.product?.name ?? '—',
        quantity: p.quantity.toString(),
        priceMinor: p.priceMinor.toString(),
      })),
    };
  }

  /** Public (token-auth): taminotchi tasdiq (approve=true) yoki rad (false + sabab). */
  async decideViaLink(token: string, approve: boolean, reason?: string) {
    if (!approve && !reason?.trim()) throw new BadRequestException('Rad etish sababi majburiy');
    const link = await this.loadValidLink(token);
    if (!link) throw new NotFoundException("Havola yaroqsiz yoki muddati o'tgan");
    const result = await this.applySupplierDecision(
      link.accountId,
      link.supplyId,
      approve,
      reason?.trim(),
    );
    await this.prisma.client.supplyApprovalLink.update({
      where: { id: link.id },
      data: { usedAt: new Date() },
    });
    return result;
  }

  /**
   * Faza E (MTProto + magic-link): taminotchiga adminning SHAXSIY akkauntidan
   * (userbot) TELEFON-raqami orqali PAROLSIZ tasdiqlash HAVOLASI yuboriladi.
   * Bot EMAS. `hrTelegramOutbox` → worker yuboradi. Non-fatal.
   */
  private async dispatchToSupplier(accountId: string, supplyId: string): Promise<void> {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId },
      select: { name: true, agent: { select: { id: true, phone: true } } },
    });
    const phone = supply?.agent?.phone?.trim();
    if (!supply || !phone) return;
    const { url } = await this.issueSupplierLink(accountId, supplyId);
    await this.prisma.client.hrTelegramOutbox
      .create({
        data: {
          accountId,
          counterpartyId: supply.agent.id,
          toPhone: phone,
          messageText: `📦 Yangi qabul: ${supply.name}\nTasdiqlash yoki rad etish uchun havolani oching:\n${url}`,
          sourceEventType: 'supply_approval_supplier',
          sourceDocId: supplyId,
          status: 'pending',
        },
      })
      .catch(() => {});
  }

  /** Faza B: Telegram callback_query — telegram.service.handleInbound chaqiradi.
   *  Binding-auth: callback kelgan chat supply agentiga bog'langan bo'lishi shart. */
  async handleSupplierCallback(
    accountId: string,
    cbq: { id: string; data: string; chatId: string; messageId: number },
  ): Promise<void> {
    const parsed = parseCallbackData(cbq.data);
    if (!parsed) return;
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg?.botTokenCipher) return;
    const token = decryptPassword(cfg.botTokenCipher);
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: parsed.supplyId, accountId },
      select: { agentId: true },
    });
    const chat = await this.prisma.client.telegramChat.findFirst({
      where: { accountId, chatId: BigInt(cbq.chatId) },
      select: { counterpartyId: true },
    });
    if (!supply || !chat || chat.counterpartyId !== supply.agentId) {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Ruxsat yo'q",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    const edit = (text: string, keyboard?: InlineKeyboard) =>
      tgEditMessageText(token, {
        chatId: cbq.chatId,
        messageId: cbq.messageId,
        text,
        replyMarkup: keyboard,
      }).catch(() => {});
    try {
      if (parsed.action === 'cfm') {
        await edit('Aniqmi? Tasdiqlaysizmi?', doubleConfirmKeyboard(parsed.supplyId));
      } else if (parsed.action === 'cxl') {
        await edit('Tasdiqlaysizmi yoki rad etasizmi?', confirmKeyboard(parsed.supplyId));
      } else if (parsed.action === 'cfm2') {
        await this.applySupplierDecision(accountId, parsed.supplyId, true);
        await edit('✅ Tasdiqlandi — yetkazib berilmoqda.');
      } else if (parsed.action === 'rej') {
        await this.applySupplierDecision(accountId, parsed.supplyId, false, 'Taminotchi rad etdi');
        await edit('❌ Rad etildi.');
      }
    } catch {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Bu qabul allaqachon o'zgargan",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    await tgAnswerCallbackQuery(token, { callbackQueryId: cbq.id }).catch(() => {});
  }

  /** Xodimlar (supply.<action> ruxsatli + Telegram bog'langan) chat_id'lari. */
  private async supplyPermChats(
    accountId: string,
    action: 'update' | 'approve',
  ): Promise<string[]> {
    const emps = await this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        telegramChatId: { not: null },
        roles: {
          some: {
            role: { permissions: { some: { entity: 'supply', action, scope: { not: 'NO' } } } },
          },
        },
      },
      select: { telegramChatId: true },
    });
    return emps.map((e) => e.telegramChatId).filter((c): c is string => !!c);
  }

  /** Callback chat egasi supply.<action> ruxsatli xodimmi → uning id'si yoki null (auth). */
  private async authSupplyEmployee(
    accountId: string,
    chatId: string,
    action: 'update' | 'approve',
  ): Promise<string | null> {
    const emp = await this.prisma.client.employee.findFirst({
      where: {
        accountId,
        telegramChatId: chatId,
        archived: false,
        roles: {
          some: {
            role: { permissions: { some: { entity: 'supply', action, scope: { not: 'NO' } } } },
          },
        },
      },
      select: { id: true },
    });
    return emp?.id ?? null;
  }

  /**
   * Faza D (MTProto, 2026-07-30): omborchilarga adminning SHAXSIY Telegram
   * akkauntidan (userbot) TELEFON-raqami orqali xabar — `hrTelegramOutbox`ga
   * qator qo'shiladi, `hr-telegram-outbox-worker` yuboradi. **Bot EMAS** (egasi
   * talabi: hammasi admin lichkasidan). supply.update ruxsatli + `telegramPhone`i
   * bor xodimlar oladi. Non-fatal — outbox band bo'lsa ham bosqich o'zgargan.
   */
  private async dispatchToOmborchi(accountId: string, supplyId: string): Promise<void> {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId },
      select: { name: true },
    });
    if (!supply) return;
    const emps = await this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        telegramPhone: { not: null },
        roles: {
          some: {
            role: {
              permissions: { some: { entity: 'supply', action: 'update', scope: { not: 'NO' } } },
            },
          },
        },
      },
      select: { id: true, telegramPhone: true },
    });
    const base = process.env.APP_BASE_URL || 'https://erp.sherset.uz';
    const text = `📦 Yangi qabul omborga keldi: ${supply.name}\nSonini sanab tekshiring va tasdiqlang:\n${base}/supplies/${supplyId}`;
    for (const e of emps) {
      const phone = e.telegramPhone?.trim();
      if (!phone) continue;
      await this.prisma.client.hrTelegramOutbox
        .create({
          data: {
            accountId,
            employeeId: e.id,
            toPhone: phone,
            messageText: text,
            sourceEventType: 'supply_approval_omborchi',
            sourceDocId: supplyId,
            status: 'pending',
          },
        })
        .catch(() => {});
    }
  }

  /**
   * Faza D3 (MTProto, 2026-08-01): omborchi tasdiqlagach adminlarga adminning
   * SHAXSIY Telegram akkauntidan (userbot) TELEFON orqali yakuniy-tasdiq xabari —
   * `hrTelegramOutbox`ga qator qo'shiladi, worker yuboradi. **Bot EMAS** (egasi
   * talabi: hammasi lichkadan; personal akkauntda inline-tugma bo'lmaydi → matn+link).
   * `supply.approve` ruxsatli + `telegramPhone`i bor xodimlar oladi. Non-fatal.
   * Ilgari bot-versiya edi — telegram_config bo'lmagani uchun jim `return` qilib
   * xabar YUBORMASDAN qolardi (2026-08-01 bug).
   */
  private async dispatchToAdmin(accountId: string, supplyId: string): Promise<void> {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId },
      select: { name: true },
    });
    if (!supply) return;
    const emps = await this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        telegramPhone: { not: null },
        roles: {
          some: {
            role: {
              permissions: { some: { entity: 'supply', action: 'approve', scope: { not: 'NO' } } },
            },
          },
        },
      },
      select: { id: true, telegramPhone: true },
    });
    const base = process.env.APP_BASE_URL || 'https://erp.sherset.uz';
    const text = `🧾 Omborchi tasdiqladi: ${supply.name}\nYakuniy tasdiq kutilmoqda (tasdiqlansa — omborga qo'shiladi):\n${base}/supplies/${supplyId}`;
    for (const e of emps) {
      const phone = e.telegramPhone?.trim();
      if (!phone) continue;
      await this.prisma.client.hrTelegramOutbox
        .create({
          data: {
            accountId,
            employeeId: e.id,
            toPhone: phone,
            messageText: text,
            sourceEventType: 'supply_approval_admin',
            sourceDocId: supplyId,
            status: 'pending',
          },
        })
        .catch(() => {});
    }
  }

  /** Faza D2: omborchi callback — auth: chat egasi supply.update ruxsatli xodim bo'lishi shart. */
  private async handleOmborchiCallback(
    accountId: string,
    cbq: { id: string; data: string; chatId: string; messageId: number },
  ): Promise<void> {
    const parsed = parseCallbackData(cbq.data);
    if (!parsed) return;
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg?.botTokenCipher) return;
    const token = decryptPassword(cfg.botTokenCipher);
    const empId = await this.authSupplyEmployee(accountId, cbq.chatId, 'update');
    if (!empId) {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Bu amal uchun ruxsatingiz yo'q",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    if (parsed.action === 'oadj') {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Son noto'g'ri bo'lsa — ERP'da qabulni oching va sonni tuzatib tasdiqlang.",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    // ocfm — sonini borligicha tasdiqlash (adjustmentsiz) → delivering→awaiting_admin.
    try {
      await this.omborchiConfirm(accountId, empId, parsed.supplyId, { adjustments: [] });
      await tgEditMessageText(token, {
        chatId: cbq.chatId,
        messageId: cbq.messageId,
        text: "✅ Omborchi tasdiqladi — admin tasdig'i kutilmoqda.",
      }).catch(() => {});
    } catch {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Bu qabul allaqachon o'zgargan",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    await tgAnswerCallbackQuery(token, { callbackQueryId: cbq.id }).catch(() => {});
  }

  /** Faza D3: admin callback — auth: chat egasi supply.approve ruxsatli xodim bo'lishi shart. */
  private async handleAdminCallback(
    accountId: string,
    cbq: { id: string; data: string; chatId: string; messageId: number },
  ): Promise<void> {
    const parsed = parseCallbackData(cbq.data);
    if (!parsed) return;
    const cfg = await this.prisma.client.telegramConfig.findUnique({ where: { accountId } });
    if (!cfg?.botTokenCipher) return;
    const token = decryptPassword(cfg.botTokenCipher);
    const empId = await this.authSupplyEmployee(accountId, cbq.chatId, 'approve');
    if (!empId) {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Bu amal uchun ruxsatingiz yo'q",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    try {
      if (parsed.action === 'acfm') {
        await this.adminConfirm(accountId, empId, parsed.supplyId);
        await tgEditMessageText(token, {
          chatId: cbq.chatId,
          messageId: cbq.messageId,
          text: "✅ Admin tasdiqladi — qabul o'tkazildi, tovar omborga qo'shildi.",
        }).catch(() => {});
      } else {
        // arej — MVP generic sabab (force_reply text-capture keyingi refinement).
        await this.reject(
          accountId,
          empId,
          parsed.supplyId,
          { reason: 'Admin Telegram orqali rad etdi' },
          'admin',
        );
        await tgEditMessageText(token, {
          chatId: cbq.chatId,
          messageId: cbq.messageId,
          text: '❌ Admin rad etdi — omborchiga qaytarildi.',
        }).catch(() => {});
      }
    } catch {
      await tgAnswerCallbackQuery(token, {
        callbackQueryId: cbq.id,
        text: "Bu qabul allaqachon o'zgargan",
        showAlert: true,
      }).catch(() => {});
      return;
    }
    await tgAnswerCallbackQuery(token, { callbackQueryId: cbq.id }).catch(() => {});
  }

  /** Telegram `sa:` callback router — action'ga qarab rol-handlerga yo'naltiradi. */
  async handleApprovalCallback(
    accountId: string,
    cbq: { id: string; data: string; chatId: string; messageId: number },
  ): Promise<void> {
    const parsed = parseCallbackData(cbq.data);
    if (!parsed) return;
    if (parsed.action === 'ocfm' || parsed.action === 'oadj') {
      return this.handleOmborchiCallback(accountId, cbq);
    }
    if (parsed.action === 'acfm' || parsed.action === 'arej') {
      return this.handleAdminCallback(accountId, cbq);
    }
    return this.handleSupplierCallback(accountId, cbq);
  }
}
