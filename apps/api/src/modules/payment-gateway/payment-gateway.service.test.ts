import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encryptPassword } from '../email/crypto.js';
import type { PaymentInService } from '../payment-in/payment-in.service.js';
import { CLICK_ERROR } from './click.protocol.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

/**
 * Faza 19 (`INT-02`, `INT-03`, `INT-04`).
 *
 * Uch bug bir faylda yashagan edi:
 *   INT-02 — «captured» to'lov ERP moliyasiga HECH QAYERDA o'tmasdi
 *            (paymePerform/Click COMPLETE faqat status yozardi).
 *   INT-03 — Click PREPARE summa-tekshiruvi `Number(amount) * 100` (float):
 *            19.99 → 1998.9999999999998 ⇒ to'g'ri to'lov «Incorrect amount».
 *            ⚠️ Audit hisobotidagi misol (`115.23`) NOTO'G'RI edi — o'lchab
 *            ko'rildi: `115.23 * 100 === 11523` AYNAN (IEEE754'da omadli
 *            yaxlitlanadi). Bug-klass real, lekin uni ko'rsatuvchi qiymatlar
 *            boshqa: 0.29 → 28.999…, 8.29 → 828.999…, 19.99 → 1998.999….
 *            Shuning uchun testlar o'lchangan qiymatlarda yuradi.
 *   INT-04 — `providerTxId` unique EMAS + Click PREPARE'da mavjudlik
 *            tekshiruvi yo'q ⇒ provider retry'ida dublikat qatorlar.
 *
 * Prisma o'rniga — lekin `updateMany` semantikasi HAQIQIY (bank-import
 * Faza 20 test'idagi uslub): shart joriy qator holatiga solishtiriladi va
 * faqat mos kelsa yoziladi. Aynan shu atomiklik takroriy PerformTransaction
 * poygasini tutadi; `vi.fn(async () => ({ count: 1 }))` mock'i bug'ni
 * ko'rsata olmasdi.
 */

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';
const ORDER_ID = '00000000-0000-0000-0000-0000000000b1';
const AGENT_ID = '00000000-0000-0000-0000-0000000000c1';
const ORG_ID = '00000000-0000-0000-0000-0000000000d1';
const OWNER_ID = '00000000-0000-0000-0000-0000000000e1';
const SECRET = 'secret-key-xyz';

interface TxRow {
  id: string;
  accountId: string;
  provider: string;
  providerTxId: string | null;
  sourceEntity: string;
  sourceEntityId: string;
  amountMinor: bigint;
  status: string;
  paymentInId: string | null;
  errorMsg: string | null;
  authorizedAt: Date | null;
  capturedAt: Date | null;
  refundedAt: Date | null;
  cancelledAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  providerLog: unknown;
}

function makeTx(o: Partial<TxRow> = {}): TxRow {
  return {
    id: 'tx-1',
    accountId: ACCOUNT_ID,
    provider: 'payme',
    providerTxId: 'pm-1',
    sourceEntity: 'CustomerOrder',
    sourceEntityId: ORDER_ID,
    amountMinor: 1_999n,
    status: 'pending',
    paymentInId: null,
    errorMsg: null,
    authorizedAt: null,
    capturedAt: null,
    refundedAt: null,
    cancelledAt: null,
    failedAt: null,
    createdAt: new Date('2026-08-09T10:00:00Z'),
    providerLog: null,
    ...o,
  };
}

const ORDER = {
  id: ORDER_ID,
  accountId: ACCOUNT_ID,
  agentId: AGENT_ID,
  organizationId: ORG_ID,
  ownerId: OWNER_ID,
  groupId: null,
  currency: 'UZS',
  sumMinor: 1_999n,
  name: 'ЗП-2026-00007',
  deletedAt: null,
};

class FakeP2002 extends Error {
  code = 'P2002';
  meta = { target: ['account_id', 'provider', 'provider_tx_id'] };
}

/** Bitta `where` shartini bitta qatorga solishtiradi (updateMany semantikasi). */
function matchesLeaf(row: TxRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') continue;
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === 'object') {
      const c = cond as { not?: unknown };
      if ('not' in c) {
        if (c.not === null ? actual === null : actual === c.not) return false;
        continue;
      }
      return false;
    }
    if (actual !== cond) return false;
  }
  return true;
}

