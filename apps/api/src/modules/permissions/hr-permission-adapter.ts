/**
 * MK27 — HR ruxsat modelini ERP modeliga xaritalash (adapter).
 *
 * TZ: `docs/superpowers/specs/2026-08-01-menejer-tz-design.md` §3.2.
 *
 * Ikki parallel model bor:
 *   HR : `page × section × access`   (`own_only` < `read` < `full` — DARAJA/rank)
 *   ERP: `entity × action × scope`   (`NO` < `OWN` < … < `ALL`)
 *
 * ## Nega HR sahifalari MAVJUD ERP entity'lariga xaritalanmaydi
 *
 * Eng tabiiy ko'ringan xaritalash (`messages:demand → demand`, `oylik → payroll`,
 * `reports → report`, `tasks → task`, `employees → employee`) — **imtiyoz
 * kengaytmasi**. Kodda tekshirilgan holat: `hr-messages` HR ning Telegram
 * bildirishnoma jurnalini o'qiydi (`hr-messages.service.ts` → `hrTelegramOutbox`),
 * sotuv hujjatini EMAS; `hr-task-review` `hrTaskLog` ustida ishlaydi, ERP `task`
 * (CRM) ustida emas; `hr-salary` `hrSalaryConfig` ni, ERP `payroll` esa oylik
 * hujjatlarini boshqaradi. Ya'ni bir xil nomlar — boshqa domenlar. Xaritalansa,
 * HR sahifasiga ruxsati bor xodim migratsiyadan keyin ERP hujjatlarini ham
 * ocha olardi — buni HECH KIM bermagan bo'lardi.
 *
 * Shu sababli har HR qatori **o'ziga tegishli `hr…` entity slug'iga** xaritalanadi.
 * Bu slug'lar yangi: hech bir mavjud `@RequirePermission` ularni tekshirmaydi
 * (`hr-permission-adapter.test.ts` da kesishmaslik mexanik qulflangan), demak
 * migratsiya hech kimga MAVJUD imkoniyat bermaydi — faqat HR qatorlarini yagona
 * omborga ko'chiradi. `hr…` slugini keyinchalik mavjud ERP entity'siga qo'shib
 * yuborish — alohida, ODAM tasdiqlaydigan qaror (MK28+ qarzi), adapter ishi emas.
 *
 * ## Nega aynan shu access → scope jadvali
 *
 * TZ §3.2: `full → ALL`, `read → ALL (faqat view)`, `own_only → OWN`. Bu jadval
 * HR ning **daraja** semantikasini aynan saqlaydi: `hr-permission.guard.ts` dagi
 * 4×3 qaror matritsasi (have × need) ERP tomonda bir xil javob beradi —
 * `hr-permission-adapter.test.ts` shu ekvivalentlikni to'liq tekshiradi.
 * Ya'ni migratsiya na kengaytiradi, na toraytiradi.
 */
import { HR_ACCESS_LEVELS, type HrAccessLevel } from '../hr/hr-auth/hr-permission.types.js';
import {
  type PermissionAction,
  type PermissionEntity,
  type PermissionScope,
  isAtLeast,
} from './permissions.types.js';

/** HR qatori (DB'dagi `hr_employee_permission` yozuvi shakli). */
export interface HrPermissionSourceRow {
  pageKey: string;
  section: string | null;
  accessLevel: string;
}

/** ERP uch-ligi — `EmployeePermission` (MK26) qatoriga aynan mos keladi. */
export interface ErpPermissionTriple {
  entity: PermissionEntity;
  action: PermissionAction;
  scope: PermissionScope;
}

/**
 * Fail-closed: xaritalanmagan HR qatori JIMGINA TUSHIB QOLMAYDI.
 * Migratsiya skripti buni ushlab to'xtaydi (`--apply` hech nima yozmaydi).
 */
export class UnmappedHrPermissionError extends Error {
  constructor(
    readonly rowKey: string,
    reason: string,
  ) {
    super(`HR ruxsat qatori xaritalanmadi: «${rowKey}» — ${reason}`);
    this.name = 'UnmappedHrPermissionError';
  }
}

/**
 * `messages:demand` (`HR_MESSAGE_SECTIONS` konstantasi) va `demand` (HR UI
 * yozadigan imlo — `hr/employees/[id]/permissions/page.tsx`) — bir xil qator.
 * Ikkalasi ham DB'da uchraydi, shuning uchun kalit normallashtiriladi.
 */
function normalizeSection(pageKey: string, section: string | null): string | null {
  if (section === null || section === '') return null;
  const prefix = `${pageKey}:`;
  return section.startsWith(prefix) ? section.slice(prefix.length) : section;
}

