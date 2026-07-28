'use client';

/**
 * «Массовое редактирование» — FULL PAGE, moysklad #bulkEdit 1:1 (owner
 * 2026-07-10, grounded on his live screenshots of online.moysklad.ru):
 *
 *   [Закрыть]
 *   (?) Массовое редактирование: <Раздел>
 *   [ℹ dismissible banner: what mass edit does + «Читать инструкцию» link]
 *   left rail: ▶ Настройка параметров / Подтверждение   ·   [Выбрано N документов]
 *   «Настройка параметров» (orange) → opt-in field rows grouped as
 *   Статус · Документ (Проект ⊕ · Статья расходов*) · Доступ (Владелец-
 *   сотрудник · *Владелец-отдел · Общий доступ Да/Нет) → [Далее]
 *   step 2 «Подтверждение»: summary of the ticked fields → [Применить]/[Назад]
 *
 * One generic page serves every section via ENTITY_CONFIG — the list pages
 * stash {entity, ids, from} in sessionStorage (lib/bulk-edit-nav.ts) and
 * navigate here. Apply = POST /<entity>/mass-edit chunked by 100 ids (the BE
 * MassEditBaseSchema cap).
 */

import { api } from '@/lib/api-client';
import { readBulkEdit } from '@/lib/bulk-edit-nav';
import { Button, Checkbox, NativeSelect, RadioGroup, useToast } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface EntityConfig {
  /** API base path segment, e.g. 'purchase-orders' → POST /purchase-orders/mass-edit. */
  api: string;
  /** i18n key inside bulk_edit_page.sections. */
  sectionKey: string;
  /** State.entityType when the entity has custom statuses (adds the Статус row). */
  statusEntityType?: string;
  /** «Статья расходов» row (Loss/CashOut/PaymentOut — stored as item NAME). */
  hasExpenseItem?: boolean;
  /** Most docs have Проект; payroll/price-list/project do not. */
  hasProject?: boolean;
}

const ENTITY_CONFIG: Record<string, EntityConfig> = {
  'purchase-orders': {
    api: 'purchase-orders',
    sectionKey: 'purchase_orders',
    statusEntityType: 'purchaseorder',
    hasProject: true,
  },
  'customer-orders': {
    api: 'customer-orders',
    sectionKey: 'customer_orders',
    statusEntityType: 'customerorder',
    hasProject: true,
  },
  demands: { api: 'demands', sectionKey: 'demands', statusEntityType: 'demand', hasProject: true },
  supplies: {
    api: 'supplies',
    sectionKey: 'supplies',
    statusEntityType: 'supply',
    hasProject: true,
  },
  'invoices-out': {
    api: 'invoices-out',
    sectionKey: 'invoices_out',
    statusEntityType: 'invoiceout',
    hasProject: true,
  },
  'invoices-in': { api: 'invoices-in', sectionKey: 'invoices_in', hasProject: true },
  'purchase-returns': {
    api: 'purchase-returns',
    sectionKey: 'purchase_returns',
    statusEntityType: 'purchasereturn',
    hasProject: true,
  },
  'sales-returns': {
    api: 'sales-returns',
    sectionKey: 'sales_returns',
    statusEntityType: 'salesreturn',
    hasProject: true,
  },
  losses: { api: 'losses', sectionKey: 'losses', hasExpenseItem: true, hasProject: true },
  enters: { api: 'enters', sectionKey: 'enters', hasProject: true },
  moves: { api: 'moves', sectionKey: 'moves', hasProject: true },
  inventories: { api: 'inventories', sectionKey: 'inventories', hasProject: true },
  'internal-orders': { api: 'internal-orders', sectionKey: 'internal_orders', hasProject: true },
  'cash-in': { api: 'cash-in', sectionKey: 'cash_in', hasProject: true },
  'cash-out': { api: 'cash-out', sectionKey: 'cash_out', hasExpenseItem: true, hasProject: true },
  'payments-in': { api: 'payments-in', sectionKey: 'payments_in', hasProject: true },
  'payments-out': {
    api: 'payments-out',
    sectionKey: 'payments_out',
    hasExpenseItem: true,
    hasProject: true,
  },
  prepayments: { api: 'prepayments', sectionKey: 'prepayments', hasProject: true },
  'prepayment-returns': {
    api: 'prepayment-returns',
    sectionKey: 'prepayment_returns',
    hasProject: true,
  },
  'counterparty-adjustments': {
    api: 'counterparty-adjustments',
    sectionKey: 'counterparty_adjustments',
    hasProject: true,
  },
  payrolls: { api: 'payrolls', sectionKey: 'payrolls' },
  'price-lists': { api: 'price-lists', sectionKey: 'price_lists' },
  projects: { api: 'projects', sectionKey: 'projects' },
  processings: { api: 'processings', sectionKey: 'processings', hasProject: true },
  'processing-orders': {
    api: 'processing-orders',
    sectionKey: 'processing_orders',
    hasProject: true,
  },
};

