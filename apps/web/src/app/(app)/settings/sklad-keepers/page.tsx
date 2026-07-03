'use client';

/**
 * /settings/sklad-keepers — «Sklad → Omborchi» (Sherset custom).
 *
 * Maps each warehouse zone number («sklad», the 1st segment of a product's bin
 * code «NN-NN-NN-NN») to the warehouse-keeper (omborchi) responsible for it.
 * When a customer order is sent to picking («Yig'ishga yuborish»), its lines are
 * grouped by sklad and each group's task goes to that sklad's keeper.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { fetchAgentPrinters } from '@/lib/print-agent';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  Input,
  Modal,
  NativeSelect,
  type PickerItem,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface KeeperRow {
  id: string;
  skladNo: number;
  employeeId: string;
  employeeName: string | null;
  printerName: string | null;
}

export default function SkladKeepersPage() {
  const t = useTranslations('sklad_keepers');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const { data, isLoading } = useQuery<{ items: KeeperRow[]; receiptPrinterName: string | null }>({
    queryKey: ['sklad-keepers'],
    queryFn: () => api.get('/sklad-keepers'),
  });
  const items = data?.items ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KeeperRow | null>(null);
  const [skladNo, setSkladNo] = useState('');
  const [empId, setEmpId] = useState<string | null>(null);
  const [empLabel, setEmpLabel] = useState('');
  const [printerName, setPrinterName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Printers installed on THIS (cashier) PC, read from the local print-agent.
  // Empty when the agent isn't running → the field falls back to manual text.
  // Fetched on mount so both the receipt-printer card and the keeper modal
  // share one probe.
  const [agentPrinters, setAgentPrinters] = useState<string[]>([]);
  const [agentChecked, setAgentChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAgentPrinters().then((list) => {
      if (!alive) return;
      setAgentPrinters(list);
      setAgentChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Customer-receipt («mijoz cheki») printer — account-wide setting ─────────
  const [receiptPrinter, setReceiptPrinter] = useState('');
  const receiptLoaded = data !== undefined;
  useEffect(() => {
    if (data) setReceiptPrinter(data.receiptPrinterName ?? '');
  }, [data]);
  const receiptMut = useMutation({
    mutationFn: (name: string) =>
      api.put('/sklad-keepers/receipt-printer', { printerName: name.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sklad-keepers'] }),
  });
  const receiptDirty = receiptLoaded && receiptPrinter !== (data?.receiptPrinterName ?? '');

  const empFetcher = async (search: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; email?: string | null }> }>(
      `/employees?search=${encodeURIComponent(search)}&limit=20`,
    );
    return d.items.map((e) => ({ id: e.id, primary: e.name, secondary: e.email ?? undefined }));
  };

  const upsertMut = useMutation({
    mutationFn: () =>
      api.put('/sklad-keepers', {
        skladNo: Number(skladNo),
        employeeId: empId,
        printerName: printerName.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sklad-keepers'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeMut = useApiMutation({
    mutationFn: (row: KeeperRow) => api.delete(`/sklad-keepers/${row.skladNo}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sklad-keepers'] }),
  });

  function openCreate() {
    setEditing(null);
    setSkladNo('');
    setEmpId(null);
    setEmpLabel('');
    setPrinterName('');
    setError(null);
    setModalOpen(true);
  }
  function openEdit(row: KeeperRow) {
    setEditing(row);
    setSkladNo(String(row.skladNo));
    setEmpId(row.employeeId);
    setEmpLabel(row.employeeName ?? '');
    setPrinterName(row.printerName ?? '');
    setError(null);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }
  function submit() {
    if (skladNo === '' || Number.isNaN(Number(skladNo)) || Number(skladNo) < 0) {
      setError(t('sklad_required'));
      return;
    }
    if (!empId) {
      setError(t('omborchi_required'));
      return;
    }
    // Editing an existing row to a different sklad would orphan the old one; the
    // sklad number is the key, so disallow changing it on edit (re-create instead).
    upsertMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" data-test-id="sklad-keepers-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Button variant="primary" onClick={openCreate} data-test-id="sklad-keeper-add">
          {t('add')}
        </Button>
      </div>

      {/* Customer-receipt printer — account-wide. The «mijoz cheki» prints
          straight to this printer via the agent (one action, correct thermal
          size), exactly like each sklad's picking sheet. */}
      <div
        className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
        data-test-id="receipt-printer-card"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">
              Chek printeri (mijoz cheki)
            </span>
            <p className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
              Mijoz cheki shu printerdan chiqadi. Bo'sh qoldirilsa — brauzer orqali chiqadi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {agentPrinters.length > 0 ? (
              <NativeSelect
                value={receiptPrinter}
                onChange={(e) => setReceiptPrinter(e.target.value)}
                className="min-w-[220px]"
                data-test-id="receipt-printer-select"
              >
                <option value="">— (brauzer orqali)</option>
                {receiptPrinter && !agentPrinters.includes(receiptPrinter) && (
                  <option value={receiptPrinter}>{receiptPrinter} (ulanmagan)</option>
                )}
                {agentPrinters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                value={receiptPrinter}
                onChange={(e) => setReceiptPrinter(e.target.value)}
                placeholder="Printer nomi (masalan XP-80C)"
                className="min-w-[220px]"
                data-test-id="receipt-printer-input"
              />
            )}
            <Button
              onClick={() => receiptMut.mutate(receiptPrinter)}
              disabled={!receiptDirty || receiptMut.isPending}
              data-test-id="receipt-printer-save"
            >
              {tCommon('save')}
            </Button>
          </div>
        </div>
        {agentChecked && agentPrinters.length === 0 && (
          <p className="mt-2 text-[var(--ms-text-muted)] text-xs">
            Print-agent topilmadi — nomni qo'lda kiriting (yoki agentni ishga tushiring).
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm" data-test-id="sklad-keepers-table">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-secondary)] text-xs">
              <th className="px-4 py-2 font-medium">{t('col_sklad')}</th>
              <th className="px-4 py-2 font-medium">{t('col_omborchi')}</th>
              <th className="px-4 py-2 font-medium">Printer</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.id}
                className="border-[var(--ms-border-default)] border-b last:border-0 hover:bg-[var(--ms-row-hover)]"
                data-test-id={`sklad-keeper-row-${row.skladNo}`}
              >
                <td className="px-4 py-2.5">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-brand-50)] px-2 font-mono font-semibold text-[var(--ms-text-brand)] tabular-nums">
                    {String(row.skladNo).padStart(2, '0')}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-[var(--ms-text-primary)]">
                  {row.employeeName ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-[var(--ms-text-secondary)]">
                  {row.printerName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {row.printerName}
                    </span>
                  ) : (
                    <span className="text-[var(--ms-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="text-[var(--ms-text-brand)] hover:underline"
                      onClick={() => openEdit(row)}
                      data-test-id={`sklad-keeper-edit-${row.skladNo}`}
                    >
                      {t('change')}
                    </button>
                    <button
                      type="button"
                      className="text-[var(--ms-text-destructive)] hover:underline"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('delete_confirm', { sklad: row.skladNo }),
                          confirmLabel: tCommon('delete'),
                          tone: 'destructive',
                        });
                        if (ok) removeMut.mutate(row);
                      }}
                      data-test-id={`sklad-keeper-delete-${row.skladNo}`}
                    >
                      {tCommon('delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-[var(--ms-text-muted)]"
                  data-test-id="sklad-keepers-empty"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={(v) => (v ? undefined : closeModal())}
        title={editing ? t('edit_title', { sklad: editing.skladNo }) : t('add')}
        widthClass="w-[460px]"
        testId="sklad-keeper-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={submit} disabled={upsertMut.isPending}>
              {tCommon('save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sklad-keeper-no"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('col_sklad')}
            </label>
            <Input
              id="sklad-keeper-no"
              type="number"
              min="0"
              max="99999"
              value={skladNo}
              onChange={(e) => setSkladNo(e.target.value)}
              disabled={!!editing}
              placeholder={t('sklad_placeholder')}
              data-test-id="sklad-keeper-no"
            />
            <span className="text-[var(--ms-text-muted)] text-xs">{t('sklad_hint')}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">
              {t('col_omborchi')}
            </span>
            <CatalogPickerField
              value={empId ? { id: empId, label: empLabel } : null}
              placeholder={t('omborchi_placeholder')}
              onPick={() => setPickerOpen(true)}
              onClear={() => {
                setEmpId(null);
                setEmpLabel('');
              }}
              testId="sklad-keeper-omborchi"
            />
          </div>

          {/* Printer — this sklad's picking sheet is routed here. Dropdown from the
              local print-agent's installed printers; if the agent isn't running,
              falls back to a manual text input so the value can still be set. */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">Printer</span>
            {agentPrinters.length > 0 ? (
              <NativeSelect
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                data-test-id="sklad-keeper-printer"
              >
                <option value="">— (chiqarilmaydi)</option>
                {/* keep a stored value that's no longer installed selectable */}
                {printerName && !agentPrinters.includes(printerName) && (
                  <option value={printerName}>{printerName} (ulanmagan)</option>
                )}
                {agentPrinters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                placeholder="Printer nomi (masalan XP-80C)"
                data-test-id="sklad-keeper-printer"
              />
            )}
            <span className="text-[var(--ms-text-muted)] text-xs">
              {agentChecked && agentPrinters.length === 0
                ? "Print-agent topilmadi — nomni qo'lda kiriting (yoki agentni ishga tushiring)."
                : 'Shu ombor cheki qaysi printerdan chiqishini tanlang. Bir printerni bir necha omborga ham berish mumkin.'}
            </span>
          </div>

          {error && (
            <div
              className="text-[var(--ms-text-destructive)] text-sm"
              data-test-id="sklad-keeper-error"
            >
              {error}
            </div>
          )}
        </div>
      </Modal>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('col_omborchi')}
        fetcher={empFetcher}
        onSelect={(item) => {
          setEmpId(item.id);
          setEmpLabel(String(item.primary));
        }}
      />
    </div>
  );
}
