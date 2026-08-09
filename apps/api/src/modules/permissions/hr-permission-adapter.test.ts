/**
 * MK27 — HR `page × section × access` → ERP `entity × action × scope` adapter.
 *
 * TZ: docs/superpowers/specs/2026-08-01-menejer-tz-design.md §3.2.
 *
 * The lock this file exists for: the unification must be **decision-preserving**.
 * Today an HR endpoint is gated by a RANK (`own_only` < `read` < `full`,
 * `hr-permission.guard.ts`); after the merge the same endpoint is gated by an ERP
 * scope. If the adapter rounds a rank up, an HR-only employee silently gains
 * access nobody granted; if it rounds down, a working employee is locked out and
 * we find out in production. So the table test below asserts the FULL decision
 * matrix (have × need), not just "something got mapped".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HR_ACCESS_LEVELS, type HrAccessLevel } from '../hr/hr-auth/hr-permission.types.js';
import {
  HR_ADAPTER_ENTITIES,
  UnmappedHrPermissionError,
  erpDecision,
  hrDecision,
  hrRowKey,
  mapHrPermissionRow,
  requirementToErp,
} from './hr-permission-adapter.js';
import { SCOPE_ORDER } from './permissions.types.js';

/** Every row the HR permissions UI can write (apps/web/.../hr/employees/[id]/permissions/page.tsx). */
const UI_ROWS: Array<{ pageKey: string; section: string | null }> = [
  { pageKey: 'dashboard', section: null },
  { pageKey: 'messages', section: null },
  { pageKey: 'messages', section: 'demand' },
  { pageKey: 'messages', section: 'customer_order' },
  { pageKey: 'messages', section: 'payment_in' },
  { pageKey: 'messages', section: 'supply' },
  { pageKey: 'messages', section: 'sales_return' },
  { pageKey: 'reports', section: null },
  { pageKey: 'employees', section: null },
  { pageKey: 'tasks', section: null },
  { pageKey: 'oylik', section: null },
  { pageKey: 'activity', section: null },
  { pageKey: 'settings', section: null },
];

describe('HR→ERP adapter — totality (jadval-test)', () => {
  for (const row of UI_ROWS) {
    for (const access of HR_ACCESS_LEVELS) {
      it(`${hrRowKey(row.pageKey, row.section)} × ${access} → ERP ekvivalenti bor`, () => {
        const triples = mapHrPermissionRow({ ...row, accessLevel: access });
        expect(triples.length).toBeGreaterThan(0);
        for (const t of triples) {
          expect(Object.values(HR_ADAPTER_ENTITIES)).toContain(t.entity);
          expect(SCOPE_ORDER[t.scope]).toBeGreaterThan(0); // hech qachon 'NO' yozilmaydi
        }
      });
    }
  }

  it('har UI qatori uchun alohida entity — ikki HR sahifasi bitta slugni bo‘lishmaydi', () => {
    const slugs = UI_ROWS.map((r) => HR_ADAPTER_ENTITIES[hrRowKey(r.pageKey, r.section)]);
    expect(new Set(slugs).size).toBe(UI_ROWS.length);
  });

  it('bo‘lim nomining ikkala imlosi bir xil entity beradi', () => {
    // UI `demand` yozadi, `HR_MESSAGE_SECTIONS` esa `messages:demand` — ikkalasi
    // ham DB'da uchraydi, migratsiya ikkalasini ham tanishi shart.
    const a = mapHrPermissionRow({ pageKey: 'messages', section: 'demand', accessLevel: 'read' });
    const b = mapHrPermissionRow({
      pageKey: 'messages',
      section: 'messages:demand',
      accessLevel: 'read',
    });
    expect(a).toEqual(b);
  });
});

describe('HR→ERP adapter — fail-closed (jimgina tushib qolmaydi)', () => {
  it('notanish sahifa → xato', () => {
    expect(() =>
      mapHrPermissionRow({ pageKey: 'driver-tracking', section: null, accessLevel: 'read' }),
    ).toThrow(UnmappedHrPermissionError);
  });

  it('notanish bo‘lim → xato', () => {
    expect(() =>
      mapHrPermissionRow({ pageKey: 'messages', section: 'invoice_in', accessLevel: 'read' }),
    ).toThrow(UnmappedHrPermissionError);
  });

  it('notanish access darajasi → xato', () => {
    expect(() =>
      mapHrPermissionRow({ pageKey: 'reports', section: null, accessLevel: 'write' }),
    ).toThrow(UnmappedHrPermissionError);
  });

  it('xato xabari qaysi qator ekanini aytadi (hisobotga tushadi)', () => {
    expect(() =>
      mapHrPermissionRow({ pageKey: 'unknown_page', section: null, accessLevel: 'full' }),
    ).toThrow(/unknown_page/);
  });
});

