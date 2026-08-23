/**
 * MK32 — POS (`/sotuv`) xarakteristik testlari uchun umumiy jihoz.
 *
 * NEGA SAHIFA ORQALI, komponentlar orqali EMAS: `page.tsx` ichidagi
 * `OpenShiftForm` / `ChekDetailPanel` / `SalesScreen` **eksport qilinmagan**.
 * Ularni sinash uchun eksport qo'shish — xulqni o'zgartirmasa ham, faylning
 * shaklini o'zgartirish bo'lardi; MK32 esa ataylab «hech narsaga tegmaydigan»
 * faza. Shu sababdan hamma test sahifaning ildizidan (`SotuvPage`) kiradi va
 * ekranni kassirning ko'zi bilan boshqaradi.
 *
 * QO'SHIMCHA FOYDASI (MK33 uchun): sahifa uch komponentga bo'linganda bu
 * testlarning birortasi ham o'zgarmaydi — ular import yo'llariga emas,
 * ekranning xulqiga bog'langan. MK33 ning yagona qabul mezoni aynan shu.
 *
 * ⚠️ Bu fayl `.test.tsx` EMAS (vitest `include` faqat `*.test.{ts,tsx}` ni
 * yig'adi) — u faqat jihoz.
 */

import type { CurrentSession, PosProductRow } from '@moysklad/contracts';

// ── Marshrutlovchi API mok ──────────────────────────────────────────────────

export interface Route {
  match: RegExp;
  /** Statik javob yoki `(path, body) => javob`. `Error` qaytarsa — otiladi. */
  value: unknown | ((path: string, body?: unknown) => unknown);
}

/**
 * Yo'l bo'yicha javob beruvchi mok. **Mos kelmagan yo'l — xato**, jimgina
 * `undefined` EMAS: `undefined` javob React Query'da jim «yuklanmoqda»ga
 * aylanadi va test nima kutilganini ko'rsatmay yiqiladi.
 *
 * Tartib muhim — birinchi mos kelgan qoida yutadi (aniqrog'ini oldinga qo'y:
 * `state=ready` umumiy `/retail-sales?` dan OLDIN).
 */
export function router(routes: Route[]) {
  return async (path: string, body?: unknown): Promise<unknown> => {
    for (const r of routes) {
      if (r.match.test(path)) {
        const out = typeof r.value === 'function' ? r.value(path, body) : r.value;
        if (out instanceof Error) throw out;
        return out;
      }
    }
    throw new Error(`Test jihozi: kutilmagan so'rov «${path}»`);
  };
}

/**
 * Bo'shliqlarni normallashtiradi. `formatMoney` ru-RU ajratgichini ishlatadi —
 * ming ajratgichi UZILMAS bo'shliq (U+00A0), oddiy probel EMAS; test satrida
 * oddiy probel yozilsa taqqoslash sababsiz yiqilardi.
 */
export function norm(text: string | null | undefined): string {
  return (text ?? '').replace(/[\u00a0\u202f\u2009]/g, ' ');
}

/**
 * Massiv elementini QAT'IY oladi. `noUncheckedIndexedAccess` yoqilgan —
 * `items[0]` turi `T | undefined`, va `?.` bilan yumshatish testni JIM
 * o'tkazib yuborardi (element yo'q bo'lsa tekshiruv umuman bajarilmasdi).
 * Bu yerda esa aniq xato beradi.
 */
export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Test jihozi: ${index}-element yo'q (uzunligi ${items.length})`);
  }
  return value;
}

// ── Fikstura ────────────────────────────────────────────────────────────────

export const RETAIL_PRICE_TYPE = '11111111-1111-4111-8111-111111111111';
export const WHOLESALE_PRICE_TYPE = '22222222-2222-4222-8222-222222222222';

export const PRICE_TYPES = {
  items: [
    {
      id: RETAIL_PRICE_TYPE,
      name: 'Цена продажи',
      isDefault: true,
      position: 0,
      currency: 'UZS',
      archived: false,
    },
    {
      id: WHOLESALE_PRICE_TYPE,
      name: 'Оптовая цена',
      isDefault: false,
      position: 1,
      currency: 'UZS',
      archived: false,
    },
  ],
};

/**
 * `GET /exchange-rates/rate?currency=USD` — kanonik `rateMinor` (×10^8) bilan.
 * 1 USD = 12 450,27 so'm. Payload'ga AYNAN `rateMinor` ketadi.
 */
export const USD_RATE = {
  date: '2026-08-11',
  currency: 'USD',
  rate: '12450.27',
  nominal: 1,
  rateMinor: '1245027000000',
  source: 'CBRU',
};

export function SESSION(over: Partial<CurrentSession> = {}): CurrentSession {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    state: 'open',
    openedAt: '2026-08-09T04:00:00.000Z',
    cashier: { id: '44444444-4444-4444-8444-444444444444', name: 'Kassir Aliyev' },
    cashDesk: { id: '55555555-5555-4555-8555-555555555555', name: 'Asosiy kassa', currency: 'UZS' },
    store: { id: '66666666-6666-4666-8666-666666666666', name: 'Markaziy do‘kon' },
    organization: { id: '77777777-7777-4777-8777-777777777777', name: 'Sherset MChJ' },
    salesCount: 3,
    salesSumMinor: '150000',
    // Qaytarish maydonlari ham SERVERDAN keladi (prodda o'lchandi:
    // `returnsCount`/`returnsSumMinor` javobda bor). Sukut = qaytarishsiz smena.
    returnsCount: 0,
    returnsSumMinor: '0',
    openingCashMinor: '0',
    // P4 — «unutilgan smena» maydonlari SERVERDAN keladi (yosh + chegara +
    // bayroq). Fixture ularni o'zi to'qib chiqarmasin: shakl
    // `CurrentSessionSchema` bilan bir xil, sukut holat = yangi ochilgan
    // smena (`fe-fixture-invents-server-field` saboqi).
    openMinutes: 120,
    staleWarnHours: 12,
    stale: false,
    ...over,
  } as CurrentSession;
}

