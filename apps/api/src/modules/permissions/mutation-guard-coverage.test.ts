import 'reflect-metadata';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { OnboardingController } from '../onboarding/onboarding.controller.js';
import { PickListController } from '../pick-list/pick-list.controller.js';
import { RestockTaskController } from '../restock-task/restock-task.controller.js';
import { ShiftScheduleController } from '../shift-schedule/shift-schedule.controller.js';
import { SkladKeeperController } from '../sklad-keeper/sklad-keeper.controller.js';
import { SmenaController } from '../smena/smena.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { type PermissionScope, isAtLeast } from './permissions.types.js';
import { PERMISSION_META, type RequiredPermission } from './require-permission.decorator.js';

/**
 * Faza Q10 — «guard-siz mutatsiya endpointlari» (AUTH-07 klassi).
 *
 * MUAMMO: `PermissionsGuard` **opt-in** (`permissions.guard.ts:40` — talab
 * metadatasi bo'lmasa `true` qaytaradi). Ya'ni `@UseGuards(JwtAuthGuard)`
 * bilan yopilgan controller HAR autentifikatsiyalangan xodimga to'liq
 * ochiq: kompaniya sozlamasini almashtirish (`sklad-keepers`), ish
 * jadvali/smena CRUD (davomat + jarimaga ta'sir), POS qarz to'lovi (PUL) —
 * hammasi oddiy sotuvchi tokeni bilan bajarilardi.
 *
 * Bu fayl ikki qatlam:
 *   (A) HAR yopilgan endpoint uchun: ruxsatsiz aktor → 403, ruxsatli → o'tadi
 *       (haqiqiy `PermissionsGuard` + haqiqiy `Reflector` + controller
 *       prototipidagi HAQIQIY handler orqali — metadata «yozilgan-u
 *       o'qilmaydi» holati ham tutiladi).
 *   (B) KLASS-QULF: butun `apps/api` bo'yicha har `@Post/@Put/@Patch/@Delete`
 *       handler'i ruxsat/HR-ruxsat/rol-guard bilan yopilgan BO'LISHI shart —
 *       aks holda u OSHKORA allowlist'da sababi bilan turishi kerak.
 *       Yangi guard-siz mutatsiya qo'shilsa test qizil bo'ladi.
 */

// ─────────────────────────────────────────────────────────────────────────────
// (A) Endpoint-daraja: metadata + haqiqiy guard xulqi
// ─────────────────────────────────────────────────────────────────────────────

/** Aktorning (entity.action → scope) xaritasi bilan haqiqiy guard'ni quradi. */
function guardFor(scopes: Record<string, PermissionScope>) {
  const permissions = {
    require: async (
      _employeeId: string,
      entity: string,
      action: string,
      requiredScope: PermissionScope = 'OWN',
    ) => {
      const scope = scopes[`${entity}.${action}`] ?? 'NO';
      if (!isAtLeast(scope, requiredScope)) {
        throw new ForbiddenException(`Ruxsat yo'q: ${entity}.${action} (sizda: ${scope})`);
      }
      return scope;
    },
  };
  // Haqiqiy Reflector — dekorator metadatasi shu yo'l bilan o'qiladi.
  return new PermissionsGuard(
    new Reflector() as never,
    permissions as never,
    {
      verifyAccessToken: async () => ({ sub: 'emp-1', accountId: 'acc-1' }),
    } as never,
  );
}

