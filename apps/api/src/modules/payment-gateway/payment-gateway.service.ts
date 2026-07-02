import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { decryptPassword, encryptPassword } from '../email/crypto.js';
import {
  CLICK_ERROR,
  type ClickCallbackParams,
  clickResponse,
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
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
      callbackUrl: parsed.callbackUrl ?? null,
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
    if (Number(order.sumMinor) !== body.params.amount) {
      return paymeError(body.id, PAYME_ERROR.INVALID_AMOUNT);
    }
    return { jsonrpc: '2.0' as const, id: body.id, result: { allow: true } };
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
      return {
        jsonrpc: '2.0' as const,
        id: body.id,
        result: {
          create_time: time,
          transaction: existing.id,
          state: 1 as const,
        },
      };
    }
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
    return {
      jsonrpc: '2.0' as const,
      id: body.id,
      result: {
        create_time: time,
        transaction: tx.id,
        state: 1 as const,
      },
    };
  }

  private async paymePerform(accountId: string, body: PaymeRpcRequest<{ id: string }>) {
    const tx = await this.prisma.client.paymentGatewayTx.findFirst({
      where: { accountId, provider: 'payme', providerTxId: body.params.id },
    });
    if (!tx) return paymeError(body.id, PAYME_ERROR.TX_NOT_FOUND);
    const performTime = Date.now();
    const updated = await this.prisma.client.paymentGatewayTx.update({
      where: { id: tx.id },
      data: {
        status: 'captured',
        capturedAt: new Date(performTime),
        authorizedAt: tx.authorizedAt ?? new Date(performTime),
      },
    });
    return {
      jsonrpc: '2.0' as const,
      id: body.id,
      result: {
        transaction: updated.id,
        perform_time: performTime,
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
      },
    });
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
      if (Number(order.sumMinor) !== Number(params.amount) * 100) {
        return clickResponse(
          params.click_trans_id,
          params.merchant_trans_id,
          CLICK_ERROR.INCORRECT_AMOUNT,
        );
      }
      const tx = await this.prisma.client.paymentGatewayTx.create({
        data: {
          accountId,
          provider: 'click',
          providerTxId: params.click_trans_id,
          sourceEntity: 'CustomerOrder',
          sourceEntityId: order.id,
          amountMinor: BigInt(Math.round(Number(params.amount) * 100)),
          status: 'authorized',
          authorizedAt: new Date(),
        },
      });
      return clickResponse(
        params.click_trans_id,
        params.merchant_trans_id,
        CLICK_ERROR.SUCCESS,
        tx.id,
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
      await this.prisma.client.paymentGatewayTx.update({
        where: { id: tx.id },
        data: {
          status: 'captured',
          capturedAt: new Date(),
        },
      });
      return clickResponse(params.click_trans_id, params.merchant_trans_id, CLICK_ERROR.SUCCESS);
    }
    return clickResponse(
      params.click_trans_id,
      params.merchant_trans_id,
      CLICK_ERROR.ACTION_NOT_FOUND,
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
