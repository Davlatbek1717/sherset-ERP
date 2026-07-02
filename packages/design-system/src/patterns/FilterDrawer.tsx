'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { Input } from '../primitives/Input.tsx';
import { Label } from '../primitives/Label.tsx';
import { CatalogPicker, CatalogPickerField, type PickerItem } from './CatalogPicker.tsx';

export interface FilterDrawerValues {
  momentFrom?: string;
  momentTo?: string;
  sumMinorFrom?: number;
  sumMinorTo?: number;
  agentId?: string;
  agentLabel?: string;
  organizationId?: string;
  organizationLabel?: string;
  storeId?: string;
  storeLabel?: string;
  ownerId?: string;
  ownerLabel?: string;
}

export interface FilterDrawerLabels {
  filterButton?: string;
  title?: string;
  apply?: string;
  reset?: string;
  period?: string;
  from?: string;
  to?: string;
  sum?: string;
  agent?: string;
  organization?: string;
  store?: string;
  owner?: string;
}

export interface FilterDrawerProps {
  values: FilterDrawerValues;
  onChange: (next: FilterDrawerValues) => void;
  onApply?: () => void;
  onReset: () => void;
  agentFetcher?: (search: string) => Promise<PickerItem[]>;
  orgFetcher?: (search: string) => Promise<PickerItem[]>;
  storeFetcher?: (search: string) => Promise<PickerItem[]>;
  ownerFetcher?: (search: string) => Promise<PickerItem[]>;
  hasStore?: boolean;
  hasAgent?: boolean;
  hasOrg?: boolean;
  hasOwner?: boolean;
  labels?: FilterDrawerLabels;
  testId?: string;
}