/** HR qatorining kanonik kaliti: `page` yoki `page:section`. */
export function hrRowKey(pageKey: string, section: string | null): string {
  const s = normalizeSection(pageKey, section);
  return s === null ? pageKey : `${pageKey}:${s}`;
}

/**
 * HR qatori → ERP entity slug'i. HR UI yozadigan HAR 13 qator shu yerda —
 * ro'yxat to'liq (`hr-permission-adapter.test.ts` totallikni tekshiradi).
 */
export const HR_ADAPTER_ENTITIES: Record<string, PermissionEntity> = {
  dashboard: 'hrdashboard',
  messages: 'hrmessage',
  'messages:demand': 'hrmessagedemand',
  'messages:customer_order': 'hrmessageorder',
  'messages:payment_in': 'hrmessagepaymentin',
  'messages:supply': 'hrmessagesupply',
  'messages:sales_return': 'hrmessagereturn',
  reports: 'hrreport',
  employees: 'hremployee',
  tasks: 'hrtask',
  oylik: 'hrsalary',
  activity: 'hractivity',
  settings: 'hrsettings',
};

const ALL_ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete', 'approve', 'print'];

/** TZ §3.2 jadvali: access darajasi → (action, scope) juftliklari. */
const ACCESS_TO_ACTIONS: Record<HrAccessLevel, Array<[PermissionAction, PermissionScope]>> = {
  full: ALL_ACTIONS.map((a) => [a, 'ALL'] as [PermissionAction, PermissionScope]),
  read: [['view', 'ALL']],
  own_only: [['view', 'OWN']],
};

function assertAccessLevel(rowKey: string, accessLevel: string): HrAccessLevel {
  if (!(HR_ACCESS_LEVELS as readonly string[]).includes(accessLevel)) {
    throw new UnmappedHrPermissionError(
      rowKey,
      `notanish access darajasi «${accessLevel}» (kutilgan: ${HR_ACCESS_LEVELS.join(', ')})`,
    );
  }
  return accessLevel as HrAccessLevel;
}

function entityFor(rowKey: string): PermissionEntity {
  const entity = HR_ADAPTER_ENTITIES[rowKey];
  if (!entity) {
    throw new UnmappedHrPermissionError(rowKey, 'bunday sahifa/bo‘lim xaritada yo‘q');
  }
  return entity;
}

/** HR qatorini ERP uch-liklariga aylantiradi. Xaritalanmasa — XATO (fail-closed). */
export function mapHrPermissionRow(row: HrPermissionSourceRow): ErpPermissionTriple[] {
  const key = hrRowKey(row.pageKey, row.section);
  const entity = entityFor(key);
  const access = assertAccessLevel(key, row.accessLevel);
  return ACCESS_TO_ACTIONS[access].map(([action, scope]) => ({ entity, action, scope }));
}

/** ERP tomondagi talab — HR endpoint'i (`@RequireHrPermission`) ekvivalenti. */
export interface ErpRequirement {
  entity: PermissionEntity;
  action: PermissionAction;
  minScope: PermissionScope;
}

/**
 * HR endpoint talabi → ERP talabi.
 *
 * `full` talabi `update:ALL` ga tushadi (yozuv amali), `read` → `view:ALL`,
 * `own_only` → `view:OWN`. Shu tanlov tufayli daraja tartibi saqlanadi:
 * `read` egasi `own_only` talabidan o'tadi (bugungi `ACCESS_RANK` xulqi), lekin
 * `full` talabidan o'tmaydi.
 */
export function requirementToErp(req: HrPermissionSourceRow): ErpRequirement {
  const key = hrRowKey(req.pageKey, req.section);
  const entity = entityFor(key);
  const access = assertAccessLevel(key, req.accessLevel);
  if (access === 'full') return { entity, action: 'update', minScope: 'ALL' };
  if (access === 'read') return { entity, action: 'view', minScope: 'ALL' };
  return { entity, action: 'view', minScope: 'OWN' };
}

/** Bugungi HR qarori (`hr-permission.guard.ts` dagi `ACCESS_RANK` mantiqi). */
export function hrDecision(have: HrAccessLevel | null, need: HrAccessLevel): boolean {
  if (have === null) return false;
  const rank: Record<HrAccessLevel, number> = { own_only: 1, read: 2, full: 3 };
  return rank[have] >= rank[need];
}

/** Migratsiyadan keyingi ERP qarori — xodimning uch-liklari talabga yetadimi. */
export function erpDecision(granted: ErpPermissionTriple[], req: ErpRequirement): boolean {
  const scope = granted.find((t) => t.entity === req.entity && t.action === req.action)?.scope;
  return scope !== undefined && isAtLeast(scope, req.minScope);
}
