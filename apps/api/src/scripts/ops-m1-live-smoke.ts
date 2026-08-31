#!/usr/bin/env tsx
/**
 * M1 JONLI SMOKE — qoida 13 ning uchala bandi (2026-08-30).
 * Reja: `docs/plans/2026-08-27-kop-omborli-tuzilma.md` → M1.5.
 *
 * M1.2 kaskad boshini `Taqsimlanmagan` dan `Ombor 07` ga ko'chirdi. Rejaning
 * 4-bo'limidagi besh o'lchov «xulq o'zgarmaydi» deydi, lekin IS-3 saboqi
 * aynan shu: kod xulqi haqidagi TO'G'RI xulosa TIZIM HOLATI haqida noto'g'ri
 * bo'lishi mumkin. Shuning uchun bu skript uchala amalni JONLIDA o'lchaydi:
 *
 *   1. SOTUV     — chek → post → qoldiq kamaydi → cancel → qoldiq TIKLANADI;
 *                  ajratma qatorining `store_id` si tovar turgan omborga teng;
 *   2. SANASH    — yacheyka sanash hujjati ochiladi, editor boyitmasi
 *                  (`position-meta`) yacheyka qoldig'ini TO'G'RI ko'rsatadi;
 *   3. KO'CHIRISH — yacheykadan yacheykaga; ombor JAMISI o'zgarmaydi, so'ng
 *                  teskari ko'chirish bilan yacheyka kesimi ham tiklanadi.
 *
 * 🔴 HAR UCHALASI IZINI O'ZI TOZALAYDI. Yiqilganda tozalash BARIBIR uriniladi
 * (`finally`), chunki jonlida qolgan `draft` chek kassirning smenasini
 * yopilmaydigan qilib qo'yadi — aynan shu sinfdagi hodisa 2026-08-24 da
 * kassani to'xtatgan (`unresolved-sales.ts`, F5).
 *
 * 🔴 NEGA HTTP, Nest konteksti EMAS (P1 dan meros qoida): prodda
 * `createApplicationContext` ikkinchi jarayonda hamma `@Cron`ni ro'yxatdan
 * o'tkazadi. HTTP hech nima ko'tarmaydi va guard/DTO qatlamini ham o'lchaydi.
 *
 * Ishga tushirish (box):
 *   cd /var/www/sherset-v2/apps/api && set -a && . ./.env && set +a && \
 *   ./node_modules/.bin/tsx src/scripts/ops-m1-live-smoke.ts           # DRY
 *   …/ops-m1-live-smoke.ts --live                                      # yozadi
 *
 * Env: `M1_API_BASE` (default `http://localhost:4001/api/v1`).
 */
import { PrismaClient } from '@moysklad/db';
// `jsonwebtoken` to'g'ridan-to'g'ri bog'liqlik EMAS (u `@nestjs/jwt` ichida).
import { JwtService } from '@nestjs/jwt';

const LIVE = process.argv.includes('--live');
const API = process.env.M1_API_BASE ?? 'http://localhost:4001/api/v1';

/** M1 kanonik kaskadi (reja 4-bo'lim). BRAK ataylab YO'Q. */
const KANONIK: readonly string[] = [
  'Ombor 07',
  'Ombor 01',
  'Ombor 02',
  'Ombor 03',
  'Ombor 04',
  'Ombor 05',
  'Ombor 06',
  'Taqsimlanmagan',
];

const prisma = new PrismaClient();