function matches(row: TxRow, where: Record<string, unknown>): boolean {
  if (!matchesLeaf(row, where)) return false;
  const or = where.OR as Array<Record<string, unknown>> | undefined;
  if (or && !or.some((branch) => matchesLeaf(row, branch))) return false;
  return true;
}

function makePrisma(rows: TxRow[], order: typeof ORDER | null = ORDER) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  let seq = state.size;
  const credsCipher = encryptPassword(JSON.stringify({ secretKey: SECRET }));

  const client = {
    paymentGatewayConfig: {
      findUnique: vi.fn(
        async ({ where }: { where: { accountId_provider: { provider: string } } }) => ({
          id: 'cfg-1',
          accountId: ACCOUNT_ID,
          provider: where.accountId_provider.provider,
          name: 'cfg',
          merchantId: 'm-1',
          credsCipher,
          testMode: true,
          callbackUrl: null,
          enabled: true,
        }),
      ),
    },
    customerOrder: {
      findFirst: vi.fn(async () => order),
    },
    paymentGatewayTx: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of state.values()) if (matches(row, where)) return { ...row };
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Haqiqiy @@unique([accountId, provider, providerTxId]) — dublikat P2002.
        const providerTxId = (data.providerTxId ?? null) as string | null;
        if (providerTxId !== null) {
          for (const row of state.values()) {
            if (
              row.accountId === data.accountId &&
              row.provider === data.provider &&
              row.providerTxId === providerTxId
            ) {
              throw new FakeP2002('Unique constraint failed');
            }
          }
        }
        seq += 1;
        const row = makeTx({ ...(data as Partial<TxRow>), id: `tx-new-${seq}` });
        state.set(row.id, row);
        return { ...row };
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = state.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data);
          return { ...row };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          let count = 0;
          for (const row of state.values()) {
            if (!matches(row, where)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
  };

  return { prisma: { client } as never, state, client };
}

function makePaymentIn(impl?: () => Promise<unknown>) {
  const create = vi.fn(
    impl ?? (async () => ({ id: 'pi-1', name: 'ПП-2026-00001', state: 'draft' })),
  );
  return { create } as unknown as PaymentInService & { create: ReturnType<typeof vi.fn> };
}

function paymeBody(method: string, params: Record<string, unknown>) {
  return { jsonrpc: '2.0' as const, id: 1, method, params };
}

const AUTH = `Basic ${Buffer.from(`Paycom:${SECRET}`).toString('base64')}`;

function clickParams(o: Partial<Record<string, string>> = {}) {
  const params: Record<string, string> = {
    click_trans_id: 'ck-1',
    service_id: 'svc-1',
    click_paydoc_id: 'pd-1',
    merchant_trans_id: ORDER_ID,
    amount: '19.99',
    action: '0',
    error: '0',
    sign_time: '2026-08-09 10:00:00',
    sign_string: '',
    ...o,
  };
  params.sign_string = createHash('md5')
    .update(
      [
        params.click_trans_id,
        params.service_id,
        SECRET,
        params.merchant_trans_id,
        params.amount,
        params.action,
        params.sign_time,
      ].join(''),
    )
    .digest('hex');
  return params as never;
}

// --- INT-02: captured → PaymentIn draft --------------------------------