function ctxFor(handler: unknown) {
  const req = {
    headers: { authorization: 'Bearer tok-1' },
    url: '/api/v1/test',
    user: { sub: 'emp-1', accountId: 'acc-1' },
  };
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

function permissionOf(handler: unknown): RequiredPermission | undefined {
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

/** [nom, handler, kutilgan entity, kutilgan action] */
const CLOSED: Array<[string, unknown, string, string]> = [
  // ── Kompaniya sozlamasi: sklad→omborchi (`/settings/sklad-keepers`)
  // `PUT /sklad-keepers/receipt-printer` olib tashlandi (B3): akkaunt-darajali
  // mijoz cheki printeri sozlamasi yo'q — chek qurilmaning Windows sukut
  // printeriga bosiladi.
  ['PUT /sklad-keepers', SkladKeeperController.prototype.upsert, 'settings', 'update'],
  ['DELETE /sklad-keepers/:skladNo', SkladKeeperController.prototype.remove, 'settings', 'delete'],

  // ── Ish jadvali (`/settings/shift-schedules`) — davomat/kechikish hisobiga asos
  ['POST /admin/shift-schedules', ShiftScheduleController.prototype.create, 'settings', 'create'],
  [
    'PATCH /admin/shift-schedules/:id',
    ShiftScheduleController.prototype.update,
    'settings',
    'update',
  ],
  [
    'DELETE /admin/shift-schedules/:id',
    ShiftScheduleController.prototype.remove,
    'settings',
    'delete',
  ],

  // ── Smena (`/settings/smena`) — kim qachon ishlaydi + kassa sessiyasi
  ['POST /admin/smenas', SmenaController.prototype.create, 'settings', 'create'],
  ['PATCH /admin/smenas/:id', SmenaController.prototype.update, 'settings', 'update'],
  ['DELETE /admin/smenas/:id', SmenaController.prototype.remove, 'settings', 'delete'],
  [
    'POST /admin/smenas/open-session',
    SmenaController.prototype.openSession,
    'cashiersession',
    'create',
  ],

  // ── MoySklad pull-triggeri (integratsiya amali — `onec` precedenti)
  ['POST /pick-lists/sync', PickListController.prototype.syncNow, 'settings', 'update'],

  // ── Vozvratdan omborchi vazifasi ochish
  [
    'POST /restock-tasks/from-sales-return',
    RestockTaskController.prototype.createFromSalesReturn,
    'salesreturn',
    'update',
  ],

  // ── Onboarding: akkaunt-BO'YLAB holatni buzuvchi amallar (`where: {accountId}`)
  ['POST /onboarding/skip', OnboardingController.prototype.skip, 'settings', 'update'],
  ['POST /onboarding/restart', OnboardingController.prototype.restart, 'settings', 'update'],
  ['POST /onboarding/override', OnboardingController.prototype.override, 'settings', 'update'],
];

describe('Faza Q10 — yopilgan mutatsiya endpointlari ruxsat talab qiladi', () => {
  it.each(CLOSED)('%s → metadata %s.%s', (_name, handler, entity, action) => {
    expect(permissionOf(handler)).toEqual({ entity, action });
  });

  it.each(CLOSED)('%s — ruxsatsiz aktor 403 oladi', async (_name, handler) => {
    const guard = guardFor({}); // hech qanday rol → hamma joyda 'NO'
    await expect(guard.canActivate(ctxFor(handler))).rejects.toThrow(ForbiddenException);
  });

  it.each(CLOSED)('%s — ruxsatli aktor o`tadi', async (_name, handler, entity, action) => {
    const guard = guardFor({ [`${entity}.${action}`]: 'ALL' });
    await expect(guard.canActivate(ctxFor(handler))).resolves.toBe(true);
  });

  it('POS qarz to`lovi kassa to`lovi bilan BIR XIL ruxsatda (TZ §3.6)', async () => {
    // `debtpayment.create` — operator (QarzOperatori) uchun ataylab YOPIQ.
    // Import dinamik: DebtController butun qarz-servis grafini tortadi.
    const { DebtController } = await import('../debt/debt.controller.js');
    expect(permissionOf(DebtController.prototype.posPay)).toEqual({
      entity: 'debtpayment',
      action: 'create',
    });
    const guard = guardFor({ 'debt.view': 'ALL', 'debtcardpayment.create': 'ALL' });
    await expect(guard.canActivate(ctxFor(DebtController.prototype.posPay))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('haydovchi magic-link faqat dispecherga (`GET /driver-tracking/link/:employeeId`)', async () => {
    const { DriverTrackingController } = await import(
      '../hr/driver-tracking/driver-tracking.controller.js'
    );
    const { DispatcherGuard } = await import('../hr/driver-tracking/dispatcher.guard.js');
    // GUARDS_METADATA ('@nestjs/common/constants') — subpath import ESM'da
    // kafolatlanmagani uchun literal ishlatiladi.
    const guards = (Reflect.getMetadata(
      '__guards__',
      DriverTrackingController.prototype.driverLink,
    ) ?? []) as unknown[];
    expect(guards).toContain(DispatcherGuard);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) Klass-qulf: butun API bo'yicha guard-siz mutatsiya = OSHKORA allowlist
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = join(__dirname, '..');

/**
 * ATAYLAB OCHIQ mutatsiyalar — har biri sababi bilan. Yangi qator qo'shish
 * = ongli qaror (review'da ko'rinadi); sabab yozilmasa qo'shmang.
 */
const INTENTIONALLY_OPEN: Record<string, string> = {
  // ── Autentifikatsiya sirti (token hali yo'q yoki self-scope) ──
  'AuthController#login': 'login — token shu yerda beriladi',
  'AuthController#refresh': 'refresh-token o`zi dalil',
  'AuthController#logout': 'o`z seansini yopish',
  'AuthController#updateMe': 'self-scope (user.sub)',
  'AuthController#changePassword': 'o`z paroli (eski parol talab qilinadi)',
  'AuthController#setPosPin': 'o`z POS-PIN kodi',
  'AuthController#verifyPosPin': 'PIN tekshiruvi — kassa oynasi',
  // Kassa .exe kirish nuqtasi: token SHU YERDA beriladi, demak ruxsat
  // tekshirib bo'lmaydi. Ochiq emas — ikki omil talab qilinadi: juftlangan
  // qurilma kaliti (argon2, `PosDeviceService.verify`) + PIN (lookup topadi,
  // argon2 tasdiqlaydi). Qurilmasiz so'rov 401 oladi.
  'AuthController#posLoginHandler': 'PIN-login — token shu yerda beriladi (qurilma kaliti + PIN)',
  // TSD (omborchi qo'l terminali) kirish nuqtasi — G5. Kassa yo'li bilan bir
  // xil sabab, LEKIN qat'iyroq: qurilma kaliti bu yerda MAJBURIY
  // (`TsdLoginSchema`), ya'ni kalitsiz so'rov 400 da to'xtaydi va PIN
  // maydoniga umuman yetib bormaydi.
  'AuthController#tsdLoginHandler':
    'TSD-login — token shu yerda beriladi (qurilma kaliti MAJBURIY + PIN)',
  // F7 kassir almashtirish: `@RequirePermission` ATAYLAB yo'q — kiosk
  // kassirining ruxsat matritsasida employee-huquqlari yo'q va bo'lmasligi
  // kerak. Himoya servisda, tartibda: kiosk-juftlik (qurilma kaliti YOKI
  // `uiMode==='kiosk'` token) → ochiq sessiya 409 → smena-a'zolik mezoni →
  // target PIN'i (mavjud 5-xato lockout) → fail-closed audit-yozuv.
  'AuthController#switchPosCashier': 'PIN-switch — kiosk-juftlik + a`zolik + PIN, audit bilan',

  // ── Webhook: autentifikatsiya = provayder imzosi / maxfiy token ──
  'ClickWebhookController#webhook': 'Click imzosi tekshiriladi',
  'PaymeWebhookController#webhook': 'Payme imzosi tekshiriladi',
  'TelegramWebhookController#webhook': 'Telegram secret-token (Faza 21)',
  'OnlineOrderWebhookController#receive':
    'kanal siri bilan HMAC imzo, xom tana ustidan, constant-time (F042)',

  // ── Magic-link (HMAC token URL ichida; accountId token ICHIDAN) ──
  'DriverPublicController#ping': 'haydovchi magic-link (driver-link.util HMAC)',
  'DriverPublicController#shiftStart': 'haydovchi magic-link',
  'DriverPublicController#shiftEnd': 'haydovchi magic-link',
  'PublicViewController#verify': 'publikatsiya tokeni',
  'PublicViewController#view': 'publikatsiya tokeni',
  // POST, GET emas: parol bilan himoyalangan havolada parol so'rov qatorida
  // (va nginx logida) ketmasligi uchun. Tana faqat token bilan ochiladi va
  // parolli publikatsiyada parol qayta tekshiriladi.
  'PublicViewController#document': 'publikatsiya tokeni (mijoz o`z chekini ko`radi)',
  'SupplyApprovalPublicController#confirm': 'qabul-tasdiq magic-link',
  'SupplyApprovalPublicController#reject': 'qabul-tasdiq magic-link',

  // ── Self-scope: yozuv egasi = token egasi (boshqa xodim nomidan MUMKIN EMAS) ──
  'DriverCashController#collect': 'driverId tanadan EMAS — user.sub',
  'DriverTrackingController#ping': 'employeeId = user.sub',
  'DriverTrackingController#startShift': 'employeeId = user.sub',
  'DriverTrackingController#endShift': 'employeeId = user.sub',
  'HrDavomatPingController#ping': 'employeeId = user.sub; PingSchema`da employeeId YO`Q',
  'HrDavomatPingController#optIn': 'o`z roziligi',
  'HrDavomatPingController#manualCheckIn': 'o`z davomati (geofence tekshiriladi)',
  'HrDavomatPingController#manualCheckOut': 'o`z davomati',
  'NotificationController#markRead': 'recipientId = user.sub',
  'NotificationController#markAllRead': 'recipientId = user.sub',
  'NotificationController#delete': 'recipientId = user.sub',
  'PresenceController#heartbeat': 'hujjat ko`rish belgisi (heartbeat)',
  'PresenceController#leave': 'heartbeat juftligi',
  'SavedFilterController#create': 'o`z filtri',
  'SavedFilterController#update': 'o`z filtri',
  'SavedFilterController#remove': 'o`z filtri',
  'UserSettingsController#update': 'o`z interfeys sozlamasi',

  // ── Egasining aniq qarori ──
  'ProductController#setDefaultSalePrice':
    'egasi qarori 2026-07-17: narxni har kassir o`zgartira oladi',

  // ── Additiv (buzmaydigan) wizard qadami ──
  'OnboardingController#completeStep':
    'wizard qadamini belgilaydi (additiv); skip/restart/override esa YOPILDI',

  // ── Faza Q10 DEFER: omborchi operatsion ekranlari ──
  // Sabab: mos entity-slug YO'Q (`msPickList` = MoySklad buyurtma+vozvrat
  // aralash; `restockTask` — o'z entity'si). Mavjud lug'atdan biror slug
  // olish = semantik yolg'on, yangi slug o'ylab topish = TAQIQ (reja §5).
  // Xavf: bu ikki ekran omborchining YAGONA sirti — noto'g'ri slug prodda
  // ombor ishini to'xtatadi (Faza 23 rol-matritsa hodisasi). Yechim:
  // `picklist`/`restocktask` entity + seed-matritsa + rol-UI — alohida faza.
  'PickListController#setPickState': 'DEFER Q10 — omborchi ekrani, mos entity-slug yo`q',
  'PickListController#markPrinted': 'DEFER Q10 — omborchi ekrani, mos entity-slug yo`q',
  'RestockTaskController#confirmLine': 'DEFER Q10 — omborchi ekrani, mos entity-slug yo`q',
  'RestockTaskController#confirmScan': 'DEFER Q10 — omborchi ekrani, mos entity-slug yo`q',
  'RestockTaskController#setShortage':
    'G6 — qator tasdiqlash bilan BIR sirt (yuqoridagi ikkisi kabi); chek tarkibini o`zgartirmaydi, faqat XABAR beradi',
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const MUTATION = /@(?:Post|Put|Patch|Delete)\(/;
/** Ruxsatni RBAC'siz, rol asosida hal qiluvchi guardlar. */
const ROLE_GUARD = /Dispatcher|Kiosk|HrPermission/;

interface Handler {
  key: string;
  file: string;
}

/** Har controller faylini skanlab mutatsiya-handlerlarini yig'adi. */
function scan(): { all: Handler[]; open: Handler[] } {
  const all: Handler[] = [];
  const open: Handler[] = [];
  const files = readdirSync(MODULES, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.controller.ts'))
    .map((p) => join(MODULES, p));

  for (const file of files) {
    const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/);
    let className = '';
    let classGuards = '';
    let inClassDecorators = false;
    let block: string[] = [];

    for (const line of lines) {
      const ctrl = line.match(/@Controller\(/);
      if (ctrl) {
        classGuards = '';
        inClassDecorators = true;
        block = [];
        continue;
      }
      if (inClassDecorators) {
        const g = line.match(/@UseGuards\(([^)]*)\)/);
        if (g) classGuards += g[1];
        const c = line.match(/export class (\w+)/);
        if (c) {
          className = c[1] ?? '';
          inClassDecorators = false;
        }
        continue;
      }
      if (/^\s*@/.test(line)) {
        block.push(line.trim());
        continue;
      }
      const m = line.match(/^\s*(?:async\s+)?(\w+)\s*\(/);
      if (m && block.length > 0) {
        const decorators = block.join(' ');
        if (MUTATION.test(decorators)) {
          const entry: Handler = {
            key: `${className}#${m[1]}`,
            file: file.replace(MODULES, '').replace(/\\/g, '/'),
          };
          all.push(entry);
          const handlerGuards = [...decorators.matchAll(/@UseGuards\(([^)]*)\)/g)]
            .map((x) => x[1])
            .join(',');
          const closed =
            /@RequirePermission\(/.test(decorators) ||
            /@RequireHrPermission\(/.test(decorators) ||
            ROLE_GUARD.test(classGuards) ||
            ROLE_GUARD.test(handlerGuards);
          if (!closed) open.push(entry);
        }
        block = [];
        continue;
      }
      if (line.trim() !== '' && !/^\s*[)\]}]/.test(line)) block = [];
    }
  }
  return { all, open };
}

describe('KLASS-QULF — guard-siz mutatsiya endpointi allowlist`da bo`lishi shart', () => {
  const { all, open } = scan();

  it('skaner ishlayapti (vakuum emas)', () => {
    expect(all.length).toBeGreaterThan(700);
    // Ma'lum ikki nuqta: biri yopilgan, biri ataylab ochiq.
    expect(all.some((h) => h.key === 'SkladKeeperController#upsert')).toBe(true);
    expect(open.some((h) => h.key === 'AuthController#login')).toBe(true);
  });

  it('yangi guard-siz mutatsiya YO`Q (allowlist to`liq)', () => {
    const unlisted = open
      .filter((h) => !(h.key in INTENTIONALLY_OPEN))
      .map((h) => `${h.key}  (${h.file})`);
    expect(
      unlisted,
      `Ruxsatsiz mutatsiya endpointi topildi. @RequirePermission qo'ying yoki\n` +
        `INTENTIONALLY_OPEN ga SABABI bilan qo'shing:\n${unlisted.join('\n')}`,
    ).toEqual([]);
  });

  it('allowlist eskirmagan — har qatori hali ham ochiq handler', () => {
    const openKeys = new Set(open.map((h) => h.key));
    const stale = Object.keys(INTENTIONALLY_OPEN).filter((k) => !openKeys.has(k));
    expect(
      stale,
      `Allowlist'da eskirgan qatorlar (endi yopiq yoki yo'q):\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('har allowlist qatorida sabab yozilgan', () => {
    const empty = Object.entries(INTENTIONALLY_OPEN)
      .filter(([, reason]) => reason.trim().length < 8)
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
