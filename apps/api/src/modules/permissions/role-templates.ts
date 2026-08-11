/**
 * MK29 — 10 rol shabloni (TZ §3.4).
 *
 * TZ: docs/superpowers/specs/2026-08-01-menejer-tz-design.md §3.4
 * Qaror: docs/REJA-MENEJER-KASSA-2026-08.md → QAROR-B4 (2026-08-10).
 *
 * ── Nega `slug`, nomi emas (QAROR-B4.1) ────────────────────────────────────
 * `Role.name` — foydalanuvchi tahrirlaydigan matn. Agar shablon aynan shu
 * nom bilan tanilsa, admin rolni «Savdo menejeri» dan «Sotuv bo'limi» ga
 * qayta nomlashi bilan shablon aloqasi jimgina uzilardi va ru interfeysda
 * o'zbekcha nom turaverardi. Shuning uchun identifikator = barqaror
 * `templateSlug`, ko'rinadigan yorliq esa i18n'dan
 * (`pages.roleTemplates.<slug>`).
 *
 * ── Matritsa qanday chiqariladi ────────────────────────────────────────────
 * Uch qatlam, shu tartibda ustma-ust qo'yiladi:
 *   1) `defaults`  — «qolgan hamma narsa» uchun bazaviy scope
 *   2) DENY        — sezgir entity'lar (rol matritsasi, ish haqi, audit…):
 *                    admin/egadan boshqa HAMMA shablonda hamma amal `NO`
 *   3) `grants`    — shablonning o'z domeni (ochiq ro'yxat)
 *
 * DENY qatlami ataylab `defaults` dan KEYIN turadi: `defaults.view = 'ALL'`
 * yozilgan shablon (masalan «Savdo menejeri») aks holda `payroll` va
 * `hrsalary` ni ham ko'rib qo'yardi — ya'ni bitta baza qiymati butun ish haqi
 * ma'lumotini ochib yuborardi. Bu «unutilgan default» bug-klassi.
 */
import {
  PERMISSION_ACTIONS,
  PERMISSION_ENTITIES,
  type PermissionAction,
  type PermissionEntity,
  type PermissionScope,
} from './permissions.types.js';

export type RoleTemplateSlug =
  | 'owner'
  | 'admin'
  | 'sales_manager'
  | 'warehouse_manager'
  | 'cashier'
  | 'seller'
  | 'storekeeper'
  | 'accountant'
  | 'supplier'
  | 'driver';

export type CellMap = Partial<
  Record<PermissionEntity, Partial<Record<PermissionAction, PermissionScope>>>
>;

export interface RoleTemplate {
  slug: RoleTemplateSlug;
  /**
   * DB `Role.name` uchun boshlang'ich qiymat (seed kaliti). Ko'rinadigan
   * yorliq BU EMAS — i18n `pages.roleTemplates.<slug>`. Admin nomni
   * o'zgartirsa shablon aloqasi `templateSlug` orqali saqlanadi.
   */
  seedName: string;
  description: string;
  /** `kiosk` — login'dan keyin to'g'ridan-to'g'ri POS (kassa TZ §3.1). */
  uiMode: 'full' | 'kiosk';
  defaults: Record<PermissionAction, PermissionScope>;
  grants?: CellMap;
}

// ─── Qisqartmalar ───────────────────────────────────────────────────────────

const ALL_NO: Record<PermissionAction, PermissionScope> = {
  view: 'NO',
  create: 'NO',
  update: 'NO',
  delete: 'NO',
  approve: 'NO',
  print: 'NO',
};

const ALL_FULL: Record<PermissionAction, PermissionScope> = {
  view: 'ALL',
  create: 'ALL',
  update: 'ALL',
  delete: 'ALL',
  approve: 'ALL',
  print: 'ALL',
};

/** «Ko'radi va chop etadi, lekin o'zgartirmaydi» — kuzatuvchi bazasi. */
const READ_ONLY_BASE: Record<PermissionAction, PermissionScope> = {
  view: 'ALL',
  create: 'NO',
  update: 'NO',
  delete: 'NO',
  approve: 'NO',
  print: 'ALL',
};

/** Bir nechta entity'ga bir xil katakchalar berish. */
function grant(
  entities: readonly PermissionEntity[],
  cells: Partial<Record<PermissionAction, PermissionScope>>,
): CellMap {
  const out: CellMap = {};
  for (const e of entities) out[e] = { ...cells };
  return out;
}