describe("INT-02 — gateway capture ERP moliyasiga o'tadi", () => {
  it("Payme PerformTransaction: PaymentIn draft yaratiladi va CustomerOrder'ga bog'lanadi", async () => {
    const { prisma, state } = makePrisma([makeTx()]);
    const paymentIn = makePaymentIn();
    const svc = new PaymentGatewayService(prisma, paymentIn);

    const res = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('PerformTransaction', { id: 'pm-1' }),
    )) as { result?: { state: number } };

    expect(res.result?.state).toBe(2);
    expect(paymentIn.create).toHaveBeenCalledTimes(1);
    const [accountId, userId, input] = paymentIn.create.mock.calls[0] as [
      string,
      string | null,
      Record<string, unknown>,
    ];
    expect(accountId).toBe(ACCOUNT_ID);
    // Webhook'da inson-aktor YO'Q — hujjat egasi buyurtmadan meros oladi.
    expect(userId).toBeNull();
    expect(input.agentId).toBe(AGENT_ID);
    expect(input.organizationId).toBe(ORG_ID);
    expect(input.ownerId).toBe(OWNER_ID);
    expect(input.sumMinor).toBe('1999');
    expect(input.currency).toBe('UZS');
    expect(input.operations).toEqual([
      { targetKind: 'customerorder', customerOrderId: ORDER_ID, amountMinor: '1999' },
    ]);
    // Tx endi hujjatga bog'langan (operator qo'lda solishtirmaydi).
    expect(state.get('tx-1')?.paymentInId).toBe('pi-1');
    expect(state.get('tx-1')?.status).toBe('captured');
  });

  it('Click COMPLETE: PaymentIn draft yaratiladi', async () => {
    const { prisma, state } = makePrisma([
      makeTx({ provider: 'click', providerTxId: 'ck-1', status: 'authorized' }),
    ]);
    const paymentIn = makePaymentIn();
    const svc = new PaymentGatewayService(prisma, paymentIn);

    const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams({ action: '1', error: '0' }));

    expect(res.error).toBe(CLICK_ERROR.SUCCESS);
    expect(paymentIn.create).toHaveBeenCalledTimes(1);
    expect(state.get('tx-1')?.paymentInId).toBe('pi-1');
  });

  it('takroriy PerformTransaction: PaymentIn FAQAT BIR MARTA (atomik claim)', async () => {
    const { prisma } = makePrisma([makeTx()]);
    const paymentIn = makePaymentIn();
    const svc = new PaymentGatewayService(prisma, paymentIn);

    const first = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('PerformTransaction', { id: 'pm-1' }),
    )) as { result?: { perform_time: number } };
    const second = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('PerformTransaction', { id: 'pm-1' }),
    )) as { result?: { perform_time: number } };

    expect(paymentIn.create).toHaveBeenCalledTimes(1);
    // Payme takroriy Perform'da AYNAN o'sha perform_time'ni kutadi.
    expect(second.result?.perform_time).toBe(first.result?.perform_time);
  });

  it('PaymentIn yaratish yiqilsa: xato yoziladi va keyingi retry qayta urinadi', async () => {
    const { prisma, state } = makePrisma([makeTx()]);
    let attempt = 0;
    const paymentIn = makePaymentIn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('org topilmadi');
      return { id: 'pi-2', name: 'ПП-2026-00002', state: 'draft' };
    });
    const svc = new PaymentGatewayService(prisma, paymentIn);

    const failed = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('PerformTransaction', { id: 'pm-1' }),
    )) as { error?: { code: number } };
    // Jim «muvaffaqiyat» EMAS — Payme xatoni ko'radi va qayta chaqiradi.
    expect(failed.error).toBeDefined();
    expect(state.get('tx-1')?.errorMsg).toContain('org topilmadi');
    expect(state.get('tx-1')?.paymentInId).toBeNull();

    const retried = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('PerformTransaction', { id: 'pm-1' }),
    )) as { result?: { state: number } };
    expect(retried.result?.state).toBe(2);
    expect(state.get('tx-1')?.paymentInId).toBe('pi-2');
    expect(state.get('tx-1')?.errorMsg).toBeNull();
  });
});

// --- INT-03: float summa-tekshiruvi ------------------------------------

