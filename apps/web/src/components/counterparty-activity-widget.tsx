'use client';

import { AttachmentsSection, type StagedFilesController } from '@/components/attachments-section';
import { TaskCreateModal } from '@/components/task-create-modal';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useAuditLabels } from '@/hooks/use-audit-labels';
import { useDocumentHistory } from '@/hooks/use-document-history';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
// MASTER-TODO #10: the loyalty maps were duplicated here byte-for-byte from
// loyalty-operations/page.tsx — the same badge rendered from two copies.
import { loyaltyStatusTone, loyaltyTypeTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  DropdownMenu,
  Icons,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  currencyDisplayName,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, type KeyboardEvent, useState } from 'react';

/**
 * counterparties/[id] RIGHT CRM activity widget (B6 S17) — moysklad parity.
 *
 * DOM-grounded tab set (docs/audits/_B5-B6-DESIGN-GROUNDING-2026-06-13.md:48,
 * captured from the live counterparty card): События · Задачи · Документы ·
 * Файлы · Показатели. This consolidates the previously-scattered audit feed,
 * attachments, and balance table into the single tabbed widget moysklad shows.
 *
 * Each tab is wired against an EXISTING backend endpoint (grounded 2026-06-13):
 *   - События   → AuditLog feed (useDocumentHistory, entity='Counterparty')
 *   - Задачи     → GET /tasks?agentId=<cp>           (Task.agentId FK)
 *   - Документы  → a card-tab nav (Документы | Договоры | Операции с баллами,
 *                  live-grounded docs/audits/cp-documents-tab-2026-06-26/) over three
 *                  sub-views: (1) Документы — fan-out across ALL 18 agent-facing doc
 *                  lists, merged by date desc (each filters by agentId; uniform
 *                  {name,state,sumMinor,moment,currency,organization} shape), first 10
 *                  rows then «Еще N документов», + a «⊕ Документ ▾» grouped create-menu;
 *                  (2) Договоры — GET /contracts?agentId= (Оплачено/Выполнено are
 *                  aggregates the API does not compute → «—»); (3) Операции с баллами —
 *                  GET /loyalty/operations?agentId= (mirrors the /loyalty-operations page).
 *   - Файлы      → AttachmentsSection (entity='Counterparty')
 *   - Показатели → GET /counterparties/:id/metrics — moysklad's analytics panel:
 *                  «Баланс» (per-organization breakdown) + «Продажи»/«Возвраты».
 */

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  done: boolean;
  dueAt: string | null;
  assignee: { id: string; name: string } | null;
  // moysklad «Тип задачи» = the task's `state` (State, entityType="task").
  state: { id: string; name: string; color: string | null } | null;
}

interface DocRow {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
  moment: string;
  currency: string;
  organization: { id: string; name: string } | null;
}
type MergedDoc = DocRow & { _type: string; _route: string };

// «Договоры» sub-tab — contracts linked to this agent (GET /contracts?agentId=). sumMinor is
// a BigInt serialized as a string; ownAgent supplies the «Организация» column.
interface ContractRow {
  id: string;
  name: string;
  code: string | null;
  currency: string;
  sumMinor: string;
  moment: string;
  agent: { id: string; name: string } | null;
  ownAgent: { id: string; name: string } | null;
}

// «Операции с баллами» sub-tab — bonus-operations ledger for this agent. Mirrors the
// BonusOperation shape of /loyalty-operations (GET /loyalty/operations?agentId=).
interface BonusOperationRow {
  id: string;
  name: string;
  moment: string;
  executionDate: string | null;
  transactionType: 'EARNING' | 'SPENDING';
  transactionStatus: 'COMMITTED' | 'PENDING' | 'CANCELLED';
  bonusValue: number;
  bonusProgram: { id: string; name: string } | null;
}

// «Показатели» tab — moysklad's counterparty analytics panel (GET /counterparties/:id/metrics,
// grounded docs/audits/cp-metrics-tab-2026-06-26/). All *Minor are base-currency (UZS) tiyin strings.
interface MetricsData {
  currency: string;
  sales: {
    totalMinor: string;
    count: number;
    avgCheckMinor: string;
    discountMinor: string;
    firstAt: string | null;
    lastAt: string | null;
    profitMinor: string;
  };
  returns: { totalMinor: string; count: number };
  balance: {
    totalMinor: string;
    // Net «Взаиморасчёты» per наша организация — the breakdown sums to totalMinor.
    // `organizationId: null` — «taqsimlanmagan» bandi (Faza 10): qarz reyestri,
    // POS qarz-sotuvi va tarixiy boshlang'ich qoldiqda organizatsiya o'lchovi yo'q.
    byOrg: { organizationId: string | null; organizationName: string; amountMinor: string }[];
  };
}

// Tone maps mirror the /loyalty-operations page (same Badge semantics).

// The «⊕ Документ ▾» create-menu — 3 groups (sales / purchase / money), each item opens a
// new doc of that type pre-linked to this counterparty (/<route>/new?agentId=<cp>). Grounded
// from docs/audits/cp-documents-tab-2026-06-26/02-doc-create-menu.png.
const DOC_CREATE_GROUPS: ReadonlyArray<ReadonlyArray<{ titleKey: string; route: string }>> = [
  [
    { titleKey: 'customer_order', route: 'customer-orders' },
    { titleKey: 'invoice_out', route: 'invoices-out' },
    { titleKey: 'demand', route: 'demands' },
  ],
  [
    { titleKey: 'purchase_order', route: 'purchase-orders' },
    { titleKey: 'invoice_in', route: 'invoices-in' },
    { titleKey: 'supply', route: 'supplies' },
  ],
  [
    { titleKey: 'payment_in', route: 'payments-in' },
    { titleKey: 'cash_in', route: 'cash-in' },
    { titleKey: 'payment_out', route: 'payments-out' },
    { titleKey: 'cash_out', route: 'cash-out' },
  ],
];

// «Заметка» — a CRM note (the «Создать заметку» composer / «Заметки» sub-filter).
interface NoteRow {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string } | null;
}
// «Звонок» — a logged call (the «Звонки» sub-filter).
interface CallRow {
  id: string;
  direction: string;
  status: string;
  startedAt: string;
  summary: string | null;
}

