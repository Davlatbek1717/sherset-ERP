/**
 * Kiosk rejim siyosati (kassa TZ §3.1) — SOF modul (DB yo'q, Nest yo'q).
 *
 * 🔴 NEGA SERVER TOMONDA: TZ ochiq aytadi — «Faqat UI yashirish **yetarli
 * emas** (bevosita URL bilan kirish bloklanishi shart)». Chap menyuni
 * yashirish kassirni `/counterparties` yoki `/reports/profitability` ga
 * qo'lda kirishdan to'xtatmaydi; token esa haqiqiy va hamma endpoint ochiq
 * bo'lardi. Shuning uchun ro'yxat shu yerda, guard esa uni bajaradi.
 *
 * Ro'yxat **default-deny**: yangi endpoint qo'shilganda kiosk uni AVTOMAT
 * ko'rmaydi. Bu ataylab — xavfsizlik ro'yxati «unutish» bilan kengaymasin.
 */

export type UiMode = 'full' | 'kiosk';

export const UI_MODE = { full: 'full', kiosk: 'kiosk' } as const;

/**
 * Xodimning amaldagi rejimi. **`full` YUTADI** (TZ §3.1): bir xodimga bir
 * necha rol berilsa va bittasi to'liq bo'lsa, u cheklanmaydi — aks holda
 * kassirlik roli qo'shilgan menejer to'satdan ERP'dan chiqib qolardi.
 *
 * Roli umuman yo'q xodim ham `full`: kiosk **opt-in**, ya'ni migratsiyadan
 * keyin hech kim jimgina cheklanmaydi.
 */
export function resolveUiMode(roles: ReadonlyArray<{ uiMode?: string | null }>): UiMode {
  if (roles.length === 0) return UI_MODE.full;
  const allKiosk = roles.every((r) => r.uiMode === UI_MODE.kiosk);
  return allKiosk ? UI_MODE.kiosk : UI_MODE.full;
}

/** HTTP metodlari — `*` = hammasi. */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';

interface Rule {
  /**
   * Yo'l prefiksi (`/api/v1` global prefiksisiz).
   *
   * `:` bilan boshlangan segment — **bitta** yo'l segmentiga mos keladi
   * (`/customer-orders/:id/transitions/confirmed`). Bu ataylab regex emas:
   * ro'yxat o'qiladigan qolsin va «`.*` yozib qo'ydim» xatosi bo'lmasin.
   */
  prefix: string;
  methods: readonly Method[];
  why: string;
  /**
   * `true` → AYNAN shu chuqurlik. Ichki yo'llar OCHILMAYDI.
   *
   * Kerak, chunki oddiy prefiks-qoida butun daraxtni ochadi: `/customer-orders`
   * GET qoidasi `:id/related`, `:id/supply-shortfall` va kelajakdagi har
   * qanday yangi sub-resursni ham jimgina ochib yuborardi.
   */
  exact?: boolean;
}

/**
 * Kiosk roliga OCHIQ endpointlar (TZ §3.1 ro'yxati).
 *
 * Har qator uchun sabab yozilgan — ro'yxat kengayganda «nega bu bor?» degan
 * savolga javob kodda tursin, aks holda vaqt o'tib hamma narsa ochilib ketadi.
 */