describe('INT-03 — Click summa-tekshiruvi butun-tiyinda', () => {
  // 19.99 → `Number('19.99') * 100 === 1998.9999999999998` (o'lchangan) ⇒ eski
  // qat'iy `!==` tekshiruvi to'g'ri to'lovni rad etardi.
  it("tiyinli summa (19.99 so'm = 1999 tiyin) PREPARE'dan o'tadi", async () => {
    const { prisma } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams({ amount: '19.99' }));

    expect(res.error).toBe(CLICK_ERROR.SUCCESS);
  });

  it("boshqa float-tuzoq qiymatlari ham o'tadi (0.29 · 8.29)", async () => {
    for (const [amount, minor] of [
      ['0.29', 29n],
      ['8.29', 829n],
    ] as const) {
      const { prisma } = makePrisma([], { ...ORDER, sumMinor: minor });
      const svc = new PaymentGatewayService(prisma, makePaymentIn());
      const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams({ amount }));
      expect(res.error).toBe(CLICK_ERROR.SUCCESS);
    }
  });

  it('haqiqiy nomuvofiqlik hamon INCORRECT_AMOUNT', async () => {
    const { prisma } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams({ amount: '19.98' }));

    expect(res.error).toBe(CLICK_ERROR.INCORRECT_AMOUNT);
  });

  it("buzuq summa ('abc') INCORRECT_AMOUNT — NaN jim o'tmaydi", async () => {
    const { prisma } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams({ amount: 'abc' }));

    expect(res.error).toBe(CLICK_ERROR.INCORRECT_AMOUNT);
  });

  it("Payme CheckPerformTransaction 2^53 dan katta summada aniqlik yo'qotmaydi", async () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1 — Number() bunda yaxlitlaydi
    const { prisma } = makePrisma([], { ...ORDER, sumMinor: big });
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    const res = (await svc.handlePaymeRpc(
      ACCOUNT_ID,
      AUTH,
      paymeBody('CheckPerformTransaction', {
        amount: 9_007_199_254_740_992,
        account: { order_id: ORDER_ID },
      }),
    )) as { error?: { code: number } };

    expect(res.error).toBeDefined();
  });
});

// --- INT-04: idempotency ------------------------------------------------

describe('INT-04 — providerTxId idempotency', () => {
  it("takroriy Click PREPARE: bitta qator, o'sha prepare_id", async () => {
    const { prisma, state } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    const first = await svc.handleClickCallback(ACCOUNT_ID, clickParams());
    const second = await svc.handleClickCallback(ACCOUNT_ID, clickParams());

    expect(first.error).toBe(CLICK_ERROR.SUCCESS);
    expect(second.error).toBe(CLICK_ERROR.SUCCESS);
    expect(second.merchant_prepare_id).toBe(first.merchant_prepare_id);
    expect(state.size).toBe(1);
  });

  it('takroriy Payme CreateTransaction: bitta qator', async () => {
    const { prisma, state } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());
    const body = paymeBody('CreateTransaction', {
      id: 'pm-9',
      time: 1_754_733_600_000,
      amount: 1_999,
      account: { order_id: ORDER_ID },
    });

    const first = (await svc.handlePaymeRpc(ACCOUNT_ID, AUTH, body)) as {
      result?: { transaction: string };
    };
    const second = (await svc.handlePaymeRpc(ACCOUNT_ID, AUTH, body)) as {
      result?: { transaction: string };
    };

    expect(second.result?.transaction).toBe(first.result?.transaction);
    expect(state.size).toBe(1);
  });

  it('P2002 poygasi (parallel PREPARE): create yiqilsa mavjud qator qaytariladi', async () => {
    const { prisma, client } = makePrisma([]);
    const svc = new PaymentGatewayService(prisma, makePaymentIn());

    // Birinchi findFirst null qaytaradi (poyga oynasi), keyin create P2002 beradi.
    const realFindFirst = client.paymentGatewayTx.findFirst;
    let calls = 0;
    client.paymentGatewayTx.findFirst = vi.fn(async (args: never) => {
      calls += 1;
      if (calls === 1) return null;
      return realFindFirst(args);
    }) as never;
    await client.paymentGatewayTx.create({
      data: {
        accountId: ACCOUNT_ID,
        provider: 'click',
        providerTxId: 'ck-1',
        sourceEntity: 'CustomerOrder',
        sourceEntityId: ORDER_ID,
        amountMinor: 1_999n,
        status: 'authorized',
      },
    } as never);

    const res = await svc.handleClickCallback(ACCOUNT_ID, clickParams());

    expect(res.error).toBe(CLICK_ERROR.SUCCESS);
    expect(res.merchant_prepare_id).toBeDefined();
  });
});
