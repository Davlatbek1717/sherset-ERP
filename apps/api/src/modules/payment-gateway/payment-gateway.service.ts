import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import { PaymentInService } from '../payment-in/payment-in.service.js';
import {
  CLICK_ERROR,
  type ClickCallbackParams,
  clickResponse,
  parseClickAmountToMinor,
  verifyClickSign,
} from './click.protocol.js';
import {
  PAYME_ERROR,
  type PaymeRpcRequest,
  paymeError,
  verifyPaymeAuth,
} from './payme.protocol.js';
import {
  InitiatePaymentSchema,
  ListGatewayTxSchema,
  type SavePaymentGatewayConfigInput,
  SavePaymentGatewayConfigSchema,
} from './payment-gateway.schema.js';

interface PublicPaymentGatewayConfig {
  id: string;
  provider: string;
  name: string;
  merchantId: string;
  testMode: boolean;
  callbackUrl: string | null;
  hasCreds: boolean;
  enabled: boolean;
}

/**
 * PaymentGatewayService — Payme + Click + (scaffolded) Uzcard/Humo/Octo/Multicard.
 *
 * Two flows:
 *
 * 1. **Inbound webhook flow** (Payme JSON-RPC, Click form-encoded):
 *    Provider → handlePaymeRpc / handleClickCallback → verify signature
 *    → look up source order → write/update PaymentGatewayTx → return
 *    provider-shaped response.
 *
 * 2. **Outbound initiate flow** (rare for Payme/Click — they use
 *    redirect-style; useful for Uzcard direct API):
 *    Operator clicks "Pay" → initiatePayment() → provider HTTP POST
 *    → record PaymentGatewayTx with status='pending'.
 *
 * Faza 19 (`INT-02`) dan beri capture UCHINCHI qadamga ega: tranzaksiya
 * `captured`ga o'tganda ERP'da **PaymentIn draft** tug'iladi va CustomerOrder'ga
 * bog'lanadi. Ilgari bu qadam umuman yo'q edi — pul kelardi, daftar bilmasdi.
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentInService) private readonly paymentIn: PaymentInService,
  ) {}

  // --- config ----------------------------------------------------------

  async listConfigs(accountId: string): Promise<PublicPaymentGatewayConfig[]> {
    const rows = await this.prisma.client.paymentGatewayConfig.findMany({
      where: { accountId },
      orderBy: { provider: 'asc' },
    });
    return rows.map((r) => this.publicView(r));
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicPaymentGatewayConfig> {
    const r = SavePaymentGatewayConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data as SavePaymentGatewayConfigInput;
    const existing = await this.prisma.client.paymentGatewayConfig.findUnique({
      where: { accountId_provider: { accountId, provider: parsed.provider } },
    });
    const credsCipher = parsed.creds ? encryptPassword(JSON.stringify(parsed.creds)) : undefined;
    if (!credsCipher && !existing) {
      throw new BadRequestException('Birinchi sozlash uchun creds majburiy');
    }
    const data = {
      accountId,
      provider: parsed.provider,
      name: parsed.name,
      merchantId: parsed.merchantId,
      ...(credsCipher !== undefined ? { credsCipher } : {}),
      testMode: parsed.testMode,
      // PATCH-semantika (`INT-13`, faza 21 naqshi / faza Q11 klass-auditi):
      // kelmagan `callbackUrl` TEGILMAYDI. Ilgari `parsed.callbackUrl ?? null`
      // uslubi uni yubormagan yangilashda (creds rotatsiyasi, `testMode`
      // o'zgarishi) Payme/Click callback manzilini jimgina o'chirardi — bu
      // endpointning web-UI'si yo'q, chaqiruvchi tashqi integratsiya.
      // Ataylab bo'sh string yuborilsa schema uni `null` qiladi ⇒ tozalash
      // yo'li saqlanadi.
      ...(parsed.callbackUrl !== undefined ? { callbackUrl: parsed.callbackUrl } : {}),
    };
    const saved = existing
      ? await this.prisma.client.paymentGatewayConfig.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.client.paymentGatewayConfig.create({
          data: { ...data, credsCipher: credsCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string, provider: string): Promise<{ ok: true }> {
    await this.prisma.client.paymentGatewayConfig.deleteMany({
      where: { accountId, provider },
    });
    return { ok: true };
  }

  // --- transactions ----------------------------------------------------

  async listTxs(accountId: string, raw: unknown) {
    const filter = ListGatewayTxSchema.parse(raw);
    const where: Prisma.PaymentGatewayTxWhereInput = {
      accountId,
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.sourceEntity ? { sourceEntity: filter.sourceEntity } : {}),
      ...(filter.sourceEntityId ? { sourceEntityId: filter.sourceEntityId } : {}),
    };
    const rows = await this.prisma.client.paymentGatewayTx.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, nextCursor };
  }

  async findTx(accountId: string, id: string) {
    const row = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`PaymentGatewayTx ${id} not found`);
    return row;
  }

  async initiatePayment(accountId: string, raw: unknown) {
    const r = InitiatePaymentSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    return this.prisma.client.paymentGatewayTx.create({
      data: {
        accountId,
        provider: parsed.provider,
        sourceEntity: parsed.sourceEntity,
        sourceEntityId: parsed.sourceEntityId,
        amountMinor: BigInt(parsed.amountMinor),
        status: 'pending',
      },
    });
  }

  // --- Payme JSON-RPC handler ------------------------------------------

  /**
   * Process an inbound Payme JSON-RPC call. The controller routes here
   * with the raw RPC body + Authorization header. Verifies basic auth,
   * dispatches by method, and returns a JSON-RPC response (success or
   * error envelope).
   */
  async handlePaymeRpc(
    accountId: string,
    authHeader: string | undefined,
    body: PaymeRpcRequest<Record<string, unknown>>,
  ) {
    const cfg = await this.prisma.client.paymentGatewayConfig.findUnique({
      where: { accountId_provider: { accountId, provider: 'payme' } },
    });
    if (!cfg || !cfg.enabled) {
      return paymeError(body.id, PAYME_ERROR.AUTH_FAILED, 'gateway not configured');
    }
    const creds = JSON.parse(decryptPassword(cfg.credsCipher)) as { secretKey?: string };
    if (!creds.secretKey || !verifyPaymeAuth(authHeader, creds.secretKey)) {
      return paymeError(body.id, PAYME_ERROR.AUTH_FAILED);
    }

    try {
      // Each handler narrows the params shape internally. We pass the raw
      // RPC envelope through; the cast is safe because Payme only invokes
      // us with documented methods + bodies that match each schema.
      switch (body.method) {
        case 'CheckPerformTransaction':
          return await this.paymeCheckPerform(accountId, body as never);
        case 'CreateTransaction':
          return await this.paymeCreate(accountId, body as never);
        case 'PerformTransaction':
          return await this.paymePerform(accountId, body as never);
        case 'CancelTransaction':
          return await this.paymeCancel(accountId, body as never);
        case 'CheckTransaction':
          return await this.paymeCheck(accountId, body as never);
        default:
          return paymeError(body.id, PAYME_ERROR.INVALID_REQUEST, `unknown method ${body.method}`);
      }
    } catch (err) {
      this.logger.error(`Payme ${body.method} failed: ${String(err)}`);
      return paymeError(body.id, PAYME_ERROR.INVALID_REQUEST, (err as Error).message);
    }
  }

  private async paymeCheckPerform(
    accountId: string,
    body: PaymeRpcRequest<{ amount: number; account: { order_id: string } }>,
  ) {
    const orderId = body.params.account?.order_id;
    if (!orderId) return paymeError(body.id, PAYME_ERROR.ORDER_NOT_FOUND);
    // Look up source order — V1 supports CustomerOrder by id.
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id: orderId, accountId, deletedAt: null },
    });
    if (!order) return paymeError(body.id, PAYME_ERROR.ORDER_NOT_FOUND);
    if (!this.paymeAmountMatches(order.sumMinor, body.params.amount)) {
      return paymeError(body.id, PAYME_ERROR.INVALID_AMOUNT);
    }
    return { jsonrpc: '2.0' as const, id: body.id, result: { allow: true } };
  }

  /**
   * Payme `amount` — butun tiyin. Solishtiruv BigInt'da: `Number(sumMinor)`
   * 2^53 dan katta summalarda yaxlitlab yuborardi (INT-03 ning ikkinchi yarmi),
   * ya'ni katta buyurtmada noto'g'ri summa «mos» ko'rinishi mumkin edi.
   */
  private paymeAmountMatches(sumMinor: bigint, amount: unknown): boolean {
    if (typeof amount !== 'number' || !Number.isInteger(amount)) return false;
    return sumMinor === BigInt(amount);
  }

  private async paymeCreate(
    accountId: string,
    body: PaymeRpcRequest<{
      id: string;
      time: number;
      amount: number;
      account: { order_id: string };
    }>,
  ) {
    const { id: providerId, time, amount, account } = body.params;
    const orderId = account.order_id;

    // Idempotent: same providerId returns existing record.
    const existing = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider: 'payme', providerTxId: providerId },
    });
    if (existing) {
      return this.paymeCreateResult(body.id, time, existing.id);
    }

    // Summa endi shu yerda ham qulflanadi: `amountMinor` capture'da to'g'ridan
    // to'g'ri PaymentIn summasiga aylanadi (INT-02), shuning uchun buyurtma bilan
    // mos kelmagan CreateTransaction hujjatga noto'g'ri summa olib kelardi.
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id: orderId, accountId, deletedAt: null },
      select: { id: true, sumMinor: true },
    });
    if (!order) return paymeError(body.id, PAYME_ERROR.ORDER_NOT_FOUND);
    if (!this.paymeAmountMatches(order.sumMinor, amount)) {
      return paymeError(body.id, PAYME_ERROR.INVALID_AMOUNT);
    }

    try {
      const tx = await this.prisma.client.paymentGatewayTx.create({
        data: {
          accountId,
          provider: 'payme',
          providerTxId: providerId,
          sourceEntity: 'CustomerOrder',
          sourceEntityId: orderId,
          amountMinor: BigInt(amount),
          status: 'pending',
          providerLog: { event: 'CreateTransaction', time } as Prisma.InputJsonValue,
        },
      });
      return this.paymeCreateResult(body.id, time, tx.id);
    } catch (err) {
      // Parallel CreateTransaction poygasi — endi DB cheklovi hakam (INT-04).
      const raced = await this.findByProviderTxIdOnConflict(err, accountId, 'payme', providerId);
      if (!raced) throw err;
      return this.paymeCreateResult(body.id, time, raced.id);
    }
  }

  private paymeCreateResult(id: number | string, time: number, txId: string) {
    return {
      jsonrpc: '2.0' as const,
      id,
      result: { create_time: time, transaction: txId, state: 1 as const },
    };
  }

  /**
   * P2002 (unique `[accountId, provider, providerTxId]`) — check-then-act
   * poygasida ikkinchi yozuvchi shu yerga tushadi va g'olib yaratgan qatorni
   * qaytaradi. Boshqa xatolarda `null` (chaqiruvchi qayta throw qiladi).
   */
  private async findByProviderTxIdOnConflict(
    err: unknown,
    accountId: string,
    provider: string,
    providerTxId: string,
  ) {
    if ((err as { code?: string }).code !== 'P2002') return null;
    return this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider, providerTxId },
    });
  }

  private async paymePerform(accountId: string, body: PaymeRpcRequest<{ id: string }>) {
    const tx = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider: 'payme', providerTxId: body.params.id },
    });
    if (!tx) return paymeError(body.id, PAYME_ERROR.TX_NOT_FOUND);
    // Xato bo'lsa THROW qiladi — handlePaymeRpc uni Payme xato-konvertiga
    // aylantiradi va Payme PerformTransaction'ni qayta chaqiradi (protokolda
    // shunday); jim «muvaffaqiyat» qaytarish pulni daftarsiz qoldirardi.
    const { capturedAt } = await this.settleCapture(accountId, tx);
    return {
      jsonrpc: '2.0' as const,
      id: body.id,
      result: {
        transaction: tx.id,
        // Takroriy Perform AYNAN o'sha perform_time'ni qaytaradi (Payme
        // solishtiradi) — oldin har chaqiruvda `Date.now()` edi.
        perform_time: capturedAt.getTime(),
        state: 2 as const,
      },
    };
  }

  private async paymeCancel(
    accountId: string,
    body: PaymeRpcRequest<{ id: string; reason: number }>,
  ) {
    const tx = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider: 'payme', providerTxId: body.params.id },
    });
    if (!tx) return paymeError(body.id, PAYME_ERROR.TX_NOT_FOUND);
    const cancelTime = Date.now();
    const wasPerformed = tx.status === 'captured';
    const updated = await this.prisma.client.paymentGatewayTx.update({
      where: { id: tx.id },
      data: {
        status: wasPerformed ? 'refunded' : 'cancelled',
        cancelledAt: new Date(cancelTime),
        refundedAt: wasPerformed ? new Date(cancelTime) : null,
        providerLog: {
          event: 'CancelTransaction',
          reason: body.params.reason,
          // Capture'dan keyingi bekor qilish = QAYTARISH. ERP'da avtomatik
          // teskari hujjat HALI YO'Q (reja Faza 19 buni «qaytarish YOKI
          // admin-xabar» deb qoldirgan) — draft PaymentIn qo'lda o'chiriladi.
          refundPendingPaymentInId: wasPerformed ? (tx.paymentInId ?? null) : null,
        } as Prisma.InputJsonValue,
      },
    });
    if (wasPerformed) {
      this.logger.warn(
        `Payme CancelTransaction ${tx.id}: capture QAYTARILDI — ERP'da teskari hujjat ` +
          `avtomatik yaratilmaydi. PaymentIn ${tx.paymentInId ?? "(yo'q)"} qo'lda ko'rib chiqilsin.`,
      );
    }
    return {
      jsonrpc: '2.0' as const,
      id: body.id,
      result: {
        transaction: updated.id,
        cancel_time: cancelTime,
        state: wasPerformed ? -2 : -1,
      },
    };
  }

  private async paymeCheck(accountId: string, body: PaymeRpcRequest<{ id: string }>) {
    const tx = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider: 'payme', providerTxId: body.params.id },
    });
    if (!tx) return paymeError(body.id, PAYME_ERROR.TX_NOT_FOUND);
    let state: -2 | -1 | 1 | 2 = 1;
    if (tx.status === 'captured') state = 2;
    else if (tx.status === 'refunded') state = -2;
    else if (tx.status === 'cancelled') state = -1;
    return {
      jsonrpc: '2.0' as const,
      id: body.id,
      result: {
        create_time: tx.createdAt.getTime(),
        perform_time: tx.capturedAt?.getTime() ?? 0,
        cancel_time: tx.cancelledAt?.getTime() ?? 0,
        transaction: tx.id,
        state,
        reason: null,
      },
    };
  }

  // --- Click form-encoded handler --------------------------------------

  async handleClickCallback(accountId: string, params: ClickCallbackParams) {
    const cfg = await this.prisma.client.paymentGatewayConfig.findUnique({
      where: { accountId_provider: { accountId, provider: 'click' } },
    });
    if (!cfg || !cfg.enabled) {
      return clickResponse(
        params.click_trans_id,
        params.merchant_trans_id,
        CLICK_ERROR.SIGN_CHECK_FAILED,
      );
    }
    const creds = JSON.parse(decryptPassword(cfg.credsCipher)) as { secretKey?: string };
    if (!creds.secretKey || !verifyClickSign(params, creds.secretKey)) {
      return clickResponse(
        params.click_trans_id,
        params.merchant_trans_id,
        CLICK_ERROR.SIGN_CHECK_FAILED,
      );
    }

    const action = Number(params.action);
    if (action === 0) {
      // PREPARE — verify order exists + amount matches
      const order = await this.prisma.client.customerOrder.findFirst({
        where: { id: params.merchant_trans_id, accountId, deletedAt: null },
      });
      if (!order) {
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.USER_NOT_FOUND,
        );
      }
      // INT-03: float ko'paytirish YO'Q — o'nlik string butun tiyinga o'giriladi.
      const amountMinor = parseClickAmountToMinor(params.amount);
      if (amountMinor === null || amountMinor !== order.sumMinor) {
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.INCORRECT_AMOUNT,
        );
      }
      // INT-04: PREPARE'ni qayta yuborish (tarmoq retry — protokolda normal)
      // ilgari HAR SAFAR yangi qator yaratardi.
      const existing = await this.prisma.client.paymentGatewayTx.findFirst({
        where: { accountId, provider: 'click', providerTxId: params.click_trans_id },
      });
      if (existing) {
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.SUCCESS,
          existing.id,
        );
      }
      let txId: string;
      try {
        const tx = await this.prisma.client.paymentGatewayTx.create({
          data: {
            accountId,
            provider: 'click',
            providerTxId: params.click_trans_id,
            sourceEntity: 'CustomerOrder',
            sourceEntityId: order.id,
            amountMinor,
            status: 'authorized',
            authorizedAt: new Date(),
          },
        });
        txId = tx.id;
      } catch (err) {
        const raced = await this.findByProviderTxIdOnConflict(
          err,
          accountId,
          'click',
          params.click_trans_id,
        );
        if (!raced) throw err;
        txId = raced.id;
      }
      return clickResponse(
        params.click_trans_id,
        params.merchant_trans_id,
        CLICK_ERROR.SUCCESS,
        txId,
      );
    }
    if (action === 1) {
      // COMPLETE — finalise (capture) the previously prepared tx
      const tx = await this.prisma.client.paymentGatewayTx.findFirst({
        where: {
          accountId,
          provider: 'click',
          providerTxId: params.click_trans_id,
        },
      });
      if (!tx) {
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.TRANSACTION_NOT_FOUND,
        );
      }
      const errorCode = Number(params.error);
      if (errorCode !== 0) {
        await this.prisma.client.paymentGatewayTx.update({
          where: { id: tx.id },
          data: {
            status: 'failed',
            failedAt: new Date(),
            errorMsg: params.error_note ?? `error ${errorCode}`,
          },
        });
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.TRANSACTION_CANCELLED,
        );
      }
      try {
        await this.settleCapture(accountId, tx);
      } catch {
        // Pul Click tomonida qabul qilingan, lekin ERP hujjati yozilmadi —
        // xatoni Click'ga qaytaramiz (u qayta chaqiradi va `settleCapture`
        // retry-shoxi qayta urinadi). `errorMsg` qatorga allaqachon yozilgan.
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.FAILED_TO_UPDATE_USER,
        );
      }
      return clickResponse(params.click_trans_id, params.merchant_trans_id, CLICK_ERROR.SUCCESS);
    }
    return clickResponse(
      params.click_trans_id,
      params.merchant_trans_id,
      CLICK_ERROR.ACTION_NOT_FOUND,
    );
  }

  // --- capture → ERP moliyasi (INT-02) ---------------------------------

  /**
   * Tranzaksiyani `captured`ga o'tkazadi VA shu capture uchun PaymentIn draft
   * yozadi (bir marta, aynan bir marta).
   *
   * **Nega bitta DB-tranzaksiya emas.** Reja «(tx) ichida» degan edi; PaymentIn
   * yaratish `PaymentInService.create` orqali boradi (nom-generatsiya, attribut
   * validatsiya, audit, webhook) va u o'z klientida ishlaydi — uni tashqi `tx`
   * klientiga o'tkazish butun servisni qayta simlashni talab qilardi. Shuning
   * o'rniga **atomik claim** ishlatiladi, u xuddi shu ikki kafolatni beradi:
   *   • dublikat YO'Q — `updateMany` sharti qatorni qulflab qayta baholanadi,
   *     shuning uchun parallel ikki Perform'dan faqat bittasi `count === 1`
   *     oladi (bank-import Faza 20 dagi claim uslubi);
   *   • yo'qolish YO'Q — hujjat yozilmasa `errorMsg` to'ldiriladi va xato
   *     yuqoriga otiladi; provider retry'ida ikkinchi shart-shoxi (`paymentInId
   *     IS NULL AND errorMsg IS NOT NULL`) yana claim beradi ⇒ o'z-o'zini
   *     tuzatadi. Qoldiq oyna: capture yozildi-yu retry hech qachon kelmasa,
   *     qator `captured + paymentInId=null + errorMsg` bo'lib qoladi — bu
   *     KO'RINADIGAN qarz (operator filtri), jimgina yo'qolish emas.
   */
  private async settleCapture(
    accountId: string,
    tx: { id: string; authorizedAt: Date | null; capturedAt: Date | null },
  ): Promise<{ capturedAt: Date }> {
    const at = new Date();
    const claim = await this.prisma.client.paymentGatewayTx.updateMany({
      where: {
        id: tx.id,
        accountId,
        OR: [
          { status: { not: 'captured' } },
          // Oldingi urinishda hujjat yozilmagan — retry qayta uradi.
          { paymentInId: null, errorMsg: { not: null } },
        ],
      },
      data: {
        status: 'captured',
        capturedAt: at,
        authorizedAt: tx.authorizedAt ?? at,
        errorMsg: null,
      },
    });

    if (claim.count === 0) {
      // Allaqachon capture qilingan (va hujjati bor) — takroriy chaqiruv.
      const fresh = await this.prisma.client.paymentGatewayTx.findFirst({
        where: { id: tx.id, accountId },
        select: { capturedAt: true },
      });
      return { capturedAt: fresh?.capturedAt ?? tx.capturedAt ?? at };
    }

    try {
      await this.writeCapturePaymentIn(accountId, tx.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.client.paymentGatewayTx.update({
        where: { id: tx.id },
        data: { errorMsg: `PaymentIn yaratilmadi: ${msg}` },
      });
      this.logger.error(
        `Gateway capture ${tx.id}: pul qabul qilindi, lekin PaymentIn yozilmadi — ${msg}`,
      );
      throw err;
    }
    return { capturedAt: at };
  }

  /** Capture uchun PaymentIn draft + tranzaksiyaga havola. */
  private async writeCapturePaymentIn(accountId: string, txId: string): Promise<void> {
    const tx = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { id: txId, accountId },
    });
    if (!tx) throw new Error(`PaymentGatewayTx ${txId} topilmadi`);
    if (tx.sourceEntity !== 'CustomerOrder') {
      throw new Error(`Qo'llab-quvvatlanmagan manba hujjat: ${tx.sourceEntity}`);
    }
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id: tx.sourceEntityId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        agentId: true,
        organizationId: true,
        ownerId: true,
        groupId: true,
        currency: true,
      },
    });
    if (!order) throw new Error(`CustomerOrder ${tx.sourceEntityId} topilmadi`);
    // Payme/Click UZS tiyinda hisob-kitob qiladi. Boshqa valyutali buyurtmada
    // `amountMinor`ni o'sha valyuta minor-birligi deb yozish M-03/M-04 sinfidagi
    // ~12 000× xatoni tug'dirardi — konvertatsiya qoidasi aniqlanmaguncha TO'XTA.
    if (order.currency !== 'UZS') {
      throw new Error(
        `Gateway to'lovi UZS'da, buyurtma ${order.name} esa ${order.currency}da — valyuta konvertatsiyasi qo'llab-quvvatlanmaydi`,
      );
    }

    const amount = tx.amountMinor.toString();
    // Inson-aktor YO'Q (webhook) — `userId: null`. Egalik buyurtmadan meros
    // oladi, shunda hujjat o'sha sotuvchining ro'yxatida ko'rinadi.
    const created = await this.paymentIn.create(accountId, null, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      ownerId: order.ownerId ?? undefined,
      groupId: order.groupId ?? undefined,
      moment: new Date().toISOString(),
      sumMinor: amount,
      currency: order.currency,
      paymentPurpose: `${tx.provider} to'lovi · buyurtma ${order.name}`,
      incomingNumber: tx.providerTxId ?? undefined,
      operations: [{ targetKind: 'customerorder', customerOrderId: order.id, amountMinor: amount }],
    });
    if (!created) throw new Error("PaymentIn yaratilmadi (bo'sh natija)");

    await this.prisma.client.paymentGatewayTx.update({
      where: { id: tx.id },
      data: { paymentInId: created.id },
    });
    this.logger.log(
      `Gateway capture ${tx.id} (${tx.provider}) → PaymentIn ${created.id} · buyurtma ${order.name}`,
    );
  }

  // --- helpers ---------------------------------------------------------

  private publicView(row: {
    id: string;
    provider: string;
    name: string;
    merchantId: string;
    testMode: boolean;
    callbackUrl: string | null;
    credsCipher: string;
    enabled: boolean;
  }): PublicPaymentGatewayConfig {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      merchantId: row.merchantId,
      testMode: row.testMode,
      callbackUrl: row.callbackUrl,
      hasCreds: row.credsCipher.length > 0,
      enabled: row.enabled,
    };
  }
}