/** Ustma-ust qo'yish — keyingi qatlam oldingisining katakchasini bosadi. */
function merge(...layers: CellMap[]): CellMap {
  const out: CellMap = {};
  for (const layer of layers) {
    for (const [entity, cells] of Object.entries(layer)) {
      const key = entity as PermissionEntity;
      out[key] = { ...out[key], ...cells };
    }
  }
  return out;
}

// ─── Entity guruhlari ───────────────────────────────────────────────────────

const HR_ENTITIES = PERMISSION_ENTITIES.filter((e) => e.startsWith('hr'));

/**
 * Admin/egadan boshqa HECH BIR shablon tegmaydigan yuza.
 *
 * `role` va `auditlog` — bu ro'yxatning o'zagi: `role:view` ruxsat modelini
 * ochadi, `role:update` esa MK26 G1 hujum yo'li (o'ziga rol yozib admin
 * bo'lish). `payroll`/`hrsalary` — ish haqi. `employee` bu yerda, lekin
 * quyida ba'zi shablonlarga `view` qaytarib beriladi (menejerga xodimlar
 * ro'yxati kerak) — YOZISH esa hech qaysisiga qaytarilmaydi.
 */
const SENSITIVE_ENTITIES: readonly PermissionEntity[] = [
  'role',
  'auditlog',
  'payroll',
  'bankaccount',
  'employee',
  'organization',
  'branch',
  'settings',
  'analitika',
  ...HR_ENTITIES,
];

const DENY_SENSITIVE: CellMap = grant(SENSITIVE_ENTITIES, ALL_NO);

const CATALOG: readonly PermissionEntity[] = [
  'product',
  'productfolder',
  'variant',
  'bundle',
  'service',
  'uom',
  'pricetype',
  'mxik',
  'trackingcode',
  'discount',
  'taxrate',
];

const SALES_DOCS: readonly PermissionEntity[] = [
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'factureout',
  'commissionreport',
  'consignment',
];

const PURCHASE_DOCS: readonly PermissionEntity[] = [
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'facturein',
];

const MONEY_DOCS: readonly PermissionEntity[] = [
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'bankimport',
  'counterpartyadjustment',
  'prepayment',
  'prepaymentreturn',
];

const WAREHOUSE_DOCS: readonly PermissionEntity[] = [
  'move',
  'loss',
  'enter',
  'inventory',
  'internalorder',
  'pricelist',
];

const CRM: readonly PermissionEntity[] = ['pipeline', 'opportunity', 'call', 'task', 'tasktype'];

const PARTNERS: readonly PermissionEntity[] = ['counterparty', 'contactperson', 'contract'];

const FULL_CRUD: Partial<Record<PermissionAction, PermissionScope>> = {
  view: 'ALL',
  create: 'ALL',
  update: 'ALL',
  approve: 'ALL',
  print: 'ALL',
  delete: 'OWN_GROUP',
};

// ─── 10 shablon ─────────────────────────────────────────────────────────────

