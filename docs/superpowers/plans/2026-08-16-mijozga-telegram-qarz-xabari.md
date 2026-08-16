# Mijozga Telegram qarz xabarlari — implementatsiya rejasi (B1+B2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kassada qarzga savdo qilinganda, qarz to'langanda va qarz tuzatilganda (qaytarish/bekor) mijozning shaxsiy Telegram chatiga admin raqamidan xabar borsin.

**Architecture:** Xabar zanjiri (`counterparty-debt-notify` moduli, MTProto outbox, o'zbekcha matnlar, dedup, FLOOD_WAIT himoyasi) **allaqachon qurilgan**. Yagona uzilish — `CounterpartyBalanceChangeSource` union'ida kassa oqimi yo'q, shuning uchun `applyDelta` hodisasi `source`siz chiqadi va notifier uni jimgina tashlaydi. Reja shu uzilishni ulaydi, matn shablonlarini qo'shadi va ikkita xavfsizlik qulfini o'rnatadi.

**Tech Stack:** NestJS · Prisma · Vitest · biome · pnpm/turbo monorepo (`apps/api`)

**Spec:** `docs/superpowers/specs/2026-08-16-mijozga-telegram-qarz-xabari-design.md`

## Global Constraints

- **Mavjud xabar matnlari O'ZGARMAYDI.** `invoiceOut`/`paymentIn`/`cashIn`/`paymentOut`/`cashOut`/`invoiceIn` uchun chiqadigan satrlar `counterparty-message.util.test.ts` da aynan qulflangan — ular baytma-bayt o'sha holicha qolishi shart.
- **Yo'nalish ishorasi:** `deltaMinor > 0` = mijozning qarzi OSHDI · `< 0` = KAMAYDI. Yangi matnlar turni emas, **ishorani** o'qib so'z tanlaydi (bitta manba turi ikki xil xabar beradi).
- **`source` optional qoladi.** Ommaviy/backfill skriptlar uni **hech qachon uzatmasin** — bu «backfill bombasi»ga qarshi birinchi qatlam (spec §5.2).
- **Notifier hech qachon throw qilmaydi** — barcha yangi kod mavjud `try/catch` ichida qoladi, hodisa avtobusiga xato qaytmaydi.
- **Gate (commitdan oldin):** `pnpm --filter @moysklad/api typecheck` · `pnpm biome check` · o'zgargan modul Vitest'i.
- **Prod bayrog'i (`DEBT_NOTIFY_ENABLED`) 4-vazifagacha `false` qoladi** — kod chiqsa ham xabar ketmaydi.

---

### Task 1: Manba turlari + xabar shablonlari (sof, wiring yo'q)

Bu vazifa faqat **sof funksiya** va **tip**ni o'zgartiradi — hech qanday hodisa yuborilmaydi, shuning uchun prodga ta'siri nol.

**Files:**
- Modify: `apps/api/src/modules/hr/hr-shared/hr-events.types.ts:145-151`
- Modify: `apps/api/src/modules/counterparty-debt-notify/counterparty-message.util.ts:55-110`
- Test: `apps/api/src/modules/counterparty-debt-notify/counterparty-message.util.test.ts`

**Interfaces:**
- Consumes: `CounterpartyMessageContext` (mavjud), `fmtAmount`, `cpTotal` (mavjud, o'zgarmaydi)
- Produces: `CounterpartyBalanceChangeSource` ga uch yangi qiymat — `'retailsale' | 'debtpayment' | 'debt'`; `buildCounterpartyMessage` ular uchun matn qaytaradi

- [ ] **Step 1: Yiqiladigan testlarni yoz**

`counterparty-message.util.test.ts` oxiriga qo'sh:

```ts
describe('kassa oqimi — yangi manba turlari', () => {
  it('retailsale, delta>0 → kassada qarzga savdo', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'retailsale',
      deltaMinor: 1_000_000n,
      newBalanceMinor: 5_000_000n,
    });
    expect(t).toContain('📄 Kassa savdosi');
    expect(t).toContain("🛒 Qarzga qo'shildi: +10 000 so'm");
    expect(t).toContain("💰 Jami qarzingiz: 50 000 so'm");
  });

  it('debtpayment, delta<0 → qarz to`lovi, qoldiq ko`rsatiladi', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debtpayment',
      deltaMinor: -2_000_000n,
      newBalanceMinor: 3_000_000n,
    });
    expect(t).toContain("📄 Qarz to'lovi");
    expect(t).toContain("✅ To'lovingiz qabul qilindi: 20 000 so'm");
    expect(t).toContain("💰 Qolgan qarzingiz: 30 000 so'm");
  });

  it('debtpayment qarzni NOLGA tushirsa ham xabar beriladi', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debtpayment',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(t).not.toBeNull();
    expect(t).toContain("💰 Hisob teng — qarzingiz yo'q");
  });

  it('debt, delta>0 → qo`lda ochilgan qarz', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debt',
      deltaMinor: 1_000_000n,
      newBalanceMinor: 1_000_000n,
    });
    expect(t).toContain('📄 Qarz');
    expect(t).toContain("🛒 Qarzga qo'shildi: +10 000 so'm");
  });

  it('TUZATISH: retailsale, delta<0 → qaytarish, qarz kamaydi', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'retailsale',
      deltaMinor: -1_000_000n,
      newBalanceMinor: 4_000_000n,
    });
    expect(t).toContain('📄 Qaytarish');
    expect(t).toContain("↩️ Qarzingizdan ayirildi: 10 000 so'm");
    expect(t).toContain("💰 Qolgan qarzingiz: 40 000 so'm");
  });

  it('TUZATISH nolga tushsa ham xabar beriladi (jim qolmaydi)', () => {
    const t = buildCounterpartyMessage({
      ...base,
      source: 'debt',
      deltaMinor: -5_000_000n,
      newBalanceMinor: 0n,
    });
    expect(t).not.toBeNull();
    expect(t).toContain("💰 Hisob teng — qarzingiz yo'q");
  });
});

