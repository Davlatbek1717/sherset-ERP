import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RECORD_SCOPE_REGISTRY,
  type RegistryEntry,
  analyzeReadPath,
  buildCoverage,
  canEnableRecordScope,
  planFlagChange,
  repoRoot,
  scopedModelsFromSchema,
  summarize,
} from './record-scope-coverage.js';
import { ROLE_TEMPLATE_SLUGS, resolveTemplateMatrix } from './role-templates.js';

/**
 * MK39 — record-scope QAMROV HISOBOTI + `recordScopeEnforced` YOQISH DARVOZASI.
 *
 * Faza MK39 ning birinchi buyrug'i: «yoqishdan oldin qamrov hisobotini chiqar —
 * qoplanmagan endpoint bo'lsa YOQMA». Bu fayl o'sha darvozani deterministik
 * qulflaydi:
 *
 *   (A) `analyzeReadPath` — bitta servis manbasida record-scope o'qish-yo'li
 *       (list `recordScopeWhere` + detail `assertRecordAccess`) O'Z entity'si
 *       bilan ulanganmi. Izohdagi so'z va qo'shni entity'ning literali
 *       qamrov sifatida SANALMAYDI (yolg'on-yashil qamrovning bug-klassi).
 *   (B) REGISTR BUTUNLIGI — `schema.prisma` dagi har `{ownerId, groupId, shared}`
 *       modeli registrda turishi shart. Yangi scoped model qo'shilsa test qizil
 *       bo'ladi (jimgina qoplanmagan endpoint paydo bo'lmaydi).
 *   (C) SHRAPNEL/RATCHET — bugun majburlangan entity'lar (`demand`,
 *       `customerorder`) qaytib uzilib qolmaydi.
 *   (D) DARVOZA ↔ SXEMA INVARIANTI — `Account.recordScopeEnforced` sxema
 *       default'i AYNAN `canEnableRecordScope()` natijasiga teng bo'lishi shart.
 *       Ya'ni qamrovda teshik borligicha bayroqni default `true` qilib bo'lmaydi;
 *       qamrov yopilganda esa bu test default'ni yangilashni MAJBUR qiladi.
 */

// ─────────────────────────────────────────────────────────────────────────────
// (A) analyzeReadPath — manba tahlili
// ─────────────────────────────────────────────────────────────────────────────

