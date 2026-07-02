import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ruMessages from '@/messages/ru.json' with { type: 'json' };
import uzMessages from '@/messages/uz.json' with { type: 'json' };
import { renderHookWithProviders } from '@/test-utils';
import { describe, expect, it } from 'vitest';
import { useAuditLabels } from './use-audit-labels';

/**
 * Guard for the History (Tarix) tab action-label i18n leak (2026-06-08l).
 *
 * The translateAction helper used to normalise only the `.` separator, so any
 * AuditLog action whose slug uses `:` (transition:posted, set:waiting,
 * create:cashout) or `-` (mass-edit) failed the `action_<key>` lookup and
 * rendered the RAW slug to the user — gate-invisible because tc/biome/unit
 * never render the tab. This locks: (1) every action slug the BE can emit
 * resolves to a localised, non-raw label in BOTH locales; (2) the well-grounded
 * states map to their dedicated labels; (3) an unmapped transition state
 * degrades to the generic "status changed" rather than leaking a slug.
 */

// Every distinct AuditLog action slug the BE can emit. This hard-coded list is
// the human-readable spec; the `source-scan` describe block below DERIVES the
// real list from apps/api at test time so it can never silently go stale — the
// `mark-printed` / `unmark-printed` / `delete-bank-account` leak (2026-06-08m)
// slipped past the 08l enumeration precisely because the list was hand-kept.
const BE_ACTION_SLUGS = [
  'create',
  'update',
  'delete',
  'restore',
  'restored',
  'archived',
  'clone',
  'mass-edit',
  'mark-printed',
  'unmark-printed',
  'delete-bank-account',
  'set:waiting',
  'clear:waiting',
  'create:cashout',
  'transition',
  'transition:posted',
  'transition:unposted',
  'transition:cancelled',
  'transition:draft',
  'transition:confirmed',
  'transition:sent',
  'transition:in_progress',
  'transition:completed',
  'transition:overdue',
  // dynamic customer-order / service-request long-tail states (`transition:${newState}`)
  // — these have no dedicated key and MUST degrade to the generic label, never raw.
  'transition:awaiting_payment',
  'transition:partially_shipped',
  'transition:paid',
];

describe('useAuditLabels.translateAction — no raw slug leaks', () => {
  it('renders a localised (non-raw) label for every BE action slug — uz (default locale)', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels());
    for (const slug of BE_ACTION_SLUGS) {
      const label = result.current.translateAction(slug);
      expect(label, `uz: "${slug}" leaked the raw slug`).not.toBe(slug);
      expect(String(label).length).toBeGreaterThan(0);
    }
  });

  it('renders a localised (non-raw) label for every BE action slug — ru', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels(), {
      messages: ruMessages as Record<string, unknown>,
    });
    for (const slug of BE_ACTION_SLUGS) {
      const label = result.current.translateAction(slug);
      expect(label, `ru: "${slug}" leaked the raw slug`).not.toBe(slug);
    }
  });
});

describe('useAuditLabels.translateAction — dedicated labels', () => {
  it('maps the well-grounded states + compound verbs to their dedicated labels (ru)', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels(), {
      messages: ruMessages as Record<string, unknown>,
    });
    const t = result.current.translateAction;
    expect(t('create')).toBe('Создано');
    expect(t('transition:posted')).toBe('Проведено');
    expect(t('transition:unposted')).toBe('Проведение снято');
    expect(t('transition:cancelled')).toBe('Отменено');
    expect(t('transition:in_progress')).toBe('В работе');
    expect(t('transition:completed')).toBe('Выполнено');
    expect(t('mass-edit')).toBe('Массовое редактирование');
    expect(t('clone')).toBe('Скопировано');
    expect(t('archived')).toBe('Архивировано');
    expect(t('mark-printed')).toBe('Напечатано');
    expect(t('unmark-printed')).toBe('Отметка о печати снята');
    expect(t('delete-bank-account')).toBe('Банковский счёт удалён');
  });

  it('degrades an unmapped transition state to the generic "status changed" — not a raw slug', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels(), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(result.current.translateAction('transition:partially_shipped')).toBe('Статус изменён');
    expect(result.current.translateAction('transition')).toBe('Статус изменён');
  });
});

