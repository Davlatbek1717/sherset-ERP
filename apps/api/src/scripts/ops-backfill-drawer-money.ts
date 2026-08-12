#!/usr/bin/env tsx
/**
 * TARIXIY YASHIQ AMALLARINI PUL DAFTARIGA KIRITISH (Faza 4, 2026-08-12).
 *
 * NEGA: `drawerCashIn` / `drawerCashOut` / `posCashOut` bugungacha
 * `RetailDrawerCashIn|Out` qatorini yozardi-yu, `MoneyOperation` ga ham,
 * `CashDesk.balanceMinor` ga ham TEGMASDI. Kod endi tuzatildi, lekin
 * O'TMISH daftarda yo'q: qoldiq faqat kirimlardan shishgan holida qolgan.
 *
 * DRY sukut bo'yicha; `--live` bilan yozadi.
 *
 * 🔴 FARQ QO'LLANADI, JAMI EMAS (xotira: `cell-migration-delta-not-total`).
 * Har hujjat uchun mos `MoneyOperation` bor-yo'qligi tekshiriladi; yo'q bo'lsa
 * qator yoziladi va `CashDesk.balanceMinor` AYNAN o'sha summaga siljitiladi.
 * Ikki marta yugurtirilsa ikkinchisi 0 ta o'zgarish qiladi (idempotent).
 *
 * 🔴 `MoneyService.applyDeltas` ATAYLAB ISHLATILMAYDI: u overdraft
 * qo'riqchisiga uriladi, tarixiy chiqimlar esa qoldiqni haqiqatan manfiyga
 * tushirishi mumkin. Backfill — o'tmishni QAYD etish, uni taqiqlash emas.
 * Manfiy natija hisobot sifatida ochiq chiqariladi.
 *
 * 🔴 VALYUTA MOS KELMASA — O'TKAZIB YUBORILADI. `CashDesk.balanceMinor`
 * kassaning O'Z valyutasidagi ustun; boshqa valyutadagi hujjat summasini unga
 * qo'shish 1 sent = 1 tiyin degan jim yolg'on bo'lardi. Bunday qatorlar
 * alohida ro'yxatga tushadi va ODAM qaroriga qoldiriladi.
 *
 * Ishga tushirish:
 *   cd apps/api && npx tsx src/scripts/ops-backfill-drawer-money.ts          # DRY
 *   cd apps/api && npx tsx src/scripts/ops-backfill-drawer-money.ts --live   # yozadi
 *
 * 🔴 Prodda yugurtirishdan OLDIN majburiy: `pg_dump` backup va DRY natijasini
 * egaga ko'rsatish.
 */
import { PrismaClient } from '@moysklad/db';

const LIVE = process.argv.includes('--live');
const prisma = new PrismaClient();

interface Row {
  id: string;
  accountId: string;
  name: string;
  sumMinor: bigint;
  currency: string;
  cashDeskId: string;
  deskCurrency: string;
  at: Date;
}

const SELECT = {
  id: true,
  accountId: true,
  name: true,
  sumMinor: true,
  currency: true,
  postedAt: true,
  moment: true,
  retailShift: { select: { cashDeskId: true, cashDesk: { select: { currency: true } } } },
} as const;

const WHERE = { state: 'posted', deletedAt: null } as const;

type Raw = {
  id: string;
  accountId: string;
  name: string;
  sumMinor: bigint;
  currency: string;
  postedAt: Date | null;
  moment: Date;
  retailShift: { cashDeskId: string; cashDesk: { currency: string } };
};

function toRow(d: Raw): Row {
  return {
    id: d.id,
    accountId: d.accountId,
    name: d.name,
    sumMinor: d.sumMinor,
    currency: d.currency,
    cashDeskId: d.retailShift.cashDeskId,
    deskCurrency: d.retailShift.cashDesk.currency,
    // Daftar qatorining vaqti — hujjat ONI, backfill kuni EMAS. Aks holda
    // butun o'tmish bugungi kunga yig'ilib, lenta yolg'on ko'rsatardi
    // (xotira: `opening-row-is-not-a-movement`).
    at: d.postedAt ?? d.moment,
  };
}

async function collect(kind: 'in' | 'out'): Promise<Row[]> {
  const docs =
    kind === 'in'
      ? await prisma.retailDrawerCashIn.findMany({ where: WHERE, select: SELECT })
      : await prisma.retailDrawerCashOut.findMany({ where: WHERE, select: SELECT });
  return (docs as Raw[]).map(toRow);
}

const som = (m: bigint) => `${(m / 100n).toLocaleString('ru-RU')} so'm`;

async function main() {
  console.log(LIVE ? '=== LIVE (yoziladi) ===' : '=== DRY (hech narsa yozilmaydi) ===');

  let planned = 0;
  let already = 0;
  const skipped: string[] = [];
  const perDesk = new Map<string, bigint>();

  for (const kind of ['in', 'out'] as const) {
    const documentKind = kind === 'in' ? 'drawer_cash_in' : 'drawer_cash_out';
    const rows = await collect(kind);
    console.log(`\n-- ${documentKind}: ${rows.length} ta posted hujjat`);

    for (const row of rows) {
      const exists = await prisma.moneyOperation.findFirst({
        where: { documentKind, documentId: row.id },
        select: { id: true },
      });
      if (exists) {
        already++;
        continue;
      }

      if (row.currency !== row.deskCurrency) {
        skipped.push(
          `  ${row.name}: hujjat ${row.currency} ≠ kassa ${row.deskCurrency} — O'TKAZIB YUBORILDI`,
        );
        continue;
      }

      const delta = kind === 'in' ? row.sumMinor : -row.sumMinor;
      planned++;
      perDesk.set(row.cashDeskId, (perDesk.get(row.cashDeskId) ?? 0n) + delta);
      console.log(`  ${row.name}  ${som(delta)}  desk=${row.cashDeskId}`);

      if (LIVE) {
        await prisma.$transaction([
          prisma.moneyOperation.create({
            data: {
              accountId: row.accountId,
              at: row.at,
              cashDeskId: row.cashDeskId,
              deltaMinor: delta,
              currency: row.currency,
              documentKind,
              documentId: row.id,
              description: `Backfill 2026-08-12: ${row.name}`,
            },
          }),
          prisma.cashDesk.update({
            where: { id: row.cashDeskId },
            data: { balanceMinor: { increment: delta } },
          }),
        ]);
      }
    }
  }

  console.log(`\nJami qator: ${planned} ta yoziladi · ${already} ta allaqachon daftarda`);
  if (skipped.length > 0) {
    console.log('\nValyuta mos kelmagani uchun o`tkazib yuborilgan:');
    for (const s of skipped) console.log(s);
  }

  console.log('\nKassa qoldig`i:');
  for (const [desk, delta] of perDesk) {
    const d = await prisma.cashDesk.findUniqueOrThrow({
      where: { id: desk },
      select: { name: true, balanceMinor: true },
    });
    // LIVE'da ustun allaqachon siljigan, DRY'da esa kutilgan holat chiziladi.
    const after = LIVE ? d.balanceMinor : d.balanceMinor + delta;
    console.log(`  ${d.name}: siljish ${som(delta)} ⇒ qoldiq ${som(after)}`);
    if (after < 0n) {
      console.log('    ⚠️ QOLDIQ MANFIY — ma`lumot sifati tekshirilsin (ochilish qoldig`i yo`q?)');
    }
  }
  if (perDesk.size === 0) console.log('  (siljish yo`q)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
