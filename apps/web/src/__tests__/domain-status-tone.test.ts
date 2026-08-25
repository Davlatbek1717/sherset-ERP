import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ABC_CLASS_TONE,
  BALANCE_SIDE_TONE,
  BANK_IMPORT_STATE_TONE,
  BONUS_FINE_TONE,
  CALL_DIRECTION_TONE,
  CALL_STATUS_TONE,
  CHANNEL_KIND_TONE,
  DEBT_SOURCE_TONE,
  DELIVERY_STATUS_TONE,
  HR_MESSAGE_STATUS_TONE,
  HR_TASK_LOG_STATUS_TONE,
  HR_TASK_PRIORITY_TONE,
  LEGAL_STATUS_TONE,
  MONEY_FLOW_TONE,
  MXIK_SOURCE_TONE,
  OPPORTUNITY_STATUS_TONE,
  SERVICE_REQUEST_PRIORITY_TONE,
  SERVICE_REQUEST_STATUS_TONE,
  TASK_STATUS_TONE,
  abcClassTone,
  activeTone,
  auditActionTone,
  callStatusTone,
  inventoryPriorityTone,
  syncStatusTone,
  systemTone,
} from '../lib/domain-status-tone';

/**
 * Canonical domain-status → Badge tone maps — permanent drift-lock (UI Convention 6).
 *
 * Bug-class (2026-06-10 recon, 5-agent discovery sweep): 38 surfaces declared
 * their own `statusTone()` helpers / `*_TONE` maps for non-document status
 * vocabularies, including byte-identical duplicate pairs (calls list ↔
 * calls-section, hr/my-tasks ↔ hr task logs-table, email-log ↔ webhook
 * deliveries, tasks list ↔ detail) — and the duplication had already produced
 * four real drifts (opportunity `open` info-vs-brand, money flow `out`
 * warning-vs-destructive, ABC class DS-tones-vs-raw-emerald/indigo/slate,
 * channel-sync null destructive-vs-hidden). Same root cause as the document
 * STATE_TONE story (Convention 1) and archivedTone (Convention 7): per-page
 * copies drift silently.
 *
 * The fix consolidated every map onto `lib/domain-status-tone.ts`. This guard:
 *   1. locks every canonical map's values (a recolour is a deliberate,
 *      reviewed edit of the lib — not a page-local fork);
 *   2. locks the resolver fallbacks (null/unknown → neutral; sync null → null);
 *   3. drift-lock source-scan: NO page/component re-declares a local
 *      domain-status tone map/helper (proven non-vacuous below);
 *   4. adoption: migrated surfaces import + use the shared helpers, and the
 *      D-track files no longer carry their raw status colour classes.
 */