export function FilterDrawer({
  values,
  onChange,
  onApply,
  onReset,
  agentFetcher,
  orgFetcher,
  storeFetcher,
  ownerFetcher,
  hasStore = false,
  hasAgent = true,
  hasOrg = true,
  hasOwner = true,
  labels = {},
  testId,
}: FilterDrawerProps) {
  const [open, setOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState<'agent' | 'org' | 'store' | 'owner' | null>(
    null,
  );

  const {
    filterButton = 'Filtrlar',
    title = 'Filtrlar',
    apply = "Qo'llash",
    reset = 'Tozalash',
    period = 'Davr',
    from = 'Dan',
    to = 'Gacha',
    sum = 'Summa',
    agent = 'Kontragent',
    organization = 'Tashkilot',
    store = 'Ombor',
    owner = 'Xodim',
  } = labels;

  const activeCount = [
    values.momentFrom,
    values.momentTo,
    values.sumMinorFrom !== undefined ? true : undefined,
    values.sumMinorTo !== undefined ? true : undefined,
    values.agentId,
    values.organizationId,
    values.storeId,
    values.ownerId,
  ].filter(Boolean).length;

  const handleApply = () => {
    setOpen(false);
    onApply?.();
  };

  const handleReset = () => {
    onReset();
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        data-test-id={testId ? `${testId}-trigger` : 'filter-drawer-trigger'}
      >
        <Icons.filter className="w-4 h-4" />
        {filterButton}
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--ms-action-primary)] text-white text-[10px] font-bold ml-1 px-1">
            {activeCount}
          </span>
        )}
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
          <Dialog.Content
            className={cn(
              'fixed right-0 top-0 z-50 h-full w-[360px] max-w-full',
              'bg-[var(--ms-bg-surface)] shadow-xl flex flex-col',
              'focus:outline-none',
            )}
            data-test-id={testId ? `${testId}-panel` : 'filter-drawer-panel'}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ms-border-default)]">
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={handleReset}
                  data-test-id={testId ? `${testId}-reset` : 'filter-reset'}
                >
                  {reset}
                </Button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-[var(--ms-radius-default)] hover:bg-[var(--ms-bg-hover)] flex items-center justify-center text-[var(--ms-text-muted)]"
                    aria-label="Yopish"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <section className="space-y-2">
                <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                  {period}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs mb-1 block">{from}</Label>
                    <Input
                      type="date"
                      value={values.momentFrom ?? ''}
                      onChange={(e) =>
                        onChange({ ...values, momentFrom: e.target.value || undefined })
                      }
                      data-test-id={testId ? `${testId}-moment-from` : 'filter-moment-from'}
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">{to}</Label>
                    <Input
                      type="date"
                      value={values.momentTo ?? ''}
                      onChange={(e) =>
                        onChange({ ...values, momentTo: e.target.value || undefined })
                      }
                      data-test-id={testId ? `${testId}-moment-to` : 'filter-moment-to'}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                  {sum}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs mb-1 block">{from}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.sumMinorFrom !== undefined ? String(values.sumMinorFrom) : ''}
                      onChange={(e) =>
                        onChange({
                          ...values,
                          sumMinorFrom: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="0"
                      data-test-id={testId ? `${testId}-sum-from` : 'filter-sum-from'}
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">{to}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.sumMinorTo !== undefined ? String(values.sumMinorTo) : ''}
                      onChange={(e) =>
                        onChange({
                          ...values,
                          sumMinorTo: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="∞"
                      data-test-id={testId ? `${testId}-sum-to` : 'filter-sum-to'}
                    />
                  </div>
                </div>
              </section>

              {hasAgent && agentFetcher && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                    {agent}
                  </p>
                  <CatalogPickerField
                    value={
                      values.agentId
                        ? { id: values.agentId, label: values.agentLabel ?? values.agentId }
                        : null
                    }
                    placeholder="Tanlang..."
                    onPick={() => setPickerOpen('agent')}
                    onClear={() => onChange({ ...values, agentId: undefined, agentLabel: undefined })}
                    testId={testId ? `${testId}-agent` : 'filter-agent'}
                  />
                </section>
              )}

              {hasOrg && orgFetcher && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                    {organization}
                  </p>
                  <CatalogPickerField
                    value={
                      values.organizationId
                        ? {
                            id: values.organizationId,
                            label: values.organizationLabel ?? values.organizationId,
                          }
                        : null
                    }
                    placeholder="Tanlang..."
                    onPick={() => setPickerOpen('org')}
                    onClear={() =>
                      onChange({
                        ...values,
                        organizationId: undefined,
                        organizationLabel: undefined,
                      })
                    }
                    testId={testId ? `${testId}-org` : 'filter-org'}
                  />
                </section>
              )}

              {hasStore && storeFetcher && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                    {store}
                  </p>
                  <CatalogPickerField
                    value={
                      values.storeId
                        ? { id: values.storeId, label: values.storeLabel ?? values.storeId }
                        : null
                    }
                    placeholder="Tanlang..."
                    onPick={() => setPickerOpen('store')}
                    onClear={() =>
                      onChange({ ...values, storeId: undefined, storeLabel: undefined })
                    }
                    testId={testId ? `${testId}-store` : 'filter-store'}
                  />
                </section>
              )}

              {hasOwner && ownerFetcher && (
                <section className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--ms-text-muted)] uppercase tracking-wide">
                    {owner}
                  </p>
                  <CatalogPickerField
                    value={
                      values.ownerId
                        ? { id: values.ownerId, label: values.ownerLabel ?? values.ownerId }
                        : null
                    }
                    placeholder="Tanlang..."
                    onPick={() => setPickerOpen('owner')}
                    onClear={() =>
                      onChange({ ...values, ownerId: undefined, ownerLabel: undefined })
                    }
                    testId={testId ? `${testId}-owner` : 'filter-owner'}
                  />
                </section>
              )}
            </div>

            <div className="px-5 py-4 border-t border-[var(--ms-border-default)]">
              <Button
                className="w-full"
                onClick={handleApply}
                data-test-id={testId ? `${testId}-apply` : 'filter-apply'}
              >
                {apply}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {agentFetcher && (
        <CatalogPicker
          open={pickerOpen === 'agent'}
          onClose={() => setPickerOpen(null)}
          title={agent}
          fetcher={agentFetcher}
          onSelect={(item) => {
            onChange({ ...values, agentId: item.id, agentLabel: String(item.primary) });
            setPickerOpen(null);
          }}
          clearable={!!values.agentId}
          onClear={() => {
            onChange({ ...values, agentId: undefined, agentLabel: undefined });
            setPickerOpen(null);
          }}
        />
      )}

      {orgFetcher && (
        <CatalogPicker
          open={pickerOpen === 'org'}
          onClose={() => setPickerOpen(null)}
          title={organization}
          fetcher={orgFetcher}
          onSelect={(item) => {
            onChange({ ...values, organizationId: item.id, organizationLabel: String(item.primary) });
            setPickerOpen(null);
          }}
          clearable={!!values.organizationId}
          onClear={() => {
            onChange({ ...values, organizationId: undefined, organizationLabel: undefined });
            setPickerOpen(null);
          }}
        />
      )}

      {storeFetcher && (
        <CatalogPicker
          open={pickerOpen === 'store'}
          onClose={() => setPickerOpen(null)}
          title={store}
          fetcher={storeFetcher}
          onSelect={(item) => {
            onChange({ ...values, storeId: item.id, storeLabel: String(item.primary) });
            setPickerOpen(null);
          }}
          clearable={!!values.storeId}
          onClear={() => {
            onChange({ ...values, storeId: undefined, storeLabel: undefined });
            setPickerOpen(null);
          }}
        />
      )}

      {ownerFetcher && (
        <CatalogPicker
          open={pickerOpen === 'owner'}
          onClose={() => setPickerOpen(null)}
          title={owner}
          fetcher={ownerFetcher}
          onSelect={(item) => {
            onChange({ ...values, ownerId: item.id, ownerLabel: String(item.primary) });
            setPickerOpen(null);
          }}
          clearable={!!values.ownerId}
          onClear={() => {
            onChange({ ...values, ownerId: undefined, ownerLabel: undefined });
            setPickerOpen(null);
          }}
        />
      )}
    </>
  );
}
