'use client';

/**
 * §3.1 — QARZDORLAR RO'YXATI (bo'limning bosh sahifasi).
 *
 * Ro'yxatda faqat qoldig'i > 0 bo'lgan mijozlar (`scope=active`). Qarz to'liq
 * to'langanda server statusni `paid` ga o'giradi va u ro'yxatdan o'zi chiqadi —
 * FE hech narsa o'chirmaydi (§3.1: «o'chirilmaydi — faqat faol ro'yxatdan
 * chiqadi, tarixda saqlanib qoladi»).
 *
 * §3.8 real-time: `refetchInterval` bilan ro'yxat o'zi yangilanadi — kassada
 * qabul qilingan to'lov call-markaz ekranida sahifani yangilamasdan ko'rinadi.
 */

import { StatusLegend } from '@/components/debts/status-legend';
import { useEnterOnHover } from '@/hooks/use-keyboard-nav';
import { useListState, useReturnToRow } from '@/hooks/use-list-memory';
import { api } from '@/lib/api-client';
import {
  type CallOutcome,
  DEBT_POLL_MS,
  type DebtRow,
  type DebtScope,
  debtApi,
} from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  Pagination,
  StatCard,
  formatMoney,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

const SCOPES: DebtScope[] = ['active', 'today', 'overdue', 'called', 'all'];

/** Bir sahifadagi qarzdorlar soni (server max 500). */
const PAGE_SIZE = 100;

/** Qo'ng'iroq natijasi → badge rangi (2026-07-12). */
const OUTCOME_TONE: Record<CallOutcome, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  paid_full: 'success',
  paid_partial: 'warning',
  not_paid: 'destructive',
  callback: 'neutral',
};

/** Mijoz-segment tablari (2026-07-11 talab): Hammasi · Elektriklar · Boshqalar. */
type Segment = 'all' | 'elektrik' | 'boshqa';

/**
 * QATOR RANGI — oxirgi qo'ng'iroq natijasiga qarab (2026-07-13 talab).
 *
 * Ilgari hamma qator oq edi: operator ro'yxatga qaraganda kimga qo'ng'iroq
 * qilingani va natijasi nima bo'lgani ko'rinmasdi. Endi bir qarashda ma'lum:
 *
 *   🔴 to'lamadi        → QIZIL   (bosim kerak)
 *   🟡 qisman to'ladi   → SARIQ   (qoldiq bor, kuzatuvda)
 *   🔵 qayta qo'ng'iroq → KO'K    (vaqti belgilangan)
 *   ⚪ hali qo'ng'iroq qilinmagan → OQ (navbatda)
 *
 * Rang YAGONA belgi emas: «Holat» ustunidagi badge ham turadi — rang
 * ko'rmaydigan foydalanuvchi ham ajrata oladi.
 *
 * Orqaga qaytilgan qator (highlightId) rangdan QAT'I NAZAR sariq halqa bilan
 * yoritiladi — «mana shu yerda edingiz».
 */
function rowTone(r: DebtRow, highlightId: string | null): string | undefined {
  const ring =
    r.id === highlightId ? ' ring-2 ring-inset ring-[var(--ms-warning-500)] duration-500' : '';

  const base = 'border-l-[3px] transition-colors';

  // MUAMMOLI mijoz (2026-07-14) — qo'ng'iroq natijasidan QAT'I NAZAR qizil
  // fon + qalin chiziq bilan ajraladi: eng og'irlari ko'zdan qochmasin.
  if (r.problem) {
    return `border-l-4 border-l-[var(--ms-row-unpaid-accent)] bg-[var(--ms-row-unpaid-bg)] font-medium transition-colors${ring}`;
  }
  switch (r.lastCallOutcome) {
    case 'not_paid':
      return `${base} border-l-[var(--ms-row-unpaid-accent)] bg-[var(--ms-row-unpaid-bg)]${ring}`;
    case 'paid_partial':
      return `${base} border-l-[var(--ms-row-partial-accent)] bg-[var(--ms-row-partial-bg)]${ring}`;
    case 'callback':
      return `${base} border-l-[var(--ms-row-callback-accent)] bg-[var(--ms-row-callback-bg)]${ring}`;
    default:
      // Qo'ng'iroq qilinmagan (yoki to'liq to'lagan — u ro'yxatdan chiqib ketadi):
      // OQ qoladi, faqat chap chiziq shaffof — qatorlar tekis tursin.
      return `${base} border-l-transparent${ring}`;
  }
}