/**
 * Tovar kartochkasi. Standart holat: sotuv narxi 10 000, optom chegara 8 000,
 * tan narx 6 000 (so'mda) — ya'ni `ok` tasma. Chegaralarni `over` bilan
 * siljitib `below-wholesale` / `loss` holatlari yasaladi.
 */
export function PRODUCT(over: Partial<PosProductRow> = {}): PosProductRow {
  return {
    id: 'p-1',
    name: 'Kabel 2×2.5',
    code: 'K-001',
    buyPrice: '600000',
    salePrices: [
      { priceTypeId: RETAIL_PRICE_TYPE, value: '1000000' },
      { priceTypeId: WHOLESALE_PRICE_TYPE, value: '800000' },
    ],
    stock: { onHand: '12', reserved: '0', inTransit: '0', available: '12' },
    ...over,
  } as PosProductRow;
}

export const PRODUCTS = {
  items: [
    PRODUCT(),
    PRODUCT({
      id: 'p-2',
      name: 'Rozetka Legrand',
      code: 'R-002',
      buyPrice: '300000',
      salePrices: [
        { priceTypeId: RETAIL_PRICE_TYPE, value: '500000' },
        { priceTypeId: WHOLESALE_PRICE_TYPE, value: '400000' },
      ],
      stock: { onHand: '5', reserved: '0', inTransit: '0', available: '5' },
    }),
  ],
  total: 2,
};

/**
 * `SalesScreen` chizilishi uchun zarur bo'lgan eng kichik marshrut to'plami.
 * `over` qoidalari OLDINGA qo'yiladi — test kerakli yo'lni ustidan yozadi.
 */
export function salesRoutes(over: Route[] = []): Route[] {
  return [
    ...over,
    { match: /^\/cashier-sessions\/current$/, value: SESSION() },
    // F7 — POS «Zakazlar» yorlig'i `usePermissions()` orqali `customerorder`
    // katakchalarini o'qiydi. Marshrut shu yerda TURISHI SHART: yo'qligida
    // router istisno otadi, matritsa `undefined` bo'lib qoladi va hook
    // fail-open ishlaydi — ya'ni ruxsat testlari JIM yashil bo'lardi.
    {
      match: /^\/permissions\/me$/,
      value: { matrix: { customerorder: { view: 'ALL', approve: 'ALL' } } },
    },
    // MK31 — to'lov oynasi ochilganda kunlik dollar kursi so'raladi. Marshrut
    // shu yerda TURISHI SHART: yo'qligida router istisno otadi va har POS
    // testi kursi yo'q holatda ishlab, dollar tenderini jimgina o'chirardi.
    { match: /^\/exchange-rates\/rate/, value: USD_RATE },
    // F5 — «Smena» rejimi yakunlanmagan cheklar ro'yxatini so'raydi. Marshrut
    // shu yerda TURISHI SHART: yo'qligida router istisno otadi va smena
    // yorlig'iga o'tadigan HAR test yiqilardi. Sukut — bo'sh (bloklovchi yo'q).
    { match: /^\/cashier-sessions\/[^/]+\/unresolved$/, value: { sales: [] } },
    { match: /^\/price-types/, value: PRICE_TYPES },
    { match: /^\/products\?/, value: PRODUCTS },
    // Aniqrog'i umumiy `/retail-sales?` dan OLDIN.
    { match: /^\/retail-sales\?.*state=ready/, value: { items: [] } },
    { match: /^\/retail-sales\?.*state=picking/, value: { items: [] } },
    { match: /^\/retail-sales\?/, value: { items: [], total: 0 } },
  ];
}

/** «Tayyor»/«Jarayonda» ro'yxat qatori. */
export function SALE_ROW(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    name: 'CHEK-00001',
    sumMinor: '2000000',
    moment: '2026-08-09T05:30:00.000Z',
    state: 'ready',
    agent: null,
    session: {
      cashier: { id: 'u-1', name: 'Kassir Aliyev' },
      cashDesk: { name: 'Asosiy kassa', currency: 'UZS' },
    },
    _count: { positions: 2 },
    ...over,
  };
}

/** `GET /retail-sales/:id` — to'liq detal (chek paneli + «Tayyor»ni yuklash). */
export function SALE_DETAIL(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    name: 'CHEK-00001',
    moment: '2026-08-09T05:30:00.000Z',
    state: 'posted',
    sumMinor: '1800000',
    cashAmountMinor: '1000000',
    cardAmountMinor: '800000',
    terminalAmountMinor: '0',
    agent: { id: 'cp-1', name: 'Usta Vali' },
    session: {
      cashier: { id: 'u-1', name: 'Kassir Aliyev' },
      cashDesk: { name: 'Asosiy kassa', currency: 'UZS' },
      store: { name: 'Markaziy do‘kon' },
    },
    positions: [
      {
        id: 'pos-1',
        quantity: '2',
        priceMinor: '1000000',
        sumMinor: '1800000',
        discount: '10',
        costMinor: null,
        basePriceMinor: null,
        product: { id: 'p-1', name: 'Kabel 2×2.5', code: 'K-001', buyPrice: '600000' },
      },
    ],
    ...over,
  };
}