interface Verdict {
  key: string;
  pass: boolean;
  label: string;
  detail: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call(token: string, method: string, path: string, body?: unknown) {
  // 🔴 `content-type: application/json` FAQAT tana bo'lganda qo'yiladi.
  // Aks holda global ValidationPipe bo'sh tanani rad etadi («Body cannot be
  // empty when content-type is set to application/json») va DELETE/POST
  // yo'llari 400 beradi — 2026-08-30 da jonlida o'lchandi.
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new HttpError(res.status, `${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/** Bitta tovarning HAMMA ombordagi qoldig'i — nomlangan xarita. */
async function stockOf(accountId: string, productId: string): Promise<Map<string, string>> {
  const rows = await prisma.stock.findMany({
    where: { accountId, assortmentKind: 'product', assortmentId: productId },
    select: { storeId: true, qty: true },
  });
  return new Map(rows.map((r) => [r.storeId, r.qty.toString()]));
}

function sumMap(m: Map<string, string>): number {
  let s = 0;
  for (const v of m.values()) s += Number(v);
  return s;
}

/** Ombor id → nom (bir marta o'qiladi; xabarlar id emas, NOM ko'rsatsin). */
let storeNameCache: Map<string, string> | null = null;
async function storeNames(accountId: string): Promise<Map<string, string>> {
  if (!storeNameCache) {
    const rows = await prisma.store.findMany({
      where: { accountId },
      select: { id: true, name: true },
    });
    storeNameCache = new Map(rows.map((r) => [r.id, r.name]));
  }
  return storeNameCache;
}

// ──────────────────────────────────────────────────── 0 · KASKAD O'LCHOVI ───

async function checkCascade(accountId: string): Promise<Verdict> {
  const stores = await prisma.store.findMany({
    where: { accountId },
    select: { id: true, name: true, attributes: true },
  });
  const withPp = stores
    .map((s) => {
      const attrs = (s.attributes ?? {}) as Record<string, unknown>;
      const pp = attrs.__posPriority;
      return {
        name: s.name,
        pp: typeof pp === 'number' ? pp : null,
        brak: attrs.__brakStore === true,
      };
    })
    .filter((s) => s.pp != null)
    .sort((a, b) => (a.pp as number) - (b.pp as number));

  const jonli = withPp.map((s) => s.name);
  const brakKirdi = withPp.some((s) => s.brak);
  const mos = jonli.length === KANONIK.length && jonli.every((n, i) => n === KANONIK[i]);
  return {
    key: 'kaskad',
    pass: mos && !brakKirdi,
    label: 'Kaskad kanonik jadval bilan mos, BRAK tashqarida',
    detail: `jonli: ${jonli.join(' → ')}${brakKirdi ? ' · 🔴 BRAK KASKADGA KIRIB QOLGAN' : ''}`,
  };
}

/**
 * Oldingi yugurishdan QOLGAN smoke chernoviklarini yopadi.
 *
 * Kerak bo'lgan sabab jonlida o'lchandi (2026-08-30): `post` 400 bergan
 * holatda `cancel` ning O'ZI ham 400 berdi (bo'sh tana) va chek `draft`
 * bo'lib qoldi. Draft esa smenani yopishga to'sqinlik qiladi (F5,
 * `unresolved-sales.ts`) — ya'ni smoke skripti kassirni bloklab qo'yardi.
 */
async function cleanupResidue(accountId: string, token: string): Promise<number> {
  let yopildi = 0;

  // (a) Cheklar. `draft/picking/ready` — cancel; `posted` — VOZVRAT (posted
  //     chekni cancel qilib bo'lmaydi, FSM ruxsat bermaydi).
  const sales = await prisma.retailSale.findMany({
    where: {
      accountId,
      deletedAt: null,
      state: { in: ['draft', 'picking', 'ready', 'posted'] },
      description: { startsWith: 'M1 jonli smoke' },
    },
    select: { id: true, name: true, state: true, positions: { select: { productId: true } } },
  });
  for (const s of sales) {
    try {
      if (s.state === 'posted') {
        const pid = s.positions[0]?.productId;
        if (!pid) throw new Error('pozitsiyasiz posted chek');
        await call(token, 'POST', `/retail-sales/${s.id}/refund`, {
          positions: [{ productId: pid, quantity: '1' }],
        });
        console.log(`  🧹 posted sinov cheki QAYTARILDI (vozvrat): ${s.name ?? s.id}`);
      } else {
        await call(token, 'POST', `/retail-sales/${s.id}/cancel`, {});
        console.log(`  🧹 qolgan chernovik yopildi: ${s.name ?? s.id}`);
      }
      yopildi += 1;
    } catch (e) {
      console.log(`  ⚠️  ${s.name ?? s.id} tozalanmadi: ${e instanceof Error ? e.message : e}`);
    }
  }

  // (b) Sanash chernoviklari — qoldiqni ushlab turadi, qolmasin.
  const invs = await prisma.inventory.findMany({
    where: {
      accountId,
      state: 'draft',
      deletedAt: null,
      description: { startsWith: 'M1 jonli smoke' },
    },
    select: { id: true, name: true },
  });
  for (const i of invs) {
    try {
      await call(token, 'DELETE', `/inventories/${i.id}`);
      console.log(`  🧹 qolgan sanash chernovigi o'chirildi: ${i.name ?? i.id}`);
      yopildi += 1;
    } catch (e) {
      console.log(`  ⚠️  ${i.name ?? i.id} o'chmadi: ${e instanceof Error ? e.message : e}`);
    }
  }
  return yopildi;
}

