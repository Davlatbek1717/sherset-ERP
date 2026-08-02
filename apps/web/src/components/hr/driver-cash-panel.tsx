'use client';

/**
 * Dispecher/kassir paneli — haydovchilardagi topshirilmagan naqd (HR TZ §7.2).
 *
 * «Topshirilmagan naqd haydovchi kartasida QIZIL bo'lib turadi» — TZ talabi.
 * Qabul qilish tugmasi bosilganda mavjud auditlangan ПКО yaratiladi
 * (`driver-cash.service.ts`), shuning uchun bu yerda uchta ma'lumot so'raladi:
 * qaysi kontragent nomidan, qaysi tashkilotga, qaysi kassaga. Ular `CashIn`
 * sxemasining majburiy maydonlari va taxmin qilib bo'lmaydi.
 */

import { api } from '@/lib/api-client';
import { type DriverCashHandover, type DriverCashOutstanding, driverCashApi } from '@/lib/hr-api';
import { Alert, Button, Combobox, type ComboboxItem, formatMoney, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const refFetch =
  (path: string) =>
  async (q: string): Promise<ComboboxItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `${path}?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name }));
  };

const fetchAgents = refFetch('/counterparties');
const fetchOrgs = refFetch('/admin/organizations');
const fetchDesks = refFetch('/admin/cash-desks');

function RefPick({
  value,
  onChange,
  fetch,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  fetch: (q: string) => Promise<ComboboxItem[]>;
  placeholder: string;
  testId: string;
}) {
  const [items, setItems] = useState<ComboboxItem[]>([]);
  return (
    <Combobox
      value={value || undefined}
      onChange={(v) => onChange(v ?? '')}
      items={items}
      onSearch={async (q) => {
        const r = await fetch(q);
        setItems(r);
        return r;
      }}
      placeholder={placeholder}
      testId={testId}
    />
  );
}

export function DriverCashPanel() {
  const t = useTranslations('pages.driver_cash');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openDriver, setOpenDriver] = useState<string | null>(null);
  const [agentId, setAgentId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [deskId, setDeskId] = useState('');

  const { data: outstanding } = useQuery<DriverCashOutstanding[]>({
    queryKey: ['driver-cash-outstanding'],
    queryFn: () => driverCashApi.outstanding(),
    refetchInterval: 60_000,
  });

  const { data: rows } = useQuery<DriverCashHandover[]>({
    queryKey: ['driver-cash-list', openDriver],
    queryFn: () => driverCashApi.list(openDriver ?? undefined),
    enabled: !!openDriver,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['driver-cash-outstanding'] });
    qc.invalidateQueries({ queryKey: ['driver-cash-list'] });
  };

  const acceptMut = useMutation({
    mutationFn: (row: DriverCashHandover) =>
      driverCashApi.handOver(row.id, {
        agentId,
        organizationId: orgId,
        cashDeskId: deskId,
        // Optimistik qulf — ikki kassir bir vaqtda qabul qilib ikki ПКО yaratmasin.
        version: row.version,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t('accepted'));
    },
    // 409 (boshqa kassir ulgurdi) yoki ПКО xatosi — EKRANDA ko'rsatiladi.
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => driverCashApi.cancel(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('cancelled'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = outstanding ?? [];
  const canAccept = !!agentId && !!orgId && !!deskId && !acceptMut.isPending;

  return (
    <div
      className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] p-3"
      data-test-id="driver-cash-panel"
    >
      <h2 className="mb-2 font-semibold text-sm">{t('title')}</h2>

      {list.length === 0 ? (
        <p className="text-[var(--ms-text-muted)] text-sm">{t('none')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((d) => (
            <div key={d.driverId}>
              <button
                type="button"
                onClick={() => setOpenDriver(openDriver === d.driverId ? null : d.driverId)}
                className="flex w-full items-center justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-left"
                data-test-id="driver-cash-row"
              >
                <span className="font-medium text-sm">{d.driverName}</span>
                <span className="font-semibold text-red-800 text-sm">
                  {formatMoney(BigInt(d.pendingMinor), 'UZS')} · {d.pendingCount}
                </span>
              </button>

              {openDriver === d.driverId && (
                <div className="mt-1.5 flex flex-col gap-2 rounded-lg border border-[var(--ms-border-default)] p-2">
                  <RefPick
                    value={agentId}
                    onChange={setAgentId}
                    fetch={fetchAgents}
                    placeholder={t('pick_agent')}
                    testId="driver-cash-agent"
                  />
                  <RefPick
                    value={orgId}
                    onChange={setOrgId}
                    fetch={fetchOrgs}
                    placeholder={t('pick_org')}
                    testId="driver-cash-org"
                  />
                  <RefPick
                    value={deskId}
                    onChange={setDeskId}
                    fetch={fetchDesks}
                    placeholder={t('pick_desk')}
                    testId="driver-cash-desk"
                  />
                  {!canAccept && <Alert tone="warning">{t('need_refs')}</Alert>}

                  {(rows ?? []).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--ms-border-default)] px-2 py-1.5"
                    >
                      <span className="text-sm">{formatMoney(BigInt(r.amountMinor), 'UZS')}</span>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => acceptMut.mutate(r)}
                          disabled={!canAccept}
                          data-test-id="driver-cash-accept"
                        >
                          {t('accept')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => cancelMut.mutate(r.id)}
                          disabled={cancelMut.isPending}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[var(--ms-text-muted)] text-xs">{t('hint')}</p>
    </div>
  );
}