// All 18 agent-facing document lists. Each /<endpoint>?agentId= accepts the
// agentId filter and returns the uniform { id, name, state, sumMinor, moment,
// currency, organization{id,name} } shape (verified 2026-06-13 via the
// verify-cp-doc-endpoints workflow — every list returns the full row + the
// included organization relation). `statesKey` doubles as the detail_titles key
// for the «Тип документа» column and the per-type slug→label `states` namespace.
const DOC_TYPES = [
  // sales
  { statesKey: 'customer_order', endpoint: '/customer-orders', route: 'customer-orders' },
  { statesKey: 'demand', endpoint: '/demands', route: 'demands' },
  { statesKey: 'invoice_out', endpoint: '/invoices-out', route: 'invoices-out' },
  { statesKey: 'sales_return', endpoint: '/sales-returns', route: 'sales-returns' },
  // purchase
  { statesKey: 'supply', endpoint: '/supplies', route: 'supplies' },
  { statesKey: 'invoice_in', endpoint: '/invoices-in', route: 'invoices-in' },
  { statesKey: 'purchase_order', endpoint: '/purchase-orders', route: 'purchase-orders' },
  { statesKey: 'purchase_return', endpoint: '/purchase-returns', route: 'purchase-returns' },
  // money
  { statesKey: 'payment_in', endpoint: '/payments-in', route: 'payments-in' },
  { statesKey: 'payment_out', endpoint: '/payments-out', route: 'payments-out' },
  { statesKey: 'cash_in', endpoint: '/cash-in', route: 'cash-in' },
  { statesKey: 'cash_out', endpoint: '/cash-out', route: 'cash-out' },
  // prepay / adjust / facture / commission
  { statesKey: 'prepayment', endpoint: '/prepayments', route: 'prepayments' },
  { statesKey: 'prepayment_return', endpoint: '/prepayment-returns', route: 'prepayment-returns' },
  {
    statesKey: 'counterparty_adjustment',
    endpoint: '/counterparty-adjustments',
    route: 'counterparty-adjustments',
  },
  { statesKey: 'facture_out', endpoint: '/factures-out', route: 'factures-out' },
  { statesKey: 'facture_in', endpoint: '/factures-in', route: 'factures-in' },
  { statesKey: 'commission_report', endpoint: '/commission-reports', route: 'commission-reports' },
] as const;

export interface CounterpartyActivityWidgetProps {
  // `null` on the create form (/counterparties/new) — moysklad shows the same
  // right-column tab strip on NEW, but empty (nothing is saved yet). A null id
  // disables every per-entity fetch and renders each tab's empty state.
  counterpartyId: string | null;
  // Counterparty name — shown as the pre-linked «Контрагент» chip in the «Создать задачу» drawer.
  counterpartyName?: string;
  // Pre-save «Файлы»: moysklad lets you add files on the create form (before save) —
  // the create page stages them locally and POSTs after the counterparty exists.
  stagedFiles?: StagedFilesController;
}

/** «Сегодня 10:22» / «Вчера 10:22» / «25.06.2026 10:22» — moysklad's feed date format. */
function relDateTime(iso: string, todayLabel: string, yesterdayLabel: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `${todayLabel} ${time}`;
  if (sameDay(d, yesterday)) return `${yesterdayLabel} ${time}`;
  return `${d.toLocaleDateString('ru-RU')} ${time}`;
}

/** «июнь 2026 г.» — the feed's month-group separator. */
function monthGroup(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

/** «26.06.2026 09:32» — the «Операции с баллами» date format (mirrors /loyalty-operations). */
function loyaltyDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(', ', ' ');
}

/** A task is «Выполнена» if its `done` mirror OR its status says so (robust to any
 *  legacy row whose `done` boolean drifted out of sync with `status`). */
function taskDone(tk: { done: boolean; status: string }): boolean {
  return tk.done || tk.status === 'done';
}