describe('mavjud matnlar o`zgarmadi (regressiya qulfi)', () => {
  it('invoiceOut aynan eski satr', () => {
    expect(buildCounterpartyMessage({ ...base, source: 'invoiceOut' })).toBe(
      "Hurmatli Akme,\n📄 Sotuv\n🛒 Qarzga qo'shildi: +10 000 so'm\n━━━━━━━━━━━━\n💰 Jami qarzingiz: 50 000 so'm",
    );
  });
});
```

- [ ] **Step 2: Testni yugurtirib, YIQILISHINI ko'r**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/counterparty-message.util.test.ts`
Expected: FAIL — TypeScript `'retailsale'` ni `CounterpartyBalanceChangeSource` ga bermaydi.

- [ ] **Step 3: Union'ni kengaytir**

`hr-events.types.ts` — mavjud union'ga uch qator qo'sh (izohni ham yangila):

```ts
export type CounterpartyBalanceChangeSource =
  | 'invoiceIn'
  | 'invoiceOut'
  | 'paymentIn'
  | 'paymentOut'
  | 'cashIn'
  | 'cashOut'
  /** Kassa (POS) qarzga savdosi. `deltaMinor < 0` ⇒ qaytarish/tuzatish. */
  | 'retailsale'
  /** Kassa qarz to'lovi (`recalcDebt` → `-paidDelta`). */
  | 'debtpayment'
  /** Qo'lda ochilgan QRZ- qarz. `deltaMinor < 0` ⇒ qarz o'chirildi/tuzatildi. */
  | 'debt';
```

- [ ] **Step 4: `cpHead` ni ishoraga sezgir qil**

`counterparty-message.util.ts` — `cpHead` imzosiga uchinchi parametr qo'sh va uch `case` qo'sh. **Mavjud `case` lar tegilmaydi.**

