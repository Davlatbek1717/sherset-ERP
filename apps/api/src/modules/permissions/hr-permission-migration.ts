/**
 * MK27 — HR ruxsatlarini yagona omborga ko'chirish rejasi (sof yadro).
 *
 * `scripts/migrate-hr-permissions.ts` faqat I/O qiladi: `hr_employee_permission`
 * qatorlarini o'qiydi, rol qatlamini o'qiydi, shu funksiyani chaqiradi va
 * hisobotni yozadi. Butun hukm shu yerda — bazasiz tekshiriladi.
 *
 * Ikki qat'iy qoida (ikkalasi ham `hr-permission-migration.test.ts` da qulflangan):
 *
 * 1. **Fail-closed** — bitta qator tushunilmasa yoki ziddiyatli bo'lsa, reja
 *    BUTUNLAY rad etiladi. «Yarim qo'llash» eng yomon holat: ruxsatlarning bir
 *    qismi ko'chgan, qolgani eski jadvalda qolgan bo'lardi va buni hech kim
 *    sezmasdi.
 * 2. **Kengayish taqiqi** — reja faqat `hr…` entity slug'lariga tegadi
 *    (adapter shunday qurilgan), ya'ni migratsiya hech kimga MAVJUD ERP
 *    imkoniyatini bermaydi.
 */
import {
  type ErpPermissionTriple,
  UnmappedHrPermissionError,
  hrRowKey,
  mapHrPermissionRow,
} from './hr-permission-adapter.js';
import {
  type PermissionAction,
  type PermissionEntity,
  type PermissionScope,
  SCOPE_ORDER,
} from './permissions.types.js';

/** `hr_employee_permission` jadvalining bir qatori. */
export interface HrPermissionRowInput {
  employeeId: string;
  pageKey: string;
  section: string | null;
  accessLevel: string;
}

export type PermissionChange = 'gained' | 'lost' | 'unchanged';

export interface MigrationPlanEntry extends ErpPermissionTriple {
  employeeId: string;
  /** Rol qatlamidan kelayotgan hozirgi scope (override yozilishidan oldin). */
  before: PermissionScope;
  change: PermissionChange;
}

export interface MigrationPlan {
  entries: MigrationPlanEntry[];
  errors: string[];
  /** `true` bo'lsa — HECH NIMA yozilmaydi (`--apply` ham to'xtaydi). */
  refused: boolean;
  summary: {
    employees: number;
    rows: number;
    gained: number;
    lost: number;
    unchanged: number;
    /** Ruxsati TUSHADIGAN xodimlar — hisobotda alohida ko'rsatiladi. */
    lostEmployees: string[];
  };
}

/** Rol qatlamidagi amaldagi scope'ni qaytaradi (skript DB'dan to'ldiradi). */
export type RoleScopeLookup = (
  employeeId: string,
  entity: PermissionEntity,
  action: PermissionAction,
) => PermissionScope;

function classify(before: PermissionScope, after: PermissionScope): PermissionChange {
  if (SCOPE_ORDER[after] > SCOPE_ORDER[before]) return 'gained';
  if (SCOPE_ORDER[after] < SCOPE_ORDER[before]) return 'lost';
  return 'unchanged';
}

export function planHrPermissionMigration(
  rows: HrPermissionRowInput[],
  roleScope: RoleScopeLookup,
): MigrationPlan {
  const errors: string[] = [];
  // Kalit: `${employeeId}|${entity}|${action}` — ziddiyatni shu yerda tutamiz.
  const chosen = new Map<string, { row: HrPermissionRowInput; triple: ErpPermissionTriple }>();
  const employees = new Set<string>();
  let mappedRows = 0;

  for (const row of rows) {
    let triples: ErpPermissionTriple[];
    try {
      triples = mapHrPermissionRow(row);
    } catch (err) {
      if (err instanceof UnmappedHrPermissionError) {
        errors.push(`xodim ${row.employeeId}: ${err.message}`);
        continue;
      }
      throw err;
    }
    employees.add(row.employeeId);
    mappedRows++;

    for (const triple of triples) {
      const key = `${row.employeeId}|${triple.entity}|${triple.action}`;
      const prev = chosen.get(key);
      if (prev && prev.triple.scope !== triple.scope) {
        errors.push(
          `xodim ${row.employeeId}: «${triple.entity}.${triple.action}» uchun ikki xil qiymat — ` +
            `«${hrRowKey(prev.row.pageKey, prev.row.section)}»=${prev.triple.scope} va ` +
            `«${hrRowKey(row.pageKey, row.section)}»=${triple.scope} (qaysi biri to‘g‘ri — odam hal qiladi)`,
        );
        continue;
      }
      chosen.set(key, { row, triple });
    }
  }

  if (errors.length > 0) {
    return {
      entries: [],
      errors,
      refused: true,
      summary: {
        employees: employees.size,
        rows: mappedRows,
        gained: 0,
        lost: 0,
        unchanged: 0,
        lostEmployees: [],
      },
    };
  }

  const entries: MigrationPlanEntry[] = [];
  const lostEmployees = new Set<string>();
  let gained = 0;
  let lost = 0;
  let unchanged = 0;

  for (const [key, { triple }] of chosen) {
    const employeeId = key.slice(0, key.indexOf('|'));
    const before = roleScope(employeeId, triple.entity, triple.action);
    const change = classify(before, triple.scope);
    if (change === 'gained') gained++;
    else if (change === 'lost') {
      lost++;
      lostEmployees.add(employeeId);
    } else unchanged++;
    entries.push({ employeeId, ...triple, before, change });
  }

  return {
    entries,
    errors,
    refused: false,
    summary: {
      employees: employees.size,
      rows: mappedRows,
      gained,
      lost,
      unchanged,
      lostEmployees: [...lostEmployees],
    },
  };
}