describe('audit action-label i18n parity (ru ⇄ uz)', () => {
  const actionKeys = (m: typeof ruMessages) =>
    Object.keys((m as { audit: Record<string, string> }).audit).filter((k) =>
      k.startsWith('action_'),
    );

  it('every audit.action_* key exists in both ru and uz', () => {
    const ru = new Set(actionKeys(ruMessages));
    const uz = new Set(actionKeys(uzMessages as typeof ruMessages));
    expect(
      [...ru].filter((k) => !uz.has(k)),
      'in ru, missing from uz',
    ).toEqual([]);
    expect(
      [...uz].filter((k) => !ru.has(k)),
      'in uz, missing from ru',
    ).toEqual([]);
  });
});

/**
 * Guard for the History (Tarix) transition-DIFF enum-value i18n leak
 * (2026-06-08m — the residual the action-label fix left behind). Every FSM
 * transition writes `fieldChanges = { from: { before, after } }` where the
 * before/after are RAW state slugs (`in_progress`, `posted`, ...). They used to
 * render verbatim under the headline — a Cyrillic UI showing
 * `Статус: in_progress → completed`. `translateValue` maps them through the
 * grounded `states.<entity>` vocabulary, and `translateField('from')` through
 * `audit.field_from` («Статус» / «Holat»). Gate-invisible — only the History
 * tab renders this, and tc/biome/unit never mount it.
 */

// Every transition-emitting entity that has a live detail-page History tab,
// mapped to its auditEntity slug + the FSM states the BE can write as before/
// after (enumerated from `grep -rn "from: { before" apps/api/src/modules` +
// each module's state enum). ServiceRequest is omitted — it has no [id] detail
// page, so no History tab ever renders its transition diff.
const TRANSITION_ENTITY_STATES: Array<{ entity: string; states: string[] }> = [
  { entity: 'WorkOrder', states: ['draft', 'in_progress', 'completed', 'cancelled'] },
  { entity: 'Production', states: ['draft', 'posted', 'cancelled'] },
  {
    entity: 'CustomerOrder',
    states: [
      'draft',
      'confirmed',
      'awaiting_payment',
      'paid',
      'partially_shipped',
      'fully_shipped',
      'closed',
      'cancelled',
    ],
  },
  { entity: 'InvoiceOut', states: ['draft', 'posted', 'sent', 'overdue', 'cancelled'] },
  { entity: 'PurchaseOrder', states: ['draft', 'sent', 'confirmed', 'closed', 'cancelled'] },
  { entity: 'CashIn', states: ['draft', 'posted', 'cancelled'] },
  { entity: 'PaymentOut', states: ['draft', 'posted', 'cancelled'] },
  { entity: 'Demand', states: ['draft', 'posted', 'cancelled'] },
  { entity: 'Move', states: ['draft', 'posted', 'cancelled'] },
  { entity: 'ProcessingOrder', states: ['draft', 'posted', 'cancelled'] },
  { entity: 'CounterpartyAdjustment', states: ['draft', 'posted', 'cancelled'] },
  // Task is NOT a posting flow (open ↔ in_progress ↔ done/cancelled) but its
  // [id] page renders a History tab (auditEntity="Task"); its transition diff
  // now uses the standard `from: { before, after }` shape (task.service.ts).
  { entity: 'Task', states: ['open', 'in_progress', 'done', 'cancelled'] },
];

