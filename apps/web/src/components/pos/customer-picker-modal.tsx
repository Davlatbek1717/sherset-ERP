'use client';

import { api } from '@/lib/api-client';
import { Button, Input, Modal, useToast } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PickedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

interface CounterpartyRow {
  id: string;
  name: string;
  phone: string | null;
  legalTitle: string | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

interface CustomerPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title varies by checkout mode (Qarzga / Buyurtma / Sovg'a). */
  title: string;
  /** Confirm-button label varies by mode. */
  confirmLabel: string;
  /** Whether the confirm action is in flight (disables the picker). */
  confirming?: boolean;
  /** Called with the chosen counterparty once the operator confirms. */
  onConfirm: (customer: PickedCustomer) => void;
}

/**
 * Counterparty search + quick-create picker used by the unified sales screen's
 * credit / order / gift checkout modes (all three need a customer, unlike the
 * walk-in cash sale). Search hits `GET /counterparties?search=`; quick-create
 * posts the minimal `{ name, phone }` to `POST /counterparties`.
 */
export function CustomerPickerModal({
  open,
  onOpenChange,
  title,
  confirmLabel,
  confirming = false,
  onConfirm,
}: CustomerPickerModalProps) {
  const t = useTranslations('pages.sotuv');
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PickedCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const { data, isLoading } = useQuery<ListResponse<CounterpartyRow>>({
    queryKey: ['counterparties-pos', search],
    queryFn: () =>
      api.get<ListResponse<CounterpartyRow>>(
        `/counterparties?search=${encodeURIComponent(search)}&limit=20`,
      ),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; phone: string | null }) =>
      api.post<CounterpartyRow>('/counterparties', body),
    onSuccess: (row) => {
      setSelected({ id: row.id, name: row.name, phone: row.phone });
      setCreating(false);
      setNewName('');
      setNewPhone('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setSearch('');
    setSelected(null);
    setCreating(false);
    setNewName('');
    setNewPhone('');
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast.error(t('customer_name_required'));
      return;
    }
    createMut.mutate({ name, phone: newPhone.trim() || null });
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      widthClass="w-[460px]"
      testId="pos-customer-picker"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!selected || confirming}
            onClick={() => selected && onConfirm(selected)}
            data-test-id="pos-customer-confirm"
          >
            {confirming ? '...' : confirmLabel}
          </Button>
        </div>
      }
    >
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--ms-brand)] bg-[var(--ms-bg-hover)] px-3 py-2.5">
          <div>
            <div className="font-medium text-sm">{selected.name}</div>
            {selected.phone && (
              <div className="text-[var(--ms-text-muted)] text-xs">{selected.phone}</div>
            )}
          </div>
          <Button variant="link" className="h-auto px-0 text-xs" onClick={() => setSelected(null)}>
            {t('change')}
          </Button>
        </div>
      ) : creating ? (
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">{t('name')}</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('name')}
              data-test-id="pos-new-customer-name"
            />
          </div>
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">{t('phone')}</span>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder={t('phone')}
              inputMode="tel"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={createMut.isPending} onClick={handleCreate}>
              {createMut.isPending ? '...' : t('create')}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_customer')}
            data-test-id="pos-customer-search"
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--ms-border)]">
            {isLoading ? (
              <div className="p-4 text-center text-[var(--ms-text-muted)] text-sm">
                {t('loading')}
              </div>
            ) : (data?.items.length ?? 0) === 0 ? (
              <div className="p-4 text-center text-[var(--ms-text-muted)] text-sm">
                {t('no_customers')}
              </div>
            ) : (
              data?.items.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSelected({ id: c.id, name: c.name, phone: c.phone })}
                  className="flex w-full flex-col items-start border-[var(--ms-border)] border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-[var(--ms-bg-hover)]"
                >
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.phone && (
                    <span className="text-[var(--ms-text-muted)] text-xs">{c.phone}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            + {t('new_customer')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