describe('HR→ERP adapter — access darajasi shartnomasi (TZ §3.2)', () => {
  it('full → hamma amal ALL', () => {
    const t = mapHrPermissionRow({ pageKey: 'oylik', section: null, accessLevel: 'full' });
    expect(t.map((x) => x.action).sort()).toEqual(
      ['approve', 'create', 'delete', 'print', 'update', 'view'].sort(),
    );
    expect(t.every((x) => x.scope === 'ALL')).toBe(true);
  });

  it('read → FAQAT view, ALL', () => {
    const t = mapHrPermissionRow({ pageKey: 'oylik', section: null, accessLevel: 'read' });
    expect(t).toEqual([{ entity: HR_ADAPTER_ENTITIES.oylik, action: 'view', scope: 'ALL' }]);
  });

  it('own_only → FAQAT view, OWN', () => {
    const t = mapHrPermissionRow({ pageKey: 'tasks', section: null, accessLevel: 'own_only' });
    expect(t).toEqual([{ entity: HR_ADAPTER_ENTITIES.tasks, action: 'view', scope: 'OWN' }]);
  });
});

describe('HR→ERP adapter — qaror saqlanishi (kengayish VA torayish taqiqi)', () => {
  // `null` = xodimda bu sahifa uchun HR qatori yo'q.
  const HAVE: Array<HrAccessLevel | null> = [null, 'own_only', 'read', 'full'];

  for (const row of UI_ROWS) {
    for (const have of HAVE) {
      for (const need of HR_ACCESS_LEVELS) {
        it(`${hrRowKey(row.pageKey, row.section)}: have=${have ?? 'yo‘q'} need=${need} — ERP qarori HR qarori bilan bir xil`, () => {
          const req = { pageKey: row.pageKey, section: row.section, accessLevel: need };
          const before = hrDecision(have, need);
          const after = erpDecision(
            have === null ? [] : mapHrPermissionRow({ ...row, accessLevel: have }),
            requirementToErp(req),
          );
          expect(after).toBe(before);
        });
      }
    }
  }
});

describe('HR→ERP adapter — mavjud ERP imkoniyati BERILMAYDI', () => {
  /**
   * Eng qattiq qulf: adapter yozadigan entity slug'lari hech bir MAVJUD
   * `@RequirePermission({ entity: … })` bilan kesishmasligi kerak. Kesishsa —
   * HR sahifasiga ruxsati bor xodim migratsiyadan keyin ERP hujjatlarini ham
   * ocha oladi (masalan `messages:demand` → `demand` xaritalansa, HR bildirishnoma
   * o'quvchisi butun sotuv hujjatlarini o'qir edi).
   */
  function collectControllerEntities(dir: string, acc: Set<string>): Set<string> {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        collectControllerEntities(full, acc);
        continue;
      }
      if (!name.endsWith('.controller.ts')) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/entity:\s*'([a-z]+)'/g)) acc.add(m[1] as string);
    }
    return acc;
  }

  it('adapter entity’lari mavjud ERP controller entity’lari bilan kesishmaydi', () => {
    // __dirname = apps/api/src/modules/permissions
    const modules = join(__dirname, '..');
    const used = collectControllerEntities(modules, new Set<string>());
    expect(used.size).toBeGreaterThan(40); // skanerlash ishladi
    const collisions = Object.values(HR_ADAPTER_ENTITIES).filter((e) => used.has(e));
    expect(collisions).toEqual([]);
  });

  it('har adapter entity’si `PermissionEntity` union’ida bor', () => {
    const src = readFileSync(join(__dirname, 'permissions.types.ts'), 'utf8');
    const block = src.match(/export type PermissionEntity =([\s\S]*?);/)?.[1] ?? '';
    const union = new Set([...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as string));
    const missing = Object.values(HR_ADAPTER_ENTITIES).filter((e) => !union.has(e));
    expect(missing).toEqual([]);
  });
});