export const KIOSK_ALLOWED: readonly Rule[] = [
  // ── Kassaning o'z ishi ────────────────────────────────────────────────────
  { prefix: '/retail-sales', methods: ['*'], why: 'kassa sotuvi — asosiy ish' },
  { prefix: '/cashier-sessions', methods: ['*'], why: "o'z smenasi: ochish/yopish/kirim/chiqim" },
  // 🔴 AYNAN ikki yo'l — butun `/admin` EMAS. `/sotuv` smenani shu yerdan
  // ochadi (controller `@Controller('admin/smenas')`). Ilgari bu yerda
  // mavjud bo'lmagan `/smena/mine` turardi: kiosk-kassir jadvalini ham
  // ko'rmasdi, smenani ham ocholmasdi — har ikkala so'rov 403 olardi.
  { prefix: '/admin/smenas/mine', methods: ['GET'], why: "o'z jadvali" },
  { prefix: '/admin/smenas/open-session', methods: ['POST'], why: 'smena ochish' },

  // ── O'qish uchun ochiq ma'lumotnomalar ────────────────────────────────────
  { prefix: '/products', methods: ['GET'], why: 'tovar qidiruv va narx' },
  { prefix: '/product-folders', methods: ['GET'], why: 'katalog daraxti' },
  { prefix: '/stock', methods: ['GET'], why: "qoldiq ko'rsatish" },
  { prefix: '/price-types', methods: ['GET'], why: 'chakana/optom narx turi' },
  { prefix: '/expense-items', methods: ['GET'], why: 'xarajat moddasi tanlash' },
  { prefix: '/currencies', methods: ['GET'], why: 'USD naqd uchun' },
  { prefix: '/exchange-rates', methods: ['GET'], why: 'USD kursi (muzlatiladi)' },
  { prefix: '/company-settings', methods: ['GET'], why: 'chek sozlamalari' },
  // 🔴 `/sklad-keepers` QATORI OLIB TASHLANDI (2026-08-16). U yig'ish
  // varag'ining ombor→printer marshruti uchun ochilgan edi; egasi esa printer
  // tanlashni butunlay bekor qildi («kompyuterning o'ziga ulangan printerdan
  // chiqsin»), ya'ni kassa bu endpointni endi CHAQIRMAYDI. Kerak bo'lmagan
  // ruxsat ro'yxatda qolsa — bu jim kengayish (default-deny ma'nosini yeydi).
  // 🔴 Marshrut ochiq edi-yu VARAQNING O'ZI yopiq qolgan edi (2026-08-16).
  // «Omborchiga yuborish» dan keyin kassa shu endpointdan chek mazmunini
  // o'qiydi (`printPickingViaAgent`), zaxira `/print/picking/:id?auto=1`
  // sahifasi ham AYNI so'rovni yuboradi — ikkalasi ham 403 olardi (prod
  // nginx logida 28 marta) va omborga chiqadigan chek umuman chiqmasdi.
  // `exact` — `/restock-tasks` ning qolgani (omborchi navbati, vazifa
  // detali, qator-tasdiqlash) kassirga OCHILMAYDI.
  {
    prefix: '/restock-tasks/picking-sheets/:source/:id',
    methods: ['GET'],
    exact: true,
    why: "omborga chiqadigan chek mazmuni (yig'ish varag'i)",
  },

  // ── Mijoz: o'qish + YARATISH + TOR tahrir (F9 mijoz kartasi) ─────────────
  // 🔴 To'rt AYNIQ qator — ilgari bu yerda bitta PREFIKS qoida turardi
  // (`/counterparties`, GET+POST, `exact`siz). U butun daraxtni ochardi:
  // `POST /counterparties/bulk-delete`, `bulk-update`, `bulk-import`,
  // `:id/archive`, `:id/clone`, `:id/bank-accounts`, `GET :id/metrics`
  // (foyda/marja paneli) — hammasi kioskka yetib borardi va ularni faqat
  // IKKINCHI qatlam (ruxsat matritsasi) to'xtatardi. Kiosk ro'yxati esa
  // aynan «URL bilan kirish bloklansin» uchun bor (TZ §3.1).
  {
    prefix: '/counterparties',
    methods: ['GET', 'POST'],
    exact: true,
    why: 'mijoz qidirish (telefon/ism) va kassada yangi mijoz ochish',
  },
  {
    prefix: '/counterparties/:id',
    methods: ['GET'],
    exact: true,
    why: 'mijoz kartasi — nom, telefon, izoh',
  },
  // Tahrir AYNAN shu tor yo'ldan: faqat `phone` va `description`. To'liq
  // `PATCH /counterparties/:id` (nom, narx turi, egasi, teglar) YOPIQ qoladi.
  {
    prefix: '/counterparties/:id/pos-contact',
    methods: ['PATCH'],
    exact: true,
    why: 'kassada telefon/izohni tuzatish — to`liq karta emas',
  },

  // ── Zakazlar (F7): KO'RISH + `draft → confirmed` TASDIQLASH ──────────────
  // 🔴 Uch AYNIQ qator — `methods: ['*']` EMAS. `/customer-orders` ostida
  // o'chirish, `merge`, `mass-edit`, `bulk-clear-reserve` bor; bitta yulduzcha
  // ularning hammasini kassirga ochib yuborardi.
  {
    prefix: '/customer-orders',
    methods: ['GET'],
    exact: true,
    why: "jarayondagi zakazlar ro'yxati (POS «Zakazlar» tabi)",
  },
  {
    prefix: '/customer-orders/:id',
    methods: ['GET'],
    exact: true,
    why: 'zakaz detali — pozitsiyalar, summa, mijoz',
  },
  {
    // FAQAT `confirmed` nishoni: rezerv aynan shu o'tishda avtomatik tushadi.
    // `cancelled` (rezervni bo'shatadi) va `paid` (F8 — to'lov) ATAYLAB yopiq.
    prefix: '/customer-orders/:id/transitions/confirmed',
    methods: ['POST'],
    exact: true,
    why: 'zakazni tasdiqlash — rezerv avtomatik tushadi',
  },

  // ── Qarz: o'qish + to'lov ─────────────────────────────────────────────────
  { prefix: '/debts', methods: ['GET', 'POST'], why: "qarz ko'rish va to'lov qabul qilish" },

  // ── Xarajat (RKO) ─────────────────────────────────────────────────────────
  { prefix: '/cash-out', methods: ['GET', 'POST'], why: 'kassadan xarajat (Q10 — tasdiqsiz)' },

  // ── Chop etish ────────────────────────────────────────────────────────────
  { prefix: '/print', methods: ['*'], why: 'chek, PKO, RKO, Z-hisobot' },
  { prefix: '/print-templates', methods: ['GET'], why: "shablon o'qish" },

  // ── Har foydalanuvchiga kerak bo'ladigan minimum ──────────────────────────
  { prefix: '/auth', methods: ['*'], why: 'login/refresh/logout/PIN — qulfsiz qolmasin' },
  { prefix: '/health', methods: ['GET'], why: "sog'lik tekshiruvi" },
  { prefix: '/permissions/me', methods: ['GET'], why: 'FE menyu qurishi uchun' },
  { prefix: '/notifications', methods: ['GET'], why: "bildirishnoma o'qish" },
] as const;