describe('useAuditLabels.translateValue — no raw FSM slug leaks in transition diffs', () => {
  for (const locale of [
    { name: 'uz (default)', messages: undefined },
    { name: 'ru', messages: ruMessages as Record<string, unknown> },
  ]) {
    it(`maps every FSM state to a localised (non-raw) label for every entity — ${locale.name}`, () => {
      for (const { entity, states } of TRANSITION_ENTITY_STATES) {
        const { result } = renderHookWithProviders(
          () => useAuditLabels(entity),
          locale.messages ? { messages: locale.messages } : undefined,
        );
        for (const state of states) {
          const label = result.current.translateValue('from', state, `transition:${state}`);
          expect(label, `${locale.name}: ${entity} state "${state}" leaked the raw slug`).not.toBe(
            state,
          );
          expect(String(label).length).toBeGreaterThan(0);
        }
      }
    });
  }

  it('maps the well-grounded states to their dedicated labels (ru)', () => {
    const wo = renderHookWithProviders(() => useAuditLabels('WorkOrder'), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(wo.result.current.translateValue('from', 'in_progress', 'transition:in_progress')).toBe(
      'В работе',
    );
    expect(wo.result.current.translateValue('from', 'completed', 'transition:completed')).toBe(
      'Выполнено',
    );
    const co = renderHookWithProviders(() => useAuditLabels('CustomerOrder'), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(
      co.result.current.translateValue('from', 'partially_shipped', 'transition:partially_shipped'),
    ).toBe('Частично отгружен');
    const cash = renderHookWithProviders(() => useAuditLabels('CashIn'), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(cash.result.current.translateValue('from', 'posted', 'transition:posted')).toBe(
      'Проведён',
    );
  });

  it('returns undefined for non-transition entries and non-"from" fields (default formatter)', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels('CashIn'), {
      messages: ruMessages as Record<string, unknown>,
    });
    // A regular update diff — must NOT be touched.
    expect(result.current.translateValue('comment', 'posted', 'update')).toBeUndefined();
    // The `from` field but a non-transition action — leave it alone.
    expect(result.current.translateValue('from', 'posted', 'update')).toBeUndefined();
    // Non-string value.
    expect(result.current.translateValue('from', 42, 'transition:posted')).toBeUndefined();
    // No entity passed → cannot resolve a per-entity map.
    const noEntity = renderHookWithProviders(() => useAuditLabels(), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(noEntity.result.current.translateValue('from', 'posted', 'transition:posted')).toBe(
      undefined,
    );
  });

  it('degrades an unmapped state to the raw slug — never worse than before', () => {
    const { result } = renderHookWithProviders(() => useAuditLabels('CashIn'), {
      messages: ruMessages as Record<string, unknown>,
    });
    // cash_in has no "frobnicated" state — falls back to the raw value, exactly
    // the pre-fix render (not a crash, not an empty string).
    expect(result.current.translateValue('from', 'frobnicated', 'transition:frobnicated')).toBe(
      'frobnicated',
    );
  });

  it('translateField maps the synthetic transition "from" key to «Статус» / «Holat»', () => {
    const ru = renderHookWithProviders(() => useAuditLabels('WorkOrder'), {
      messages: ruMessages as Record<string, unknown>,
    });
    expect(ru.result.current.translateField('from')).toBe('Статус');
    const uz = renderHookWithProviders(() => useAuditLabels('WorkOrder'));
    expect(uz.result.current.translateField('from')).toBe('Holat');
    // A real entity field is still translated through the fields namespace.
    expect(ru.result.current.translateField('description')).not.toBe('Статус');
  });
});

describe('states i18n parity (ru ⇄ uz) — transition-diff vocabulary', () => {
  const stateEntityKeys = (m: typeof ruMessages) =>
    Object.keys((m as { states: Record<string, unknown> }).states);

  it('every states.<entity> map exists in both ru and uz (incl. the new work_order + production)', () => {
    const ru = new Set(stateEntityKeys(ruMessages));
    const uz = new Set(stateEntityKeys(uzMessages as typeof ruMessages));
    expect(
      [...ru].filter((k) => !uz.has(k)),
      'in ru, missing from uz',
    ).toEqual([]);
    expect(
      [...uz].filter((k) => !ru.has(k)),
      'in uz, missing from ru',
    ).toEqual([]);
    // The two maps 08m added must be present.
    expect(ru.has('work_order')).toBe(true);
    expect(ru.has('production')).toBe(true);
    // The Task transition-diff map this session added (08n).
    expect(ru.has('task')).toBe(true);
  });
});

/**
 * SELF-MAINTAINING SOURCE-SCAN — the real fix for the staleness bug-class.
 *
 * The 08l action-label guard hand-listed the slugs the BE emits, and that list
 * went stale: `mark-printed` / `unmark-printed` (9 services) and
 * `delete-bank-account` (counterparty) were added later and leaked raw on the
 * History tab for months, invisible to every gate. This block DERIVES the slug
 * list from apps/api at test time, so a newly-added audit action that has no
 * i18n key fails CI immediately — no human bookkeeping required.
 */
describe('audit action slugs — source-scan (no raw slug can ever leak)', () => {
  const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
  const API_MODULES = join(REPO_ROOT, 'apps', 'api', 'src', 'modules');

  const tsFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...tsFiles(full));
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(full);
    }
    return out;
  };

  // Extract action-string literals from precisely the action position of an
  // audit write — the 3rd positional arg of `logAudit(acc, user, <ACTION>, …)`,
  // or the `action:` property INSIDE an `auditLog.create({ … })` call (scoped so
  // the ~1000 unrelated `action:` occurrences — zod `action: z.enum([…])`
  // schemas, `action: string` signatures — are not mistaken for audit slugs).
  // Both handle ternaries (`printed ? 'mark-printed' : 'unmark-printed'`).
  // Reading only the action expression (up to the next comma) avoids the
  // fieldChanges-literal false positives a looser scan would hit.
  // A template literal action (`transition:${state}`) emits its STATIC prefix +
  // a dynamic interpolation. Represent it by the prefix's leading token (e.g.
  // `transition`) so it exercises translateAction's degrade path — never the
  // embedded `${cond ? 'unposted' : 'cancelled'}` ternary literals, which are
  // interpolation parts, not standalone slugs (processing.service.ts:1308).
  const addSlugsFrom = (expr: string, slugs: Set<string>) => {
    if (expr.includes('`')) {
      const prefix = expr.match(/`([^`$]*)/)?.[1] ?? '';
      const token = prefix.replace(/[:_-]+$/, '');
      if (token) slugs.add(token);
      return;
    }
    for (const s of expr.matchAll(/['"]([a-zA-Z][a-zA-Z0-9:_-]*)['"]/g)) {
      if (s[1]) slugs.add(s[1]);
    }
  };

  const collectActionSlugs = (): Set<string> => {
    const slugs = new Set<string>();
    const logAuditArg = /logAudit\([^,]+,[^,]+,([^,]+),/g;
    const auditCreateAction = /auditLog\.create\(\s*\{[\s\S]{0,400}?\baction:\s*([^,\n}]+)/g;
    for (const file of tsFiles(API_MODULES)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(logAuditArg)) {
        if (m[1]) addSlugsFrom(m[1], slugs);
      }
      for (const m of src.matchAll(auditCreateAction)) {
        if (m[1]) addSlugsFrom(m[1], slugs);
      }
    }
    return slugs;
  };

  it('finds the audit-write call sites at all (scan sanity check)', () => {
    const slugs = collectActionSlugs();
    // A floor well below the real count — guards against a broken scan silently
    // passing because it matched nothing.
    expect(slugs.size).toBeGreaterThan(10);
    expect(slugs.has('create')).toBe(true);
    expect(slugs.has('mark-printed')).toBe(true);
    expect(slugs.has('transition:posted')).toBe(true);
  });

  for (const locale of [
    { name: 'ru', messages: ruMessages as Record<string, unknown> },
    { name: 'uz (default)', messages: undefined },
  ]) {
    it(`every BE audit action slug resolves to a localised (non-raw) label — ${locale.name}`, () => {
      const slugs = [...collectActionSlugs()].sort();
      const { result } = renderHookWithProviders(
        () => useAuditLabels(),
        locale.messages ? { messages: locale.messages } : undefined,
      );
      const leaked = slugs.filter((s) => String(result.current.translateAction(s)) === s);
      expect(
        leaked,
        `${locale.name}: these BE action slugs leak raw on the History tab — add audit.action_<key>: ${leaked.join(', ')}`,
      ).toEqual([]);
    });
  }
});