export const ROLE_TEMPLATES: Record<RoleTemplateSlug, RoleTemplate> = {
  /**
   * Egasi — `AccountOwner` bilan bir xil matritsa. Farq MATRITSADA EMAS,
   * STRUKTURADA: egalik yagona (singleton), «Сделать владельцем» orqali
   * o'tkaziladi va egasi MK26 G1 tekshiruvidan ozod. Ikkalasini bir xil
   * qilib qo'yish ataylab — «egasi nimanidir ko'ra olmaydi» degan holat
   * qo'llab-quvvatlanmaydi.
   */
  owner: {
    slug: 'owner',
    seedName: 'Egasi',
    description: "Akkaunt egasi — to'liq kirish, egalikni o'tkaza oladi",
    uiMode: 'full',
    defaults: ALL_FULL,
  },

  admin: {
    slug: 'admin',
    seedName: 'Admin',
    description: "To'liq kirish — sozlamalar va ruxsatlar ham",
    uiMode: 'full',
    defaults: ALL_FULL,
  },

  /**
   * Savdo menejeri — savdo zanjiri to'liq, katalog va pul FAQAT o'qish.
   * `delete` savdo hujjatlarida `OWN_GROUP`: menejer o'z bo'limi hujjatini
   * o'chira oladi, begonasini emas.
   */
  sales_manager: {
    slug: 'sales_manager',
    seedName: 'Savdo menejeri',
    description: "Savdo zanjiri va mijozlar — o'z bo'limi kesimida",
    uiMode: 'full',
    defaults: READ_ONLY_BASE,
    grants: merge(
      DENY_SENSITIVE,
      grant(SALES_DOCS, FULL_CRUD),
      grant(PARTNERS, { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(CRM, { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      // Menejerga xodimlar ro'yxati kerak (hujjatni kimga biriktirish) —
      // faqat O'QISH, yozish DENY'da qoladi.
      grant(['employee'], { view: 'ALL' }),
      grant(['report'], { view: 'ALL', print: 'ALL' }),
    ),
  },

  /**
   * Ombor menejeri — ombor va ta'minot zanjiri. Pul hujjatlari ATAYLAB
   * yopiq: qabul qilingan tovarni to'lov bilan birga boshqarish
   * vazifalar ajratilishini (segregation of duties) buzardi.
   */
  warehouse_manager: {
    slug: 'warehouse_manager',
    seedName: 'Ombor menejeri',
    description: "Ombor, qabul va ta'minot zanjiri",
    uiMode: 'full',
    defaults: READ_ONLY_BASE,
    grants: merge(
      DENY_SENSITIVE,
      grant(MONEY_DOCS, ALL_NO),
      grant(WAREHOUSE_DOCS, FULL_CRUD),
      grant(PURCHASE_DOCS, {
        view: 'ALL',
        create: 'ALL',
        update: 'ALL',
        approve: 'ALL',
        print: 'ALL',
      }),
      grant(['store', 'cashdesk'], { view: 'ALL' }),
      grant(['storecell'], { view: 'ALL', update: 'ALL' }),
      grant(['product', 'variant', 'bundle', 'productfolder'], { view: 'ALL', update: 'ALL' }),
      // Yig'ish/jo'natish — realizatsiyani tasdiqlaydi, lekin YARATMAYDI.
      grant(['demand'], { view: 'ALL', update: 'ALL', approve: 'ALL', print: 'ALL' }),
      grant(['employee'], { view: 'ALL' }),
      grant(['report'], { view: 'ALL', print: 'ALL' }),
    ),
  },

  /**
   * Kassir — YAGONA `kiosk` shabloni. Matritsa `KIOSK_ALLOWED` ro'yxati
   * (kassa TZ §3.1) bilan MOS bo'lishi shart: kiosk yetib bormaydigan
   * endpoint uchun ruxsat berish «qog'ozda bor, amalda yo'q» yolg'oni
   * bo'lardi va sozlovchini adashtirardi. `role-templates.test.ts` shu
   * mosliкni har amal uchun tekshiradi.
   *
   * `debtreport` ataylab yopiq — kassirlar bo'yicha kunlik hisobot
   * call-markaz rahbariyati uchun (qarz TZ §3.9), kassirning o'ziga emas.
   */
  cashier: {
    slug: 'cashier',
    seedName: 'Kassir',
    description: 'Faqat kassa (kiosk) — sotuv, smena, qarz to‘lovi',
    uiMode: 'kiosk',
    defaults: ALL_NO,
    grants: merge(
      grant(['retailsale'], { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(['cashiersession'], { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(['product', 'productfolder', 'pricetype'], { view: 'ALL' }),
      // F9 — mijoz kartasi. `update` kiosk'da FAQAT bitta tor yo'lda yashaydi:
      // `PATCH /counterparties/:id/pos-contact` (telefon + izoh). Umumiy
      // `PATCH /counterparties/:id` `KIOSK_ALLOWED` da YO'Q, ya'ni bu ruxsat
      // nom/narx turi/egasi/teglarni o'zgartirishga yetmaydi.
      grant(['counterparty'], { view: 'ALL', create: 'ALL', update: 'ALL' }),
      grant(['debt', 'debtpayment'], { view: 'ALL', create: 'ALL' }),
      // F7 — zakazlar POS'da. `view` (ro'yxat + detal) va `approve`
      // (`draft → confirmed`, rezerv avtomatik tushadi) — boshqa hech nima.
      // `create`/`update` ATAYLAB yo'q: zakazni savdo menejeri tuzadi, kassir
      // faqat qabul qiladi. Kiosk tomonidagi juftligi — `KIOSK_ALLOWED` dagi
      // uch aniq qator (`/customer-orders`, `/customer-orders/:id`,
      // `…/transitions/confirmed`).
      grant(['customerorder'], { view: 'ALL', approve: 'ALL' }),
      grant(['cashout'], { view: 'ALL', create: 'ALL', print: 'ALL' }),
      grant(['expenseitem', 'currency', 'exchangerate'], { view: 'ALL' }),
      grant(['settings'], { view: 'ALL' }),
    ),
  },

  /**
   * Sotuvchi (B2B/B2G) — o'z va guruh yozuvlari kesimida. `OWN_AND_GROUP`
   * ataylab: sotuvchilar bir-birining mijozini ko'rmasligi kerak (TZ §4
   * raqobat sababi), lekin bo'lim ichida almashish ishlaydi.
   */
  seller: {
    slug: 'seller',
    seedName: 'Sotuvchi',
    description: "B2B/B2G sotuvchi — o'z va bo'lim yozuvlari",
    uiMode: 'full',
    defaults: ALL_NO,
    grants: merge(
      grant(['customerorder', 'demand', 'invoiceout'], {
        view: 'OWN_AND_GROUP',
        create: 'ALL',
        update: 'OWN_AND_GROUP',
        print: 'OWN_AND_GROUP',
      }),
      grant(['counterparty', 'contactperson'], {
        view: 'OWN_AND_GROUP',
        create: 'ALL',
        update: 'OWN',
      }),
      grant(['contract'], { view: 'OWN_AND_GROUP' }),
      grant(CATALOG, { view: 'ALL' }),
      grant(['call', 'task', 'opportunity'], {
        view: 'OWN_AND_GROUP',
        create: 'ALL',
        update: 'OWN',
      }),
    ),
  },

  /**
   * Omborchi — jismoniy ombor ishi: yig'ish, qabul, ko'chirish, inventarizatsiya.
   * Narx va pul KO'RINMAYDI (`defaults` = hammasi `NO`, katalogdan faqat
   * `view`) — omborchiga tan narx kerak emas.
   */
  storekeeper: {
    slug: 'storekeeper',
    seedName: 'Omborchi',
    description: "Yig'ish, qabul, ko'chirish va inventarizatsiya",
    uiMode: 'full',
    defaults: ALL_NO,
    grants: merge(
      grant(['demand'], { view: 'ALL', update: 'ALL', approve: 'ALL', print: 'ALL' }),
      grant(['move', 'enter', 'loss', 'internalorder'], {
        view: 'ALL',
        create: 'ALL',
        update: 'ALL',
        print: 'ALL',
      }),
      grant(['inventory'], { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      // Qabulni ko'radi va yopadi, lekin ta'minot hujjatini YARATMAYDI.
      grant(['supply'], { view: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(['product', 'productfolder', 'variant', 'bundle', 'uom'], { view: 'ALL' }),
      grant(['store'], { view: 'ALL' }),
      // TZ v3 §3: yacheyka amallari (bog'lash/sanash) omborchining asosiy ishi —
      // ombor kartochkasini tahrirlash huquqini bermasdan ochiladi.
      grant(['storecell'], { view: 'ALL', update: 'ALL' }),
      grant(['label'], { view: 'ALL', print: 'ALL' }),
    ),
  },

  /**
   * Buxgalter — pul va hisobot. Katalog/hujjatlarni ko'radi, lekin savdo
   * hujjatini o'zgartirmaydi. `auditlog` va `bankaccount` unga QAYTARILADI
   * (DENY qatlamidan keyin) — buxgalterning asosiy ish quroli.
   */
  accountant: {
    slug: 'accountant',
    seedName: 'Buxgalter',
    description: 'Pul hujjatlari, hisobotlar va ish haqi',
    uiMode: 'full',
    defaults: READ_ONLY_BASE,
    grants: merge(
      DENY_SENSITIVE,
      grant(MONEY_DOCS, {
        view: 'ALL',
        create: 'ALL',
        update: 'ALL',
        approve: 'ALL',
        print: 'ALL',
      }),
      grant(['factureout', 'facturein'], {
        view: 'ALL',
        create: 'ALL',
        update: 'ALL',
        print: 'ALL',
      }),
      grant(['payroll'], { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(['bankaccount', 'cashdesk'], { view: 'ALL', create: 'ALL', update: 'ALL' }),
      grant(['auditlog', 'report'], { view: 'ALL', print: 'ALL' }),
      grant(['organization', 'branch'], { view: 'ALL' }),
      grant(['employee'], { view: 'ALL' }),
      grant(['debt', 'debtpayment', 'debtreport'], { view: 'ALL', print: 'ALL' }),
    ),
  },

  /**
   * Ta'minotchi — xarid zanjiri va yetkazib beruvchilar. Savdo tomoni va
   * pul hujjatlari yopiq: xaridni ham, to'lovni ham bir odam bajarishi
   * klassik firibgarlik yo'li.
   */
  supplier: {
    slug: 'supplier',
    seedName: "Ta'minotchi",
    description: 'Xarid zanjiri va yetkazib beruvchilar',
    uiMode: 'full',
    defaults: READ_ONLY_BASE,
    grants: merge(
      DENY_SENSITIVE,
      grant(MONEY_DOCS, ALL_NO),
      grant(SALES_DOCS, { view: 'ALL', create: 'NO', update: 'NO', print: 'ALL' }),
      grant(PURCHASE_DOCS, FULL_CRUD),
      grant(PARTNERS, { view: 'ALL', create: 'ALL', update: 'ALL', print: 'ALL' }),
      grant(['product', 'productfolder', 'variant'], { view: 'ALL', create: 'ALL', update: 'ALL' }),
      grant(['enter', 'pricelist'], { view: 'ALL' }),
      grant(['report'], { view: 'ALL', print: 'ALL' }),
    ),
  },

  /**
   * Haydovchi — ATAYLAB eng tor shablon.
   *
   * ⚠️ Chegara ochiq yozilgan: haydovchiga hujjat BIRIKTIRISH mexanizmi
   * hozir yo'q (u `F043 — Yetkazish: haydovchi + naqd` bilan keladi).
   * Shungacha ko'rinish `OWN_GROUP` orqali beriladi — ya'ni haydovchi
   * yetkazish guruhiga qo'yilgan bo'lsa o'sha guruh realizatsiyalarini
   * ko'radi. Guruhsiz haydovchi hech nima ko'rmaydi — bu fail-closed
   * xulq, xato emas.
   */
  driver: {
    slug: 'driver',
    seedName: 'Haydovchi',
    description: "Yetkazish — o'z guruhi realizatsiyalari va topshiriqlar",
    uiMode: 'full',
    defaults: ALL_NO,
    grants: merge(
      grant(['demand'], { view: 'OWN_GROUP', print: 'OWN_GROUP' }),
      grant(['customerorder'], { view: 'OWN_GROUP' }),
      grant(['counterparty'], { view: 'OWN_GROUP' }),
      grant(['task'], { view: 'OWN', update: 'OWN' }),
    ),
  },
};

export const ROLE_TEMPLATE_SLUGS = Object.keys(ROLE_TEMPLATES) as RoleTemplateSlug[];

/** Shablon ekanini runtime'da tekshirish (kontroller kirishida). */
export function isRoleTemplateSlug(v: unknown): v is RoleTemplateSlug {
  return typeof v === 'string' && Object.hasOwn(ROLE_TEMPLATES, v);
}

/**
 * Bitta katakcha uchun yakuniy scope: `grants` → `defaults` → `NO`.
 * DENY qatlami `grants` ichida (yuqoridagi `merge` tartibi bilan).
 */
export function scopeFor(
  tpl: RoleTemplate,
  entity: PermissionEntity,
  action: PermissionAction,
): PermissionScope {
  return tpl.grants?.[entity]?.[action] ?? tpl.defaults[action] ?? 'NO';
}

export interface TemplateCell {
  entity: PermissionEntity;
  action: PermissionAction;
  scope: PermissionScope;
}

/**
 * Shablonning TO'LIQ matritsasi — `PERMISSION_ENTITIES` × `PERMISSION_ACTIONS`,
 * `NO` katakchalar ham kiradi.
 *
 * Nega `NO` ham qaytariladi: shablonni qo'llash rol matritsasini TO'LIQ
 * almashtiradi. Faqat musbat katakchalar qaytarilsa, eski roldagi ortiqcha
 * ruxsat o'chmay qolardi va «shablonni qo'lladim» degan amal aslida
 * ruxsatni faqat KENGAYTIRARDI.
 */
export function resolveTemplateMatrix(slug: RoleTemplateSlug): TemplateCell[] {
  const tpl = ROLE_TEMPLATES[slug];
  const out: TemplateCell[] = [];
  for (const entity of PERMISSION_ENTITIES) {
    for (const action of PERMISSION_ACTIONS) {
      out.push({ entity, action, scope: scopeFor(tpl, entity, action) });
    }
  }
  return out;
}

/**
 * Snapshot uchun ixcham ko'rinish: faqat `NO` bo'lmagan katakchalar,
 * `entity: view/create/…` shaklida. 84 entity × 6 amal = 504 qator o'rniga
 * o'qiladigan diff beradi.
 */
export function summarizeTemplate(slug: RoleTemplateSlug): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { entity, action, scope } of resolveTemplateMatrix(slug)) {
    if (scope === 'NO') continue;
    out[entity] = out[entity] ? `${out[entity]} ${action}:${scope}` : `${action}:${scope}`;
  }
  return out;
}