```ts
/** Per-source report title + the "this operation" amount line (counterparty framing). */
function cpHead(
  source: CounterpartyBalanceChangeSource,
  amt: string,
  /** `true` ⇒ delta manfiy: qarz KAMAYDI (to'lov emas — tuzatish/qaytarish). */
  isDecrease: boolean,
): { title: string; amountLine: string } | null {
  switch (source) {
    case 'invoiceOut': // we sold to them → their debt to us grew
      return { title: 'Sotuv', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'invoiceIn': // we bought from them → we owe them more
      return { title: 'Qabul (mahsulot)', amountLine: `📦 Mahsulot summasi: ${amt}` };
    case 'paymentIn':
    case 'cashIn': // they paid us
      return { title: "To'lov", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'paymentOut':
    case 'cashOut': // we paid them
      return { title: "To'lov (bizdan)", amountLine: `💸 Bizning to'lovimiz: ${amt}` };
    // ── Kassa oqimi (2026-08-16) ────────────────────────────────────────
    case 'retailsale':
      return isDecrease
        ? { title: 'Qaytarish', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Kassa savdosi', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    case 'debtpayment':
      return { title: "Qarz to'lovi", amountLine: `✅ To'lovingiz qabul qilindi: ${amt}` };
    case 'debt':
      return isDecrease
        ? { title: 'Qarz tuzatildi', amountLine: `↩️ Qarzingizdan ayirildi: ${amt}` }
        : { title: 'Qarz', amountLine: `🛒 Qarzga qo'shildi: +${amt}` };
    default:
      return null;
  }
}
```

- [ ] **Step 5: `buildCounterpartyMessage` — «doim xabar ber» qoidasini kengaytir**

Mavjud `isPayment` qatorini almashtir:

```ts
export function buildCounterpartyMessage(ctx: CounterpartyMessageContext): string | null {
  const isDecrease = ctx.deltaMinor < 0n;
  // To'lov = mijozning puli keldi. `debtpayment` ham shu toifada.
  const isPayment =
    ctx.source === 'paymentIn' || ctx.source === 'cashIn' || ctx.source === 'debtpayment';
  // TUZATISH (qaytarish / qarz o'chirilishi): mijozga aytilishi SHART, aks holda
  // uning qo'lida «qarzga qo'shildi» xabari oxirgi haqiqat bo'lib qoladi (spec §4.3).
  const isCorrection = isDecrease && (ctx.source === 'retailsale' || ctx.source === 'debt');
  const head = cpHead(ctx.source, fmtAmount(ctx.deltaMinor, ctx.currency), isDecrease);
  if (!head) return null;
  // Non-payment change landing exactly on zero ⇒ nothing meaningful to say.
  if (!isPayment && !isCorrection && ctx.newBalanceMinor === 0n) return null;
  ...
```

Va pastdagi `cpTotal` chaqiruvida `isPayment` o'rniga `isPayment || isCorrection` uzat (qoldiq «Qolgan qarzingiz» deb yozilsin):

```ts
  lines.push(cpTotal(ctx.newBalanceMinor, ctx.currency, isPayment || isCorrection));
```

- [ ] **Step 6: Testlar o'tishini tekshir**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/`
Expected: PASS (yangi 6 test + mavjud regressiya qulfi).

- [ ] **Step 7: Gate + commit**

```bash
pnpm --filter @moysklad/api typecheck
pnpm biome check apps/api/src/modules/counterparty-debt-notify apps/api/src/modules/hr/hr-shared
git add apps/api/src/modules/hr/hr-shared/hr-events.types.ts apps/api/src/modules/counterparty-debt-notify/counterparty-message.util.ts apps/api/src/modules/counterparty-debt-notify/counterparty-message.util.test.ts
git commit -m "feat(qarz): kassa oqimi uchun mijoz xabari shablonlari"
git show --stat HEAD
```

> `git show --stat HEAD` MAJBURIY: lint-staged begona fayl qo'shishi mumkin (CLAUDE.md §6.7B).

---

### Task 2: Kassa oqimini hodisaga ulash

Endi `applyDelta` chaqiruvlariga `source` qo'shiladi. **Shu vazifadan keyin** hodisa notifier'ga yetadi — lekin prod bayrog'i hamon `false`, ya'ni xabar ketmaydi.

**Files:**
- Modify: `apps/api/src/modules/retail-sale/retail-sale.service.ts` (post ~1203-1209, refund ~1804-1810)
- Modify: `apps/api/src/modules/debt/pos-debt-payment.service.ts:458`
- Modify: `apps/api/src/modules/debt/debt.service.ts:224` va `~730` va `~2191`
- Test: `apps/api/src/modules/counterparty-debt-notify/debt-source-wiring.test.ts` (yangi)

**Interfaces:**
- Consumes: Task 1 dagi union qiymatlari (`'retailsale' | 'debtpayment' | 'debt'`)
- Produces: olti `applyDelta` chaqiruv nuqtasi `meta.source` uzatadi

- [ ] **Step 1: Wiring testini yoz (yiqiladigan)**

Yangi fayl `apps/api/src/modules/counterparty-debt-notify/debt-source-wiring.test.ts`. Bu test **kod matnini** o'qiydi — mavjud «wiring» qo'riqchilari uslubida (servisni ko'tarmasdan chaqiruv nuqtasi unutilmaganini qulflaydi):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API = join(process.cwd(), 'src', 'modules');
const read = (p: string) => readFileSync(join(API, p), 'utf8');

describe('kassa oqimi balans hodisasiga `source` uzatadi', () => {
  it("retail-sale: qarzga savdo va qaytarish — ikkalasi ham source:'retailsale'", () => {
    const src = read('retail-sale/retail-sale.service.ts');
    const metas = src.match(/\{[^{}]*docType:\s*'retailsale'[^{}]*\}/g) ?? [];
    expect(metas.length).toBe(2); // post (+) va refund (−)
    for (const m of metas) expect(m).toContain("source: 'retailsale'");
  });

  it("pos-debt-payment: source:'debtpayment'", () => {
    const src = read('debt/pos-debt-payment.service.ts');
    const metas = src.match(/\{[^{}]*docType:\s*'debtpayment'[^{}]*\}/g) ?? [];
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) expect(m).toContain("source: 'debtpayment'");
  });

  it("debt.service: 'debt' va 'debtpayment' metalari source bilan", () => {
    const src = read('debt/debt.service.ts');
    const metas = src.match(/\{[^{}]*docType:\s*'(debt|debtpayment)'[^{}]*\}/g) ?? [];
    expect(metas.length).toBe(3); // recalc helper + create + remove
    for (const m of metas) expect(m).toMatch(/source: '(debt|debtpayment)'/);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/debt-source-wiring.test.ts`
Expected: FAIL — `source` hech qayerda yo'q.

- [ ] **Step 3: `retail-sale.service.ts` — ikki nuqta**

Post (qarzga savdo, ~1209):

```ts
          { docType: 'retailsale', docId: id, organizationId: sale.organizationId, source: 'retailsale' },
```

Refund (qarz kamayishi, ~1810):

```ts
          {
            docType: 'retailsale',
            docId: refundSale.id,
            organizationId: original.organizationId,
            source: 'retailsale',
          },
```

- [ ] **Step 4: `pos-debt-payment.service.ts:458`**

```ts
            meta: { docType: 'debtpayment', docId: batchId, organizationId: null, source: 'debtpayment' },
```

- [ ] **Step 5: `debt.service.ts` — uch nuqta**

`:224` (recalc yordamchisi):

```ts
      meta: { docType: 'debtpayment', docId, organizationId: null, source: 'debtpayment' },
```

`~730` (qarz ochilishi):

```ts
        { docType: 'debt', docId: debt.id, organizationId: null, source: 'debt' },
```

`~2191` (qarz o'chirilishi — TUZATISH xabari beradi):

```ts
          { docType: 'debt', docId: id, organizationId: null, source: 'debt' },
```

- [ ] **Step 6: Testlar o'tishini tekshir**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/ src/modules/debt/ src/modules/retail-sale/`
Expected: PASS — yangi wiring testi + mavjud qarz/kassa testlari regressiyasiz.

- [ ] **Step 7: Gate + commit**

```bash
pnpm --filter @moysklad/api typecheck
pnpm biome check apps/api/src/modules/retail-sale apps/api/src/modules/debt apps/api/src/modules/counterparty-debt-notify
git add apps/api/src/modules/retail-sale/retail-sale.service.ts apps/api/src/modules/debt/pos-debt-payment.service.ts apps/api/src/modules/debt/debt.service.ts apps/api/src/modules/counterparty-debt-notify/debt-source-wiring.test.ts
git commit -m "feat(qarz): kassa savdosi va qarz to'lovi balans hodisasiga source uzatadi"
git show --stat HEAD
```

---

### Task 3: Ikki xavfsizlik qulfi — ommaviy portlash va birinchi to'lqin

**Files:**
- Modify: `apps/api/src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.ts` (`notifyCounterparty` private, ~168-222)
- Test: `apps/api/src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.test.ts`

**Interfaces:**
- Consumes: `CounterpartyBalanceChangedEvent`, `hrTelegramOutbox` Prisma modeli
- Produces: `notifyCounterparty` ikki yangi shartni hurmat qiladi — `DEBT_NOTIFY_MAX_PER_MINUTE` (sukut 20) va `DEBT_NOTIFY_ONLY_KNOWN_CONTACTS` (sukut `true`)

- [ ] **Step 1: Testlarni yoz (yiqiladigan)**

Avval mavjud `makePrismaFull` yordamchisini kengaytir — u hozir `attributes`, `telegramChat.count` va `hrTelegramOutbox.count` ni modellamaydi. **Mavjud imzo buzilmaydi** (hamma yangi maydon optional, sukut qiymatlari eski xulqni saqlaydi):

```ts
function makePrismaFull(
  opts: {
    name?: string | null;
    phone?: string | null;
    existingRow?: boolean;
    createImpl?: () => Promise<unknown>;
    /** Kontragent `attributes` — `{ tgid }` bo'lsa «tanish kontakt». */
    attributes?: Record<string, unknown> | null;
    /** Bog'langan Telegram chatlari soni. */
    chatCount?: number;
    /** Oxirgi daqiqada yozilgan mijoz-xabarlari soni (portlash qulfi uchun). */
    recentNotifyCount?: number;
  } = {},
) {
  const cp =
    opts.name === null
      ? null
      : { name: opts.name ?? 'Akme', phone: opts.phone ?? null, attributes: opts.attributes ?? { tgid: '123' } };
  const outboxCreate = vi.fn(opts.createImpl ?? (async () => ({ id: 'out-1' })));
  const outboxFindFirst = vi.fn(async () => (opts.existingRow ? { id: 'out-existing' } : null));
  const outboxCount = vi.fn(async () => opts.recentNotifyCount ?? 0);
  const chatCount = vi.fn(async () => opts.chatCount ?? 0);
  return {
    prisma: {
      client: {
        counterparty: { findFirst: vi.fn(async () => cp) },
        telegramChat: { count: chatCount },
        hrTelegramOutbox: { findFirst: outboxFindFirst, create: outboxCreate, count: outboxCount },
      },
    },
    outboxCreate,
    outboxFindFirst,
    outboxCount,
    chatCount,
  };
}
```

> Sukut `attributes: { tgid: '123' }` ATAYLAB: shu faylning MAVJUD testlari «tanish kontakt» qulfidan o'tib ketsin va o'zgartirishsiz yashil qolsin.

Keyin yangi `describe` blokini fayl oxiriga qo'sh:

```ts
describe('xavfsizlik qulflari', () => {
  const retailEvent: CounterpartyBalanceChangedEvent = {
    ...baseEvent,
    source: 'retailsale',
    docType: 'retailsale',
    docId: 'rs-1',
  };

  it('ommaviy portlash: daqiqalik chegara to`lgan bo`lsa yozmaydi', async () => {
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '2';
    const { prisma, outboxCreate, outboxCount } = makePrismaFull({ phone: '+998901234567', recentNotifyCount: 2 });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
    expect(outboxCount).toHaveBeenCalled();
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('chegara ostida bo`lsa yoziladi', async () => {
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '20';
    const { prisma, outboxCreate } = makePrismaFull({ phone: '+998901234567', recentNotifyCount: 3 });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
    expect(outboxCreate).toHaveBeenCalled();
  });

  it("noma'lum kontakt (tgid yo`q, chat yo`q) ⇒ yozmaydi", async () => {
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'true';
    const { prisma, outboxCreate } = makePrismaFull({
      phone: '+998901234567',
      attributes: {},
      chatCount: 0,
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('tgid yo`q, lekin bog`langan chat bor ⇒ yoziladi', async () => {
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'true';
    const { prisma, outboxCreate } = makePrismaFull({
      phone: '+998901234567',
      attributes: {},
      chatCount: 1,
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
    expect(outboxCreate).toHaveBeenCalled();
  });

  it("qulf o'chirilsa (false) noma'lum kontaktga ham yoziladi", async () => {
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'false';
    const { prisma, outboxCreate } = makePrismaFull({
      phone: '+998901234567',
      attributes: {},
      chatCount: 0,
    });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    await new CounterpartyDebtNotifier(prisma as any).onBalanceChanged(retailEvent);
    expect(outboxCreate).toHaveBeenCalled();
  });
});
```

`beforeEach` ga ikki kalitni qo'sh (test izolyatsiyasi uchun), `afterEach` da tozala:

```ts
    process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS = 'false'; // mavjud testlar qulfsiz yugursin
    process.env.DEBT_NOTIFY_MAX_PER_MINUTE = '20';
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.test.ts`
Expected: FAIL — qulflar yo'q, `outboxCreate` baribir chaqiriladi.

- [ ] **Step 3: Kontragent o'qishini kengaytir**

`onBalanceChanged` ichidagi `counterparty.findFirst` `select` iga `attributes` qo'sh:

```ts
        select: { name: true, phone: true, attributes: true },
```

Va `cp` tipini shunga moslab, `notifyCounterparty` ga uzat:

```ts
    await this.notifyCounterparty(payload, cp.name, cp.phone, doc, cp.attributes);
```

- [ ] **Step 4: Ikki qulfni `notifyCounterparty` ga qo'sh**

`if (!text) return;` dan KEYIN, dedup blokidan OLDIN qo'sh:

```ts
      // ── QULF 1: «birinchi to'lqin» — faqat TANISH kontaktlar ──────────────
      // Shaxsiy raqamdan hech qachon yozmagan odamga xabar yuborish «Report
      // spam» xavfini tug'diradi (spec §5.1) — bu FLOOD_WAIT himoyasi
      // qoplamaydigan BOSHQA xavf klassi. Sukut bo'yicha YOQILGAN.
      if (process.env.DEBT_NOTIFY_ONLY_KNOWN_CONTACTS !== 'false') {
        const attrs =
          attributes && typeof attributes === 'object' && !Array.isArray(attributes)
            ? (attributes as Record<string, unknown>)
            : {};
        const hasTgid = attrs.tgid !== undefined && attrs.tgid !== null && attrs.tgid !== '';
        let known = hasTgid;
        if (!known) {
          const chats = await this.prisma.client.telegramChat.count({
            where: { accountId: payload.accountId, counterpartyId: payload.counterpartyId },
          });
          known = chats > 0;
        }
        if (!known) {
          this.logger.log(
            `Counterparty ${payload.counterpartyId} noma'lum kontakt — xabar yuborilmadi`,
          );
          return;
        }
      }

      // ── QULF 2: OMMAVIY PORTLASH (backfill bombasi, spec §5.2) ───────────
      // Ommaviy skript balansni qayta hisoblasa, bir zumda yuzlab hodisa
      // chiqadi. Bu qulf soniga qarab to'xtatadi — mijozlarga spam ketmaydi.
      const maxPerMinute = Number.parseInt(process.env.DEBT_NOTIFY_MAX_PER_MINUTE ?? '20', 10);
      if (Number.isFinite(maxPerMinute) && maxPerMinute > 0) {
        const since = new Date(Date.now() - 60_000);
        const recent = await this.prisma.client.hrTelegramOutbox.count({
          where: {
            accountId: payload.accountId,
            sourceEventType: COUNTERPARTY_NOTIFY_EVENT,
            createdAt: { gte: since },
          },
        });
        if (recent >= maxPerMinute) {
          this.logger.warn(
            `debt notify: daqiqalik chegara (${maxPerMinute}) to'ldi — ` +
              `${payload.counterpartyId} uchun xabar TASHLANDI (ommaviy amal shubhasi)`,
          );
          return;
        }
      }
```

`notifyCounterparty` imzosiga oxirgi parametr qo'sh:

```ts
  private async notifyCounterparty(
    payload: CounterpartyBalanceChangedEvent,
    name: string,
    phone: string | null,
    doc: { number: string; moment: Date } | null,
    attributes: unknown,
  ): Promise<void> {
```

- [ ] **Step 5: Testlar o'tishini tekshir**

Run: `pnpm --filter @moysklad/api vitest run src/modules/counterparty-debt-notify/`
Expected: PASS — 4 yangi test + mavjudlari.

- [ ] **Step 6: Gate + commit**

```bash
pnpm --filter @moysklad/api typecheck
pnpm biome check apps/api/src/modules/counterparty-debt-notify
git add apps/api/src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.ts apps/api/src/modules/counterparty-debt-notify/counterparty-debt-notifier.service.test.ts
git commit -m "feat(qarz): mijoz xabariga tanish-kontakt va ommaviy-portlash qulflari"
git show --stat HEAD
```

---

### Task 4: Prodga chiqarish va jonli tekshiruv

**Files:**
- Modify (prod box, repo EMAS): `/var/www/sherset-v2/apps/api/.env`
- Modify: `apps/api/.env.example` (yangi kalitlar hujjatlashtirilsin)

**Interfaces:**
- Consumes: Task 1-3 kodi
- Produces: prodda yoqilgan va o'lchangan xabar oqimi

- [ ] **Step 1: `.env.example` ga uch kalitni yoz**

```
# Mijozga qarz/to'lov Telegram xabari (counterparty-debt-notify).
# `true` bo'lmaguncha HECH QANDAY mijoz xabari yuborilmaydi.
DEBT_NOTIFY_ENABLED=false
# Faqat `tgid` bor yoki bog'langan Telegram chati bor mijozlarga yozish
# («Report spam» xavfiga qarshi birinchi to'lqin cheklovi). `false` = hammaga.
DEBT_NOTIFY_ONLY_KNOWN_CONTACTS=true
# Daqiqasiga maksimal mijoz xabari (ommaviy/backfill portlashiga qarshi qulf).
DEBT_NOTIFY_MAX_PER_MINUTE=20
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/.env.example
git commit -m "docs(qarz): mijoz xabari env kalitlari"
git show --stat HEAD
```

- [ ] **Step 3: Deploy**

`/deploy` (yoki `DS_TARGET=v2 deploy-smart.sh`) — CLAUDE.md tartibi bo'yicha. Deploydan keyin `curl erp.sherset.uz → 200` va `:4001/api/v1/health` MAJBURIY.

- [ ] **Step 4: Prod `.env` ga kalitlarni qo'sh (bayroq hamon `false`)**

```bash
cp /var/www/sherset-v2/apps/api/.env /root/env-backup-$(date +%Y%m%d-%H%M%S)
# DEBT_NOTIFY_ONLY_KNOWN_CONTACTS=true va DEBT_NOTIFY_MAX_PER_MINUTE=20 qo'shiladi
pm2 restart sherset-v2-api --update-env
```

- [ ] **Step 5: BITTA mijozda jonli sinov (bayroq yoqilmasdan oldin)**

`DEBT_NOTIFY_ENABLED=true` qilishdan oldin sinov mijozi tayyorla: `tgid` i bor va telefoni **o'zingizniki** bo'lgan bitta kontragent. Kassada shu mijozga kichik summada qarzga savdo qil va tekshir:

```sql
SELECT to_phone, status, sent_by_slot, left(message_text, 80), created_at, sent_at
FROM hr_telegram_outbox
WHERE source_event_type = 'debt.counterparty_notify'
ORDER BY created_at DESC LIMIT 5;
```

🔴 `pending` DALIL EMAS — `sent` bo'lishi va telefoningizga xabar KELISHI shart.

- [ ] **Step 6: Bayroqni yoq va birinchi soatni kuzat**

```bash
# apps/api/.env: DEBT_NOTIFY_ENABLED=true
pm2 restart sherset-v2-api --update-env
```

Birinchi soat: yuqoridagi SQL bilan `status` taqsimotini kuzat (`sent` / `pending` / `failed` / `retry`) va `failed` sabablarini o'qi.

- [ ] **Step 7: Natijani NEXT.md va xotiraga yoz**

Yozilishi kerak: nechta xabar `sent`, nechtasi `failed` va nega, «tanish kontakt» qulfi nechta mijozni chetlab o'tdi (qamrov: `tgid` 486 + bog'langan chat 146 dan 608 qarzdorning nechtasi).

---

## Bajarilmaydi (bu rejadan tashqarida)

- Qarz muddati kelganda avtomatik eslatma (spec §4.2) — alohida reja.
- `debt_closed` tasdiq xabari, davriy takror eslatma, egaga chegara ogohlantirishi (spec §4.1) — B3.
- Chek nusxasi / buyurtma tayyor / akt-sverka Telegramga (spec §4.2) — B4.
- Ommaviy skriptlarga `source` uzatmaslik — kod o'zgarishi TALAB QILMAYDI (skriptlar `applyDelta` ishlatmaydi), lekin Task 3 dagi ikkinchi qulf buni himoya qiladi.
- **Ko'p tillilik (spec §5.3)** — matnlar faqat o'zbekcha lotin. Ruszabon mijozlar
  («пакуптел», «1покупатель») ham o'zbekcha xabar oladi. Til tanlash uchun kontragentda
  til maydoni kerak — u hozir YO'Q, shuning uchun alohida ish.
- **Yetkazilmaganlar HISOBOTI (spec §5.4)** — Task 4 Step 6-7 da faqat SQL bilan qo'lda
  kuzatiladi. Doimiy UI hisoboti («kimga yetmadi va nega») qurilmaydi — B3 ga qoldiriladi.
  Shu sababli birinchi hafta natijani qo'lda o'qish MAJBURIY.
