'use client';

/**
 * «Владелец» popover — moysklad parity. The document header's right slot shows
 * the owner («Файзуллоев Ф. / Основной ▾»); clicking it opens a popover to edit
 * the owner employee, the owner department («Отдел») and the «Общий доступ»
 * (shared) flag. Wires the document's ownerId / groupId / shared fields
 * (already accepted by the create/update schemas).
 *
 * Reuses the shared inline CatalogPickerField (foundation #1) for the two
 * pickers; localised via the `owner_access` namespace.
 */

import { api } from '@/lib/api-client';
import { CatalogPickerField, Checkbox, type PickerItem } from '@moysklad/ui';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface OwnerAccessValue {
  ownerId: string | null;
  ownerLabel: string;
  groupId: string | null;
  groupLabel: string;
  shared: boolean;
}

export function OwnerAccessPopover({
  value,
  onChange,
}: {
  value: OwnerAccessValue;
  onChange: (next: OwnerAccessValue) => void;
}) {
  const t = useTranslations('owner_access');

  const employeeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; email?: string | null }> }>(
      `/employees?search=${encodeURIComponent(s)}&limit=20`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name, secondary: x.email ?? undefined }));
  };
  const groupFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/groups?search=${encodeURIComponent(s)}&limit=20`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex flex-col items-end rounded-[var(--ms-radius-default)] px-1 py-0.5 text-right text-xs leading-tight hover:bg-[var(--ms-bg-hover)]"
          data-test-id="doc-owner-trigger"
        >
          <span className="font-medium text-[var(--ms-text-brand)]">{value.ownerLabel || '—'}</span>
          <span className="flex items-center gap-0.5 text-[var(--ms-text-muted)]">
            {value.groupLabel || t('primary')}
            <ChevronDown className="h-3 w-3" />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-[var(--ms-z-popover)] w-72 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 shadow-[var(--ms-shadow-md)]"
          data-test-id="doc-owner-popover"
        >
          <div className="flex flex-col gap-3">
            {/* moysklad parity: the popover is titled «Владелец» (live-grounded). */}
            <div
              className="font-medium text-[var(--ms-text-primary)] text-sm"
              data-test-id="doc-owner-title"
            >
              {t('title')}
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--ms-text-muted)]">{t('employee')}</span>
              <CatalogPickerField
                value={value.ownerId ? { id: value.ownerId, label: value.ownerLabel } : null}
                placeholder={t('selectEmployee')}
                onPick={() => undefined}
                onClear={() => onChange({ ...value, ownerId: null, ownerLabel: '' })}
                inlineFetcher={employeeFetcher}
                onInlineSelect={(item) =>
                  onChange({ ...value, ownerId: item.id, ownerLabel: String(item.primary) })
                }
                testId="doc-owner-employee"
              />
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--ms-text-muted)]">{t('department')}</span>
              <CatalogPickerField
                value={value.groupId ? { id: value.groupId, label: value.groupLabel } : null}
                placeholder={t('selectDepartment')}
                onPick={() => undefined}
                onClear={() => onChange({ ...value, groupId: null, groupLabel: '' })}
                inlineFetcher={groupFetcher}
                onInlineSelect={(item) =>
                  onChange({ ...value, groupId: item.id, groupLabel: String(item.primary) })
                }
                testId="doc-owner-department"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={value.shared}
                onCheckedChange={(v) => onChange({ ...value, shared: Boolean(v) })}
                data-test-id="doc-owner-shared"
              />
              <span className="text-[var(--ms-text-primary)]">{t('shared')}</span>
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