/** Up-to-2-letter initials for the round author avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function CounterpartyActivityWidget({
  counterpartyId,
  counterpartyName,
  stagedFiles,
}: CounterpartyActivityWidgetProps) {
  const t = useTranslations('counterparty_activity');
  const tCommon = useTranslations('common');
  const tStates = useTranslations('states');
  const tTitles = useTranslations('detail_titles');
  // «Договоры» / «Операции с баллами» sub-tab labels + the loyalty column headers/tones
  // are already translated elsewhere — reuse their namespaces (no key churn).
  const tCrm = useTranslations('subnav.crm');
  const tLoyalty = useTranslations('pages.loyalty_operations');
  const router = useRouter();

  const qc = useQueryClient();
  const { translateAction } = useAuditLabels('Counterparty');
  const historyQuery = useDocumentHistory('Counterparty', counterpartyId);
  const events = historyQuery.data?.items ?? [];

  const tasksQuery = useQuery<{ items: TaskRow[] }>({
    queryKey: ['tasks', 'by-counterparty', counterpartyId],
    queryFn: () => api.get<{ items: TaskRow[] }>(`/tasks?agentId=${counterpartyId}&limit=200`),
    enabled: !!counterpartyId,
  });
  const tasks = tasksQuery.data?.items ?? [];
  // moysklad «Задачи» sub-filter: Невыполненные (default) / Выполненные / Все задачи.
  const [taskFilter, setTaskFilter] = useState<'open' | 'done' | 'all'>('open');
  const [tasksPage, setTasksPage] = useState(0);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  // The ○ circle toggles completion (moysklad: clicking it marks done / reopens).
  const toggleTask = useApiMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api.post(`/tasks/${id}/transition`, { status: done ? 'open' : 'done' }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['tasks', 'by-counterparty', counterpartyId] }),
  });

  const docsQuery = useQuery<MergedDoc[]>({
    queryKey: ['counterparty-documents', counterpartyId],
    queryFn: async () => {
      // Per-endpoint failures must not blank the whole tab — allSettled keeps the
      // doc types that did resolve (one list 500ing shouldn't hide the others).
      const settled = await Promise.allSettled(
        DOC_TYPES.map(async (dt) => {
          const r = await api.get<{ items: DocRow[] }>(
            `${dt.endpoint}?agentId=${counterpartyId}&limit=20`,
          );
          return r.items.map<MergedDoc>((d) => ({
            ...d,
            _type: dt.statesKey,
            _route: dt.route,
          }));
        }),
      );
      const merged = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
      merged.sort((a, b) => (a.moment < b.moment ? 1 : -1));
      return merged;
    },
    enabled: !!counterpartyId,
  });
  const docs = docsQuery.data ?? [];

  // «Документы» card-tab nav (moysklad: Документы | Договоры | Операции с баллами) +
  // the «Документы» sub-view's «Еще N» load-more + the «⊕ Документ ▾» create-menu state.
  const [docSubTab, setDocSubTab] = useState<'documents' | 'contracts' | 'loyalty'>('documents');
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [docCreateOpen, setDocCreateOpen] = useState(false);

  // «Договоры» — fetched only when its sub-tab is open (and we have a saved counterparty).
  const contractsQuery = useQuery<{ items: ContractRow[] }>({
    queryKey: ['counterparty-contracts', counterpartyId],
    queryFn: () => api.get(`/contracts?agentId=${counterpartyId}&limit=50`),
    enabled: !!counterpartyId && docSubTab === 'contracts',
  });
  const contracts = contractsQuery.data?.items ?? [];

  // «Операции с баллами» — fetched only when its sub-tab is open.
  const loyaltyQuery = useQuery<{ items: BonusOperationRow[] }>({
    queryKey: ['counterparty-loyalty', counterpartyId],
    queryFn: () => api.get(`/loyalty/operations?agentId=${counterpartyId}&limit=50`),
    enabled: !!counterpartyId && docSubTab === 'loyalty',
  });
  const loyaltyOps = loyaltyQuery.data?.items ?? [];

  // «Показатели» — sales / returns / per-organization balance analytics.
  const metricsQuery = useQuery<MetricsData>({
    queryKey: ['counterparty-metrics', counterpartyId],
    queryFn: () => api.get<MetricsData>(`/counterparties/${counterpartyId}/metrics`),
    enabled: !!counterpartyId,
  });
  const metrics = metricsQuery.data;

  // «События» sub-streams — CRM notes («Заметки») + calls («Звонки»). The audit feed
  // (events, above) supplies the system events; moysklad merges all three in «Все события».
  const notesQuery = useQuery<{ items: NoteRow[] }>({
    queryKey: ['counterparty-notes', counterpartyId],
    queryFn: () => api.get(`/counterparty-notes?counterpartyId=${counterpartyId}&limit=100`),
    enabled: !!counterpartyId,
  });
  const notes = notesQuery.data?.items ?? [];
  const callsQuery = useQuery<{ items: CallRow[] }>({
    queryKey: ['counterparty-calls', counterpartyId],
    queryFn: () => api.get(`/calls?counterpartyId=${counterpartyId}&limit=100`),
    enabled: !!counterpartyId,
  });
  const calls = callsQuery.data?.items ?? [];

  const [eventFilter, setEventFilter] = useState<'all' | 'notes' | 'calls'>('all');
  const [noteText, setNoteText] = useState('');
  const [eventsPage, setEventsPage] = useState(0);
  // «Количество строк» — the feed page size (moysklad ⚙ menu: 5 / 25 / 50 / 100, default 5).
  const [evPageSize, setEvPageSize] = useState(5);
  const [feedSettingsOpen, setFeedSettingsOpen] = useState(false);
  const createNote = useApiMutation({
    mutationFn: (text: string) => api.post('/counterparty-notes', { counterpartyId, text }),
    onSuccess: () => {
      setNoteText('');
      qc.invalidateQueries({ queryKey: ['counterparty-notes', counterpartyId] });
    },
  });
  const deleteNote = useApiMutation({
    mutationFn: (id: string) => api.delete(`/counterparty-notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['counterparty-notes', counterpartyId] }),
  });
  // «Редактировать» — inline-edit a note's text (id being edited + its draft).
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const updateNote = useApiMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.patch(`/counterparty-notes/${id}`, { text }),
    onSuccess: () => {
      setEditNoteId(null);
      qc.invalidateQueries({ queryKey: ['counterparty-notes', counterpartyId] });
    },
  });

  // The merged «Все события» list — notes + calls + audit events, newest first.
  const stream = [
    ...notes.map((n) => ({ kind: 'note' as const, at: n.createdAt, key: `note-${n.id}`, note: n })),
    ...calls.map((c) => ({ kind: 'call' as const, at: c.startedAt, key: `call-${c.id}`, call: c })),
    ...events.map((e) => ({ kind: 'event' as const, at: e.at, key: `event-${e.id}`, event: e })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const shownStream =
    eventFilter === 'all'
      ? stream
      : stream.filter((s) => (eventFilter === 'notes' ? s.kind === 'note' : s.kind === 'call'));
  // Client-side pager for the feed (moysklad shows «N-M из Total» under the composer).
  const EV_PAGE = evPageSize;
  const evTotal = shownStream.length;
  const evPageCount = Math.max(1, Math.ceil(evTotal / EV_PAGE));
  const evSafePage = Math.min(eventsPage, evPageCount - 1);
  const evVisible = shownStream.slice(evSafePage * EV_PAGE, evSafePage * EV_PAGE + EV_PAGE);
  const evFrom = evTotal ? evSafePage * EV_PAGE + 1 : 1;
  const evTo = evTotal ? evSafePage * EV_PAGE + evVisible.length : 1;

  // «Задачи» sub-filter + client pager (moysklad shows «N-M из Total» + «« ‹ › »»).
  const TASK_PAGE = 25;
  const filteredTasks = tasks.filter((tk) =>
    taskFilter === 'all' ? true : taskFilter === 'done' ? taskDone(tk) : !taskDone(tk),
  );
  const tkTotal = filteredTasks.length;
  const tkPageCount = Math.max(1, Math.ceil(tkTotal / TASK_PAGE));
  const tkSafePage = Math.min(tasksPage, tkPageCount - 1);
  const visibleTasks = filteredTasks.slice(
    tkSafePage * TASK_PAGE,
    tkSafePage * TASK_PAGE + TASK_PAGE,
  );
  const tkFrom = tkTotal ? tkSafePage * TASK_PAGE + 1 : 1;
  const tkTo = tkTotal ? tkSafePage * TASK_PAGE + visibleTasks.length : 1;
  const now = Date.now();

  const stateLabel = (typeKey: string, state: string) => {
    const key = `${typeKey}.${state}`;
    return tStates.has(key) ? tStates(key) : state;
  };

  // Keyboard-accessible row navigation (a11y: click rows must also respond to
  // Enter). Spread onto each clickable <tr>.
  const rowNavProps = (href: string) => ({
    onClick: () => router.push(href),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') router.push(href);
    },
    tabIndex: 0,
  });

  const th =
    'h-8 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide';
  const muted = 'py-6 text-center text-[var(--ms-text-muted)] text-sm';
  const evPagerBtn =
    'flex h-6 w-6 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <Tabs
      defaultValue={counterpartyId ? 'events' : 'files'}
      className="w-full"
      data-test-id="counterparty-activity-widget"
    >
      {/* On the create form (counterpartyId=null) moysklad opens «Файлы» and locks the rest —
          События/Задачи/Документы/Показатели need a saved counterparty. They unlock after the
          first save (the redirect to /[id] gives a non-null id → every trigger enabled). */}
      <TabsList variant="boxed">
        <TabsTrigger value="events" data-test-id="tab-events" disabled={!counterpartyId}>
          {t('tab_events')}
        </TabsTrigger>
        <TabsTrigger value="tasks" data-test-id="tab-tasks" disabled={!counterpartyId}>
          {t('tab_tasks')}
        </TabsTrigger>
        <TabsTrigger value="documents" data-test-id="tab-documents" disabled={!counterpartyId}>
          {t('tab_documents')}
        </TabsTrigger>
        <TabsTrigger value="files" data-test-id="tab-files">
          {t('tab_files')}
        </TabsTrigger>
        <TabsTrigger value="metrics" data-test-id="tab-metrics" disabled={!counterpartyId}>
          {t('tab_metrics')}
        </TabsTrigger>
      </TabsList>

      {/* События — moysklad's unified CRM activity stream: a sub-filter (Все события /
          Заметки / Звонки), a «Создать заметку» composer, and the merged notes+calls+audit feed. */}
      <TabsContent value="events">
        {/* moysklad: a segmented «Все события | Заметки | Звонки» group + a feed-settings ⚙. */}
        <div className="mb-3 flex items-center justify-end gap-2" data-test-id="events-subfilter">
          {/* moysklad: a light grey container; the selected filter is a raised white segment. */}
          <div className="inline-flex items-center gap-0.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-0.5">
            {(['all', 'notes', 'calls'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setEventFilter(f)}
                data-test-id={`events-filter-${f}`}
                className={`rounded-[var(--ms-radius-sm)] px-3 py-0.5 text-sm ${
                  eventFilter === f
                    ? 'bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)] shadow-sm'
                    : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
                }`}
              >
                {f === 'all'
                  ? t('events_all')
                  : f === 'notes'
                    ? t('events_notes')
                    : t('events_calls')}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label={tCommon('settings')}
              onClick={() => setFeedSettingsOpen((o) => !o)}
              className="flex h-7 items-center gap-0.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-1.5 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] data-[open=true]:bg-[var(--ms-bg-muted)]"
              data-open={feedSettingsOpen}
              data-test-id="events-feed-settings"
            >
              <Icons.settings className="h-4 w-4" />
              <Icons.down className="h-3 w-3" />
            </button>
            {feedSettingsOpen && (
              <>
                <button
                  type="button"
                  aria-label={tCommon('cancel')}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setFeedSettingsOpen(false)}
                />
                {/* moysklad ⚙ → «Количество строк:» 5 / 25 / 50 / 100. */}
                <div
                  className="absolute right-0 z-50 mt-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 shadow-[var(--ms-shadow-elevated)]"
                  data-test-id="feed-settings-popover"
                >
                  <div className="mb-2 whitespace-nowrap text-[var(--ms-text-primary)] text-sm">
                    {tCommon('rows_per_page')}:
                  </div>
                  <div className="inline-flex overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                    {[5, 25, 50, 100].map((n, i) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setEvPageSize(n);
                          setEventsPage(0);
                          setFeedSettingsOpen(false);
                        }}
                        data-test-id={`feed-rows-${n}`}
                        className={`px-3 py-1 text-sm ${
                          i > 0 ? 'border-[var(--ms-border-default)] border-l' : ''
                        } ${
                          evPageSize === n
                            ? 'bg-[var(--ms-bg-muted)] font-medium text-[var(--ms-text-primary)]'
                            : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {counterpartyId && (
          <div className="mb-4" data-test-id="note-composer">
            <div className="mb-1 text-[var(--ms-text-muted)] text-sm">
              {t('note_compose_label')}
            </div>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t('note_placeholder')}
              className="max-w-[520px]"
              data-test-id="note-text"
            />
            {/* moysklad shows the «Написать»/«Отмена» actions only once you start a note. */}
            {noteText.trim() && (
              <div className="mt-2 flex justify-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={createNote.isPending}
                  onClick={() => createNote.mutate(noteText.trim())}
                  data-test-id="note-add"
                >
                  {t('note_submit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNoteText('')}
                  data-test-id="note-cancel"
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            )}
          </div>
        )}

        {historyQuery.isLoading || notesQuery.isLoading ? (
          <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
        ) : (
          <div data-test-id="events-stream">
            {evVisible.map((item, idx) => {
              const author =
                item.kind === 'note'
                  ? (item.note.author?.name ?? null)
                  : item.kind === 'event'
                    ? (item.event.user?.name ?? null)
                    : null;
              const label =
                item.kind === 'note'
                  ? t('note_label')
                  : item.kind === 'call'
                    ? item.call.direction === 'in'
                      ? t('call_in')
                      : t('call_out')
                    : translateAction(item.event.action);
              const KindIcon =
                item.kind === 'note' ? Icons.chat : item.kind === 'call' ? Icons.phone : Icons.edit;
              const prev = evVisible[idx - 1];
              const showSep = !prev || monthGroup(item.at) !== monthGroup(prev.at);
              const editing = item.kind === 'note' && editNoteId === item.note.id;
              return (
                <Fragment key={item.key}>
                  {showSep && (
                    <div
                      className="bg-[var(--ms-bg-muted)] py-1 text-center text-[var(--ms-text-muted)] text-xs"
                      data-test-id="events-month"
                    >
                      {monthGroup(item.at)}
                    </div>
                  )}
                  <div
                    className="group flex items-start gap-2.5 border-[var(--ms-border-default)] border-b py-2.5"
                    data-test-id={`stream-${item.kind}`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
                      <KindIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[var(--ms-text-secondary)] text-xs">
                        {label}. {relDateTime(item.at, t('date_today'), t('date_yesterday'))}
                      </div>
                      {editing ? (
                        <div className="mt-1 max-w-[520px]">
                          <Textarea
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            data-test-id="note-edit-text"
                          />
                          <div className="mt-1 flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={!editNoteText.trim() || updateNote.isPending}
                              onClick={() =>
                                updateNote.mutate({
                                  id: item.note.id,
                                  text: editNoteText.trim(),
                                })
                              }
                              data-test-id="note-edit-save"
                            >
                              {tCommon('save')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditNoteId(null)}
                            >
                              {tCommon('cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : item.kind === 'note' ? (
                        <p className="whitespace-pre-wrap break-words text-sm">{item.note.text}</p>
                      ) : item.kind === 'call' ? (
                        <button
                          type="button"
                          className="text-left text-sm hover:text-[var(--ms-text-brand)]"
                          {...rowNavProps(`/calls/${item.call.id}`)}
                        >
                          {item.call.summary || '—'}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {author && (
                        <>
                          <span className="text-[var(--ms-text-muted)] text-xs">{author}</span>
                          <div
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[10px] text-[var(--ms-text-muted)]"
                            aria-hidden
                          >
                            {initials(author)}
                          </div>
                        </>
                      )}
                      {item.kind === 'note' && (
                        <DropdownMenu
                          align="end"
                          testId={`note-menu-${item.note.id}`}
                          trigger={
                            <button
                              type="button"
                              aria-label={tCommon('actions')}
                              className="flex h-6 w-6 items-center justify-center rounded-[var(--ms-radius-sm)] text-[var(--ms-text-muted)] opacity-0 hover:bg-[var(--ms-bg-muted)] group-hover:opacity-100 data-[state=open]:opacity-100"
                              data-test-id={`note-menu-trigger-${item.note.id}`}
                            >
                              <Icons.moreVertical className="h-4 w-4" />
                            </button>
                          }
                        >
                          <DropdownMenu.Item
                            icon={<Icons.edit className="h-4 w-4" />}
                            onSelect={() => {
                              setEditNoteId(item.note.id);
                              setEditNoteText(item.note.text);
                            }}
                            testId="note-edit"
                          >
                            {t('note_edit')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            destructive
                            icon={<Icons.delete className="h-4 w-4" />}
                            onSelect={() => deleteNote.mutate(item.note.id)}
                            testId="note-delete"
                          >
                            {tCommon('delete')}
                          </DropdownMenu.Item>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {/* «N-M из Total» pager (moysklad shows it under the feed, «1-1 из 0» when empty). */}
            <div
              className="mt-2 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs"
              data-test-id="events-pager"
            >
              <button
                type="button"
                className={evPagerBtn}
                disabled={evSafePage <= 0}
                onClick={() => setEventsPage(0)}
                aria-label="first"
              >
                «
              </button>
              <button
                type="button"
                className={evPagerBtn}
                disabled={evSafePage <= 0}
                onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
                aria-label="prev"
              >
                ‹
              </button>
              <span data-test-id="events-range">
                {t('events_range', { from: evFrom, to: evTo, total: evTotal })}
              </span>
              <button
                type="button"
                className={evPagerBtn}
                disabled={evSafePage >= evPageCount - 1}
                onClick={() => setEventsPage((p) => Math.min(evPageCount - 1, p + 1))}
                aria-label="next"
              >
                ›
              </button>
              <button
                type="button"
                className={evPagerBtn}
                disabled={evSafePage >= evPageCount - 1}
                onClick={() => setEventsPage(evPageCount - 1)}
                aria-label="last"
              >
                »
              </button>
            </div>
          </div>
        )}
      </TabsContent>

      {/* Задачи — moysklad CRM tasks linked to this counterparty (Task.agentId).
          Live-grounded 2026-06-25 (docs/audits/.../tasks-tab-2026-06-25/01-tasks-tab.png):
          a left-aligned sub-filter (Невыполненные / Выполненные / Все задачи), the task
          list (○ toggle · description link · ● type · Срок · Исполнитель), a «N-M из Total»
          pager, and a «⊕ Создать задачу» button. */}
      <TabsContent value="tasks">
        {/* sub-filter — left-aligned segmented group (active = raised white segment) */}
        <div className="mb-3 flex" data-test-id="tasks-subfilter">
          <div className="inline-flex items-center gap-0.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-0.5">
            {(['open', 'done', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setTaskFilter(f);
                  setTasksPage(0);
                }}
                data-test-id={`tasks-filter-${f}`}
                className={`rounded-[var(--ms-radius-sm)] px-3 py-0.5 text-sm ${
                  taskFilter === f
                    ? 'bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)] shadow-sm'
                    : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
                }`}
              >
                {f === 'open'
                  ? t('task_filter_open')
                  : f === 'done'
                    ? t('task_filter_done')
                    : t('task_filter_all')}
              </button>
            ))}
          </div>
        </div>

        {tasksQuery.isLoading ? (
          <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
        ) : (
          <div data-test-id="tasks-list">
            {visibleTasks.length === 0 ? (
              <div className={muted} data-test-id="tasks-empty">
                {t('tasks_empty')}
              </div>
            ) : (
              visibleTasks.map((task) => {
                const done = taskDone(task);
                const overdue = !!task.dueAt && !done && new Date(task.dueAt).getTime() < now;
                const text = task.description?.trim() || task.title;
                return (
                  <div
                    key={task.id}
                    className="group flex items-start gap-3 border-[var(--ms-border-default)] border-b py-2.5"
                    data-test-id="task-row"
                  >
                    {/* ○ completion toggle — click to mark done / reopen */}
                    <button
                      type="button"
                      aria-label={t('task_mark_done')}
                      disabled={toggleTask.isPending}
                      onClick={() => toggleTask.mutate({ id: task.id, done })}
                      data-test-id={`task-toggle-${task.id}`}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? 'border-[var(--ms-brand-500)] bg-[var(--ms-brand-500)] text-white'
                          : 'border-[var(--ms-text-muted)] text-transparent hover:border-[var(--ms-brand-500)]'
                      }`}
                    >
                      <Icons.check className="h-3 w-3" />
                    </button>
                    {/* description — blue link to the task detail */}
                    <button
                      type="button"
                      className={`min-w-0 flex-1 text-left text-sm hover:underline ${
                        done
                          ? 'text-[var(--ms-text-muted)] line-through'
                          : 'text-[var(--ms-text-brand)]'
                      }`}
                      {...rowNavProps(`/tasks/${task.id}`)}
                    >
                      {text}
                    </button>
                    {/* ● Тип задачи — coloured dot + name (the task's `state`) */}
                    <div className="flex w-[140px] shrink-0 items-center gap-1.5 pt-0.5 text-[var(--ms-text-secondary)] text-xs">
                      {task.state && (
                        <>
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: task.state.color ?? 'var(--ms-text-muted)' }}
                            aria-hidden
                          />
                          <span className="truncate">{task.state.name}</span>
                        </>
                      )}
                    </div>
                    {/* Срок — due date+time, red when overdue */}
                    <div
                      className={`w-[120px] shrink-0 pt-0.5 text-xs ${
                        overdue
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-secondary)]'
                      }`}
                      data-test-id="task-due"
                    >
                      {task.dueAt ? formatDate(task.dueAt) : ''}
                    </div>
                    {/* Исполнитель — avatar + name */}
                    <div className="flex w-[140px] shrink-0 items-center gap-2">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[10px] text-[var(--ms-text-muted)]"
                        aria-hidden
                      >
                        {task.assignee ? initials(task.assignee.name) : ''}
                      </div>
                      <span className="truncate text-[var(--ms-text-muted)] text-xs">
                        {task.assignee?.name ?? ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {/* «N-M из Total» pager (always shown, like moysklad) */}
            <div
              className="mt-2 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs"
              data-test-id="tasks-pager"
            >
              <button
                type="button"
                className={evPagerBtn}
                disabled={tkSafePage <= 0}
                onClick={() => setTasksPage(0)}
                aria-label="first"
              >
                «
              </button>
              <button
                type="button"
                className={evPagerBtn}
                disabled={tkSafePage <= 0}
                onClick={() => setTasksPage((p) => Math.max(0, p - 1))}
                aria-label="prev"
              >
                ‹
              </button>
              <span data-test-id="tasks-range">
                {t('tasks_range', { from: tkFrom, to: tkTo, total: tkTotal })}
              </span>
              <button
                type="button"
                className={evPagerBtn}
                disabled={tkSafePage >= tkPageCount - 1}
                onClick={() => setTasksPage((p) => Math.min(tkPageCount - 1, p + 1))}
                aria-label="next"
              >
                ›
              </button>
              <button
                type="button"
                className={evPagerBtn}
                disabled={tkSafePage >= tkPageCount - 1}
                onClick={() => setTasksPage(tkPageCount - 1)}
                aria-label="last"
              >
                »
              </button>
            </div>

            {/* «⊕ Создать задачу» — opens the task-create modal pre-linked to this agent */}
            {counterpartyId && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setTaskModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5"
                data-test-id="task-create-open"
              >
                <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                {t('task_create_btn')}
              </Button>
            )}
          </div>
        )}
      </TabsContent>

      {/* Документы — a card-tab nav (Документы | Договоры | Операции с баллами) over three
          sub-views. Live-grounded 2026-06-26 (docs/audits/cp-documents-tab-2026-06-26/):
            · Документы  → merged agent-facing docs (all 18 types) — first 10 then «Еще N»,
                           plus a «⊕ Документ ▾» grouped create-menu.
            · Договоры    → contracts for this agent + «⊕ Договор».
            · Операции с баллами → bonus-operations ledger (mirrors /loyalty-operations). */}
      <TabsContent value="documents">
        {/* sub-tab nav — moysklad style: an OUTLINED active tab on the plain panel (NO grey
            track); inactive tabs are plain text. (Live-grounded 2026-06-26.) */}
        <div className="mb-4 flex" data-test-id="documents-subtabs">
          <div className="inline-flex items-center gap-1">
            {(['documents', 'contracts', 'loyalty'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDocSubTab(s)}
                data-test-id={`documents-subtab-${s}`}
                className={`rounded-[var(--ms-radius-default)] border px-3 py-1 text-sm ${
                  docSubTab === s
                    ? 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)]'
                    : 'border-transparent text-[var(--ms-text-secondary)] hover:text-[var(--ms-text-primary)]'
                }`}
              >
                {s === 'documents'
                  ? t('tab_documents')
                  : s === 'contracts'
                    ? tCrm('contracts')
                    : tCrm('bonus_operations')}
              </button>
            ))}
          </div>
        </div>

        {/* ── Документы sub-view ─────────────────────────────────────────────── */}
        {docSubTab === 'documents' && (
          <div data-test-id="documents-sub">
            {docsQuery.isLoading ? (
              <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
            ) : docs.length === 0 ? (
              <div className={muted} data-test-id="documents-empty">
                {t('documents_empty')}
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--ms-bg-muted)]">
                      <tr>
                        <th className={th}>{t('doc_col_type')}</th>
                        <th className={th}>{t('doc_col_number')}</th>
                        <th className={`${th} w-32`}>{t('doc_col_date')}</th>
                        <th className={th}>{t('doc_col_organization')}</th>
                        <th className={`${th} w-32 text-right`}>{t('doc_col_sum')}</th>
                        <th className={`${th} w-16`}>{t('doc_col_currency')}</th>
                        <th className={`${th} w-28`}>{t('doc_col_status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* moysklad shows ~10 rows then a «Еще N документов» link to expand the rest. */}
                      {(docsExpanded ? docs : docs.slice(0, 10)).map((doc) => (
                        <tr
                          key={`${doc._route}-${doc.id}`}
                          className="cursor-pointer border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                          {...rowNavProps(`/${doc._route}/${doc.id}`)}
                        >
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {tTitles.has(doc._type) ? tTitles(doc._type) : doc._type}
                          </td>
                          <td className="px-3 py-2 font-medium">{doc.name}</td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {formatDate(doc.moment)}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {doc.organization?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(BigInt(doc.sumMinor), doc.currency, { displayAs: 'none' })}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                            {doc.currency}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={documentStateTone(doc.state)}>
                              {stateLabel(doc._type, doc.state)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* «Еще N документов» — only when more than the first 10 exist and not expanded. */}
                {!docsExpanded && docs.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setDocsExpanded(true)}
                    className="mt-2 text-[var(--ms-text-brand)] text-sm hover:underline"
                    data-test-id="documents-more"
                  >
                    {t('docs_more', { count: docs.length - 10 })}
                  </button>
                )}
              </>
            )}

            {/* «⊕ Документ ▾» — grouped create-menu, ALWAYS shown (moysklad shows it even when
                there are NO documents — you need it to create the first one). */}
            {counterpartyId && (
              <div className="relative mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setDocCreateOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5"
                  aria-haspopup="menu"
                  aria-expanded={docCreateOpen}
                  data-test-id="doc-create-open"
                >
                  <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                  {t('doc_create_btn')}
                  <Icons.down className="h-3.5 w-3.5 text-[var(--ms-text-muted)]" aria-hidden />
                </Button>
                {docCreateOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setDocCreateOpen(false)}
                    />
                    {/* moysklad opens this menu DOWNWARD (below the button), into the panel's
                          empty space — not upward over the table. */}
                    <div
                      data-test-id="doc-create-menu"
                      className="absolute top-full left-0 z-20 mt-1 min-w-[200px] overflow-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-[var(--ms-shadow-md)]"
                    >
                      {DOC_CREATE_GROUPS.map((group, gi) => (
                        <Fragment key={group[0]?.route ?? gi}>
                          {gi > 0 && (
                            <div className="my-1 border-[var(--ms-border-default)] border-t" />
                          )}
                          {group.map((item) => (
                            <button
                              key={item.route}
                              type="button"
                              onClick={() => {
                                setDocCreateOpen(false);
                                router.push(`/${item.route}/new?agentId=${counterpartyId}`);
                              }}
                              data-test-id={`doc-create-${item.route}`}
                              className="block w-full px-3 py-1.5 text-left text-[var(--ms-text-brand)] text-sm hover:bg-[var(--ms-bg-muted)]"
                            >
                              {tTitles(item.titleKey)}
                            </button>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Договоры sub-view ──────────────────────────────────────────────── */}
        {docSubTab === 'contracts' &&
          (contractsQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : (
            <div data-test-id="contracts-sub">
              {contracts.length === 0 ? (
                <div className={muted} data-test-id="contracts-empty">
                  {tCommon('no_records')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--ms-bg-muted)]">
                      <tr>
                        <th className={th}>{t('doc_col_number')}</th>
                        <th className={`${th} w-32`}>{t('doc_col_date')}</th>
                        <th className={th}>{t('doc_col_organization')}</th>
                        <th className={`${th} w-32 text-right`}>{t('doc_col_sum')}</th>
                        <th className={`${th} w-16`}>{t('doc_col_currency')}</th>
                        <th className={`${th} w-24`}>{t('doc_col_paid')}</th>
                        <th className={`${th} w-24`}>{t('doc_col_done')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((c) => (
                        <tr
                          key={c.id}
                          className="cursor-pointer border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-muted)]"
                          {...rowNavProps(`/contracts/${c.id}`)}
                        >
                          <td className="px-3 py-2 font-medium">{c.name}</td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {formatDate(c.moment)}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                            {c.ownAgent?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(BigInt(c.sumMinor), c.currency, { displayAs: 'none' })}
                          </td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                            {c.currency}
                          </td>
                          {/* Оплачено / Выполнено are aggregates moysklad computes; our API
                              does not — render «—» (moysklad shows them blank for empty too). */}
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">—</td>
                          <td className="px-3 py-2 text-[var(--ms-text-muted)]">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* «⊕ Договор» — opens a new contract pre-linked to this counterparty. */}
              {counterpartyId && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => router.push(`/contracts/new?agentId=${counterpartyId}`)}
                  className="mt-3 inline-flex items-center gap-1.5"
                  data-test-id="contract-create-open"
                >
                  <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
                  {t('contract_create_btn')}
                </Button>
              )}
            </div>
          ))}

        {/* ── Операции с баллами sub-view (mirrors /loyalty-operations) ───────── */}
        {docSubTab === 'loyalty' &&
          (loyaltyQuery.isLoading ? (
            <div className="py-4 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
          ) : loyaltyOps.length === 0 ? (
            <div className={muted} data-test-id="loyalty-empty">
              {tLoyalty('empty_title')}
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
              data-test-id="loyalty-sub"
            >
              <table className="w-full text-sm">
                <thead className="bg-[var(--ms-bg-muted)]">
                  <tr>
                    <th className={`${th} w-24`}>{tLoyalty('col_number')}</th>
                    <th className={`${th} w-40`}>{tLoyalty('col_created')}</th>
                    <th className={`${th} w-32`}>{tLoyalty('col_type')}</th>
                    <th className={`${th} w-28 text-right`}>{tLoyalty('col_points')}</th>
                    <th className={`${th} w-28`}>{tLoyalty('col_status')}</th>
                    <th className={`${th} w-40`}>{tLoyalty('col_execution_date')}</th>
                    <th className={th}>{tLoyalty('col_program')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loyaltyOps.map((op) => (
                    <tr key={op.id} className="border-[var(--ms-border-default)] border-t">
                      <td className="px-3 py-2 font-medium tabular-nums">{op.name}</td>
                      <td className="px-3 py-2 tabular-nums">{loyaltyDateTime(op.moment)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={loyaltyTypeTone(op.transactionType)}>
                          {tLoyalty(`types.${op.transactionType}`)}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          op.bonusValue < 0 ? 'text-[var(--ms-text-destructive)]' : ''
                        }`}
                      >
                        {op.bonusValue > 0 ? `+${op.bonusValue}` : op.bonusValue}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={loyaltyStatusTone(op.transactionStatus)}>
                          {tLoyalty(`statuses.${op.transactionStatus}`)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[var(--ms-text-muted)] tabular-nums">
                        {loyaltyDateTime(op.executionDate)}
                      </td>
                      <td className="px-3 py-2">{op.bonusProgram?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </TabsContent>

      {/* Файлы — attachments (needs a saved entity; empty on the create form) */}
      <TabsContent value="files">
        {counterpartyId ? (
          <AttachmentsSection entity="Counterparty" entityId={counterpartyId} hideTitle />
        ) : stagedFiles ? (
          // Pre-save: stage files locally; the create form POSTs them after the counterparty
          // exists (moysklad lets you attach files on the create form before saving).
          <AttachmentsSection entity="Counterparty" entityId="" hideTitle staged={stagedFiles} />
        ) : (
          <div className={muted} data-test-id="files-empty">
            {tCommon('no_records')}
          </div>
        )}
      </TabsContent>

      {/* Показатели — moysklad's counterparty analytics panel (GROUND
          docs/audits/cp-metrics-tab-2026-06-26/): a toolbar, then a 2-column
          layout — LEFT «Баланс:» (bold total + per-organization breakdown), RIGHT
          «Продажи:» + «Возвраты:». Data: GET /counterparties/:id/metrics. */}
      <TabsContent value="metrics">
        {/* Toolbar — «Создать корректировку» (a new debt adjustment for this agent)
            and «Создать акт сверки» (the взаиморасчёты / mutual-settlements report). */}
        <div className="mb-6 flex flex-wrap gap-2" data-test-id="metrics-toolbar">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              counterpartyId &&
              router.push(`/counterparty-adjustments/new?agentId=${counterpartyId}`)
            }
            data-test-id="metric-create-adjustment"
          >
            {t('metric_create_adjustment')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/reports/counterparty-balance')}
            data-test-id="metric-create-reconciliation"
          >
            {t('metric_create_reconciliation')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {/* LEFT — «Баланс:» bold total + per-organization breakdown (green +, red −). */}
          <div data-test-id="metric-balance">
            <div className="mb-3 font-semibold text-[var(--ms-text-primary)]">
              {t('metric_balance_title')}:
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
              {/* total — number aligns with the breakdown amounts; «сум» sits where the
                  org names sit (matches moysklad's column alignment). */}
              <div
                className="text-right font-semibold tabular-nums"
                data-test-id="metric-balance-total"
              >
                {formatMoney(BigInt(metrics?.balance.totalMinor ?? '0'), metrics?.currency, {
                  displayAs: 'none',
                })}
              </div>
              <div className="font-semibold text-[var(--ms-text-muted)]">
                {currencyDisplayName(metrics?.currency ?? 'UZS')}
              </div>
              {(metrics?.balance.byOrg ?? []).map((o) => {
                const amt = BigInt(o.amountMinor);
                const positive = amt > 0n;
                return (
                  <Fragment key={o.organizationId ?? '—'}>
                    <div
                      className={`text-right tabular-nums ${
                        positive
                          ? 'text-[var(--ms-text-success)]'
                          : 'text-[var(--ms-text-destructive)]'
                      }`}
                      data-test-id="metric-balance-org"
                    >
                      {positive ? '+' : '−'}{' '}
                      {formatMoney(amt < 0n ? -amt : amt, metrics?.currency, {
                        displayAs: 'none',
                      })}
                    </div>
                    <div className="text-[var(--ms-text-muted)]">– {o.organizationName}</div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* RIGHT — «Продажи:» (with bold «Прибыль») + «Возвраты:». One grid so every
              value aligns in a single column, exactly like moysklad. */}
          <dl
            className="grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-1.5 text-sm"
            data-test-id="metric-sales-block"
          >
            <dt className="col-span-2 font-semibold text-[var(--ms-text-primary)]">
              {t('metric_sales_title')}:
            </dt>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_total_sum')}:</dt>
            <dd className="tabular-nums" data-test-id="metric-sales-total">
              {formatMoney(BigInt(metrics?.sales.totalMinor ?? '0'))}
            </dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_count')}:</dt>
            <dd className="tabular-nums">{metrics?.sales.count ?? 0}</dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_avg_check')}:</dt>
            <dd className="tabular-nums">
              {formatMoney(BigInt(metrics?.sales.avgCheckMinor ?? '0'))}
            </dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_discount_sum')}:</dt>
            <dd className="tabular-nums">
              {formatMoney(BigInt(metrics?.sales.discountMinor ?? '0'))}
            </dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_first')}:</dt>
            <dd className="tabular-nums">{loyaltyDateTime(metrics?.sales.firstAt ?? null)}</dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_last')}:</dt>
            <dd className="tabular-nums">{loyaltyDateTime(metrics?.sales.lastAt ?? null)}</dd>

            {/* «Прибыль» — bold, set off by a blank gap (matches moysklad). */}
            <dt className="col-span-2 h-2" />
            <dt className="font-semibold text-[var(--ms-text-primary)]">{t('metric_profit')}:</dt>
            <dd className="font-semibold tabular-nums" data-test-id="metric-profit">
              {formatMoney(BigInt(metrics?.sales.profitMinor ?? '0'))}
            </dd>

            <dt className="col-span-2 mt-3 font-semibold text-[var(--ms-text-primary)]">
              {t('metric_returns_title')}:
            </dt>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_total_sum')}:</dt>
            <dd className="tabular-nums" data-test-id="metric-returns-total">
              {formatMoney(BigInt(metrics?.returns.totalMinor ?? '0'))}
            </dd>
            <dt className="text-[var(--ms-text-muted)]">{t('metric_count')}:</dt>
            <dd className="tabular-nums">{metrics?.returns.count ?? 0}</dd>
          </dl>
        </div>
      </TabsContent>

      {/* «Создать задачу» modal — pre-linked to this counterparty (agentId) so the new
          task surfaces in this very tab on success. Rendered inside Tabs so it shares the
          widget tree; only mounted once a counterparty exists. */}
      {counterpartyId && (
        <TaskCreateModal
          open={taskModalOpen}
          onOpenChange={setTaskModalOpen}
          entity="Counterparty"
          entityId={counterpartyId}
          agentId={counterpartyId}
          agentLabel={counterpartyName}
          invalidateKey={['tasks', 'by-counterparty', counterpartyId]}
        />
      )}
    </Tabs>
  );
}