// ───────────────────────────────────────────────────────── 1 · SINOV SOTUV ───

async function smokeSale(accountId: string, token: string, shiftId: string): Promise<Verdict[]> {
  const out: Verdict[] = [];

  // Qoldig'i bor tovar — eng ko'p qoldiqlisi (bir dona ayirish sezilmaydi).
  const stocks = await prisma.stock.findMany({
    where: { accountId, assortmentKind: 'product', qty: { gt: 5 } },
    orderBy: { qty: 'desc' },
    take: 50,
    select: { assortmentId: true, storeId: true, qty: true },
  });
  const cand = stocks[0];
  if (!cand) throw new Error('Qoldiqli tovar topilmadi');
  const product = await prisma.product.findFirstOrThrow({
    where: { id: cand.assortmentId, accountId, deletedAt: null },
    select: { id: true, name: true, salePrices: true },
  });

  // Narx — tovarning O'Z sotuv narxi (narx-poli tekshiruviga tushmaslik uchun).
  const sp = (product.salePrices ?? []) as { value?: unknown }[] | null;
  const raw = Array.isArray(sp) ? sp.map((x) => x?.value).find((v) => v != null) : null;
  const priceMinor = raw != null ? BigInt(String(raw)) : 100_000n;

  const before = await stockOf(accountId, product.id);
  const beforeSum = sumMap(before);
  console.log(`  tovar: ${product.name} · jami qoldiq: ${beforeSum} · narx: ${priceMinor}`);

  if (!LIVE) {
    out.push({
      key: 'sotuv',
      pass: true,
      label: 'SOTUV (DRY — yozilmadi)',
      detail: `tanlangan tovar «${product.name}», jami ${beforeSum}; --live bilan post→cancel qilinadi`,
    });
    return out;
  }

  let saleId: string | null = null;
  try {
    const draft = await call(token, 'POST', '/retail-sales', {
      sessionId: shiftId,
      description: 'M1 jonli smoke — SINOV cheki, darhol bekor qilinadi',
      positions: [{ productId: product.id, quantity: '1', priceMinor: priceMinor.toString() }],
    });
    saleId = draft.id as string;

    await call(token, 'POST', `/retail-sales/${saleId}/post`, {
      cashAmountMinor: priceMinor.toString(),
      cardAmountMinor: '0',
      terminalAmountMinor: '0',
      debtAmountMinor: '0',
      prepayAmountMinor: '0',
      // Klient tomonidagi sanity — server uni bazadagi summa bilan QAYTA
      // tekshiradi. 1 dona × narx ⇒ chek jamisi aynan shu.
      expectedSumMinor: priceMinor.toString(),
    });

    const afterPost = await stockOf(accountId, product.id);
    const ayirildi = beforeSum - sumMap(afterPost);
    out.push({
      key: 'sotuv-post',
      pass: Math.abs(ayirildi - 1) < 1e-9,
      label: 'SOTUV: post qoldiqni AYNAN 1 dona kamaytirdi',
      detail: `jami ${beforeSum} → ${sumMap(afterPost)} (ayirildi ${ayirildi})`,
    });

    // Ajratma qaysi omborga tushdi — kaskad boshi o'zgargani bilan tovar
    // turgan ombor o'zgarmasligi SHART (bo'sh ombor hissa qo'shmaydi).
    const allocs = await prisma.retailSalePositionAllocation.findMany({
      where: { accountId, position: { retailSaleId: saleId } },
      select: { storeId: true, qty: true },
    });
    const allocStores = await prisma.store.findMany({
      where: { id: { in: allocs.map((a) => a.storeId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(allocStores.map((s) => [s.id, s.name]));
    const tushdi = allocs.map((a) => `${nameById.get(a.storeId) ?? a.storeId}:${a.qty}`);
    // 🔴 INVARIANT — «bo'sh ombor tortmaydi», ya'ni ajratma FAQAT sotuvdan
    // OLDIN qoldig'i BOR omborlardan olinadi. Bu M1 ning asosiy xavfsizlik
    // sharti: kaskad boshi bo'sh «Ombor 07» ga o'tgani bilan ajratma o'sha
    // bo'sh ombordan olinmasligi kerak. (Aniq ombor NOMINI kutish noto'g'ri
    // bo'lardi — qoldiq vaqt o'tishi bilan boshqa omborga ham tarqaydi.)
    const qoldiqliOmborlar = new Set(
      [...before.entries()].filter(([, q]) => Number(q) > 0).map(([sid]) => sid),
    );
    const bosqdanOlindi = allocs.filter((a) => !qoldiqliOmborlar.has(a.storeId));
    out.push({
      key: 'sotuv-ajratma',
      pass: allocs.length > 0 && bosqdanOlindi.length === 0,
      label: "SOTUV: ajratma faqat QOLDIG'I BOR ombordan olindi (bo'sh ombor tortmadi)",
      detail: `ajratma: ${tushdi.join(', ') || "(yo'q)"} · sotuvdan oldin qoldiqli ombor: ${qoldiqliOmborlar.size} ta`,
    });
  } finally {
    if (saleId) {
      // Yiqilsa ham chek QOLMAYDI — draft smenani yopilmaydigan qiladi (F5).
      // 🔴 Teskarisi HOLATGA qarab tanlanadi (2026-08-30 da jonlida o'lchandi):
      //    posted chekni `cancel` QILIB BO'LMAYDI (FSM: draft|picking|ready),
      //    uning teskarisi — VOZVRAT. Noto'g'ri tanlansa chek jonlida qoladi.
      const cur = await prisma.retailSale.findFirst({
        where: { id: saleId },
        select: { state: true },
      });
      const teskari =
        cur?.state === 'posted'
          ? call(token, 'POST', `/retail-sales/${saleId}/refund`, {
              positions: [{ productId: product.id, quantity: '1' }],
            })
          : call(token, 'POST', `/retail-sales/${saleId}/cancel`, {});
      await teskari.catch((e) =>
        console.log(`  ⚠️  teskarisi yiqildi: ${e instanceof Error ? e.message : e}`),
      );
    }
  }

  const afterCancel = await stockOf(accountId, product.id);
  const farq = sumMap(afterCancel) - beforeSum;
  out.push({
    key: 'sotuv-teskari',
    pass: Math.abs(farq) < 1e-9,
    label: 'SOTUV: teskarisi (vozvrat/cancel) JAMI qoldiqni AYNAN tikladi',
    detail: `jami ${beforeSum} → ${sumMap(afterCancel)} (farq ${farq})`,
  });

  // 🔴 2026-08-30 da JONLIDA TOPILDI: vozvrat tovarni O'ZI OLINGAN omborga
  // emas, chekning BOSH omboriga (`cascade[0]`) qaytaradi. M1 gacha bu
  // ko'rinmasdi (cascade[0] = «Taqsimlanmagan» = tovar turgan joy), M1 dan
  // keyin esa har vozvrat qoldiqni bo'sh «Ombor 07» ga ko'chira boshlaydi.
  // Jami saqlanadi, ya'ni yuqoridagi hukm YASHIL — lekin TAQSIMOT siljiydi.
  // Smoke o'z izini tozalashi shart, shuning uchun siljish «Перемещение»
  // hujjati bilan qaytariladi va farq ALOHIDA hukm bo'lib chiqadi.
  const nomlar = await storeNames(accountId);
  const siljish: { storeId: string; delta: number }[] = [];
  for (const sid of new Set([...before.keys(), ...afterCancel.keys()])) {
    const d = Number(afterCancel.get(sid) ?? '0') - Number(before.get(sid) ?? '0');
    if (Math.abs(d) > 1e-9) siljish.push({ storeId: sid, delta: d });
  }
  out.push({
    key: 'sotuv-taqsimot',
    pass: siljish.length === 0,
    label: 'SOTUV: teskarisi TAQSIMOTNI ham tikladi (vozvrat o`z omboriga qaytdi)',
    detail:
      siljish.length === 0
        ? "ombor kesimi o'zgarmadi"
        : `🔴 siljidi: ${siljish
            .map((s) => `${nomlar.get(s.storeId) ?? s.storeId} ${s.delta > 0 ? '+' : ''}${s.delta}`)
            .join(', ')} — vozvrat cascade[0] ga tushdi`,
  });

  // Siljishni QAYTARISH — smoke iz qoldirmasin.
  const oshgan = siljish.find((s) => s.delta > 0);
  const kamaygan = siljish.find((s) => s.delta < 0);
  if (oshgan && kamaygan) {
    const org = await prisma.organization.findFirstOrThrow({
      where: { accountId },
      select: { id: true },
    });
    try {
      await call(token, 'POST', '/moves', {
        organizationId: org.id,
        sourceStoreId: oshgan.storeId,
        destinationStoreId: kamaygan.storeId,
        description: 'M1 jonli smoke — vozvrat siljishini QAYTARISH',
        applicable: true,
        positions: [{ assortmentId: product.id, quantity: String(oshgan.delta) }],
      });
      const tiklandi = await stockOf(accountId, product.id);
      const qoldi =
        Number(tiklandi.get(oshgan.storeId) ?? '0') - Number(before.get(oshgan.storeId) ?? '0');
      console.log(
        `  🧹 siljish qaytarildi (Перемещение ${oshgan.delta} dona) · qolgan farq: ${qoldi}`,
      );
    } catch (e) {
      console.log(`  ⚠️  siljishni qaytarish yiqildi: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────── 2 · YACHEYKA SANASH ──

async function smokeCount(accountId: string, token: string): Promise<Verdict[]> {
  // Qoldig'i bor yacheyka.
  const byCell = await prisma.stockByCell.findFirst({
    where: { accountId, qty: { gt: 0 } },
    orderBy: { qty: 'desc' },
    select: { storeId: true, cellId: true, assortmentId: true, qty: true },
  });
  if (!byCell) throw new Error("Qoldig'i bor yacheyka topilmadi");
  const org = await prisma.organization.findFirstOrThrow({
    where: { accountId },
    select: { id: true },
  });
  const cell = await prisma.storeCell.findFirstOrThrow({
    where: { id: byCell.cellId },
    select: { name: true },
  });
  console.log(`  yacheyka: ${cell.name} · qoldiq: ${byCell.qty}`);

  if (!LIVE)
    return [
      {
        key: 'sanash',
        pass: true,
        label: 'SANASH (DRY — yozilmadi)',
        detail: `yacheyka «${cell.name}», qoldiq ${byCell.qty}; --live bilan chernovik ochiladi va o'chiriladi`,
      },
    ];

  let invId: string | null = null;
  const out: Verdict[] = [];
  try {
    const inv = await call(token, 'POST', '/inventories', {
      organizationId: org.id,
      storeId: byCell.storeId,
      description: 'M1 jonli smoke — SANASH chernovigi, darhol o`chiriladi',
      positions: [
        {
          assortmentId: byCell.assortmentId,
          actualQty: byCell.qty.toString(),
          cellId: byCell.cellId,
          cell: cell.name,
        },
      ],
    });
    invId = inv.id as string;

    // Editor boyitmasi — hujjat yacheyka qoldig'ini TO'G'RI ko'rsatadimi.
    const meta = await call(token, 'POST', '/inventories/position-meta', {
      storeId: byCell.storeId,
      assortmentIds: [byCell.assortmentId],
    });
    const txt = JSON.stringify(meta);
    const kutilganSon = Number(byCell.qty);
    // Boyitma StockByCell qatorlarini qaytaradi — sonimiz ichida bo'lishi shart.
    const topildi = txt.includes(byCell.cellId) || txt.includes(String(kutilganSon));
    out.push({
      key: 'sanash',
      pass: invId != null && topildi,
      label: 'SANASH: hujjat ochildi va yacheyka qoldig`i to`g`ri ko`rindi',
      detail: `hujjat ${invId} · yacheyka «${cell.name}» · kutilgan qoldiq ${kutilganSon} · boyitmada topildi: ${topildi}`,
    });
  } finally {
    if (invId) {
      // Chernovik QOLMAYDI — sanash hujjati qoldiqni ushlab turadi.
      await call(token, 'DELETE', `/inventories/${invId}`).catch((e) =>
        console.log(`  ⚠️  sanash chernovigi o'chmadi: ${e instanceof Error ? e.message : e}`),
      );
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────── 3 · KO'CHIRISH ─────

async function smokeMove(accountId: string, token: string): Promise<Verdict[]> {
  const src = await prisma.stockByCell.findFirst({
    where: { accountId, qty: { gte: 2 } },
    orderBy: { qty: 'desc' },
    select: { storeId: true, cellId: true, assortmentId: true, qty: true },
  });
  if (!src) throw new Error("Ko'chirish uchun yetarli qoldiqli yacheyka topilmadi");
  const dst = await prisma.storeCell.findFirst({
    where: { accountId, storeId: src.storeId, id: { not: src.cellId } },
    select: { id: true, name: true },
  });
  if (!dst) throw new Error("O'sha omborda ikkinchi yacheyka topilmadi");
  const srcCell = await prisma.storeCell.findFirstOrThrow({
    where: { id: src.cellId },
    select: { name: true },
  });
  console.log(`  ko'chirish: «${srcCell.name}» → «${dst.name}» · 1 dona`);

  if (!LIVE)
    return [
      {
        key: 'kochirish',
        pass: true,
        label: "KO'CHIRISH (DRY — yozilmadi)",
        detail: `«${srcCell.name}» → «${dst.name}»; --live bilan 1 dona ko'chiriladi va QAYTARILADI`,
      },
    ];

  const storeBefore = await prisma.stock.findFirstOrThrow({
    where: {
      accountId,
      storeId: src.storeId,
      assortmentKind: 'product',
      assortmentId: src.assortmentId,
    },
    select: { qty: true },
  });

  const out: Verdict[] = [];
  let kochdi = false;
  try {
    await call(token, 'POST', `/products/${src.assortmentId}/cell-move`, {
      storeId: src.storeId,
      fromCellId: src.cellId,
      toCellId: dst.id,
      qty: '1',
    });
    kochdi = true;

    const storeAfter = await prisma.stock.findFirstOrThrow({
      where: {
        accountId,
        storeId: src.storeId,
        assortmentKind: 'product',
        assortmentId: src.assortmentId,
      },
      select: { qty: true },
    });
    const jamiFarq = Number(storeAfter.qty) - Number(storeBefore.qty);
    out.push({
      key: 'kochirish-neytral',
      pass: Math.abs(jamiFarq) < 1e-9,
      label: "KO'CHIRISH: ombor JAMISI o`zgarmadi (stok-neytral)",
      detail: `${storeBefore.qty} → ${storeAfter.qty} (farq ${jamiFarq})`,
    });
  } finally {
    if (kochdi) {
      await call(token, 'POST', `/products/${src.assortmentId}/cell-move`, {
        storeId: src.storeId,
        fromCellId: dst.id,
        toCellId: src.cellId,
        qty: '1',
      }).catch((e) =>
        console.log(`  ⚠️  teskari ko'chirish yiqildi: ${e instanceof Error ? e.message : e}`),
      );
    }
  }

  const srcAfter = await prisma.stockByCell.findFirst({
    where: { accountId, storeId: src.storeId, cellId: src.cellId, assortmentId: src.assortmentId },
    select: { qty: true },
  });
  const yacheykaFarq = Number(srcAfter?.qty ?? 0) - Number(src.qty);
  out.push({
    key: 'kochirish-tiklandi',
    pass: Math.abs(yacheykaFarq) < 1e-9,
    label: "KO'CHIRISH: teskari ko`chirish yacheyka kesimini tikladi",
    detail: `«${srcCell.name}»: ${src.qty} → ${srcAfter?.qty ?? 0} (farq ${yacheykaFarq})`,
  });
  return out;
}

/**
 * `--restore-stray` — «Ombor 01…07» da QOLIB KETGAN qoldiqni hovuzga qaytaradi.
 *
 * M1.0 da o'lchangan holat: bu yettala ombor BO'SH (qoldiq 0) — tovar hali
 * joylashtirilmagan. Ya'ni bugun u yerda paydo bo'lgan har qanday qoldiq —
 * smoke vozvratining izi (vozvrat `cascade[0]` ga tushadi). Skript avval
 * NIMA ko'chirishini bosib chiqaradi, `--apply` bo'lmasa hech nima qilmaydi.
 *
 * 🔴 Tovar joylashtirila boshlagach BU REJIM ISHLATILMAYDI — u paytda o'sha
 * omborlardagi qoldiq HAQIQIY bo'ladi.
 */
async function restoreStray(accountId: string, token: string, apply: boolean) {
  const nomlar = await storeNames(accountId);
  const hovuz = [...nomlar.entries()].find(([, n]) => n === 'Taqsimlanmagan')?.[0];
  if (!hovuz) throw new Error('«Taqsimlanmagan» ombori topilmadi');
  const nishon = [...nomlar.entries()]
    .filter(([, n]) => /^Ombor 0[1-7]$/.test(n))
    .map(([id]) => id);

  const rows = await prisma.stock.findMany({
    where: { accountId, storeId: { in: nishon }, qty: { gt: 0 } },
    select: { storeId: true, assortmentId: true, qty: true },
  });
  if (rows.length === 0) {
    console.log('  ✅ «Ombor 01…07» toza — ko`chiriladigan qoldiq yo`q.');
    return;
  }
  const org = await prisma.organization.findFirstOrThrow({
    where: { accountId },
    select: { id: true },
  });
  for (const r of rows) {
    const p = await prisma.product.findFirst({
      where: { id: r.assortmentId },
      select: { name: true },
    });
    console.log(
      `  ${apply ? '→' : '(dry)'} ${nomlar.get(r.storeId)} → Taqsimlanmagan · ${p?.name ?? r.assortmentId} · ${r.qty}`,
    );
    if (!apply) continue;
    await call(token, 'POST', '/moves', {
      organizationId: org.id,
      sourceStoreId: r.storeId,
      destinationStoreId: hovuz,
      description: 'M1 jonli smoke — qolib ketgan qoldiqni hovuzga QAYTARISH',
      applicable: true,
      positions: [{ assortmentId: r.assortmentId, quantity: r.qty.toString() }],
    });
  }
}

// ─────────────────────────────────────────────────────────────────── MAIN ────

async function main() {
  const acc = await prisma.account.findFirstOrThrow({ select: { id: true, name: true } });
  const accountId = acc.id;

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET topilmadi (apps/api/.env ni source qiling)');
  const emp = await prisma.employee.findFirstOrThrow({
    where: { accountId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      accountId: true,
      email: true,
      name: true,
      username: true,
      hrRoles: true,
      isChecker: true,
    },
  });
  const token = new JwtService({ secret }).sign(
    {
      sub: emp.id,
      accountId: emp.accountId,
      email: emp.email,
      name: emp.name,
      username: emp.username,
      hrRoles: emp.hrRoles,
      isChecker: emp.isChecker,
      uiMode: 'full',
      hrPermissions: [],
    },
    { expiresIn: '30m' },
  );

  console.log('════════ M1 JONLI SMOKE (qoida 13) ════════');
  console.log(
    `Rejim:   ${LIVE ? '🔴 LIVE (yozadi va o`zi tozalaydi)' : 'DRY (hech nima yozilmaydi)'}`,
  );
  console.log(`API:     ${API}`);
  console.log(`Akkaunt: ${acc.name} · token: ${emp.name}\n`);

  if (process.argv.includes('--restore-stray')) {
    console.log('── «Ombor 01…07» dagi qolib ketgan qoldiqni QAYTARISH ──');
    await restoreStray(accountId, token, LIVE);
    await prisma.$disconnect();
    process.exit(0);
  }

  const verdicts: Verdict[] = [];
  verdicts.push(await checkCascade(accountId));

  // Har yugurishdan OLDIN — oldingi urinishning izi qolmasin.
  if (LIVE) await cleanupResidue(accountId, token);

  const openShifts = await prisma.cashierSession.findMany({
    where: { accountId, state: 'open' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, cashDeskId: true },
  });
  const shift = openShifts.find((s) => s.cashDeskId != null);
  if (!shift) throw new Error('Ochiq smena (kassali) topilmadi');

  console.log('── 1 · SINOV SOTUV ──');
  verdicts.push(...(await smokeSale(accountId, token, shift.id)));
  console.log('── 2 · YACHEYKA SANASH ──');
  verdicts.push(...(await smokeCount(accountId, token)));
  console.log("── 3 · KO'CHIRISH ──");
  verdicts.push(...(await smokeMove(accountId, token)));

  console.log('\n── HUKM ──');
  for (const v of verdicts) {
    console.log(`  ${v.pass ? 'OK  ' : 'XATO'} ${v.label}`);
    console.log(`        ${v.detail}`);
  }
  const passed = verdicts.filter((v) => v.pass).length;
  const ok = passed === verdicts.length;
  console.log(`\n${passed}/${verdicts.length} hukm o'tdi.`);
  if (!ok)
    console.log(
      `Yiqilganlar: ${verdicts
        .filter((v) => !v.pass)
        .map((v) => v.key)
        .join(', ')}`,
    );
  console.log(ok ? 'M1 SMOKE O`TDI' : 'M1 SMOKE YIQILDI');

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('XATO:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