describe('canonical domain maps — values locked', () => {
  const EXPECT: Record<string, [Record<string, string>, Record<string, string>]> = {
    CALL_STATUS_TONE: [
      CALL_STATUS_TONE,
      { scheduled: 'warning', completed: 'success', missed: 'destructive', cancelled: 'neutral' },
    ],
    CALL_DIRECTION_TONE: [CALL_DIRECTION_TONE, { in: 'info', out: 'success' }],
    TASK_STATUS_TONE: [
      TASK_STATUS_TONE,
      { open: 'info', in_progress: 'warning', done: 'success', cancelled: 'neutral' },
    ],
    OPPORTUNITY_STATUS_TONE: [
      OPPORTUNITY_STATUS_TONE,
      { open: 'info', won: 'success', lost: 'destructive' },
    ],
    SERVICE_REQUEST_STATUS_TONE: [
      SERVICE_REQUEST_STATUS_TONE,
      {
        new: 'info',
        in_progress: 'warning',
        waiting_customer: 'warning',
        resolved: 'success',
        closed: 'neutral',
        cancelled: 'destructive',
      },
    ],
    SERVICE_REQUEST_PRIORITY_TONE: [
      SERVICE_REQUEST_PRIORITY_TONE,
      { low: 'neutral', normal: 'neutral', high: 'warning', critical: 'destructive' },
    ],
    HR_TASK_LOG_STATUS_TONE: [
      HR_TASK_LOG_STATUS_TONE,
      {
        answered_yes: 'success',
        answered_text: 'success',
        approved: 'success',
        answered_no: 'destructive',
        rejected: 'destructive',
        failed: 'destructive',
        pending_review: 'warning',
        sent: 'neutral',
      },
    ],
    HR_MESSAGE_STATUS_TONE: [
      HR_MESSAGE_STATUS_TONE,
      // `sending` — Faza 28 outbox claim (worker in flight), see outbox-claim.ts
      {
        sent: 'success',
        pending: 'neutral',
        sending: 'info',
        retry: 'warning',
        failed: 'destructive',
      },
    ],
    HR_TASK_PRIORITY_TONE: [HR_TASK_PRIORITY_TONE, { urgent: 'destructive', high: 'warning' }],
    BONUS_FINE_TONE: [BONUS_FINE_TONE, { bonus: 'success', fine: 'destructive' }],
    DELIVERY_STATUS_TONE: [
      DELIVERY_STATUS_TONE,
      // `sending` — Faza 28 outbox claim (worker in flight), see outbox-claim.ts
      {
        sent: 'success',
        pending: 'warning',
        sending: 'info',
        dead: 'destructive',
        failed: 'destructive',
      },
    ],
    MXIK_SOURCE_TONE: [
      MXIK_SOURCE_TONE,
      { soliq: 'success', manual: 'brand', override: 'warning' },
    ],
    CHANNEL_KIND_TONE: [
      CHANNEL_KIND_TONE,
      {
        telegram: 'info',
        instagram: 'warning',
        website: 'success',
        marketplace_uzum: 'info',
        marketplace_olcha: 'warning',
        custom: 'neutral',
      },
    ],
    MONEY_FLOW_TONE: [MONEY_FLOW_TONE, { in: 'success', out: 'destructive' }],
    BANK_IMPORT_STATE_TONE: [
      BANK_IMPORT_STATE_TONE,
      { committed: 'success', cancelled: 'destructive' },
    ],
    ABC_CLASS_TONE: [ABC_CLASS_TONE, { A: 'success', B: 'warning', C: 'destructive' }],
    BALANCE_SIDE_TONE: [
      BALANCE_SIDE_TONE,
      { debtor: 'success', creditor: 'destructive', settled: 'neutral' },
    ],
    LEGAL_STATUS_TONE: [LEGAL_STATUS_TONE, { Juridical: 'brand', Natural: 'success' }],
    // Q4 (2026-08-25) — qarz manbasi. Ikkalasi ham NEYTRAL turkumda: manba
    // «yomon/yaxshi» emas, u faqat kelib chiqish; ogohlantirish rangi
    // undirish ekranidagi KECHIKISH belgisiga tegishli, manbaga emas.
    DEBT_SOURCE_TONE: [DEBT_SOURCE_TONE, { retailsale: 'info', registry: 'neutral' }],
  };
  for (const [name, [actual, expected]] of Object.entries(EXPECT)) {
    it(`${name} matches the canon exactly (no extra/missing keys)`, () => {
      expect(actual).toEqual(expected);
    });
  }
  it('INVENTORY_PRIORITY_TONE via resolver', () => {
    expect(inventoryPriorityTone('overdue')).toBe('destructive');
    expect(inventoryPriorityTone('due_today')).toBe('warning');
    expect(inventoryPriorityTone('due_soon')).toBe('info');
  });
});

describe('resolvers — fallback + boolean helpers', () => {
  it('unknown / null / undefined → neutral (same fallback the old per-page helpers used)', () => {
    expect(callStatusTone('definitely_unknown')).toBe('neutral');
    expect(callStatusTone(null)).toBe('neutral');
    expect(abcClassTone(undefined)).toBe('neutral');
  });
  it('activeTone: active → success, inactive → neutral', () => {
    expect(activeTone(true)).toBe('success');
    expect(activeTone(false)).toBe('neutral');
  });
  it('systemTone: system → brand (a kind, not an outcome), custom → neutral', () => {
    expect(systemTone(true)).toBe('brand');
    expect(systemTone(false)).toBe('neutral');
  });
  it('syncStatusTone: true → success, false → destructive, null/undefined → null (NO badge — unknown is not an error)', () => {
    expect(syncStatusTone(true)).toBe('success');
    expect(syncStatusTone(false)).toBe('destructive');
    expect(syncStatusTone(null)).toBeNull();
    expect(syncStatusTone(undefined)).toBeNull();
  });
  it('auditActionTone: substring branches in load-bearing order', () => {
    expect(auditActionTone('create')).toBe('success');
    expect(auditActionTone('bulk-delete')).toBe('destructive');
    expect(auditActionTone('cancel')).toBe('destructive');
    expect(auditActionTone('transition:posted')).toBe('info');
    expect(auditActionTone('update')).toBe('warning');
    expect(auditActionTone('archive')).toBe('warning');
    expect(auditActionTone('mass-edit')).toBe('neutral');
    // order is load-bearing: 'create' is matched before 'delete'
    expect(auditActionTone('delete-created')).toBe('success');
  });
});