export default function DebtsPage() {
  const t = useTranslations('pages.debts');
  const router = useRouter();

  // 2026-07-13: ro'yxat holati (tab/filtr/saralash/sahifa) sessionStorage'da —
  // kartochkadan orqaga qaytganda AYNAN o'sha ko'rinish tiklanadi, ro'yxat
  // boshiga tashlanmaydi («kimga telefon qilayotgandim?» muammosi).
  // sortBy default = remainingMinor (eng katta qoldiq tepada).
  const [ls, setLs] = useListState<{
    scope: DebtScope;
    segment: Segment;
    search: string;
    sortBy: 'nextContactAt' | 'remainingMinor' | 'totalMinor';
    page: number;
  }>('debts:list', {
    scope: 'active',
    segment: 'all',
    search: '',
    sortBy: 'remainingMinor',
    page: 1,
  });
  const { scope, segment, search, sortBy } = ls;
  const setScope = (v: DebtScope) => setLs({ scope: v, page: 1 });
  const setSegment = (v: Segment) => setLs({ segment: v, page: 1 });
  const setSearch = (v: string) => setLs({ search: v, page: 1 });
  const setSortBy = (v: 'nextContactAt' | 'remainingMinor' | 'totalMinor') =>
    setLs({ sortBy: v, page: 1 });
  // «Qo'ng'iroq qilinganlar» ko'rinishi filtrlari (2026-07-12).
  const [calledDate, setCalledDate] = useState('');
  const [callOutcome, setCallOutcome] = useState<CallOutcome | ''>('');
  // «Qo'ng'iroq qilindi» modali ochiq turgan qarzdor.
  // CHECKBOX bilan belgilangan qarzlar (2026-07-12) — «aynan shularni PDF qil».
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // SAHIFALASH (2026-07-13): 591 qarzdor bir sahifaga sig'maydi — server
  // limit/offset bilan sahifalaydi, «1-100 / 591» ko'rsatkichi bilan.
  const page = ls.page;
  const setPage = (updater: number | ((p: number) => number)) =>
    setLs({ page: typeof updater === 'function' ? updater(ls.page) : updater });
  const offset = (page - 1) * PAGE_SIZE;
  // 2026-07-13: sichqoncha qator ustida turganda ENTER → mijoz sahifasi.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEnterOnHover(
    useCallback(() => {
      if (!hoveredId) return null;
      rememberRef.current?.(hoveredId);
      return `/debts/${hoveredId}`;
    }, [hoveredId]),
  );
  // remember() list'dan keyin e'lon qilinadi — ref orqali oldindan bog'laymiz.
  const rememberRef = useRef<((id: string) => void) | null>(null);

  // «Elektriklar» guruhi id'si nom bo'yicha topiladi — guruh hali yaratilmagan
  // akkauntlarda tablar shunchaki ko'rinmaydi (graceful degradation).
  const groups = useQuery({
    queryKey: ['counterparty-groups'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/counterparty-groups'),
    staleTime: 5 * 60_000,
  });
  const elektrikGroupId = groups.data?.items.find((g) => g.name === 'Elektriklar')?.id;

  const summary = useQuery({
    queryKey: ['debts', 'summary'],
    queryFn: () => debtApi.summary(),
    refetchInterval: DEBT_POLL_MS,
  });

  const list = useQuery({
    queryKey: [
      'debts',
      'list',
      scope,
      segment,
      elektrikGroupId,
      search,
      sortBy,
      calledDate,
      callOutcome,
      page,
    ],
    queryFn: () =>
      debtApi.list({
        scope,
        search: search || undefined,
        // Segment → guruh filtri: Elektriklar = guruh ichida, Boshqalar = tashqarida.
        counterpartyGroupId:
          segment === 'elektrik' && elektrikGroupId ? elektrikGroupId : undefined,
        counterpartyGroupExclude:
          segment === 'boshqa' && elektrikGroupId ? elektrikGroupId : undefined,
        // «Qo'ng'iroq qilinganlar» ko'rinishi: kun (default bugun) + natija filtri.
        calledDate: scope === 'called' && calledDate ? calledDate : undefined,
        callOutcome: scope === 'called' && callOutcome ? callOutcome : undefined,
        sortBy,
        // Qo'ng'iroq sanasi — eng erta yuqorida; pul — eng katta yuqorida.
        sortDir: sortBy === 'nextContactAt' ? 'asc' : 'desc',
        limit: PAGE_SIZE,
        offset,
      }),
    refetchInterval: DEBT_POLL_MS,
    // Sahifa almashganda eski qatorlar turib tursin (miltillamasin).
    placeholderData: (prev) => prev,
  });

  // Kartochkadan qaytganda — oxirgi ochilgan qatorga surish + qisqa yoritish.
  const { remember, highlightId } = useReturnToRow(
    'debts',
    Boolean(list.data),
    useCallback((id: string) => `[data-test-id="debt-row-${id}"]`, []),
  );
  rememberRef.current = remember;

  /**
   * PDF eksport (2026-07-12) — EKRANDAGI holatni aynan chiqaradi:
   * tanlangan tab (Elektriklar/Boshqalar/Hammasi), scope, qidiruv, natija
   * filtri — hammasi PDF'ga o'tadi; sarlavhaga tab nomi yoziladi.
   */
  async function exportPdf() {
    // Belgilanganlar bor — AYNAN o'shalarni chiqaramiz (filtrdan mustaqil).
    if (selected.size > 0) {
      await debtApi.printSelectedPdf([...selected], `${t('heading_selected')} (${selected.size})`);
      return;
    }
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (search) params.set('search', search);
    if (segment === 'elektrik' && elektrikGroupId)
      params.set('counterpartyGroupId', elektrikGroupId);
    if (segment === 'boshqa' && elektrikGroupId)
      params.set('counterpartyGroupExclude', elektrikGroupId);
    if (scope === 'called' && calledDate) params.set('calledDate', calledDate);
    if (scope === 'called' && callOutcome) params.set('callOutcome', callOutcome);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortBy === 'nextContactAt' ? 'asc' : 'desc');
    const heading =
      segment === 'elektrik'
        ? t('segment_elektrik')
        : segment === 'boshqa'
          ? t('segment_boshqa')
          : t('segment_all');
    params.set('heading', heading.replace('⚡ ', ''));
    await api.download(
      `/debts/print/pdf?${params.toString()}`,
      `qarzdorlar-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }

  const statusTone = (r: DebtRow) =>
    r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : 'neutral';

  const statusLabel = (r: DebtRow) =>
    r.status === 'paid'
      ? t('status_paid')
      : r.status === 'partial'
        ? t('status_partial')
        : t('status_unpaid');

  // Checkbox tanlash yordamchilari — ko'rinayotgan qatorlar kesimida.
  const visibleRows = list.data?.rows ?? [];
  // 2026-07-13: «№» ustuni — ro'yxatdagi tartib raqami (1..N). DataTable cell'ga
  // index uzatmaydi, shuning uchun id→raqam xaritasi. Saralash o'zgarsa raqamlar
  // ham qayta joylashadi (ro'yxat tartibiga aynan mos).
  const rowNumber = new Map(visibleRows.map((r, i) => [r.id, offset + i + 1]));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const r of visibleRows) next.delete(r.id);
      else for (const r of visibleRows) next.add(r.id);
      return next;
    });
  }

  // QO'LDA Telegram qarz-eslatmasi (qatordan). Natijani KUTAMIZ — operatorga
  // «yuborildi / yuborilmadi (sabab)» deb halol javob beramiz.
  const { toast } = useToast();
  const reminderMut = useMutation({
    mutationFn: (id: string) => debtApi.telegramReminder(id),
    onSuccess: (res) => {
      if (res.sent) {
        toast.success(t('tg_reminder_sent'));
      } else {
        const known = ['no_phone', 'no_debt', 'no_counterparty', 'telegram_off', 'no_chat'];
        const reason =
          res.reason && known.includes(res.reason)
            ? t(`tg_reason_${res.reason}` as 'tg_reason_no_phone')
            : (res.reason ?? '');
        toast.error(t('tg_reminder_failed'), { description: reason });
      }
    },
    onError: (e: Error) => toast.error(t('tg_reminder_failed'), { description: e.message }),
  });

  const columns: DataTableColumn<DebtRow>[] = [
    {
      key: 'select',
      // Master-checkbox: ko'rinayotgan hammasini belgilash/bekor qilish.
      header: (
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleAllVisible}
          className="h-4 w-4 cursor-pointer"
          data-test-id="debt-select-all"
        />
      ),
      cell: (r) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: checkbox o'zi klaviaturaga ega; wrapper faqat qator-klik navigatsiyasini to'xtatadi
        <span onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggleOne(r.id)}
            className="h-4 w-4 cursor-pointer"
            data-test-id={`debt-select-${r.id}`}
          />
        </span>
      ),
      cellText: () => '',
    },
    {
      key: 'rownum',
      header: t('col_num'),
      width: '52px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] tabular-nums">
          {rowNumber.get(r.id) ?? ''}
        </span>
      ),
      cellText: (r) => String(rowNumber.get(r.id) ?? ''),
    },
    {
      key: 'counterparty',
      header: t('col_counterparty'),
      cell: (r) => <span className="font-medium">{r.counterpartyName ?? '—'}</span>,
      cellText: (r) => r.counterpartyName ?? '',
    },
    {
      key: 'phone',
      header: t('col_phone'),
      cell: (r) => r.phone ?? '—',
      cellText: (r) => r.phone ?? '',
    },
    {
      key: 'total',
      header: t('col_total'),
      cell: (r) => <span className="tabular-nums">{formatMoney(r.totalMinor, r.currency)}</span>,
      cellText: (r) => r.totalMinor,
    },
    {
      key: 'remaining',
      header: t('col_remaining'),
      cell: (r) => (
        <span className="font-semibold tabular-nums">
          {formatMoney(r.remainingMinor, r.currency)}
        </span>
      ),
      cellText: (r) => r.remainingMinor,
    },
    {
      key: 'next',
      header: t('col_next_contact'),
      // §3.5 — muddati o'tgan qo'ng'iroq QIZIL bilan ajratiladi.
      cell: (r) =>
        r.nextContactAt ? (
          <span
            className={
              r.overdue
                ? 'font-semibold text-[var(--ms-text-destructive)] tabular-nums'
                : 'tabular-nums'
            }
          >
            {new Date(r.nextContactAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : (
          '—'
        ),
      cellText: (r) => r.nextContactAt ?? '',
    },
    {
      key: 'owner',
      header: t('col_owner'),
      cell: (r) => r.ownerName ?? '—',
      cellText: (r) => r.ownerName ?? '',
    },
    {
      key: 'status',
      header: t('col_status'),
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={statusTone(r)}>{statusLabel(r)}</Badge>
          {r.overdue && <Badge tone="destructive">{t('badge_overdue')}</Badge>}
          {/* Oxirgi qo'ng'iroq natijasi — bir qarashda ko'rinadi (2026-07-12). */}
          {r.lastCallOutcome && (
            <Badge tone={OUTCOME_TONE[r.lastCallOutcome]}>
              📞 {t(`outcome_${r.lastCallOutcome}` as 'outcome_paid_full')}
            </Badge>
          )}
        </div>
      ),
      cellText: (r) => r.status,
    },
    // 2026-07-13: bu yerda har qatorda «📞 Qo'ng'iroq qilindi» tugmasi bor edi.
    // Xuddi shu tugma MIJOZ SAHIFASIDA ham turadi — bitta amal uchun ikkita
    // tugma chalkashtirardi. Ro'yxatdagisi olib tashlandi: operator mijozga
    // kirib, o'sha yerdan natijani belgilaydi.
    {
      // Telegram qarz-eslatma tugmasi (2026-07-19) — qarzi bor mijozga bir bosishda
      // tartibli eslatma ketadi. Qarz qolmagan qatorda tugma ko'rsatilmaydi.
      key: 'tgReminder',
      header: '',
      width: '48px',
      align: 'center',
      cell: (r) => {
        let hasDebt = false;
        try {
          hasDebt = BigInt(r.remainingMinor || '0') > 0n;
        } catch {
          hasDebt = false;
        }
        if (!hasDebt) return null;
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: button o'zi klaviaturaga ega; wrapper faqat qator-klik navigatsiyasini to'xtatadi
          <span onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              title={t('tg_reminder_title')}
              aria-label={t('tg_reminder_title')}
              disabled={reminderMut.isPending}
              onClick={() => reminderMut.mutate(r.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#2ca5e0] hover:bg-[#e8f3fc] disabled:opacity-50"
              data-test-id={`debt-tg-remind-${r.id}`}
            >
              <Send className="-rotate-45 h-4 w-4" />
            </button>
          </span>
        );
      },
      cellText: () => '',
    },
  ];

  return (
    <Container>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/debts/calls">{t('tab_calls')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/called">{t('tab_called')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/problems">{t('tab_problems')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/payments">{t('tab_payments')}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/debts/reports">{t('tab_reports')}</Link>
            </Button>
            {selected.size > 0 && (
              <Button
                variant="secondary"
                onClick={() => setSelected(new Set())}
                data-test-id="debt-clear-selection"
              >
                ✕ {selected.size}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void exportPdf()} data-test-id="debt-pdf">
              {selected.size > 0
                ? `${t('export_pdf_selected')} (${selected.size})`
                : t('export_pdf')}
            </Button>
            <Button asChild>
              <Link href="/debts/new">{t('new_debt')}</Link>
            </Button>
          </div>
        }
      />

      {/* §4 — umumiy hisobot kartochkalari */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t('kpi_outstanding')}
          value={formatMoney(summary.data?.outstandingMinor ?? '0')}
        />
        <StatCard label={t('kpi_debtors')} value={summary.data?.debtorCount ?? 0} />
        <StatCard
          label={t('kpi_overdue')}
          value={formatMoney(summary.data?.overdueMinor ?? '0')}
          hint={`${summary.data?.overdueCount ?? 0}`}
          tone="destructive"
        />
        <StatCard
          label={t('kpi_today_calls')}
          value={summary.data?.todayCallCount ?? 0}
          tone="warning"
        />
        {/* MUAMMOLI mijozlar (2026-07-14) — bosilsa alohida sahifaga o'tadi */}
        <Link href="/debts/problems" className="block">
          <StatCard
            label={t('kpi_problem')}
            value={summary.data?.problemCount ?? 0}
            tone="destructive"
          />
        </Link>
      </div>

      {/* Mijoz-segment tablari: Hammasi · ⚡ Elektriklar · Boshqalar */}
      {elektrikGroupId && (
        <div className="mb-3 flex items-center gap-1" data-test-id="debt-segment">
          {(['all', 'elektrik', 'boshqa'] as Segment[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSegment(s)}
              className={[
                'rounded-[var(--ms-radius-default)] px-3 py-1.5 font-medium text-sm transition-colors',
                segment === s
                  ? 'bg-[var(--ms-primary-600)] text-white'
                  : 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-hover)]',
              ].join(' ')}
              data-test-id={`debt-segment-${s}`}
            >
              {s === 'all'
                ? t('segment_all')
                : s === 'elektrik'
                  ? t('segment_elektrik')
                  : t('segment_boshqa')}
            </button>
          ))}
        </div>
      )}

      {/* Filtrlar (§3.1) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NativeSelect
          value={scope}
          onChange={(e) => setScope(e.target.value as DebtScope)}
          className="w-[220px]"
          data-test-id="debt-scope"
        >
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(`scope_${s}` as 'scope_active')}
            </option>
          ))}
        </NativeSelect>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filter_search')}
          className="w-[240px]"
          data-test-id="debt-search"
        />

        <NativeSelect
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as 'nextContactAt' | 'remainingMinor' | 'totalMinor')
          }
          className="w-[200px]"
          data-test-id="debt-sort"
        >
          <option value="nextContactAt">{t('sort_next_contact')}</option>
          <option value="remainingMinor">{t('sort_remaining')}</option>
          <option value="totalMinor">{t('sort_total')}</option>
        </NativeSelect>

        {/* «Qo'ng'iroq qilinganlar» rejimi: kun (bo'sh = bugun) + natija filtri */}
        {scope === 'called' && (
          <>
            <Input
              type="date"
              value={calledDate}
              onChange={(e) => setCalledDate(e.target.value)}
              className="w-[170px]"
              data-test-id="called-date"
            />
            <NativeSelect
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value as CallOutcome | '')}
              className="w-[210px]"
              data-test-id="called-outcome"
            >
              <option value="">{t('outcome_all')}</option>
              <option value="paid_full">{t('outcome_paid_full')}</option>
              <option value="paid_partial">{t('outcome_paid_partial')}</option>
              <option value="not_paid">{t('outcome_not_paid')}</option>
              <option value="callback">{t('outcome_callback')}</option>
            </NativeSelect>
          </>
        )}
      </div>

      {/* Ranglar izohi — rang o'zi jumboq bo'lib qolmasin */}
      <StatusLegend items={['problem', 'not_paid', 'partial', 'callback', 'no_call']} />

      <DataTable
        columns={columns}
        rows={list.data?.rows ?? []}
        keyField="id"
        // Sarlavha KO'K — qatorlar rangli bo'lgani uchun kulrang sarlavha
        // ular bilan qo'shilib ketardi.
        headerTone="brand"
        loading={list.isLoading}
        onRowClick={(r) => {
          remember(r.id);
          router.push(`/debts/${r.id}`);
        }}
        rowClassName={(r) => rowTone(r, highlightId)}
        onRowMouseEnter={(r) => setHoveredId(r.id)}
        onRowMouseLeave={() => setHoveredId(null)}
        rowTestId={(r) => `debt-row-${r.id}`}
        empty={<EmptyState title={t('empty')} />}
      />

      {/* Sahifalash — «1-100 / 591» (2026-07-13) */}
      {(list.data?.total ?? 0) > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            total={list.data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            visibleCount={visibleRows.length}
            hasPrevious={page > 1}
            hasNext={offset + visibleRows.length < (list.data?.total ?? 0)}
            onFirst={() => setPage(1)}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
            onLast={() => setPage(Math.ceil((list.data?.total ?? 1) / PAGE_SIZE))}
            data-test-id="debt-pagination"
          />
        </div>
      )}

      {/* «Qo'ng'iroq qilindi» — natija modali (umumiy komponent) */}
    </Container>
  );
}