describe('analyzeReadPath', () => {
  it('list-yo`lini o`z entity literali bilan tanidi', () => {
    const src = `
      const scoped = await this.permissions.recordScopeWhere(accountId, userId, 'demand', 'view');
    `;
    expect(analyzeReadPath(src, 'demand').list).toBe(true);
  });

  it('detail-yo`lini `assertRecordAccess` bo`yicha tanidi', () => {
    const src = `
      const allowed = await this.permissions.assertRecordAccess(accountId, userId, 'demand', 'view', rec);
    `;
    expect(analyzeReadPath(src, 'demand').detail).toBe(true);
  });

  it('BOSHQA entity literali qamrov sifatida SANALMAYDI', () => {
    const src = `
      const scoped = await this.permissions.recordScopeWhere(accountId, userId, 'demand', 'view');
    `;
    expect(analyzeReadPath(src, 'invoiceout')).toEqual({ list: false, detail: false });
  });

  it('IZOHDAGI eslatma qamrov sifatida SANALMAYDI', () => {
    const src = `
      // recordScopeWhere returns {} when the flag is off — 'demand' misolida.
      // assertRecordAccess ham shu 'demand' izohida eslatilgan.
      const where = baseWhere;
    `;
    expect(analyzeReadPath(src, 'demand')).toEqual({ list: false, detail: false });
  });

  it('entity yo`q (null) bo`lsa hech narsa majburlanmagan hisoblanadi', () => {
    const src = `recordScopeWhere(accountId, userId, 'demand', 'view')`;
    expect(analyzeReadPath(src, null)).toEqual({ list: false, detail: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (A2) buildCoverage / summarize / canEnableRecordScope — sof mantiq
// ─────────────────────────────────────────────────────────────────────────────

const ENFORCED_SRC = `
  recordScopeWhere(accountId, userId, 'demand', 'view');
  assertRecordAccess(accountId, userId, 'demand', 'view', rec);
`;
const PARTIAL_SRC = `recordScopeWhere(accountId, userId, 'demand', 'view');`;

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    model: 'Demand',
    entity: 'demand',
    service: 'apps/api/src/modules/demand/demand.service.ts',
    applicability: 'scoped',
    ...over,
  };
}

describe('buildCoverage', () => {
  it('list+detail ikkalasi bor → `enforced`', () => {
    const [row] = buildCoverage([entry()], () => ENFORCED_SRC);
    expect(row.status).toBe('enforced');
  });

  it('faqat list bor → `partial` (detail 404 himoyasi yo`q)', () => {
    const [row] = buildCoverage([entry()], () => PARTIAL_SRC);
    expect(row.status).toBe('partial');
  });

  it('servis bor, lekin hech biri ulanmagan → `missing`', () => {
    const [row] = buildCoverage([entry()], () => 'const x = 1;');
    expect(row.status).toBe('missing');
  });

  it('o`qish-yo`li servisi yo`q → `no-read-path`', () => {
    const [row] = buildCoverage([entry({ service: null, entity: null })], () => null);
    expect(row.status).toBe('no-read-path');
  });

  it('servis bor, lekin PermissionEntity slug`i yo`q → `no-entity`', () => {
    const [row] = buildCoverage([entry({ entity: null })], () => ENFORCED_SRC);
    expect(row.status).toBe('no-entity');
  });

  it('record-scope qo`llanmaydigan model → `not-applicable`', () => {
    const [row] = buildCoverage([entry({ applicability: 'not-applicable' })], () => ENFORCED_SRC);
    expect(row.status).toBe('not-applicable');
  });

  it('manba o`qilmasa yiqilmaydi — `missing` deb belgilanadi', () => {
    const [row] = buildCoverage([entry()], () => null);
    expect(row.status).toBe('missing');
  });
});

describe('canEnableRecordScope', () => {
  it('barcha scoped qator `enforced` bo`lsa — YOQISHGA RUXSAT', () => {
    const rows = buildCoverage([entry()], () => ENFORCED_SRC);
    expect(canEnableRecordScope(rows)).toEqual({ ok: true, blockers: [] });
  });

  it('bitta `missing` qator — YOQISH BLOKLANADI va sabab ko`rsatiladi', () => {
    const rows = buildCoverage(
      [entry(), entry({ model: 'InvoiceOut', entity: 'invoiceout', service: 'x.ts' })],
      (f) => (f === 'x.ts' ? 'const x = 1;' : ENFORCED_SRC),
    );
    const gate = canEnableRecordScope(rows);
    expect(gate.ok).toBe(false);
    expect(gate.blockers.join(' ')).toContain('InvoiceOut');
  });

  it('`partial` ham bloklaydi (detail teshigi = mavjudlik sizishi)', () => {
    const rows = buildCoverage([entry()], () => PARTIAL_SRC);
    expect(canEnableRecordScope(rows).ok).toBe(false);
  });

  it('`no-read-path` bloklaydi — o`qish-yo`li keyin qo`shilsa jimgina ochiq qoladi', () => {
    const rows = buildCoverage([entry({ service: null, entity: null })], () => null);
    expect(canEnableRecordScope(rows).ok).toBe(false);
  });

  it('`not-applicable` bloklamaydi', () => {
    const rows = buildCoverage([entry({ applicability: 'not-applicable' })], () => null);
    expect(canEnableRecordScope(rows).ok).toBe(true);
  });

  it('`no-entity` bloklaydi — slug`siz model hech qachon majburlanmaydi', () => {
    const rows = buildCoverage([entry({ entity: null })], () => ENFORCED_SRC);
    expect(canEnableRecordScope(rows).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (A3) planFlagChange — OPS yoqish/o`chirish qarori (asimmetrik ataylab)
// ─────────────────────────────────────────────────────────────────────────────

describe('planFlagChange', () => {
  it('darvoza ochiq + `on` → yoqiladi', () => {
    expect(planFlagChange({ target: 'on', gateOk: true }).action).toBe('enable');
  });

  it('darvoza YOPIQ + `on` → RAD ETILADI (MK39 ning asosiy qoidasi)', () => {
    const plan = planFlagChange({ target: 'on', gateOk: false });
    expect(plan.action).toBe('refuse');
    expect(plan.message).toMatch(/qamrov/i);
  });

  it('`off` darvozadan QAT`I NAZAR ishlaydi — bayroq qaytariladigan bo`lishi shart', () => {
    expect(planFlagChange({ target: 'off', gateOk: false }).action).toBe('disable');
    expect(planFlagChange({ target: 'off', gateOk: true }).action).toBe('disable');
  });
});

describe('summarize', () => {
  it('holatlar bo`yicha sanaydi', () => {
    const rows = buildCoverage(
      [entry(), entry({ model: 'InvoiceOut', entity: 'invoiceout', service: 'x.ts' })],
      (f) => (f === 'x.ts' ? 'const x = 1;' : ENFORCED_SRC),
    );
    const s = summarize(rows);
    expect(s.total).toBe(2);
    expect(s.enforced).toBe(1);
    expect(s.missing).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) REGISTR BUTUNLIGI — schema.prisma bilan solishtirish
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_PATH = join(repoRoot(), 'packages/db/prisma/schema.prisma');
const schemaText = readFileSync(SCHEMA_PATH, 'utf8');

describe('RECORD_SCOPE_REGISTRY butunligi', () => {
  it('schema.prisma dagi har scoped model registrda bor', () => {
    const inSchema = scopedModelsFromSchema(schemaText);
    const inRegistry = new Set(RECORD_SCOPE_REGISTRY.map((e) => e.model));
    const missing = inSchema.filter((m) => !inRegistry.has(m));
    expect(missing).toEqual([]);
  });

  it('registrda schema.prisma da yo`q model turmaydi (eskirgan qator)', () => {
    const inSchema = new Set(scopedModelsFromSchema(schemaText));
    const stale = RECORD_SCOPE_REGISTRY.filter((e) => !inSchema.has(e.model)).map((e) => e.model);
    expect(stale).toEqual([]);
  });

  it('registrda ko`rsatilgan har servis fayli mavjud', () => {
    const gone = RECORD_SCOPE_REGISTRY.filter((e) => e.service).filter((e) => {
      try {
        readFileSync(join(repoRoot(), e.service as string), 'utf8');
        return false;
      } catch {
        return true;
      }
    });
    expect(gone.map((e) => `${e.model} → ${e.service}`)).toEqual([]);
  });

  /**
   * MENING HUKMIMNI MASHINA TEKSHIRADI. `not-applicable` — bu qo'lda qo'yilgan
   * qaror, ya'ni «qulay» xato qilish mumkin bo'lgan yagona joy. Rol shablonlari
   * (MK29) esa mustaqil manba: agar biror shablon entity'ga `view` uchun ALL'dan
   * PAST scope bersa, demak o'sha entity uchun record-scope AYNAN farq qiladi va
   * uni «qo'llanmaydi» deb belgilash — yolg'on. Bu test shuni refute qiladi.
   */
  it('birorta rol shabloni ALL`dan past `view` bergan entity `not-applicable` BO`LMAYDI', () => {
    const subAll = new Set<string>();
    for (const slug of ROLE_TEMPLATE_SLUGS) {
      for (const cell of resolveTemplateMatrix(slug)) {
        if (cell.action !== 'view') continue;
        if (cell.scope === 'OWN' || cell.scope === 'OWN_GROUP' || cell.scope === 'OWN_AND_GROUP') {
          subAll.add(cell.entity);
        }
      }
    }
    expect(
      subAll.size,
      'shablonlarda umuman sub-ALL view yo`q — test bo`sh (vacuous)',
    ).toBeGreaterThan(0);

    const mislabelled = RECORD_SCOPE_REGISTRY.filter(
      (e) => e.applicability === 'not-applicable' && e.entity && subAll.has(e.entity),
    ).map((e) => `${e.model} (${e.entity})`);
    expect(mislabelled).toEqual([]);
  });

  it('har `not-applicable` / servissiz qator SABAB bilan hujjatlangan', () => {
    const undocumented = RECORD_SCOPE_REGISTRY.filter(
      (e) => (e.applicability === 'not-applicable' || !e.service) && !e.reason,
    );
    expect(undocumented.map((e) => e.model)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (C) RATCHET + (D) DARVOZA ↔ SXEMA INVARIANTI — haqiqiy repo ustida
// ─────────────────────────────────────────────────────────────────────────────

const liveRows = buildCoverage(RECORD_SCOPE_REGISTRY, (file) => {
  try {
    return readFileSync(join(repoRoot(), file), 'utf8');
  } catch {
    return null;
  }
});

describe('haqiqiy repo qamrovi', () => {
  it('RATCHET: bugun majburlangan entity`lar uzilib qolmaydi', () => {
    const enforced = new Set(
      liveRows.filter((r) => r.status === 'enforced').map((r) => r.entity as string),
    );
    // MK39 boshlanish nuqtasi (RFC W4): demand + customer-order.
    // Bu ro'yxat faqat O'SADI — qisqarsa test qizil.
    for (const e of ['demand', 'customerorder']) expect([...enforced]).toContain(e);
  });

  it('DARVOZA-SXEMA: `recordScopeEnforced` default AYNAN darvoza natijasiga teng', () => {
    const m = schemaText.match(/recordScopeEnforced\s+Boolean\s+@default\((true|false)\)/);
    expect(m, 'schema.prisma da Account.recordScopeEnforced topilmadi').toBeTruthy();
    const schemaDefault = m?.[1] === 'true';
    const gate = canEnableRecordScope(liveRows);
    expect(
      schemaDefault,
      gate.ok
        ? 'Qamrov TO`LIQ — endi sxema default`ini `true` qilish mumkin (MK39 yoqish qadami).'
        : `Qamrovda ${gate.blockers.length} teshik bor — default \`false\` bo'lishi SHART:\n` +
            gate.blockers.slice(0, 10).join('\n'),
    ).toBe(gate.ok);
  });
});