const SRC = join(__dirname, '..');
const APP = join(SRC, 'app', '(app)');
const COMPONENTS = join(SRC, 'components');

function srcFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((p) => (p.endsWith('.tsx') || p.endsWith('.ts')) && !p.includes('__tests__'))
    .map((p) => join(dir, p));
}

/**
 * Banned shapes — a page/component re-declaring a domain-status tone mapping
 * instead of importing it from lib/domain-status-tone.
 * (Document `*STATE_TONE` maps are banned by document-state-tone.test.ts; the
 * archived→tone literal pair by archived-tone.test.ts.)
 */
const BAN_NAMED_MAP =
  /const\s+[A-Z_]*(?:STATUS|PRIORITY|KIND|SOURCE|CLASS|SIDE|ACTION|FLOW|DIRECTION)[A-Z_]*_TONE\s*[:=]/;
const BAN_LOCAL_HELPER =
  /(?:const|function)\s+(?:statusTone|directionTone|actionTone|classTone|sideTone|priorityTone|kindTone)\s*[=(]/;
const BAN_ISACTIVE_PAIR = /\.isActive\s*\?\s*'success'\s*:\s*'neutral'/;
/**
 * INLINE map indexed on the spot — `{ moving: 'success', stopped: 'warning' }[d.status]`.
 *
 * MASTER-TODO #29 (2026-07-28): found by mutation-testing the new pre-push
 * guard gate. Reverting a consolidated helper to an inline object slipped past
 * all three patterns above (nothing is named, nothing is declared), so the
 * consolidation could be undone silently — the exact drift this file exists to
 * stop. Requires >=2 tone-valued keys AND an immediate index, so ordinary
 * option/label objects are untouched.
 */
const TONE = "(?:'(?:success|warning|destructive|neutral|info|brand)')";
const BAN_INLINE_MAP = new RegExp(
  `\\{\\s*\\w+\\s*:\\s*${TONE}\\s*,(?:\\s*\\w+\\s*:\\s*${TONE}\\s*,?)+\\s*\\}\\s*\\[`,
);

function offends(src: string): boolean {
  return (
    BAN_NAMED_MAP.test(src) ||
    BAN_LOCAL_HELPER.test(src) ||
    BAN_ISACTIVE_PAIR.test(src) ||
    BAN_INLINE_MAP.test(src)
  );
}

describe('drift-lock: no surface re-declares a domain-status tone mapping', () => {
  it('detector is non-vacuous (flags the pre-fix shapes)', () => {
    // the exact shapes that existed on the 38 pre-fix surfaces:
    expect(offends("const STATUS_TONE: Record<string, 'neutral'> = { new: 'info' };")).toBe(true);
    expect(offends("const PRIORITY_TONE = { low: 'neutral' };")).toBe(true);
    expect(offends("const KIND_BADGE_TONE = { telegram: 'info' };")).toBe(true);
    expect(offends("const statusTone = (s: Call['status']) => 'success';")).toBe(true);
    expect(offends("function actionTone(action: string) { return 'neutral'; }")).toBe(true);
    expect(
      offends("const classTone = (c: ClassGroup) => (c === 'A' ? 'success' : 'warning');"),
    ).toBe(true);
    expect(offends("tone={tpl.isActive ? 'success' : 'neutral'}")).toBe(true);
    // Inline map indexed on the spot — the hole a mutation test found (#29).
    expect(offends("tone={{ moving: 'success', stopped: 'warning' }[d.status]}")).toBe(true);
    // …but an ordinary options/label object must NOT trip it.
    expect(offends("const OPTIONS = { draft: 'Черновик', posted: 'Проведён' };")).toBe(false);
    expect(offends("const cfg = { tone: 'success' };")).toBe(false);
    // helper IMPORTS and call sites are NOT flagged:
    expect(offends("import { callStatusTone } from '@/lib/domain-status-tone';")).toBe(false);
    expect(offends('tone={taskStatusTone(data.status)}')).toBe(false);
    expect(offends("tone={data.archived ? 'neutral' : taskStatusTone(data.status)}")).toBe(false);
    expect(offends('tone={activeTone(tpl.isActive)}')).toBe(false);
  });

  it('every app page + component resolves domain statuses via lib/domain-status-tone', () => {
    const offenders: string[] = [];
    for (const file of [...srcFiles(APP), ...srcFiles(COMPONENTS)]) {
      if (offends(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(SRC, '').replace(/\\/g, '/'));
      }
    }
    expect(
      offenders,
      `These surfaces must import from '@/lib/domain-status-tone' instead of declaring a local map/helper:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('adoption: migrated surfaces use the shared helpers', () => {
  const FILES: Array<[string, string[]]> = [
    [join(COMPONENTS, 'calls-section.tsx'), ['callStatusTone', 'callDirectionTone']],
    [join(APP, 'calls', 'page.tsx'), ['callStatusTone', 'callDirectionTone']],
    [join(APP, 'tasks', 'page.tsx'), ['taskStatusTone']],
    [join(APP, 'tasks', '[id]', 'page.tsx'), ['taskStatusTone']],
    [join(APP, 'opportunities', 'page.tsx'), ['opportunityStatusTone']],
    [join(APP, 'opportunities', '[id]', 'page.tsx'), ['opportunityStatusTone']],
    [
      join(APP, 'service-requests', 'page.tsx'),
      ['serviceRequestStatusTone', 'serviceRequestPriorityTone'],
    ],
    // MASTER-TODO #10 (2026-07-28): the Telegram-messages panel moved out of
    // /hr when that page was rewritten attendance-first (HR Faza 5) — the
    // status badges now live on /hr/messages, which uses the helper. Pointing
    // at the old file demanded a badge the page no longer renders.
    [join(APP, 'hr', 'messages', 'page.tsx'), ['hrMessageStatusTone']],
    [join(APP, 'hr', 'my-tasks', 'page.tsx'), ['hrTaskLogStatusTone']],
    [join(APP, 'hr', 'messages', 'page.tsx'), ['hrMessageStatusTone']],
    [join(APP, 'hr', 'tasks', 'page.tsx'), ['hrTaskPriorityTone', 'activeTone']],
    [join(APP, 'hr', 'tasks', '_components', 'logs-table.tsx'), ['hrTaskLogStatusTone']],
    [join(APP, 'hr', 'payroll', 'page.tsx'), ['bonusFineTone']],
    [join(APP, 'hr', 'attendance', 'page.tsx'), ['activeTone']],
    [join(APP, 'hr', 'settings', 'telegram', 'page.tsx'), ['activeTone']],
    [join(APP, 'hr', 'settings', 'roles', 'page.tsx'), ['systemTone']],
    [join(APP, 'settings', 'audit-log', 'page.tsx'), ['auditActionTone', 'translateAction']],
    [join(APP, 'settings', 'mxik', 'page.tsx'), ['mxikSourceTone']],
    [join(APP, 'settings', 'email', 'log', 'page.tsx'), ['deliveryStatusTone']],
    [join(APP, 'settings', 'webhooks', '[id]', 'deliveries', 'page.tsx'), ['deliveryStatusTone']],
    [join(APP, 'ecommerce', 'channels', 'page.tsx'), ['channelKindTone', 'syncStatusTone']],
    [join(APP, 'ecommerce', 'channels', '[id]', 'page.tsx'), ['syncStatusTone']],
    [join(APP, 'money', 'page.tsx'), ['moneyFlowTone']],
    [join(APP, 'bank-import', 'page.tsx'), ['moneyFlowTone', 'bankImportStateTone']],
    [join(APP, 'reports', 'counterparty-balance', 'page.tsx'), ['balanceSideTone', 'archivedTone']],
    [join(APP, 'reports', 'abc-analysis', 'page.tsx'), ['abcClassTone']],
    [join(APP, 'retail', 'page.tsx'), ['documentStateTone', 'RETAIL_SESSION_STATE_TONE']],
    [join(APP, 'analitika', 'xodimlar', 'page.tsx'), ['archivedTone']],
    [join(APP, 'analitika', 'xodimlar', 'men', 'page.tsx'), ['archivedTone']],
    [join(APP, 'analitika', 'xodimlar', '[id]', 'page.tsx'), ['archivedTone', 'systemTone']],
    [join(APP, 'analitika', 'xodimlar', '_components', 'staff-form.tsx'), ['systemTone']],
    [join(APP, 'analitika', 'sozlamalar', '_components', 'roles-list-view.tsx'), ['systemTone']],
    [join(APP, 'analitika', 'sozlamalar', '_components', 'role-detail-view.tsx'), ['systemTone']],
    [join(APP, 'analitika', 'kontragentlar', 'page.tsx'), ['legalStatusTone']],
    [
      join(APP, 'analitika', 'inventerizatsiya', '_components', 'cycle-view.tsx'),
      ['inventoryPriorityTone', 'abcClassTone'],
    ],
  ];
  for (const [file, helpers] of FILES) {
    const label = file.replace(SRC, '').replace(/\\/g, '/');
    it(`${label} uses ${helpers.join(' + ')}`, () => {
      const src = readFileSync(file, 'utf8');
      for (const h of helpers) {
        expect(src, `${label} must use ${h}(…)`).toMatch(new RegExp(`${h}\\s*\\(|${h}\\b`));
      }
    });
  }
});

describe('D-track: raw status colour classes are gone from the migrated files', () => {
  const NO_RAW: Array<[string, RegExp]> = [
    [join(APP, 'analitika', 'kontragentlar', 'page.tsx'), /bg-(?:blue|emerald)-50/],
    [
      // (red excluded: the page keeps a red ERROR-ALERT box — alert-family, not a status pill)
      join(APP, 'analitika', 'inventerizatsiya', '_components', 'cycle-view.tsx'),
      /bg-(?:amber|blue|emerald|indigo|slate)-\d+/,
    ],
    [
      join(APP, 'analitika', 'inventerizatsiya', '_components', 'dashboard-view.tsx'),
      /text-amber-600/,
    ],
    [join(APP, 'analitika', 'inventerizatsiya', '_lib', 'format.ts'), /bg-amber-500/],
    [join(APP, 'analitika', 'page.tsx'), /bg-amber-500/],
    [join(APP, 'analitika', 'xodimlar', 'page.tsx'), /bg-emerald-50/],
    [join(APP, 'analitika', 'xodimlar', 'men', 'page.tsx'), /bg-emerald-50/],
    [join(APP, 'analitika', 'xodimlar', '[id]', 'page.tsx'), /bg-blue-50/],
    [
      join(APP, 'analitika', 'xodimlar', '_components', 'staff-form.tsx'),
      /bg-blue-50.*role_system|role_system.*bg-blue-50/s,
    ],
    [join(APP, 'analitika', 'sozlamalar', '_components', 'roles-list-view.tsx'), /bg-blue-50/],
    [join(APP, 'hr', 'page.tsx'), /text-emerald-600|text-red-600|text-amber-600/],
    [join(APP, 'hr', 'payroll', 'page.tsx'), /tone\s*===\s*'success'[^}]*text-emerald-600/s],
    [join(APP, 'tasks', 'page.tsx'), /#dc2626|#d97706/],
    [join(APP, 'tasks', '[id]', 'page.tsx'), /#dc2626|#d97706/],
  ];
  for (const [file, banned] of NO_RAW) {
    const label = file.replace(SRC, '').replace(/\\/g, '/');
    it(`${label} no longer carries ${banned}`, () => {
      expect(readFileSync(file, 'utf8')).not.toMatch(banned);
    });
  }
});