interface RefItem {
  id: string;
  name: string;
}

export default function BulkEditPage() {
  const router = useRouter();
  const t = useTranslations('bulk_edit_page');
  const { toast } = useToast();

  // sessionStorage is browser-only — read once on mount.
  const [payload, setPayload] = useState<ReturnType<typeof readBulkEdit>>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setPayload(readBulkEdit());
    setLoaded(true);
  }, []);

  const cfg = payload ? ENTITY_CONFIG[payload.entity] : undefined;
  const ids = useMemo(() => payload?.ids ?? [], [payload]);

  const [step, setStep] = useState<'params' | 'confirm'>('params');
  const [bannerOpen, setBannerOpen] = useState(true);
  const [applying, setApplying] = useState(false);

  // Opt-in rows: tick + value (moysklad: unticked rows are not applied).
  const [editStatus, setEditStatus] = useState(false);
  const [stateId, setStateId] = useState('');
  const [editProject, setEditProject] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [editExpense, setEditExpense] = useState(false);
  const [expenseItem, setExpenseItem] = useState('');
  const [editOwner, setEditOwner] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [editGroup, setEditGroup] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [editShared, setEditShared] = useState(false);
  const [sharedValue, setSharedValue] = useState(true);

  const { data: statesData } = useQuery<{ items: Array<RefItem> }>({
    queryKey: ['states', cfg?.statusEntityType],
    queryFn: () => api.get(`/states?entityType=${cfg?.statusEntityType}`),
    enabled: !!cfg?.statusEntityType,
    staleTime: 5 * 60 * 1000,
  });
  const { data: projectsData } = useQuery<{ items: Array<RefItem> }>({
    queryKey: ['projects', 'bulk-edit'],
    queryFn: () => api.get('/projects?limit=100'),
    enabled: !!cfg?.hasProject,
    staleTime: 5 * 60 * 1000,
  });
  const { data: expenseData } = useQuery<{ items: Array<RefItem> }>({
    queryKey: ['expense-items', 'bulk-edit'],
    queryFn: () => api.get('/expense-items?limit=100'),
    enabled: !!cfg?.hasExpenseItem,
    staleTime: 5 * 60 * 1000,
  });
  const { data: employeesData } = useQuery<{ items: Array<RefItem> }>({
    queryKey: ['employees', 'bulk-edit'],
    queryFn: () => api.get('/employees?limit=100'),
    enabled: !!cfg,
    staleTime: 5 * 60 * 1000,
  });
  const { data: groupsData } = useQuery<{ items: Array<RefItem> }>({
    queryKey: ['groups', 'bulk-edit'],
    queryFn: () => api.get('/groups?limit=100'),
    enabled: !!cfg,
    staleTime: 5 * 60 * 1000,
  });

  const anyTicked =
    editStatus || editProject || editExpense || editOwner || editGroup || editShared;

  const close = () => router.push(payload?.from ?? '/');

  const buildPatch = () => {
    const patch: Record<string, unknown> = {};
    if (editStatus) patch.stateId = stateId === '' ? null : stateId;
    if (editProject) patch.projectId = projectId === '' ? null : projectId;
    if (editExpense) patch.expenseItem = expenseItem === '' ? null : expenseItem;
    if (editOwner) patch.ownerId = ownerId === '' ? null : ownerId;
    if (editGroup) patch.groupId = groupId === '' ? null : groupId;
    if (editShared) patch.shared = sharedValue;
    return patch;
  };

  const apply = async () => {
    if (!cfg || ids.length === 0) return;
    setApplying(true);
    try {
      const patch = buildPatch();
      // BE MassEditBaseSchema caps ids at 100 — chunk large sets sequentially.
      for (let i = 0; i < ids.length; i += 100) {
        await api.post(`/${cfg.api}/mass-edit`, { ids: ids.slice(i, i + 100), ...patch });
      }
      toast.success(t('applied', { count: ids.length }));
      sessionStorage.removeItem('bulkEdit');
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!loaded) return null;

  if (!payload || !cfg) {
    return (
      <div className="p-6" data-test-id="bulk-edit-page-empty">
        <Button variant="secondary" onClick={() => router.push('/')}>
          {t('close')}
        </Button>
        <p className="mt-6 text-[var(--ms-text-muted)] text-sm">{t('empty')}</p>
      </div>
    );
  }

  const sectionTitle = t(`sections.${cfg.sectionKey}`);

  // Confirmation summary rows (step 2) — label → chosen value.
  const summary: Array<{ label: string; value: string }> = [];
  if (editStatus)
    summary.push({
      label: t('status'),
      value: statesData?.items.find((s) => s.id === stateId)?.name ?? '—',
    });
  if (editProject)
    summary.push({
      label: t('project'),
      value: projectsData?.items.find((p) => p.id === projectId)?.name ?? '—',
    });
  if (editExpense) summary.push({ label: t('expense_item'), value: expenseItem || '—' });
  if (editOwner)
    summary.push({
      label: t('owner'),
      value: employeesData?.items.find((e) => e.id === ownerId)?.name ?? '—',
    });
  if (editGroup)
    summary.push({
      label: t('group'),
      value: groupsData?.items.find((g) => g.id === groupId)?.name ?? '—',
    });
  if (editShared) summary.push({ label: t('shared'), value: sharedValue ? t('yes') : t('no') });

  return (
    <div className="min-h-screen bg-white px-6 py-4" data-test-id="bulk-edit-page">
      {/* [Закрыть] — top-left, moysklad's only chrome on #bulkEdit */}
      <Button variant="secondary" onClick={close} data-test-id="bulk-edit-close">
        {t('close')}
      </Button>

      {/* (?) Массовое редактирование: <Раздел> */}
      <h1 className="mt-4 flex items-center gap-2 font-semibold text-[22px] text-[var(--ms-text-primary)]">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ms-text-brand)] font-bold text-[12px] text-white"
        >
          ?
        </span>
        {t('title')}: {sectionTitle}
      </h1>

      {/* ℹ dismissible banner */}
      {bannerOpen && (
        <div
          className="relative mt-4 max-w-[460px] rounded border border-[#bfdbf2] bg-[#eaf4fb] px-4 py-3 text-[13px] text-[var(--ms-text-primary)]"
          data-test-id="bulk-edit-banner"
        >
          <button
            type="button"
            aria-label="close"
            onClick={() => setBannerOpen(false)}
            className="absolute top-1.5 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
          >
            ×
          </button>
          <p className="pr-4">{t('banner_text')}</p>
          <p className="mt-2">
            {t('banner_read')}{' '}
            <a
              className="text-[var(--ms-text-link)] underline"
              href="https://kb.moysklad.ru/priyomy-raboty/massovoe-redaktirovanie/"
              target="_blank"
              rel="noreferrer"
            >
              {t('title')}
            </a>
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-10">
        {/* Left rail — wizard steps */}
        <nav className="w-[230px] shrink-0 text-sm" data-test-id="bulk-edit-steps">
          <div
            className={
              step === 'params'
                ? 'flex items-center gap-1 font-semibold text-[var(--ms-text-primary)]'
                : 'text-[var(--ms-text-muted)]'
            }
          >
            {step === 'params' ? <span aria-hidden>▶</span> : null} {t('step_params')}
          </div>
          <div
            className={
              step === 'confirm'
                ? 'mt-2 flex items-center gap-1 font-semibold text-[var(--ms-text-primary)]'
                : 'mt-2 text-[var(--ms-text-muted)]'
            }
          >
            {step === 'confirm' ? <span aria-hidden>▶</span> : null} {t('step_confirm')}
          </div>
        </nav>

        {/* Main column */}
        <div className="min-w-0 max-w-[620px] flex-1">
          <div
            className="inline-block rounded bg-[var(--ms-bg-muted)] px-4 py-2 text-sm"
            data-test-id="bulk-edit-count"
          >
            {t('selected_count', { count: ids.length })}
          </div>

          {step === 'params' ? (
            <>
              <h2 className="mt-6 text-[15px] text-[var(--ms-warning-600,#d97706)]">
                {t('step_params')}
              </h2>

              <div className="mt-5 flex flex-col gap-5">
                {cfg.statusEntityType ? (
                  <Row
                    checked={editStatus}
                    onChecked={setEditStatus}
                    label={t('status')}
                    testId="bulk-edit-row-status"
                  >
                    <NativeSelect
                      value={stateId}
                      onChange={(e) => setStateId(e.target.value)}
                      disabled={!editStatus}
                      data-test-id="bulk-edit-status-select"
                    >
                      <option value="">{''}</option>
                      {(statesData?.items ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Row>
                ) : null}

                {cfg.hasProject || cfg.hasExpenseItem ? (
                  <div className="flex flex-col gap-4">
                    <h3 className="font-semibold text-[14px]">{t('group_document')}</h3>
                    {cfg.hasProject ? (
                      <Row
                        checked={editProject}
                        onChecked={setEditProject}
                        label={t('project')}
                        testId="bulk-edit-row-project"
                        after={
                          <a
                            href="/settings/projects/new"
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t('project_create')}
                            className="font-bold text-[var(--ms-text-link)] text-lg leading-none"
                          >
                            +
                          </a>
                        }
                      >
                        <NativeSelect
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          disabled={!editProject}
                          data-test-id="bulk-edit-project-select"
                        >
                          <option value="">{''}</option>
                          {(projectsData?.items ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </Row>
                    ) : null}
                    {cfg.hasExpenseItem ? (
                      <Row
                        checked={editExpense}
                        onChecked={setEditExpense}
                        label={`* ${t('expense_item')}`}
                        testId="bulk-edit-row-expense"
                      >
                        <NativeSelect
                          value={expenseItem}
                          onChange={(e) => setExpenseItem(e.target.value)}
                          disabled={!editExpense}
                          data-test-id="bulk-edit-expense-select"
                        >
                          <option value="">{''}</option>
                          {(expenseData?.items ?? []).map((x) => (
                            <option key={x.id} value={x.name}>
                              {x.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </Row>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-4">
                  <h3 className="font-semibold text-[14px]">{t('group_access')}</h3>
                  <Row
                    checked={editOwner}
                    onChecked={setEditOwner}
                    label={t('owner')}
                    testId="bulk-edit-row-owner"
                  >
                    <NativeSelect
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      disabled={!editOwner}
                      data-test-id="bulk-edit-owner-select"
                    >
                      <option value="">{''}</option>
                      {(employeesData?.items ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Row>
                  <Row
                    checked={editGroup}
                    onChecked={setEditGroup}
                    label={`* ${t('group')}`}
                    testId="bulk-edit-row-group"
                  >
                    <NativeSelect
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      disabled={!editGroup}
                      data-test-id="bulk-edit-group-select"
                    >
                      <option value="">{''}</option>
                      {(groupsData?.items ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Row>
                  <Row
                    checked={editShared}
                    onChecked={setEditShared}
                    label={t('shared')}
                    testId="bulk-edit-row-shared"
                  >
                    <RadioGroup
                      name="bulk-edit-shared"
                      value={sharedValue ? 'yes' : 'no'}
                      onChange={(next) => setSharedValue(next === 'yes')}
                      ariaLabel={t('shared')}
                      className="gap-1 text-sm"
                      options={[
                        { value: 'yes', label: t('yes'), disabled: !editShared },
                        { value: 'no', label: t('no'), disabled: !editShared },
                      ]}
                    />
                  </Row>
                </div>
              </div>

              <hr className="mt-6 border-[var(--ms-border-default)]" />
              <Button
                variant="primary"
                className="mt-4"
                disabled={!anyTicked}
                onClick={() => setStep('confirm')}
                data-test-id="bulk-edit-next"
              >
                {t('next')}
              </Button>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-[15px] text-[var(--ms-warning-600,#d97706)]">
                {t('step_confirm')}
              </h2>
              <p className="mt-4 text-sm">{t('confirm_text', { count: ids.length })}</p>
              <table className="mt-4 text-sm">
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.label}>
                      <td className="py-1 pr-8 text-[var(--ms-text-muted)]">{r.label}</td>
                      <td className="py-1 font-medium">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr className="mt-6 border-[var(--ms-border-default)]" />
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setStep('params')}
                  disabled={applying}
                  data-test-id="bulk-edit-back"
                >
                  {t('back')}
                </Button>
                <Button
                  variant="primary"
                  onClick={apply}
                  disabled={applying}
                  data-test-id="bulk-edit-apply"
                >
                  {t('apply')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  checked,
  onChecked,
  label,
  children,
  after,
  testId,
}: {
  checked: boolean;
  onChecked: (v: boolean) => void;
  label: string;
  children: React.ReactNode;
  after?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="grid grid-cols-[auto_190px_260px_auto] items-center gap-3"
      data-test-id={testId}
    >
      <Checkbox checked={checked} onCheckedChange={(n) => onChecked(n === true)} />
      <span className="text-sm">{label}</span>
      <div>{children}</div>
      {after ? <div>{after}</div> : <div />}
    </div>
  );
}
