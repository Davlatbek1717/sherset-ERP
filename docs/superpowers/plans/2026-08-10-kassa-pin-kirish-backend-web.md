# Kassa PIN-kirish (backend + web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kassir 4–6 raqamli PIN bilan (email/parolsiz) tizimga kirib `/sotuv` ga tushadi; kirish faqat oldindan juftlangan kassa qurilmasidan qabul qilinadi.

**Architecture:** `Employee.posPinLookup` (HMAC-SHA256, unique) PIN bo'yicha xodimni O(1) topadi, mavjud `posPinHash` (argon2) uni tasdiqlaydi. Yangi `PosDevice` modeli qurilmani do'kon/kassaga bog'laydi va uning maxfiy kaliti `POST /auth/pos-login` uchun majburiy ikkinchi omil. Web tomonda `/kassa-kirish` raqamli klaviatura sahifasi.

**Tech Stack:** NestJS + Fastify + Prisma (PostgreSQL) · argon2 · node:crypto HMAC · Zod · Next.js App Router · next-intl · Vitest.

**Manba spec:** `docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md` (K1–K4). K5–K8 (Electron o'ram) — alohida reja, bu reja tugagach yoziladi.

## Global Constraints

- **Model:** Opus (CLAUDE.md §0) — subagentlarga `model` uzatilmaydi.
- **Til:** kod izohlari o'zbekcha, «nega» tushuntiriladi (loyiha uslubi). UI matni **hech qachon hardcode emas** — `apps/web/src/messages/{ru,uz}.json`.
- **Xesh:** parollar/PIN uchun `argon2` (loyihada mavjud). Yangi xesh kutubxonasi olib kirilmaydi.
- **PIN shakli:** mavjud `POS_PIN_RE = /^\d{4,6}$/` (`kiosk-policy.ts:114`) — o'zgarmaydi, qayta ishlatiladi.
- **Ruxsat:** admin PIN endpointi `@RequireHrPermission('employees', 'full')` — `hr-employee.controller.ts:306-315` (`set-password`) bilan **aynan bir xil**. Spec'dagi `employees:update` — noto'g'ri nom edi, kodda bunday slug yo'q.
- **Git:** faqat aniq yo'llar bilan `git add`; commit'dan keyin `git show --stat HEAD` bilan tarkib tekshiriladi (CLAUDE.md §6.7).
- **Commit sarlavhasi:** kichik harf bilan (`commitlint` bosh harfli prefiksni rad etadi).
- **Gate har commit'da:** `pnpm --filter @moysklad/api typecheck` · `pnpm --filter @moysklad/web typecheck` · `pnpm biome check` · tegishli vitest. **API testlari ham** yugurtiriladi (web-only gate `apps/api` qo'riqchilarini o'tkazib yuboradi).
- **Halol yorliq:** bu reja tugaganda natija «Phase-1: strukturaviy, runtime-tasdiqlanmagan». «done/verified» deyilmaydi.
- **Lokal DB:** `climart_adopt` @ `localhost:5432` (`packages/db/.env`). Ishlab turibdi — preflight'ning «db down» ogohlantirishi yolg'on.

## File Structure

**Yaratiladi:**

| Fayl | Mas'uliyat |
|---|---|
| `apps/api/src/modules/auth/pos-pin-lookup.ts` | Sof funksiya: `posPinLookupHash(pin, pepper)` — HMAC-SHA256 hex. DB yo'q, Nest yo'q. |
| `apps/api/src/modules/auth/pos-pin-lookup.test.ts` | Sof unit testlar. |
| `apps/api/src/modules/auth/employee-login-guards.ts` | Sof funksiya: `assertEmployeeMayLogin()` — `login()` va `pos-login` uchun **umumiy** qo'riqchilar. |
| `apps/api/src/modules/auth/employee-login-guards.test.ts` | |
| `apps/api/src/modules/auth/pos-device.service.ts` | Qurilma juftlash / topish / qulflash. |
| `apps/api/src/modules/auth/pos-device.service.test.ts` | |
| `apps/api/src/modules/auth/pos-login.service.ts` | PIN → xodim → token. |
| `apps/api/src/modules/auth/pos-login.service.test.ts` | |
| `apps/api/src/modules/auth/pos-pin.service.test.ts` | Mavjud servis uchun test (hozir yo'q). |
| `packages/db/prisma/migrations/<ts>_pos_device_and_pin_lookup/migration.sql` | |
| `apps/web/src/components/pos/pin-keypad.tsx` | Raqamli klaviatura (sof prezentatsion). |
| `apps/web/src/components/pos/__tests__/pin-keypad.test.tsx` | |
| `apps/web/src/lib/pos-device.ts` | Qurilma ma'lumotini o'qish/yozish (Electron ko'prigi yoki localStorage). |
| `apps/web/src/app/kassa-kirish/page.tsx` | PIN ekrani. |
| `apps/web/src/app/kassa-kirish/juftlash/page.tsx` | Qurilmani juftlash ekrani (admin). |
| `apps/web/src/__tests__/kassa-kirish-wiring.test.ts` | Sahifa simlari qo'riqchisi. |

**O'zgartiriladi:**

| Fayl | O'zgarish |
|---|---|
| `packages/db/prisma/schema.prisma` | `Employee.posPinLookup` + `model PosDevice` |
| `apps/api/src/modules/auth/auth.schema.ts` | `PosLoginSchema`, `PairPosDeviceSchema` |
| `apps/api/src/modules/auth/auth.service.ts` | qo'riqchilarni `employee-login-guards.ts` ga ko'chirish |
| `apps/api/src/modules/auth/pos-pin.service.ts` | `setPin` endi `posPinLookup` ni ham yozadi; `clearPin` qo'shiladi |
| `apps/api/src/modules/auth/auth.controller.ts` | `POST /auth/pos-login`, `POST /auth/pos-device/pair` |
| `apps/api/src/modules/auth/auth.module.ts` | yangi servislar provider sifatida |
| `apps/api/src/modules/auth/kiosk-policy.ts` | — (o'zgarmaydi: `/auth` allaqachon `*`) |
| `apps/api/src/modules/hr/hr-employee/hr-employee.controller.ts` | `POST/DELETE :id/pos-pin` |
| `apps/api/src/modules/hr/hr-employee/hr-employee.service.ts` | `setPosPin` / `clearPosPin` |
| `apps/web/src/lib/auth-store.ts` | `posLogin(deviceId, deviceSecret, pin)` |
| `apps/web/src/messages/{ru,uz}.json` | `kassaLogin.*` kalitlari |

---

### Task 1: `posPinLookupHash` — sof HMAC funksiyasi

**Files:**
- Create: `apps/api/src/modules/auth/pos-pin-lookup.ts`
- Test: `apps/api/src/modules/auth/pos-pin-lookup.test.ts`

**Interfaces:**
- Consumes: hech narsa (sof modul).
- Produces: `posPinLookupHash(pin: string, pepper: string): string` (64 belgili hex) · `resolvePosPinPepper(value: string | undefined, nodeEnv: string | undefined): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/auth/pos-pin-lookup.test.ts
import { describe, expect, it } from 'vitest';
import { posPinLookupHash, resolvePosPinPepper } from './pos-pin-lookup.js';

describe('posPinLookupHash', () => {
  it('deterministik — bir xil PIN + pepper = bir xil hex', () => {
    expect(posPinLookupHash('1234', 'pepper-a')).toBe(posPinLookupHash('1234', 'pepper-a'));
  });

  it('64 belgili hex qaytaradi (SHA-256)', () => {
    expect(posPinLookupHash('1234', 'pepper-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pepper o‘zgarsa natija o‘zgaradi — bu «pepper yo‘qolsa PIN qayta beriladi» shartnomasi', () => {
    expect(posPinLookupHash('1234', 'pepper-a')).not.toBe(posPinLookupHash('1234', 'pepper-b'));
  });

  it('turli PIN — turli natija', () => {
    expect(posPinLookupHash('1234', 'p')).not.toBe(posPinLookupHash('1235', 'p'));
  });

  it('PIN saqlanmaydi: natijadan PIN tiklanmaydi (bir tomonlama)', () => {
    // Ramziy tekshiruv: chiqishda PIN matni yo‘q.
    expect(posPinLookupHash('1234', 'p')).not.toContain('1234');
  });
});

describe('resolvePosPinPepper', () => {
  it('prod’da pepper yo‘q bo‘lsa BOOT’da yiqiladi — jim ishlamaydi', () => {
    expect(() => resolvePosPinPepper(undefined, 'production')).toThrow(/POS_PIN_PEPPER/);
  });

  it('prod’da dev-fallback qiymati ham rad etiladi', () => {
    expect(() => resolvePosPinPepper('dev-pos-pin-pepper-change-in-prod', 'production')).toThrow(
      /POS_PIN_PEPPER/,
    );
  });

  it('dev’da fallback beriladi', () => {
    expect(resolvePosPinPepper(undefined, 'development')).toBe(
      'dev-pos-pin-pepper-change-in-prod',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-pin-lookup.test.ts`
Expected: FAIL — `Failed to resolve import "./pos-pin-lookup.js"`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/auth/pos-pin-lookup.ts
import { createHmac } from 'node:crypto';
import { resolveSecret } from './boot-secrets.js';

/**
 * PIN-only kirishda xodimni PIN bo'yicha TOPISH kerak. `posPinHash` — argon2,
 * har xesh o'z tuzi bilan, ya'ni «PIN bo'yicha qidirish» imkonsiz. Butun
 * xodimlar bo'ylab argon2 sikli yuritish ham yaramaydi (20 xodim ≈ 1 soniya,
 * kassa tezligiga tegadi va vaqt-kanali ochadi).
 *
 * Yechim — ikkinchi, TUZSIZ lekin PEPPERLANGAN qiymat: HMAC-SHA256(pin, pepper).
 * U indekslanadi ⇒ O(1) topish. Tuzsizligi xavf emas, chunki pepper serverda
 * (bazada EMAS): baza o'g'irlansa ham 10 000 ta PIN'ni oldindan hisoblab
 * bo'lmaydi.
 *
 * 🔴 SHARTNOMA: pepper o'zgarsa/yo'qolsa hamma `posPinLookup` yaroqsiz bo'ladi.
 * PIN saqlanmagani uchun qayta hisoblab BO'LMAYDI — PIN'lar qayta beriladi.
 * Shuning uchun prod'da pepper majburiy (pastdagi resolver) va deploy
 * hujjatida qayd etilgan.
 */
export function posPinLookupHash(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin).digest('hex');
}

/** Dev-fallback — `boot-secrets.ts` naqshi: prod'da jim ishlamaydi, yiqiladi. */
export const POS_PIN_PEPPER_DEV_FALLBACK = 'dev-pos-pin-pepper-change-in-prod';

export function resolvePosPinPepper(
  value: string | undefined,
  nodeEnv: string | undefined,
): string {
  return resolveSecret({
    name: 'POS_PIN_PEPPER',
    value,
    devFallback: POS_PIN_PEPPER_DEV_FALLBACK,
    nodeEnv,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-pin-lookup.test.ts`
Expected: PASS (8 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/pos-pin-lookup.ts apps/api/src/modules/auth/pos-pin-lookup.test.ts
git commit -m "feat(kassa): pos-pin lookup hmac + pepper boot-guard"
git show --stat HEAD
```

---

### Task 2: Migratsiya — `Employee.posPinLookup` + `PosDevice`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`model Employee` ~349-354 va yangi model)
- Create: `packages/db/prisma/migrations/<timestamp>_pos_device_and_pin_lookup/migration.sql`

**Interfaces:**
- Produces: Prisma klientida `prisma.employee.posPinLookup` (`string | null`) va `prisma.posDevice` (CRUD). Keyingi tasklar shularga tayanadi.

- [ ] **Step 1: `schema.prisma` — `Employee` ga ustun qo'shish**

`posPinHash` (hozirgi ~354-qator) ostiga:

```prisma
  /// POS PIN bo'yicha xodimni TOPISH uchun HMAC-SHA256(pin, POS_PIN_PEPPER) hex.
  /// `posPinHash` (argon2) tasdiqlaydi, bu esa topadi — sabab
  /// `apps/api/src/modules/auth/pos-pin-lookup.ts` izohida.
  /// NULL = PIN o'rnatilmagan. Postgres'da NULL'lar unique cheklovga tushmaydi,
  /// shuning uchun PIN'siz xodimlar bir-biriga xalaqit bermaydi.
  posPinLookup               String?   @map("pos_pin_lookup") @db.VarChar(64)
```

Va `@@index([accountId, groupId])` yonidagi cheklovlar blokiga:

```prisma
  /// PIN-only kirishda PIN AYNIQLIK bermasligi shart: ikki kassirda bir xil PIN
  /// bo'lsa kim kirgani noaniq bo'lardi va sotuv noto'g'ri odamga yozilardi.
  /// Shuning uchun cheklov BAZA darajasida — servis tekshiruvi yetarli emas
  /// (ikki parallel so'rov ikkalasi ham «bo'sh» ko'radi).
  @@unique([accountId, posPinLookup], name: "Employee_account_pos_pin_uk")
```

- [ ] **Step 2: `schema.prisma` — `PosDevice` modeli**

`model Employee` blokidan keyin qo'shiladi:

```prisma
/// Kassa qurilmasi (kassa .exe o'rnatilgan kompyuter).
///
/// NEGA KERAK: PIN-only kirishda foydalanuvchi nomi kiritilmaydi — 4 raqam =
/// 10 000 variant. Qurilma kaliti bo'lmasa har kim ochiq internetdan PIN tera
/// olardi. `POST /auth/pos-login` shu yozuvsiz ISHLAMAYDI.
///
/// Do'kon/kassa/tashkilot shu yerda muhrlanadi, chunki `CashierSession`
/// uchalasini talab qiladi — kassir har smenada qayta tanlamasin.
model PosDevice {
  id        String @id @default(uuid()) @db.Uuid
  accountId String @map("account_id") @db.Uuid

  /// Operator ko'radigan nom: «1-kassa, markaziy do'kon».
  name String @db.VarChar(200)

  storeId        String @map("store_id") @db.Uuid
  cashDeskId     String @map("cash_desk_id") @db.Uuid
  organizationId String @map("organization_id") @db.Uuid

  /// argon2(qurilma maxfiy kaliti). Kalitning o'zi FAQAT juftlash javobida
  /// bir marta qaytadi va boshqa hech qachon o'qib bo'lmaydi.
  secretHash String @map("secret_hash") @db.VarChar(255)

  pairedById String    @map("paired_by_id") @db.Uuid
  pairedAt   DateTime  @default(now()) @map("paired_at") @db.Timestamptz()
  lastSeenAt DateTime? @map("last_seen_at") @db.Timestamptz()

  /// Qurilma yo'qolsa/o'g'irlansa admin bekor qiladi — o'chirilmaydi (audit).
  revokedAt DateTime? @map("revoked_at") @db.Timestamptz()

  /// PIN brute-force qulfi. Xodim hisoblagichi (`pos-pin.service.ts`) ataylab
  /// XOTIRADA; bu esa BAZADA, chunki qurilma qulfi API qayta ishga tushganda
  /// yo'qolmasligi kerak — aks holda qulfni restart bilan aylanib o'tish mumkin.
  failedAttempts Int       @default(0) @map("failed_attempts")
  lockedUntil    DateTime? @map("locked_until") @db.Timestamptz()

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@index([accountId, revokedAt])
  @@map("pos_devices")
}
```

- [ ] **Step 3: Migratsiyani FAQAT yaratish (qo'llamasdan)**

Run: `pnpm --filter @moysklad/db exec prisma migrate dev --name pos_device_and_pin_lookup --create-only`

- [ ] **Step 4: Yaratilgan SQL'ni QO'LDA tekshirish 🔴**

`schema.prisma:253-262` da hujjatlangan drift bor: `username` uchun bazada **qisman** unique indeks, Prisma esa har safar oddiy `CREATE UNIQUE INDEX "employees_account_id_username_key"` chiqaradi. Yaratilgan `migration.sql` da shu qator **BO'LSA — o'chiriladi**. Faylda faqat quyidagilar qolishi kerak:

```sql
ALTER TABLE "employees" ADD COLUMN "pos_pin_lookup" VARCHAR(64);
CREATE UNIQUE INDEX "Employee_account_pos_pin_uk" ON "employees"("account_id", "pos_pin_lookup");
CREATE TABLE "pos_devices" ( ... );
CREATE INDEX "pos_devices_account_id_revoked_at_idx" ON "pos_devices"("account_id", "revoked_at");
```

- [ ] **Step 5: Qo'llash va klientni qayta generatsiya qilish**

Run: `pnpm --filter @moysklad/db exec prisma migrate dev` va `pnpm --filter @moysklad/db exec prisma generate`
Expected: migratsiya `climart_adopt` da o'tadi, xatosiz.

- [ ] **Step 6: Unique cheklov haqiqatan ishlashini o'lchash**

Run:

```bash
pnpm --filter @moysklad/db exec prisma db execute --stdin <<'SQL'
SELECT indexdef FROM pg_indexes WHERE indexname = 'Employee_account_pos_pin_uk';
SQL
```

Expected: bitta qator qaytadi (indeks mavjud). Qaytmasa — migratsiya qo'llanmagan, oldinga o'tilmaydi.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(kassa): pos_devices jadvali + employee.pos_pin_lookup unique"
git show --stat HEAD
```

---

### Task 3: `assertEmployeeMayLogin` — umumiy kirish qo'riqchilari

**Files:**
- Create: `apps/api/src/modules/auth/employee-login-guards.ts`
- Create: `apps/api/src/modules/auth/employee-login-guards.test.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts:62-77` (qo'riqchilar shu funksiyaga almashtiriladi)

**Interfaces:**
- Consumes: `readEmployeeSystemAttrs` (`../hr/hr-employee/hr-employee.service.js`), `isIpAllowed` (`../shared/ip-match.js`).
- Produces: `assertEmployeeMayLogin(employee, meta): void` — 401 tashlaydi yoki jim qaytadi.

```ts
export interface LoginGuardEmployee {
  lockedUntil: Date | null;
  attributes: unknown;
}
export interface LoginGuardMeta {
  ipAddress?: string;
  /** Xato xabari — chaqiruvchi kontekstiga qarab («Email yoki parol...» / «PIN...»). */
  genericMessage: string;
}
export function assertEmployeeMayLogin(e: LoginGuardEmployee, meta: LoginGuardMeta): void;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/auth/employee-login-guards.test.ts
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertEmployeeMayLogin } from './employee-login-guards.js';

const META = { ipAddress: '10.0.0.5', genericMessage: 'PIN noto`g`ri' };
const OPEN = { lockedUntil: null, attributes: null };

describe('assertEmployeeMayLogin', () => {
  it('toza xodimni o‘tkazadi', () => {
    expect(() => assertEmployeeMayLogin(OPEN, META)).not.toThrow();
  });

  it('lockedUntil kelajakda — bloklangan, qolgan daqiqa xabarda', () => {
    const until = new Date(Date.now() + 5 * 60_000);
    expect(() => assertEmployeeMayLogin({ ...OPEN, lockedUntil: until }, META)).toThrow(
      /bloklangan/,
    );
  });

  it('lockedUntil o‘tmishda — o‘tkazadi', () => {
    const until = new Date(Date.now() - 60_000);
    expect(() => assertEmployeeMayLogin({ ...OPEN, lockedUntil: until }, META)).not.toThrow();
  });

  it('loginAllowed=false — RAD ETADI va sababni oshkor qilmaydi', () => {
    const attributes = { __employee_system: { loginAllowed: false } };
    try {
      assertEmployeeMayLogin({ ...OPEN, attributes }, META);
      throw new Error('kutilmagan: o‘tkazdi');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      // Hisob holati sizib chiqmasin — chaqiruvchining umumiy xabari.
      expect((err as UnauthorizedException).message).toBe('PIN noto`g`ri');
    }
  });

  it('IP allowlist’dan tashqarida — RAD ETADI', () => {
    const attributes = { __employee_system: { allowedIps: ['10.0.0.1'] } };
    expect(() => assertEmployeeMayLogin({ ...OPEN, attributes }, META)).toThrow(/IP/);
  });

  it('IP allowlist ichida — o‘tkazadi', () => {
    const attributes = { __employee_system: { allowedIps: ['10.0.0.5'] } };
    expect(() => assertEmployeeMayLogin({ ...OPEN, attributes }, META)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/employee-login-guards.test.ts`
Expected: FAIL — modul topilmadi

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/modules/auth/employee-login-guards.ts
import { UnauthorizedException } from '@nestjs/common';
import { readEmployeeSystemAttrs } from '../hr/hr-employee/hr-employee.service.js';
import { isIpAllowed } from '../shared/ip-match.js';

/**
 * Parol-login va PIN-login uchun UMUMIY xodim-kartasi qo'riqchilari.
 *
 * NEGA AJRATILDI: bular ilgari faqat `auth.service.login()` ichida edi. PIN
 * kirishi ikkinchi kirish yo'li — qo'riqchilar nusxa-ko'chirilsa, biri
 * yangilanganda ikkinchisi jimgina eskirardi (xotira: «nusxa-ko'chirish bitta
 * shoxni yo'qotadi» — api-client `download()` da 401-retry shunday yo'qolgan).
 */
export interface LoginGuardEmployee {
  lockedUntil: Date | null;
  attributes: unknown;
}

export interface LoginGuardMeta {
  ipAddress?: string;
  /** Hisob holatini oshkor qilmaydigan umumiy xabar (chaqiruvchi beradi). */
  genericMessage: string;
}

export function assertEmployeeMayLogin(e: LoginGuardEmployee, meta: LoginGuardMeta): void {
  if (e.lockedUntil && e.lockedUntil > new Date()) {
    const remaining = Math.ceil((e.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new UnauthorizedException(`Hisob vaqtincha bloklangan (${remaining} daqiqa qoldi)`);
  }

  // moysklad xodim kartasi: «Разрешить вход в систему» olib tashlansa kirish
  // yo'q; «Сеть» ro'yxati bo'lsa faqat o'sha IP/tarmoqdan.
  const sysAttrs = readEmployeeSystemAttrs(e.attributes);
  if (sysAttrs.loginAllowed === false) {
    // Ataylab umumiy xabar — hisob holati sizib chiqmasin.
    throw new UnauthorizedException(meta.genericMessage);
  }
  if (!isIpAllowed(meta.ipAddress, sysAttrs.allowedIps, sysAttrs.allowedNetworks)) {
    throw new UnauthorizedException('Bu IP-manzildan kirish taqiqlangan');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/employee-login-guards.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: `auth.service.login()` ni shu funksiyaga o'tkazish**

`apps/api/src/modules/auth/auth.service.ts` da 62–77 qatorlardagi blokni almashtir:

```ts
    assertEmployeeMayLogin(employee, {
      ipAddress: meta.ipAddress,
      genericMessage: "Email yoki parol noto'g'ri",
    });
```

Import qo'sh: `import { assertEmployeeMayLogin } from './employee-login-guards.js';`
Endi `readEmployeeSystemAttrs`/`isIpAllowed` `login()` da ishlatilmaydi, lekin `refresh()` da **hamon ishlatiladi** (176–182) — importlarni O'CHIRMA.

- [ ] **Step 6: Regressiya yo'qligini tekshirish**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth`
Expected: barcha mavjud auth testlari yashil.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/employee-login-guards.ts apps/api/src/modules/auth/employee-login-guards.test.ts apps/api/src/modules/auth/auth.service.ts
git commit -m "refactor(auth): kirish qo'riqchilari umumiy funksiyaga ajratildi"
git show --stat HEAD
```

---

### Task 4: `PosPinService` — lookup yozadi, takror PIN'ni rad etadi

**Files:**
- Modify: `apps/api/src/modules/auth/pos-pin.service.ts`
- Create: `apps/api/src/modules/auth/pos-pin.service.test.ts`

**Interfaces:**
- Consumes: `posPinLookupHash`, `resolvePosPinPepper` (Task 1).
- Produces: `PosPinService.setPin(accountId, employeeId, pin)` (endi lookup ham yozadi) · `PosPinService.clearPin(accountId, employeeId)` · `PosPinService.findByPin(accountId | null, pin)` → `{ employeeId } | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/auth/pos-pin.service.test.ts
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosPinService } from './pos-pin.service.js';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    employee: {
      findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', posPinHash: null }),
      update: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return args.data;
      }),
      ...overrides,
    },
  };
  return { prisma: { client } as never, updates, client };
}

const CONFIG = { get: () => 'test-pepper' } as never;

describe('PosPinService.setPin', () => {
  it('posPinHash VA posPinLookup ni birga yozadi', async () => {
    const { prisma, updates } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await svc.setPin('acc-1', 'emp-1', '1234');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty('posPinHash');
    expect(updates[0]).toHaveProperty('posPinLookup');
    // Lookup — 64 belgili hex, PIN matni emas.
    expect(updates[0]?.posPinLookup).toMatch(/^[0-9a-f]{64}$/);
  });

  it('noto‘g‘ri shakldagi PIN rad etiladi (3 raqam)', async () => {
    const { prisma } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.setPin('acc-1', 'emp-1', '123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takror PIN (unique 23505) → tushunarli 400 xabari', async () => {
    const { prisma } = makePrisma({
      update: vi.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
    });
    const svc = new PosPinService(prisma, CONFIG);
    await expect(svc.setPin('acc-1', 'emp-1', '1234')).rejects.toThrow(/band/);
  });
});

describe('PosPinService.clearPin', () => {
  it('ikkala ustunni NULL qiladi', async () => {
    const { prisma, updates } = makePrisma();
    const svc = new PosPinService(prisma, CONFIG);
    await svc.clearPin('acc-1', 'emp-1');
    expect(updates[0]).toEqual({ posPinHash: null, posPinLookup: null });
  });
});

describe('PosPinService.findByPin', () => {
  it('lookup bo‘yicha xodimni topadi', async () => {
    const { prisma, client } = makePrisma();
    client.employee.findFirst = vi.fn().mockResolvedValue({ id: 'emp-7' });
    const svc = new PosPinService(prisma, CONFIG);
    const found = await svc.findByPin('1234');
    expect(found).toEqual({ employeeId: 'emp-7' });
    // Qidiruv AYNAN lookup ustuni bo'yicha ketishi shart (skanerlash emas).
    const where = client.employee.findFirst.mock.calls[0]?.[0]?.where;
    expect(where).toHaveProperty('posPinLookup');
  });

  it('topilmasa null', async () => {
    const { prisma, client } = makePrisma();
    client.employee.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new PosPinService(prisma, CONFIG);
    expect(await svc.findByPin('9999')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-pin.service.test.ts`
Expected: FAIL — konstruktor ikkinchi argument kutmaydi; `clearPin`/`findByPin` yo'q.

- [ ] **Step 3: Implement**

`pos-pin.service.ts` da konstruktorga `ConfigService` qo'shiladi va pepper bir marta hisoblanadi:

```ts
import { ConfigService } from '@nestjs/config';
import { posPinLookupHash, resolvePosPinPepper } from './pos-pin-lookup.js';

  private readonly pepper: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    // Boot'da hal qilinadi: prod'da pepper yo'q bo'lsa API ko'tarilmaydi
    // (jim ishlab, keyin hamma PIN'ni yaroqsiz qilishdan ko'ra shu yaxshi).
    this.pepper = resolvePosPinPepper(
      config.get<string>('POS_PIN_PEPPER'),
      process.env.NODE_ENV,
    );
  }
```

`setPin` ichida `data` ni almashtir:

```ts
    try {
      await this.prisma.client.employee.update({
        where: { id: employeeId },
        data: {
          posPinHash: await argon2.hash(pin),
          // Ikkala ustun BIRGA yoziladi — biri yozilib ikkinchisi qolsa
          // kirish jim ishlamay qolardi (lookup topmaydi yoki xesh mos kelmaydi).
          posPinLookup: posPinLookupHash(pin, this.pepper),
        },
      });
    } catch (err) {
      // Unique cheklov: bu PIN allaqachon boshqa xodimda.
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Bu PIN band — boshqa PIN tanlang');
      }
      throw err;
    }
```

Yangi metodlar:

```ts
  /** PIN'ni olib tashlash — qulf ham, kirish ham o'chadi. */
  async clearPin(accountId: string, employeeId: string): Promise<{ ok: true }> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Xodim topilmadi');
    await this.prisma.client.employee.update({
      where: { id: employeeId },
      data: { posPinHash: null, posPinLookup: null },
    });
    this.attempts.delete(employeeId);
    return { ok: true };
  }

  /**
   * PIN bo'yicha xodimni topish (PIN-only kirish uchun).
   *
   * `accountId` bo'yicha filtrlanmaydi: kassir kirishdan OLDIN qaysi akkaunt
   * ekani ma'lum emas — uni qurilma beradi, lekin qurilma tekshiruvi
   * `PosLoginService` da bo'ladi va u topilgan xodimning `accountId` sini
   * qurilmaniki bilan solishtiradi.
   */
  async findByPin(pin: string): Promise<{ employeeId: string } | null> {
    const row = await this.prisma.client.employee.findFirst({
      where: { posPinLookup: posPinLookupHash(pin, this.pepper), archived: false },
      select: { id: true },
    });
    return row ? { employeeId: row.id } : null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-pin.service.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/pos-pin.service.ts apps/api/src/modules/auth/pos-pin.service.test.ts
git commit -m "feat(kassa): pos-pin lookup yoziladi, takror pin rad etiladi"
git show --stat HEAD
```

---

### Task 5: `PosDeviceService` — juftlash, tekshirish, qulflash

**Files:**
- Create: `apps/api/src/modules/auth/pos-device.service.ts`
- Create: `apps/api/src/modules/auth/pos-device.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces:
  - `PosDeviceService.pair(accountId, pairedById, input): Promise<{ deviceId: string; deviceSecret: string; name: string }>` — `input: { name: string; storeId: string; cashDeskId: string; organizationId: string }`
  - `PosDeviceService.verify(deviceId, deviceSecret): Promise<PosDeviceContext>` — `{ id, accountId, storeId, cashDeskId, organizationId, name }`; xatoda 401/423 tashlaydi
  - `PosDeviceService.registerFailure(deviceId): Promise<void>`
  - `PosDeviceService.registerSuccess(deviceId): Promise<void>`
  - `export const POS_DEVICE_MAX_ATTEMPTS = 5` · `export const POS_DEVICE_LOCKOUT_MS = 15 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/auth/pos-device.service.test.ts
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { POS_DEVICE_MAX_ATTEMPTS, PosDeviceService } from './pos-device.service.js';

interface Row {
  id: string;
  accountId: string;
  storeId: string;
  cashDeskId: string;
  organizationId: string;
  name: string;
  secretHash: string;
  revokedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

function makePrisma(row: Row | null) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const creates: Array<Record<string, unknown>> = [];
  const client = {
    posDevice: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(async (args: never) => {
        updates.push(args as never);
        return row;
      }),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        creates.push(args.data);
        return { ...args.data, id: 'dev-new' };
      }),
    },
  };
  return { prisma: { client } as never, updates, creates, client };
}

async function makeRow(secret: string, over: Partial<Row> = {}): Promise<Row> {
  return {
    id: 'dev-1',
    accountId: 'acc-1',
    storeId: 'store-1',
    cashDeskId: 'desk-1',
    organizationId: 'org-1',
    name: '1-kassa',
    secretHash: await argon2.hash(secret),
    revokedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    ...over,
  };
}

describe('PosDeviceService.pair', () => {
  it('kalitni QAYTARADI, lekin bazaga faqat xeshini yozadi', async () => {
    const { prisma, creates } = makePrisma(null);
    const svc = new PosDeviceService(prisma);
    const out = await svc.pair('acc-1', 'emp-1', {
      name: '1-kassa',
      storeId: 'store-1',
      cashDeskId: 'desk-1',
      organizationId: 'org-1',
    });
    expect(out.deviceSecret).toMatch(/^[0-9a-f]{64}$/);
    const written = creates[0] as Record<string, string>;
    expect(written.secretHash).toBeTruthy();
    // Ochiq kalit HECH QAYERDA saqlanmaydi.
    expect(JSON.stringify(creates)).not.toContain(out.deviceSecret);
    // Xesh haqiqatan shu kalitniki.
    expect(await argon2.verify(written.secretHash, out.deviceSecret)).toBe(true);
  });
});

describe('PosDeviceService.verify', () => {
  it('to‘g‘ri kalit → kontekst qaytadi', async () => {
    const row = await makeRow('s3cret');
    const svc = new PosDeviceService(makePrisma(row).prisma);
    const ctx = await svc.verify('dev-1', 's3cret');
    expect(ctx).toMatchObject({ accountId: 'acc-1', cashDeskId: 'desk-1' });
  });

  it('noto‘g‘ri kalit → 401', async () => {
    const row = await makeRow('s3cret');
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 'boshqa')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('qurilma yo‘q → 401 (mavjudligini oshkor qilmaydi)', async () => {
    const svc = new PosDeviceService(makePrisma(null).prisma);
    await expect(svc.verify('yo-q', 's3cret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bekor qilingan qurilma → 401', async () => {
    const row = await makeRow('s3cret', { revokedAt: new Date() });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('qulflangan qurilma → 423, qolgan daqiqa xabarda', async () => {
    const row = await makeRow('s3cret', { lockedUntil: new Date(Date.now() + 10 * 60_000) });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).rejects.toThrow(/daqiqa/);
  });

  it('qulf muddati o‘tgan → o‘tkazadi', async () => {
    const row = await makeRow('s3cret', { lockedUntil: new Date(Date.now() - 60_000) });
    const svc = new PosDeviceService(makePrisma(row).prisma);
    await expect(svc.verify('dev-1', 's3cret')).resolves.toBeTruthy();
  });
});

describe('PosDeviceService.registerFailure', () => {
  it('chegaraga yetganda qulflaydi', async () => {
    const row = await makeRow('s3cret', { failedAttempts: POS_DEVICE_MAX_ATTEMPTS - 1 });
    const { prisma, updates } = makePrisma(row);
    await new PosDeviceService(prisma).registerFailure('dev-1');
    expect(updates[0]?.data.lockedUntil).toBeInstanceOf(Date);
  });

  it('chegaradan past — faqat hisoblagich oshadi, qulf yo‘q', async () => {
    const row = await makeRow('s3cret', { failedAttempts: 0 });
    const { prisma, updates } = makePrisma(row);
    await new PosDeviceService(prisma).registerFailure('dev-1');
    expect(updates[0]?.data.failedAttempts).toBe(1);
    expect(updates[0]?.data.lockedUntil).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-device.service.test.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/auth/pos-device.service.ts
import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Kassa qurilmasi — PIN-only kirishning IKKINCHI omili.
 *
 * NEGA: PIN'da foydalanuvchi nomi yo'q (4 raqam = 10 000 variant). Qurilma
 * kaliti bo'lmasa erp'ga kirgan har kim PIN tera olardi. Kalit kassa
 * kompyuterida DPAPI bilan shifrlangan holda yotadi ⇒ hujum uchun avval
 * jismoniy kirish kerak.
 */
@Injectable()
export class PosDeviceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async pair(
    accountId: string,
    pairedById: string,
    input: { name: string; storeId: string; cashDeskId: string; organizationId: string },
  ): Promise<{ deviceId: string; deviceSecret: string; name: string }> {
    // 32 bayt = 256 bit. Kalit FAQAT shu javobda ko'rinadi.
    const deviceSecret = randomBytes(32).toString('hex');
    const created = await this.prisma.client.posDevice.create({
      data: {
        accountId,
        name: input.name,
        storeId: input.storeId,
        cashDeskId: input.cashDeskId,
        organizationId: input.organizationId,
        secretHash: await argon2.hash(deviceSecret),
        pairedById,
      },
      select: { id: true, name: true },
    });
    return { deviceId: created.id, deviceSecret, name: created.name };
  }

  async verify(deviceId: string, deviceSecret: string): Promise<PosDeviceContext> {
    const row = await this.prisma.client.posDevice.findUnique({ where: { id: deviceId } });

    // Qurilma yo'q / bekor qilingan — bir xil 401. Farqli xabar qurilma
    // identifikatorlarini sanab chiqishga yo'l ochardi.
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Qurilma tanilmadi');
    }

    if (row.lockedUntil && row.lockedUntil > new Date()) {
      const remaining = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Qurilma vaqtincha qulflangan (${remaining} daqiqa qoldi)`,
        HttpStatus.LOCKED,
      );
    }

    const ok = await argon2.verify(row.secretHash, deviceSecret).catch(() => false);
    if (!ok) throw new UnauthorizedException('Qurilma tanilmadi');

    return {
      id: row.id,
      accountId: row.accountId,
      storeId: row.storeId,
      cashDeskId: row.cashDeskId,
      organizationId: row.organizationId,
      name: row.name,
    };
  }

  /** Noto'g'ri PIN — hisoblagich BAZADA (restart bilan aylanib o'tilmasin). */
  async registerFailure(deviceId: string): Promise<void> {
    const row = await this.prisma.client.posDevice.findUnique({
      where: { id: deviceId },
      select: { failedAttempts: true },
    });
    if (!row) return;
    const attempts = row.failedAttempts + 1;
    const locked = attempts >= POS_DEVICE_MAX_ATTEMPTS;
    await this.prisma.client.posDevice.update({
      where: { id: deviceId },
      data: {
        failedAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + POS_DEVICE_LOCKOUT_MS) : null,
      },
    });
  }

  async registerSuccess(deviceId: string): Promise<void> {
    await this.prisma.client.posDevice.update({
      where: { id: deviceId },
      data: { failedAttempts: 0, lockedUntil: null, lastSeenAt: new Date() },
    });
  }
}

export interface PosDeviceContext {
  id: string;
  accountId: string;
  storeId: string;
  cashDeskId: string;
  organizationId: string;
  name: string;
}

export const POS_DEVICE_MAX_ATTEMPTS = 5;
export const POS_DEVICE_LOCKOUT_MS = 15 * 60 * 1000;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-device.service.test.ts`
Expected: PASS (9 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/pos-device.service.ts apps/api/src/modules/auth/pos-device.service.test.ts
git commit -m "feat(kassa): pos-device juftlash va kalit tekshiruvi"
git show --stat HEAD
```

---

### Task 6: `PosLoginService` — PIN → token

**Files:**
- Create: `apps/api/src/modules/auth/pos-login.service.ts`
- Create: `apps/api/src/modules/auth/pos-login.service.test.ts`
- Modify: `apps/api/src/modules/auth/auth.schema.ts` (`PosLoginSchema`, `PairPosDeviceSchema`)

**Interfaces:**
- Consumes: `PosDeviceService.verify/registerFailure/registerSuccess` (Task 5) · `PosPinService.findByPin` (Task 4) · `assertEmployeeMayLogin` (Task 3) · `TokenService.signAccessToken/createRefreshToken/signMediaToken` · `resolveUiMode`.
- Produces: `PosLoginService.login(input, meta): Promise<{ accessToken; refreshToken; mediaToken; user; device }>` — `user` shakli `LoginResponse['user']` bilan **aynan bir xil**; `device: { id, name, storeId, cashDeskId, organizationId }`.

- [ ] **Step 1: Schema qo'shish**

`apps/api/src/modules/auth/auth.schema.ts` oxiriga (mavjud `SetPosPinSchema` yonida):

```ts
/** Kassa qurilmasidan PIN bilan kirish (tokensiz endpoint). */
export const PosLoginSchema = z.object({
  deviceId: z.string().uuid(),
  deviceSecret: z.string().min(32),
  pin: z.string().regex(/^\d{4,6}$/, "PIN 4–6 raqamdan iborat bo'lishi kerak"),
});
export type PosLoginInput = z.infer<typeof PosLoginSchema>;

/** Qurilmani do'kon/kassaga bog'lash (JWT + hr employees:full talab qiladi). */
export const PairPosDeviceSchema = z.object({
  name: z.string().min(1).max(200),
  storeId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export type PairPosDeviceInput = z.infer<typeof PairPosDeviceSchema>;
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/modules/auth/pos-login.service.test.ts
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PosLoginService } from './pos-login.service.js';

const DEVICE_CTX = {
  id: 'dev-1',
  accountId: 'acc-1',
  storeId: 'store-1',
  cashDeskId: 'desk-1',
  organizationId: 'org-1',
  name: '1-kassa',
};

const EMPLOYEE = {
  id: 'emp-1',
  accountId: 'acc-1',
  email: 'kassir@demo.local',
  name: 'Kassir',
  position: 'Kassir',
  username: null,
  hrRoles: [],
  isChecker: false,
  archived: false,
  lockedUntil: null,
  attributes: null,
  account: { plan: 'pro' },
  hrPermissions: [],
  roles: [{ role: { uiMode: 'kiosk' } }],
};

function makeDeps(over: Record<string, unknown> = {}) {
  const devices = {
    verify: vi.fn().mockResolvedValue(DEVICE_CTX),
    registerFailure: vi.fn().mockResolvedValue(undefined),
    registerSuccess: vi.fn().mockResolvedValue(undefined),
  };
  const pins = { findByPin: vi.fn().mockResolvedValue({ employeeId: 'emp-1' }) };
  const prisma = {
    client: {
      employee: {
        findFirst: vi.fn().mockResolvedValue(EMPLOYEE),
        update: vi.fn().mockResolvedValue(EMPLOYEE),
      },
    },
  };
  const tokens = {
    signAccessToken: vi.fn().mockReturnValue('access-jwt'),
    createRefreshToken: vi.fn().mockResolvedValue('refresh-raw'),
    signMediaToken: vi.fn().mockReturnValue('media-jwt'),
  };
  Object.assign(devices, over.devices ?? {});
  Object.assign(pins, over.pins ?? {});
  return { devices, pins, prisma, tokens };
}

function build(over: Record<string, unknown> = {}) {
  const d = makeDeps(over);
  return {
    ...d,
    svc: new PosLoginService(d.prisma as never, d.tokens as never, d.devices as never, d.pins as never),
  };
}

const META = { ipAddress: '10.0.0.5', userAgent: 'kassa-exe' };
const INPUT = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), pin: '1234' };

describe('PosLoginService.login', () => {
  it('to‘g‘ri PIN → token va qurilma konteksti', async () => {
    const { svc, devices } = build();
    const out = await svc.login(INPUT, META);
    expect(out.accessToken).toBe('access-jwt');
    expect(out.device).toMatchObject({ cashDeskId: 'desk-1', storeId: 'store-1' });
    expect(devices.registerSuccess).toHaveBeenCalledWith('dev-1');
  });

  it('PIN topilmadi → 401 va qurilma hisoblagichi oshadi', async () => {
    const { svc, devices } = build({ pins: { findByPin: vi.fn().mockResolvedValue(null) } });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(devices.registerFailure).toHaveBeenCalledWith('dev-1');
  });

  it('juftlanmagan qurilma → 401, PIN umuman tekshirilmaydi', async () => {
    const { svc, pins } = build({
      devices: { verify: vi.fn().mockRejectedValue(new UnauthorizedException('Qurilma tanilmadi')) },
    });
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(pins.findByPin).not.toHaveBeenCalled();
  });

  it('xodim BOSHQA akkauntdan → 401 (tenant chegarasi)', async () => {
    const { svc } = build();
    const d = makeDeps();
    d.prisma.client.employee.findFirst = vi
      .fn()
      .mockResolvedValue({ ...EMPLOYEE, accountId: 'acc-BOSHQA' });
    const svc2 = new PosLoginService(
      d.prisma as never,
      d.tokens as never,
      d.devices as never,
      d.pins as never,
    );
    await expect(svc2.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
    // `svc` ishlatilmadi — lint uchun ishora
    expect(svc).toBeTruthy();
  });

  it('loginAllowed=false xodim → 401', async () => {
    const d = makeDeps();
    d.prisma.client.employee.findFirst = vi.fn().mockResolvedValue({
      ...EMPLOYEE,
      attributes: { __employee_system: { loginAllowed: false } },
    });
    const svc = new PosLoginService(
      d.prisma as never,
      d.tokens as never,
      d.devices as never,
      d.pins as never,
    );
    await expect(svc.login(INPUT, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('xato xabari kim ekanini OSHKOR QILMAYDI', async () => {
    const { svc } = build({ pins: { findByPin: vi.fn().mockResolvedValue(null) } });
    await expect(svc.login(INPUT, META)).rejects.toThrow(/PIN/);
  });

  it('uiMode kiosk sifatida hisoblanadi va user javobida qaytadi', async () => {
    const { svc } = build();
    const out = await svc.login(INPUT, META);
    expect(out.user.uiMode).toBe('kiosk');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-login.service.test.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 4: Implement**

```ts
// apps/api/src/modules/auth/pos-login.service.ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser, LoginResponse, PosLoginInput } from './auth.schema.js';
import { assertEmployeeMayLogin } from './employee-login-guards.js';
import { resolveUiMode } from './kiosk-policy.js';
import { PosDeviceService } from './pos-device.service.js';
import { PosPinService } from './pos-pin.service.js';
import { TokenService } from './token.service.js';

/** Har xato holatida BIR XIL xabar — hisob/PIN holati sizib chiqmasin. */
const GENERIC = "PIN noto'g'ri";

/**
 * PIN-only kirish (kassa .exe).
 *
 * Tartib ATAYLAB shunday: avval QURILMA, keyin PIN. Aks holda juftlanmagan
 * qurilmadan ham PIN taxmin qilish mumkin bo'lardi va qurilma tekshiruvi
 * bezakka aylanardi.
 */
@Injectable()
export class PosLoginService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PosDeviceService) private readonly devices: PosDeviceService,
    @Inject(PosPinService) private readonly pins: PosPinService,
  ) {}

  async login(input: PosLoginInput, meta: { userAgent?: string; ipAddress?: string }) {
    const device = await this.devices.verify(input.deviceId, input.deviceSecret);

    const found = await this.pins.findByPin(input.pin);
    if (!found) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: found.employeeId, archived: false },
      include: {
        account: { select: { plan: true } },
        hrPermissions: { select: { pageKey: true, section: true, accessLevel: true } },
        roles: { select: { role: { select: { uiMode: true } } } },
      },
    });

    // Tenant chegarasi: PIN qidiruvi akkauntdan mustaqil (kassir kirishdan
    // oldin akkauntni ko'rsatmaydi), shuning uchun moslikni SHU YERDA
    // tekshiramiz — aks holda bir akkauntning PIN'i boshqasining kassasida
    // ishlab ketardi.
    if (!employee || employee.accountId !== device.accountId) {
      await this.devices.registerFailure(device.id);
      throw new UnauthorizedException(GENERIC);
    }

    assertEmployeeMayLogin(employee, { ipAddress: meta.ipAddress, genericMessage: GENERIC });

    await this.prisma.client.employee.update({
      where: { id: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.devices.registerSuccess(device.id);

    const authUser: AuthenticatedUser = {
      sub: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      uiMode: resolveUiMode(employee.roles.map((r) => r.role)),
      hrPermissions: employee.hrPermissions.map((p) => ({
        pageKey: p.pageKey,
        section: p.section,
        accessLevel: p.accessLevel as 'full' | 'read' | 'own_only',
      })),
    };

    const user: LoginResponse['user'] = {
      id: employee.id,
      accountId: employee.accountId,
      email: employee.email,
      name: employee.name,
      position: employee.position,
      accountPlan: employee.account.plan,
      username: employee.username,
      hrRoles: employee.hrRoles,
      isChecker: employee.isChecker,
      uiMode: authUser.uiMode,
      hrPermissions: authUser.hrPermissions,
    };

    return {
      accessToken: this.tokens.signAccessToken(authUser),
      refreshToken: await this.tokens.createRefreshToken(employee.id, meta),
      mediaToken: this.tokens.signMediaToken(authUser),
      user,
      device: {
        id: device.id,
        name: device.name,
        storeId: device.storeId,
        cashDeskId: device.cashDeskId,
        organizationId: device.organizationId,
      },
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/pos-login.service.test.ts`
Expected: PASS (7 test)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/pos-login.service.ts apps/api/src/modules/auth/pos-login.service.test.ts apps/api/src/modules/auth/auth.schema.ts
git commit -m "feat(kassa): pin-only kirish servisi (qurilma + pin -> token)"
git show --stat HEAD
```

---

### Task 7: Endpointlar — `/auth/pos-login`, `/auth/pos-device/pair` + DI simlari

**Files:**
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts:56-57`
- Modify: `apps/api/src/modules/auth/kiosk-policy.test.ts` (yangi yo'llar qoplanganini tasdiqlash)

**Interfaces:**
- Consumes: `PosLoginService.login` (Task 6), `PosDeviceService.pair` (Task 5), `PosLoginSchema`/`PairPosDeviceSchema` (Task 6).
- Produces: HTTP `POST /api/v1/auth/pos-login` → `{ accessToken, user, device }` + `ms_rt`/`ms_mt` cookie'lar · `POST /api/v1/auth/pos-device/pair` → `{ deviceId, deviceSecret, name }`.

- [ ] **Step 1: Kiosk allowlist qoplamini tasdiqlovchi test yozish**

`apps/api/src/modules/auth/kiosk-policy.test.ts` oxiriga:

```ts
describe('PIN-kirish yo‘llari kiosk allowlist bilan mos', () => {
  it('/auth/pos-login kiosk uchun ochiq (mavjud /auth qoidasi qoplaydi)', () => {
    expect(isKioskAllowed('POST', '/auth/pos-login')).toBe(true);
  });

  it('/auth/pos-device/pair ham /auth qoidasiga tushadi', () => {
    // Bu endpoint JWT + hr-ruxsat talab qiladi; kiosk kassiri baribir
    // RequireHrPermission’dan o‘tolmaydi — allowlist ochiqligi teshik emas.
    expect(isKioskAllowed('POST', '/auth/pos-device/pair')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `pnpm --filter @moysklad/api vitest run src/modules/auth/kiosk-policy.test.ts`
Expected: PASS — `/auth` qoidasi `methods: ['*']` bo'lgani uchun yashil. (Bu test **hujjatlovchi**: kelajakda kimdir `/auth` qoidasini torroq qilsa darhol qizaradi.)

- [ ] **Step 3: Controller'ga endpointlarni qo'shish**

`auth.controller.ts` — importlarga:

```ts
import { PairPosDeviceSchema, PosLoginSchema } from './auth.schema.js';
import { PosDeviceService } from './pos-device.service.js';
import { PosLoginService } from './pos-login.service.js';
import { RequireHrPermission } from '../hr/hr-auth/require-hr-permission.decorator.js';
```

> Yo'l `hr-employee.controller.ts:22` dan o'lchandi (`../hr-auth/require-hr-permission.decorator.js`); `auth.controller.ts` bir daraja yuqorida bo'lgani uchun `../hr/hr-auth/…`.

Konstruktorga:

```ts
    @Inject(PosLoginService) private readonly posLogin: PosLoginService,
    @Inject(PosDeviceService) private readonly posDevices: PosDeviceService,
```

Klass oxiriga:

```ts
  // ── PIN-only kirish (kassa .exe) ──────────────────────────────────────────

  /**
   * Kassa qurilmasidan PIN bilan kirish. Tokensiz — qurilma kaliti «kim
   * so'rayapti» savoliga javob beradi, PIN esa «qaysi kassir».
   */
  @Post('pos-login')
  async posLoginHandler(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const input = PosLoginSchema.parse(body);
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    const { accessToken, refreshToken, mediaToken, user, device } = await this.posLogin.login(
      input,
      meta,
    );
    // Cookie'lar parol-login bilan AYNAN bir xil — sessiya xulqi ikkiga
    // bo'linmasin (refresh/logout/media yo'llari o'zgarmaydi).
    res.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    res.setCookie(MEDIA_TOKEN_COOKIE, mediaToken, MEDIA_COOKIE_OPTS);
    return { accessToken, user, device };
  }

  /** Qurilmani do'kon/kassaga bog'lash. Kalit FAQAT shu javobda qaytadi. */
  @Post('pos-device/pair')
  @UseGuards(JwtAuthGuard)
  @RequireHrPermission('employees', 'full')
  async pairPosDevice(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = PairPosDeviceSchema.parse(body);
    return this.posDevices.pair(user.accountId, user.sub, input);
  }
```

- [ ] **Step 4: Modulga providerlarni qo'shish**

`auth.module.ts`:

```ts
  providers: [AuthService, TokenService, JwtAuthGuard, PosPinService, KioskGuard, PosDeviceService, PosLoginService],
  exports: [AuthService, TokenService, JwtAuthGuard, KioskGuard, PosPinService],
```

- [ ] **Step 5: DI grafi haqiqatan qurilishini tekshirish**

Run: `pnpm --filter @moysklad/api vitest run src/app-boot.test.ts`
Expected: PASS. Yiqilsa — provider ro'yxati yoki `ConfigService` in'yeksiyasi yetishmayapti (xotira: «@Global in'yeksiya qo'riqsiz» — hech bir boshqa test DI grafini qurmaydi).

- [ ] **Step 6: To'liq API gate**

Run: `pnpm --filter @moysklad/api typecheck && pnpm --filter @moysklad/api vitest run src/modules/auth src/app-boot.test.ts`
Expected: typecheck 0 xato; testlar yashil.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.module.ts apps/api/src/modules/auth/kiosk-policy.test.ts
git commit -m "feat(kassa): /auth/pos-login va /auth/pos-device/pair endpointlari"
git show --stat HEAD
```

---

### Task 8: Admin PIN berish — `hr/employees/:id/pos-pin`

**Files:**
- Modify: `apps/api/src/modules/hr/hr-employee/hr-employee.controller.ts` (`set-password` yonida, ~315-qatordan keyin)
- Modify: `apps/api/src/modules/hr/hr-employee/hr-employee.service.ts`
- Modify: `apps/api/src/modules/hr/hr-employee/hr-employee.module.ts` (AuthModule'dan `PosPinService`)

**Interfaces:**
- Consumes: `PosPinService.setPin/clearPin/hasPin` (Task 4). `AuthModule` uni `exports` ga qo'shgan (Task 7 Step 4).
- Produces: `POST /api/v1/hr/employees/:id/pos-pin` `{ pin }` → `{ ok: true }` · `DELETE /api/v1/hr/employees/:id/pos-pin` → `{ ok: true }` · `GET /api/v1/hr/employees/:id/pos-pin` → `{ hasPin: boolean }`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/hr/hr-employee/hr-employee-pos-pin.test.ts` yarat:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wiring qo'riqchisi: admin PIN endpointlari MAVJUD va `set-password` bilan
 * BIR XIL ruxsat talab qiladi. Sabab — PIN kassaga kirish kaliti: undan
 * zaifroq ruxsat qo'yilsa parolni o'zgartira olmaydigan xodim PIN orqali
 * boshqa kassirning hisobiga kirish yo'lini ochardi.
 */
const src = readFileSync(
  join(process.cwd(), 'src/modules/hr/hr-employee/hr-employee.controller.ts'),
  'utf8',
);

describe('admin POS PIN endpointlari', () => {
  it('POST :id/pos-pin mavjud', () => {
    expect(src).toContain("@Post(':id/pos-pin')");
  });

  it('DELETE :id/pos-pin mavjud', () => {
    expect(src).toContain("@Delete(':id/pos-pin')");
  });

  it('GET :id/pos-pin mavjud', () => {
    expect(src).toContain("@Get(':id/pos-pin')");
  });

  it("uchalasi ham set-password bilan bir xil ruxsat talab qiladi", () => {
    const posPinBlock = src.slice(src.indexOf("':id/pos-pin'"));
    // Har bir pos-pin route'idan oldin/keyin RequireHrPermission('employees','full')
    const occurrences = (src.match(/@RequireHrPermission\('employees', 'full'\)/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(4); // set-password + 3 ta pos-pin
    expect(posPinBlock).toContain("@RequireHrPermission('employees', 'full')");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/api vitest run src/modules/hr/hr-employee/hr-employee-pos-pin.test.ts`
Expected: FAIL — `@Post(':id/pos-pin')` topilmadi

- [ ] **Step 3: Controller'ga qo'shish**

`hr-employee.controller.ts` da `setPassword` (306–315) dan keyin:

```ts
  // ── Kassa PIN (kassa .exe kirishi) ────────────────────────────────────────
  // Ruxsat set-password BILAN BIR XIL: PIN — kassaga kirish kaliti, undan
  // zaifroq ruxsat qo'yilsa u parolni chetlab o'tish yo'li bo'lardi.

  @Get(':id/pos-pin')
  @RequireHrPermission('employees', 'full')
  async getPosPin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posPin.hasPin(user.accountId, id);
  }

  @Post(':id/pos-pin')
  @RequireHrPermission('employees', 'full')
  async setPosPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { pin } = SetPosPinSchema.parse(body);
    return this.posPin.setPin(user.accountId, id, pin);
  }

  @Delete(':id/pos-pin')
  @RequireHrPermission('employees', 'full')
  async clearPosPin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posPin.clearPin(user.accountId, id);
  }
```

Konstruktorga `@Inject(PosPinService) private readonly posPin: PosPinService` va importlar:
`import { SetPosPinSchema } from '../../auth/auth.schema.js';`
`import { PosPinService } from '../../auth/pos-pin.service.js';`

- [ ] **Step 4: Modulga `AuthModule` importini tasdiqlash**

`hr-employee.module.ts` da `imports` ichida `AuthModule` bo'lishi shart (xotira: «@Global in'yeksiya qo'riqsiz» — modulni OSHKORA import qil). Bo'lmasa qo'sh.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @moysklad/api vitest run src/modules/hr/hr-employee/hr-employee-pos-pin.test.ts src/app-boot.test.ts`
Expected: ikkalasi ham PASS. `app-boot` yiqilsa — `AuthModule` importi yetishmayapti.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/hr/hr-employee/hr-employee.controller.ts apps/api/src/modules/hr/hr-employee/hr-employee.module.ts apps/api/src/modules/hr/hr-employee/hr-employee-pos-pin.test.ts
git commit -m "feat(kassa): admin xodimga pos-pin beradi va o'chiradi"
git show --stat HEAD
```

---

### Task 9: Jonli o'lchash — API haqiqatan token beradi

**Files:** yo'q (verifikatsiya taski). Natija `docs/superpowers/plans/` ga emas, sessiya hisobotiga yoziladi.

**Interfaces:**
- Consumes: Task 2–8 natijalari.
- Produces: o'lchangan dalil (token, qurilma id) — Task 10+ (web) shu oqimni takrorlaydi.

- [ ] **Step 1: Stack'ni ko'tarish**

Run: `pnpm dev` (turbo --parallel; api :4000, web :3100)
Diqqat (xotira: «dev-stack boshqa worktree'dan ishlashi mumkin»): `:4000` allaqachon band bo'lsa, u **shu** worktree'dan ishlayotganini tasdiqla, aks holda yangi marshrutlar 404 beradi.

- [ ] **Step 2: Admin bilan kirib qurilma juftlash**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.local","password":"admin123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')

curl -s -X POST http://localhost:4000/api/v1/auth/pos-device/pair \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"1-kassa","storeId":"<STORE_UUID>","cashDeskId":"<DESK_UUID>","organizationId":"<ORG_UUID>"}'
```

UUID'larni bazadan ol:

```bash
pnpm --filter @moysklad/db exec prisma db execute --stdin <<'SQL'
SELECT (SELECT id FROM stores LIMIT 1) AS store,
       (SELECT id FROM cash_desks LIMIT 1) AS desk,
       (SELECT id FROM organizations LIMIT 1) AS org;
SQL
```

Expected: `{ "deviceId": "...", "deviceSecret": "<64 hex>", "name": "1-kassa" }`

- [ ] **Step 3: Kassirga PIN berish**

```bash
curl -s -X POST http://localhost:4000/api/v1/hr/employees/<EMP_ID>/pos-pin \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"pin":"4321"}'
```

Expected: `{"ok":true}`

- [ ] **Step 4: Takror PIN rad etilishini o'lchash**

Boshqa xodimga **aynan `4321`** berishga urin.
Expected: HTTP 400, xabarda «band». Agar 200 qaytsa — unique indeks qo'llanmagan (Task 2 Step 6 ga qayt).

- [ ] **Step 5: PIN bilan kirish**

```bash
curl -s -i -X POST http://localhost:4000/api/v1/auth/pos-login \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"<DEVICE_ID>","deviceSecret":"<SECRET>","pin":"4321"}'
```

Expected: 201/200, tanada `accessToken` + `user` + `device`, sarlavhalarda `Set-Cookie: ms_rt=` va `ms_mt=`.

- [ ] **Step 6: Qurilmasiz kirish RAD ETILISHINI o'lchash**

Bir xil so'rov, `deviceSecret` ni bitta belgi o'zgartirib yubor.
Expected: 401. **Bu — butun xavfsizlik modelining o'lchovi**; 200 qaytsa oldinga o'tilmaydi.

- [ ] **Step 7: 5 xatodan keyin qurilma qulflanishini o'lchash**

Noto'g'ri PIN bilan 5 marta chaqir.
Expected: 5-chidan keyin HTTP **423** va xabarda qolgan daqiqa.

- [ ] **Step 8: Natijani yozib qo'yish**

O'lchangan javoblarni (status kodlar) sessiya hisobotiga ko'chir. Bu — «Phase-1 + API runtime-o'lchangan» yorlig'ining dalili.

---

### Task 10: Web — qurilma ma'lumotini saqlash qatlami

**Files:**
- Create: `apps/web/src/lib/pos-device.ts`
- Create: `apps/web/src/lib/__tests__/pos-device.test.ts`

**Interfaces:**
- Consumes: `window.electronAPI` (hozircha yo'q — K5 da keladi).
- Produces: `readPosDevice(): PosDeviceCreds | null` · `writePosDevice(creds): void` · `clearPosDevice(): void` · `type PosDeviceCreds = { deviceId: string; deviceSecret: string; name: string }`

> **Dizayn aniqligi (spec §4.1 dan kengaytma):** juftlash EKRANI web tomonda bo'ladi, Electron emas. Sabab — bitta implementatsiya ikkala muhitda ishlaydi va brauzerda QA qilish mumkin. Electron faqat **xavfsiz saqlash** beradi (`safeStorage`); brauzerda `localStorage` ga tushadi. Bu farq kodda ochiq izohlanadi: brauzer varianti dev/QA uchun, prod kassa — Electron.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/pos-device.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPosDevice, readPosDevice, writePosDevice } from '../pos-device';

const CREDS = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), name: '1-kassa' };

beforeEach(() => {
  localStorage.clear();
  // biome-ignore lint/suspicious/noExplicitAny: test uchun ko'prikni olib tashlash
  (window as any).electronAPI = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('pos-device (brauzer varianti)', () => {
  it('yozilgan ma‘lumot o‘qiladi', () => {
    writePosDevice(CREDS);
    expect(readPosDevice()).toEqual(CREDS);
  });

  it('hech narsa yozilmagan bo‘lsa null', () => {
    expect(readPosDevice()).toBeNull();
  });

  it('buzuq JSON — null, otilmaydi', () => {
    localStorage.setItem('sherset.pos-device', '{buzuq');
    expect(readPosDevice()).toBeNull();
  });

  it('to‘liqmas yozuv — null (yarim juftlangan holat kirishga urinmasin)', () => {
    localStorage.setItem('sherset.pos-device', JSON.stringify({ deviceId: 'a' }));
    expect(readPosDevice()).toBeNull();
  });

  it('clear o‘chiradi', () => {
    writePosDevice(CREDS);
    clearPosDevice();
    expect(readPosDevice()).toBeNull();
  });
});

describe('pos-device (Electron varianti)', () => {
  it('Electron ko‘prigi bor bo‘lsa O‘SHANDAN o‘qiydi, localStorage’dan emas', () => {
    localStorage.setItem('sherset.pos-device', JSON.stringify(CREDS));
    const fromShell = { deviceId: 'shell-dev', deviceSecret: 'y'.repeat(64), name: 'Shell kassa' };
    // biome-ignore lint/suspicious/noExplicitAny: test ko'prigi
    (window as any).electronAPI = { isSherset: true, getDevice: () => fromShell };
    expect(readPosDevice()).toEqual(fromShell);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/web vitest run src/lib/__tests__/pos-device.test.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/pos-device.ts
/**
 * Kassa qurilmasining kirish ma'lumoti (id + maxfiy kalit).
 *
 * IKKI SAQLASH JOYI:
 *  - Electron (prod kassa): `window.electronAPI.getDevice()` → Windows DPAPI
 *    bilan shifrlangan fayl. Kalit brauzer xotirasida qolmaydi.
 *  - Brauzer (dev/QA): `localStorage`. Ataylab zaifroq — bu yo'l ishlab
 *    chiqarish kassasi uchun emas, sinov uchun. Juftlash EKRANI esa bitta:
 *    ikki muhitda bir xil kod ishlaydi.
 */
export interface PosDeviceCreds {
  deviceId: string;
  deviceSecret: string;
  name: string;
}

const KEY = 'sherset.pos-device';

interface ShellBridge {
  isSherset?: boolean;
  getDevice?: () => PosDeviceCreds | null;
  setDevice?: (creds: PosDeviceCreds) => void;
  clearDevice?: () => void;
}

function shell(): ShellBridge | null {
  if (typeof window === 'undefined') return null;
  const el = (window as { electronAPI?: ShellBridge }).electronAPI;
  return el?.isSherset ? el : null;
}

function isComplete(v: unknown): v is PosDeviceCreds {
  const o = v as Partial<PosDeviceCreds> | null;
  return !!o && typeof o.deviceId === 'string' && typeof o.deviceSecret === 'string' && typeof o.name === 'string';
}

export function readPosDevice(): PosDeviceCreds | null {
  const el = shell();
  if (el?.getDevice) {
    const fromShell = el.getDevice();
    return isComplete(fromShell) ? fromShell : null;
  }
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Yarim yozuv — kirishga urinmaymiz: 401 bilan chalkash xato o'rniga
    // «juftlanmagan» ekrani ko'rsatiladi.
    return isComplete(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePosDevice(creds: PosDeviceCreds): void {
  const el = shell();
  if (el?.setDevice) {
    el.setDevice(creds);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(creds));
}

export function clearPosDevice(): void {
  const el = shell();
  if (el?.clearDevice) {
    el.clearDevice();
    return;
  }
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/web vitest run src/lib/__tests__/pos-device.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pos-device.ts apps/web/src/lib/__tests__/pos-device.test.ts
git commit -m "feat(kassa): qurilma ma'lumoti saqlash qatlami (electron yoki localstorage)"
git show --stat HEAD
```

---

### Task 11: Web — `posLogin` auth-store'da

**Files:**
- Modify: `apps/web/src/lib/auth-store.ts` (`login` dan keyin, ~132-qator)
- Create: `apps/web/src/lib/__tests__/auth-store-pos-login.test.ts`

**Interfaces:**
- Consumes: `PosDeviceCreds` (Task 10).
- Produces: `posLogin(creds: PosDeviceCreds, pin: string): Promise<User>` — muvaffaqiyatda `state.accessToken` to'ldiriladi va `writeAuthHint(true)` chaqiriladi.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/auth-store-pos-login.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, posLogin } from '../auth-store';

const CREDS = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), name: '1-kassa' };

afterEach(() => vi.restoreAllMocks());

describe('posLogin', () => {
  it('to‘g‘ri PIN → token saqlanadi va user qaytadi', async () => {
    const user = { id: 'emp-1', name: 'Kassir', uiMode: 'kiosk' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'jwt-1', user, device: CREDS }),
      }),
    );
    const out = await posLogin(CREDS, '4321');
    expect(out).toEqual(user);
    expect(getAccessToken()).toBe('jwt-1');
  });

  it('so‘rov tanasida qurilma kaliti VA pin ketadi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'jwt-1', user: {}, device: CREDS }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await posLogin(CREDS, '4321');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), pin: '4321' });
    // Cookie'lar kerak: refresh/media shu orqali o'rnatiladi.
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('401 → server xabari bilan xato otiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'PIN noto`g`ri' }),
      }),
    );
    await expect(posLogin(CREDS, '0000')).rejects.toThrow(/PIN/);
  });

  it('423 (qurilma qulflangan) → xabar uzatiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 423,
        json: async () => ({ message: 'Qurilma vaqtincha qulflangan (14 daqiqa qoldi)' }),
      }),
    );
    await expect(posLogin(CREDS, '0000')).rejects.toThrow(/qulflangan/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/web vitest run src/lib/__tests__/auth-store-pos-login.test.ts`
Expected: FAIL — `posLogin` eksport qilinmagan

- [ ] **Step 3: Implement**

`auth-store.ts` da `login()` dan keyin:

```ts
/**
 * Kassa PIN-kirishi. `login()` dan farqi — hisob ma'lumoti o'rniga QURILMA
 * kaliti + PIN yuboriladi. Muvaffaqiyat holati aynan bir xil: server bir xil
 * cookie'larni qo'yadi, shuning uchun refresh/logout yo'llari o'zgarmaydi.
 */
export async function posLogin(
  creds: { deviceId: string; deviceSecret: string },
  pin: string,
): Promise<User> {
  const res = await fetch(`${BASE}/auth/pos-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceId: creds.deviceId, deviceSecret: creds.deviceSecret, pin }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { accessToken: string; user: User };
  state = { accessToken: data.accessToken, user: data.user, initialized: true };
  writeAuthHint(true);
  emit();
  return data.user;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @moysklad/web vitest run src/lib/__tests__/auth-store-pos-login.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth-store.ts apps/web/src/lib/__tests__/auth-store-pos-login.test.ts
git commit -m "feat(kassa): auth-store posLogin funksiyasi"
git show --stat HEAD
```

---

### Task 12: Web — `PinKeypad` komponenti

**Files:**
- Create: `apps/web/src/components/pos/pin-keypad.tsx`
- Create: `apps/web/src/components/pos/__tests__/pin-keypad.test.tsx`
- Modify: `apps/web/src/messages/ru.json`, `apps/web/src/messages/uz.json`

**Interfaces:**
- Consumes: `useTranslations('kassaLogin')`.
- Produces: `<PinKeypad value={string} onChange={(next: string) => void} onSubmit={() => void} disabled={boolean} maxLength={number} />` — sof prezentatsion, tarmoqqa chiqmaydi.

- [ ] **Step 1: i18n kalitlarini qo'shish**

`apps/web/src/messages/uz.json` ildiziga:

```json
  "kassaLogin": {
    "title": "Kassaga kirish",
    "subtitle": "PIN-kodingizni kiriting",
    "device_label": "Qurilma",
    "pin_label": "PIN-kod",
    "submit": "Kirish",
    "submitting": "Tekshirilmoqda…",
    "clear": "Tozalash",
    "backspace": "O'chirish",
    "error_generic": "PIN noto'g'ri",
    "not_paired_title": "Bu qurilma juftlanmagan",
    "not_paired_body": "Administrator qurilmani do'kon va kassaga bog'lashi kerak.",
    "pair_link": "Qurilmani juftlash",
    "admin_login": "Administrator kirishi"
  },
```

`apps/web/src/messages/ru.json` ildiziga:

```json
  "kassaLogin": {
    "title": "Вход в кассу",
    "subtitle": "Введите PIN-код",
    "device_label": "Устройство",
    "pin_label": "PIN-код",
    "submit": "Войти",
    "submitting": "Проверка…",
    "clear": "Очистить",
    "backspace": "Стереть",
    "error_generic": "Неверный PIN",
    "not_paired_title": "Устройство не привязано",
    "not_paired_body": "Администратор должен привязать устройство к складу и кассе.",
    "pair_link": "Привязать устройство",
    "admin_login": "Вход администратора"
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/src/components/pos/__tests__/pin-keypad.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/uz.json';
import { PinKeypad } from '../pin-keypad';

function renderKeypad(props: Partial<React.ComponentProps<typeof PinKeypad>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider locale="uz" messages={messages}>
      <PinKeypad value="" onChange={onChange} onSubmit={onSubmit} disabled={false} maxLength={6} {...props} />
    </NextIntlClientProvider>,
  );
  return { onChange, onSubmit };
}

describe('PinKeypad', () => {
  it('0–9 tugmalari bor', () => {
    renderKeypad();
    for (const d of '0123456789') {
      expect(screen.getByRole('button', { name: d })).toBeTruthy();
    }
  });

  it('raqam bosilsa onChange qo‘shilgan qiymat bilan chaqiriladi', () => {
    const { onChange } = renderKeypad({ value: '12' });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenCalledWith('123');
  });

  it('maxLength ga yetganda yangi raqam QO‘SHILMAYDI', () => {
    const { onChange } = renderKeypad({ value: '123456', maxLength: 6 });
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('o‘chirish oxirgi raqamni olib tashlaydi', () => {
    const { onChange } = renderKeypad({ value: '123' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.backspace }));
    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('bo‘sh qiymatda o‘chirish xato bermaydi', () => {
    const { onChange } = renderKeypad({ value: '' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.backspace }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('kiritilgan raqamlar OCHIQ ko‘rinmaydi (nuqta bilan)', () => {
    renderKeypad({ value: '1234' });
    expect(screen.queryByText('1234')).toBeNull();
  });

  it('disabled bo‘lsa raqam bosilmaydi', () => {
    const { onChange } = renderKeypad({ value: '1', disabled: true });
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('«Kirish» onSubmit chaqiradi', () => {
    const { onSubmit } = renderKeypad({ value: '1234' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.submit }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('4 raqamdan kam bo‘lsa «Kirish» o‘chirilgan', () => {
    renderKeypad({ value: '12' });
    const btn = screen.getByRole('button', { name: messages.kassaLogin.submit }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @moysklad/web vitest run src/components/pos/__tests__/pin-keypad.test.tsx`
Expected: FAIL — komponent yo'q

- [ ] **Step 4: Implement**

```tsx
// apps/web/src/components/pos/pin-keypad.tsx
'use client';

import { useTranslations } from 'next-intl';

/**
 * Kassa PIN klaviaturasi — SOF prezentatsion (tarmoq yo'q, holat yo'q).
 *
 * Katta tugmalar sensorli ekran uchun: kassa monitorlari ko'pincha teginishli
 * va kassirda sichqoncha bo'lmaydi.
 */
export interface PinKeypadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxLength: number;
}

const MIN_PIN = 4;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function PinKeypad({ value, onChange, onSubmit, disabled, maxLength }: PinKeypadProps) {
  const t = useTranslations('kassaLogin');

  const press = (d: string) => {
    // Chegaraga yetganda JIM e'tiborsiz — xato ko'rsatish kassirni
    // chalg'itardi, u shunchaki ortiqcha bosgan bo'ladi.
    if (disabled || value.length >= maxLength) return;
    onChange(value + d);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Kiritilgan raqamlar OCHIQ ko'rsatilmaydi — kassa monitorini mijoz ham ko'radi. */}
      <div className="flex h-12 items-center gap-3" aria-label={t('pin_label')}>
        {Array.from({ length: maxLength }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < value.length
                ? 'border-[var(--ms-brand-500)] bg-[var(--ms-brand-500)]'
                : 'border-[var(--ms-border-default)]'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={disabled}
            className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] font-semibold text-2xl shadow-[var(--ms-shadow-sm)] disabled:opacity-50"
          >
            {d}
          </button>
        ))}

        <button
          type="button"
          onClick={() => !disabled && onChange('')}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-muted)] text-sm disabled:opacity-50"
        >
          {t('clear')}
        </button>

        <button
          type="button"
          onClick={() => press('0')}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] font-semibold text-2xl shadow-[var(--ms-shadow-sm)] disabled:opacity-50"
        >
          0
        </button>

        <button
          type="button"
          onClick={() => !disabled && onChange(value.slice(0, -1))}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-muted)] text-sm disabled:opacity-50"
        >
          {t('backspace')}
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || value.length < MIN_PIN}
        className="h-14 w-full rounded-[var(--ms-radius-md)] bg-[var(--ms-brand-500)] font-semibold text-white disabled:opacity-50"
      >
        {t('submit')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @moysklad/web vitest run src/components/pos/__tests__/pin-keypad.test.tsx`
Expected: PASS (9 test)

- [ ] **Step 6: i18n gate**

Run: `pnpm i18n:gate`
Expected: o'tadi (ru va uz da bir xil kalitlar; hardcode yo'q).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/pos/pin-keypad.tsx apps/web/src/components/pos/__tests__/pin-keypad.test.tsx apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git commit -m "feat(kassa): pin klaviatura komponenti + ru/uz kalitlari"
git show --stat HEAD
```

---

### Task 13: Web — `/kassa-kirish` sahifasi va juftlash ekrani

**Files:**
- Create: `apps/web/src/app/kassa-kirish/page.tsx`
- Create: `apps/web/src/app/kassa-kirish/juftlash/page.tsx`
- Create: `apps/web/src/__tests__/kassa-kirish-wiring.test.ts`

**Interfaces:**
- Consumes: `PinKeypad` (Task 12) · `posLogin` (Task 11) · `readPosDevice/writePosDevice` (Task 10) · `login` (mavjud auth-store) · `api` (`@/lib/api-client`).
- Produces: `/kassa-kirish` route (kassir) va `/kassa-kirish/juftlash` route (admin).

- [ ] **Step 1: Wiring qo'riqchisi testini yozish**

```ts
// apps/web/src/__tests__/kassa-kirish-wiring.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/app/kassa-kirish/page.tsx'), 'utf8');

/**
 * Sahifa simlari qo'riqchisi. Komponent testlari PinKeypad'ni tekshiradi,
 * lekin sahifa uni HAQIQATAN posLogin'ga ulaganini ko'rmaydi — xotira:
 * «DocumentEditor prop-drop: typecheck'dan jim o'tadi, render'ga yetmaydi».
 */
describe('/kassa-kirish simlari', () => {
  it('PinKeypad ishlatiladi', () => {
    expect(page).toContain('<PinKeypad');
  });

  it('posLogin chaqiriladi (login emas)', () => {
    expect(page).toContain('posLogin(');
  });

  it('qurilma ma‘lumoti readPosDevice orqali o‘qiladi', () => {
    expect(page).toContain('readPosDevice(');
  });

  it('juftlanmagan holat uchun alohida shox bor', () => {
    expect(page).toContain('not_paired_title');
  });

  it('muvaffaqiyatdan keyin /sotuv ga yo‘naltiriladi', () => {
    expect(page).toContain("'/sotuv'");
  });

  it('PIN qiymati brauzer saqlagichiga YOZILMAYDI', () => {
    // PIN hech qachon localStorage/sessionStorage'ga tushmasin.
    expect(page).not.toMatch(/(local|session)Storage\.setItem\([^)]*pin/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @moysklad/web vitest run src/__tests__/kassa-kirish-wiring.test.ts`
Expected: FAIL — `ENOENT: src/app/kassa-kirish/page.tsx`

- [ ] **Step 3: PIN sahifasini yozish**

```tsx
// apps/web/src/app/kassa-kirish/page.tsx
'use client';

import { PinKeypad } from '@/components/pos/pin-keypad';
import { posLogin } from '@/lib/auth-store';
import { type PosDeviceCreds, readPosDevice } from '@/lib/pos-device';
import { Alert, Container } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const MAX_PIN = 6;

export default function KassaKirishPage() {
  const t = useTranslations('kassaLogin');
  const router = useRouter();
  const [device, setDevice] = useState<PosDeviceCreds | null>(null);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Qurilma ma'lumoti FAQAT brauzerda mavjud (Electron ko'prigi yoki
  // localStorage) — shuning uchun effektda, render paytida emas.
  useEffect(() => {
    setDevice(readPosDevice());
    setReady(true);
  }, []);

  const submit = async () => {
    if (!device || pending) return;
    setPending(true);
    setError(null);
    try {
      await posLogin(device, pin);
      router.replace('/sotuv');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_generic'));
      // Xatodan keyin maydon tozalanadi — kassir noto'g'ri raqamni
      // qidirib o'tirmasin.
      setPin('');
    } finally {
      setPending(false);
    }
  };

  if (!ready) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] p-8 shadow-[var(--ms-shadow-lg)]">
          <h1 className="text-center font-semibold text-xl">{t('title')}</h1>

          {device ? (
            <>
              <p className="mt-1 text-center text-[var(--ms-text-muted)] text-sm">
                {t('subtitle')}
              </p>
              <div className="mt-6">
                {error && <Alert tone="destructive">{error}</Alert>}
                <PinKeypad
                  value={pin}
                  onChange={setPin}
                  onSubmit={submit}
                  disabled={pending}
                  maxLength={MAX_PIN}
                />
              </div>
              <p className="mt-6 text-center text-[var(--ms-text-muted)] text-xs">
                {t('device_label')}: {device.name}
              </p>
            </>
          ) : (
            <div className="mt-6 text-center">
              <p className="font-medium">{t('not_paired_title')}</p>
              <p className="mt-2 text-[var(--ms-text-muted)] text-sm">{t('not_paired_body')}</p>
              <Link
                href="/kassa-kirish/juftlash"
                className="mt-4 inline-block text-[var(--ms-brand-500)] text-sm underline"
              >
                {t('pair_link')}
              </Link>
            </div>
          )}

          <p className="mt-6 text-center">
            <Link href="/login" className="text-[var(--ms-text-muted)] text-xs underline">
              {t('admin_login')}
            </Link>
          </p>
        </div>
      </Container>
    </main>
  );
}
```

- [ ] **Step 4: Juftlash sahifasini yozish**

```tsx
// apps/web/src/app/kassa-kirish/juftlash/page.tsx
'use client';

import { api } from '@/lib/api-client';
import { login } from '@/lib/auth-store';
import { writePosDevice } from '@/lib/pos-device';
import { Alert, Button, Container, FormField, Input, PasswordInput } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

interface NamedRow {
  id: string;
  name: string;
}

/**
 * Qurilmani juftlash — BIR MARTALIK admin amali.
 *
 * NEGA WEB'DA, Electron'da emas: bitta implementatsiya ikkala muhitda ishlaydi
 * va brauzerda QA qilinadi. Electron faqat XAVFSIZ SAQLASH beradi
 * (`writePosDevice` uni o'zi tanlaydi).
 */
export default function JuftlashPage() {
  const t = useTranslations('kassaLogin');
  const router = useRouter();
  const [step, setStep] = useState<'login' | 'select'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stores, setStores] = useState<NamedRow[]>([]);
  const [desks, setDesks] = useState<NamedRow[]>([]);
  const [orgs, setOrgs] = useState<NamedRow[]>([]);
  const [storeId, setStoreId] = useState('');
  const [cashDeskId, setCashDeskId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const doLogin = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(identifier, password);
      // Ro'yxat javobi `{ items: [...] }` shaklida — o'lchandi:
      // apps/web/src/app/(app)/cash-in/new/page.tsx:121-129.
      const [s, d, o] = await Promise.all([
        api.get<{ items: NamedRow[] }>('/stores'),
        api.get<{ items: NamedRow[] }>('/cash-desks'),
        api.get<{ items: NamedRow[] }>('/organizations'),
      ]);
      setStores(s.items);
      setDesks(d.items);
      setOrgs(o.items);
      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setPending(false);
    }
  };

  const doPair = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ deviceId: string; deviceSecret: string; name: string }>(
        '/auth/pos-device/pair',
        { name, storeId, cashDeskId, organizationId },
      );
      // Kalit FAQAT shu javobda keladi — darhol saqlaymiz, aks holda
      // qurilmani qayta juftlash kerak bo'ladi.
      writePosDevice(res);
      router.replace('/kassa-kirish');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-navbar)]">
      <Container size="sm" className="py-10">
        <div className="rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] p-8 shadow-[var(--ms-shadow-lg)]">
          <h1 className="font-semibold text-xl">{t('pair_link')}</h1>
          {error && (
            <div className="mt-4">
              <Alert tone="destructive">{error}</Alert>
            </div>
          )}

          {step === 'login' ? (
            <form onSubmit={doLogin} className="mt-6 space-y-4">
              <FormField id="pair-id" label={t('admin_login')} required>
                <Input
                  id="pair-id"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </FormField>
              <FormField id="pair-pw" label={t('pin_label')} required>
                <PasswordInput
                  id="pair-pw"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  showLabel="show"
                  hideLabel="hide"
                />
              </FormField>
              <Button type="submit" disabled={pending}>
                {pending ? t('submitting') : t('submit')}
              </Button>
            </form>
          ) : (
            <form onSubmit={doPair} className="mt-6 space-y-4">
              <FormField id="pair-name" label={t('device_label')} required>
                <Input
                  id="pair-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </FormField>
              <Selector id="pair-store" rows={stores} value={storeId} onChange={setStoreId} />
              <Selector id="pair-desk" rows={desks} value={cashDeskId} onChange={setCashDeskId} />
              <Selector id="pair-org" rows={orgs} value={organizationId} onChange={setOrganizationId} />
              <Button
                type="submit"
                disabled={pending || !name || !storeId || !cashDeskId || !organizationId}
              >
                {pending ? t('submitting') : t('submit')}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </main>
  );
}

function Selector({
  id,
  rows,
  value,
  onChange,
}: {
  id: string;
  rows: NamedRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] p-2"
      required
    >
      <option value="">—</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
```

> **O'lchangan:** `api.get<T>(path)` / `api.post<T>(path, body)` — `api-client.ts:159-163`. Ro'yxat javobi `{ items: [...] }` — `cash-in/new/page.tsx:121-129`. `/stores`, `/cash-desks`, `/organizations` yo'llari o'sha sahifalarda ishlatilgan.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @moysklad/web vitest run src/__tests__/kassa-kirish-wiring.test.ts`
Expected: PASS (6 test)

- [ ] **Step 6: Typecheck + biome + i18n**

Run: `pnpm --filter @moysklad/web typecheck && pnpm biome check apps/web/src/app/kassa-kirish apps/web/src/components/pos/pin-keypad.tsx && pnpm i18n:gate`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/kassa-kirish apps/web/src/__tests__/kassa-kirish-wiring.test.ts
git commit -m "feat(kassa): /kassa-kirish pin ekrani va qurilma juftlash sahifasi"
git show --stat HEAD
```

---

### Task 14: Chiqish → PIN ekraniga qaytish

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx` (kiosk «Chiqish» yo'nalishi)
- Create: `apps/web/src/__tests__/kiosk-logout-redirect.test.ts`

**Interfaces:**
- Consumes: `readPosDevice` (Task 10), `isKioskUser` (mavjud).
- Produces: kiosk foydalanuvchi chiqqanda `/kassa-kirish` ga (qurilma juftlangan bo'lsa), aks holda `/login` ga.

- [ ] **Step 1: Mavjud chiqish yo'lini topish**

Run: `grep -n "logout" apps/web/src/app/\(app\)/layout.tsx`
Natijaga qarab quyidagi qadam moslanadi (fayl katta — aniq qatorni o'lchab ol).

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/__tests__/kiosk-logout-redirect.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(join(process.cwd(), 'src/app/(app)/layout.tsx'), 'utf8');

/**
 * Kassir chiqqanda email-login emas, PIN ekrani ochilishi kerak — aks holda
 * u parolni bilmaydi va kassa ishlamay qoladi.
 */
describe('kiosk chiqish yo‘nalishi', () => {
  it('layout /kassa-kirish ga yo‘naltirishni biladi', () => {
    expect(layout).toContain('/kassa-kirish');
  });

  it('qurilma juftlanganini tekshiradi (juftlanmagan holda /login qoladi)', () => {
    expect(layout).toContain('readPosDevice');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @moysklad/web vitest run src/__tests__/kiosk-logout-redirect.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement**

Chiqish handler'ida `router.replace('/login')` o'rniga:

```ts
  // Kassir parolni bilmaydi — chiqishdan keyin PIN ekrani ochilishi kerak.
  // Qurilma juftlanmagan bo'lsa PIN ekrani ham foydasiz ⇒ /login qoladi.
  const afterLogout = isKioskUser(user) && readPosDevice() ? '/kassa-kirish' : '/login';
  router.replace(afterLogout);
```

Import: `import { readPosDevice } from '@/lib/pos-device';`

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @moysklad/web vitest run src/__tests__/kiosk-logout-redirect.test.ts src/__tests__/kiosk-shell.test.ts`
Expected: ikkalasi ham PASS (mavjud kiosk-shell testi buzilmasin).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx" apps/web/src/__tests__/kiosk-logout-redirect.test.ts
git commit -m "feat(kassa): kiosk chiqishi pin ekraniga qaytaradi"
git show --stat HEAD
```

---

### Task 15: To'liq gate va brauzerda o'lchash

**Files:** yo'q (verifikatsiya taski).

- [ ] **Step 1: To'liq typecheck**

Run: `pnpm --filter @moysklad/money build && pnpm --filter @moysklad/api typecheck && pnpm --filter @moysklad/web typecheck`
Expected: 0 xato. (`@moysklad/money` avval quriladi — xotira: «money dist eskirishi».)

- [ ] **Step 2: Biome**

Run: `pnpm biome check apps/api/src/modules/auth apps/web/src/app/kassa-kirish apps/web/src/components/pos apps/web/src/lib/pos-device.ts`
Expected: 0 xato.

- [ ] **Step 3: To'liq test to'plami — API VA web**

Run: `pnpm --filter @moysklad/api vitest run && pnpm --filter @moysklad/web vitest run`
Expected: yangi regressiya yo'q. Yiqilgan test bo'lsa — **meniki ekanini yoki oldindan qizil ekanini** aniqlab yoz.

- [ ] **Step 4: i18n gate**

Run: `pnpm i18n:gate`
Expected: o'tadi.

- [ ] **Step 5: Brauzerda jonli o'lchash**

`pnpm dev` bilan:
1. `http://localhost:3100/kassa-kirish` → «juftlanmagan» ekrani ko'rinadi.
2. «Qurilmani juftlash» → admin bilan kirib do'kon/kassa/tashkilot tanlanadi → `/kassa-kirish` ga qaytadi.
3. PIN teriladi → `/sotuv` ochiladi.
4. Noto'g'ri PIN → xato ko'rinadi, maydon tozalanadi.
5. `/sotuv` da «Chiqish» → `/kassa-kirish` ga qaytadi (`/login` EMAS).

Har qadam natijasi yoziladi. Bu — xotira «brauzer-QA statik ko'rmaganini tutadi» sabog'i.

- [ ] **Step 6: Yakuniy hujjat**

`NEXT.md` ga hand-off yozuvi: nima tugadi, `.env` ga `POS_PIN_PEPPER` qo'shish kerakligi, va K5–K8 (Electron) hali qolgani. Yorliq: **«Phase-1 + API/brauzer runtime-o'lchangan; real kassa PC va printer — K8»**.

- [ ] **Step 7: Commit**

```bash
git add NEXT.md
git commit -m "docs(kassa): k1-k4 hand-off va qolgan qarz"
git show --stat HEAD
```

---

## Spec qoplamasi (self-review)

| Spec bo'limi | Task |
|---|---|
| §4.2 qurilma juftlash (`PosDevice`) | Task 2, 5, 7, 13 |
| §4.3 `posPinLookup` + unique | Task 1, 2, 4 |
| §4.4 `POST /auth/pos-login` | Task 6, 7 |
| §4.4 umumiy qo'riqchilar ajratilishi | Task 3 |
| §4.5 brute-force (qurilma qulfi) | Task 5, 9 |
| §4.6 idle-qulf o'zgarmaydi | Task 4 (mavjud `verifyPin` ga tegilmaydi) |
| §5 admin PIN berish | Task 8 |
| §7 web PIN ekrani + i18n | Task 12, 13 |
| §7 «Chiqish» → PIN ekrani | Task 14 |
| §9 testlar va gate'lar | har taskda + Task 15 |
| §12 qabul mezoni 1–5 | Task 9 (API) + Task 15 Step 5 (brauzer) |
| §12 qabul mezoni 6 (URL bilan kira olmaslik) | mavjud `kiosk.guard` — Task 7 Step 1 hujjatlovchi testi |

**Bu rejada YO'Q (K5–K8, alohida reja):** §3.1 offline ekrani · §3.2 exe'da server manzili · §6 butun Electron o'rami · §6.3 `electron-bridge-contract.test.ts` · §6.4 chop etish · §6.5 mijoz-ekran · §8 installer va autoupdate.