/** Yo'ldan global prefiks va so'rov qatorini olib tashlaydi. */
export function normalizePath(url: string, globalPrefix = '/api/v1'): string {
  const path = url.split('?')[0] ?? '';
  const withoutPrefix = path.startsWith(globalPrefix) ? path.slice(globalPrefix.length) : path;
  // Oxirgi `/` ahamiyatsiz; bo'sh bo'lsa ildiz.
  const trimmed = withoutPrefix.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** `/a/b` → `['a','b']` (bo'sh segmentlarsiz). */
function segments(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

/**
 * Yo'l qoidaga mos keladimi — **segment chegarasida**.
 *
 * `/products` qoidasi `/products/123` ga mos keladi, lekin `/products-secret`
 * ga MOS KELMAYDI (aks holda o'xshash nomli yangi modul jimgina ochilib
 * qolardi). `:param` segmenti istalgan BITTA segmentga mos keladi;
 * `exact` bo'lsa chuqurlik ham teng bo'lishi shart.
 */
function matchesPrefix(rule: Rule, path: string): boolean {
  const ruleSegs = segments(rule.prefix);
  const pathSegs = segments(path);
  if (rule.exact ? pathSegs.length !== ruleSegs.length : pathSegs.length < ruleSegs.length) {
    return false;
  }
  return ruleSegs.every((seg, i) =>
    seg.startsWith(':') ? pathSegs[i] !== undefined : seg === pathSegs[i],
  );
}

/**
 * Kiosk shu so'rovni bajara oladimi.
 */
export function isKioskAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return KIOSK_ALLOWED.some((rule) => {
    if (!matchesPrefix(rule, path)) return false;
    return rule.methods.includes('*') || rule.methods.includes(m as Method);
  });
}

/**
 * PIN shakli: AYNAN 4 raqam (TZ §3.2, 2026-08-12 da toraytirildi).
 *
 * Uzunlik chegarasi ataylab tor: PIN — qulay qaytish vositasi, parol emas.
 * Uni uzaytirish kassirni yozib qo'yishga majbur qiladi va qulfni zaiflashtiradi.
 *
 * 🔴 Ilgari `4,6` edi. Egasi jonli qurilmada 5- va 6-raqamni kiritib ko'rdi
 * («4 tadan oshmasligi kerak»). Diapazon o'zi UI'da ham yopishqoq muammo
 * tug'dirardi: kassirga necha raqam kutilayotgani ko'rinmasdi. Bu qiymat —
 * butun zanjirning YAGONA manbai; web tomoni `kiosk-shell.test.ts` bilan
 * shu yerga qulflangan.
 *
 * ⚠️ Migratsiya: 5–6 raqamli PIN'i bor xodim kira olmaydi — admin unga
 * xodim kartasidan 4 raqamli PIN qayta qo'yishi kerak. PIN xesh saqlanadi,
 * ya'ni eski uzunlikni oldindan aniqlab bo'lmaydi.
 */
export const POS_PIN_RE = /^\d{4}$/;

export function isValidPosPin(pin: string): boolean {
  return POS_PIN_RE.test(pin);
}

/**
 * Ketma-ket noto'g'ri PIN chegarasi (TZ §3.2): shundan keyin sessiya to'liq
 * chiqariladi va menejerga xabar ketadi.
 *
 * Sabab: «erkin kassir» modelida asosiy xavf — kassir hisobidan boshqa
 * odamning sotuvi. Cheksiz urinish qulfni bezakka aylantirardi.
 */
export const POS_PIN_MAX_ATTEMPTS = 5;

// 🔴 `POS_LOCK_IDLE_MINUTES` OLIB TASHLANDI (egasi, 2026-08-16): «bir marta
// kirgandan keyin yana pinkod so'raydi, ekran qulf bo'lib qoladi — o'shani
// to'liq olib tashla, ekran qulf kerak emas umuman». Harakatsizlik qulfi
// (`PosPinLock`) o'chirildi; bu konstanta faqat o'sha ekranning chegarasi edi
// va hech bir server mantig'i uni o'qimasdi (sessiyani yopadigan cron yo'q).
