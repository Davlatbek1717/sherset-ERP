'use client';

/**
 * Saved-filter pills above the row table — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/i-default.png — the small pill row
 *   under the sub-nav (e.g. "ипадром" / "Фаррухбек касса").
 *   Each pill applies its saved query string when clicked, plus a
 *   "+" pill at the end opens a save-current dialog.
 *
 * Storage: per-user via /saved-filters?entity=customerorder. The
 * `entity` slug is passed from the parent so this component is
 * reusable across list pages.
 */

import { api } from '@/lib/api-client';
import { Button, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SavedFilter {
  id: string;
  name: string;
  queryString: string;
  position: number;
}

export interface SavedFiltersPillsProps {
  /** Entity slug (customerorder, demand, …). */
  entity: string;
  /** Currently-applied query string (for the "+" save dialog). */
  currentQueryString: string;
  /** Apply a saved filter — parent should reset cursor + parse the
   *  query string into its own filter state. */
  onApply(queryString: string): void;
  /** Active filter id — its pill renders with the moysklad blue
   *  background to mark it as currently applied (i-default.png:
   *  "ипадром" pill is highlighted blue). */
  activeId?: string;
  /** Optional controlled «save current» open-state — lets a sibling trigger
   *  (e.g. moysklad's 🔖 bookmark icon in the filter toolbar) open the save
   *  input. When omitted, the «+» pill manages it internally. */
  adding?: boolean;
  onAddingChange?: (open: boolean) => void;
}

export function SavedFiltersPills({
  entity,
  currentQueryString,
  onApply,
  activeId,
  adding: addingProp,
  onAddingChange,
}: SavedFiltersPillsProps) {
  const t = useTranslations('saved_filters');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const [addingInternal, setAddingInternal] = useState(false);
  const adding = addingProp ?? addingInternal;
  const setAdding = (open: boolean) => (onAddingChange ?? setAddingInternal)(open);
  const [name, setName] = useState('');

  const queryKey = ['saved-filters', entity] as const;
  const { data } = useQuery<{ items: SavedFilter[] }>({
    queryKey,
    queryFn: () =>
      api.get<{ items: SavedFilter[] }>(`/saved-filters?entity=${encodeURIComponent(entity)}`),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; queryString: string }) =>
      api.post('/saved-filters', { ...input, entity }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setAdding(false);
      setName('');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/saved-filters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/saved-filters/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // Per-pill edit mode — clicking the pencil swaps the pill to an inline
  // input + Save/Delete/Cancel cluster, matching moysklad's «test ✏️»
  // affordance where hovering reveals a pencil that opens edit-in-place.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const items = data?.items ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-test-id="saved-filters-pills">
      {items.map((f) => {
        const isActive = activeId === f.id;
        const isEditing = editingId === f.id;

        if (isEditing) {
          return (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-0.5 text-xs"
              data-test-id={`saved-filter-pill-${f.id}-editing`}
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editName.trim()) {
                    rename.mutate({ id: f.id, name: editName.trim() });
                    setEditingId(null);
                  }
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="h-6 w-24 bg-transparent text-[var(--ms-text-primary)] text-xs focus:outline-none"
                // biome-ignore lint/a11y/noAutofocus: pencil click is the explicit user action that triggers this
                autoFocus
                data-test-id={`saved-filter-rename-input-${f.id}`}
              />
              <button
                type="button"
                onClick={() => {
                  if (editName.trim()) {
                    rename.mutate({ id: f.id, name: editName.trim() });
                    setEditingId(null);
                  }
                }}
                disabled={!editName.trim() || rename.isPending}
                className="rounded p-0.5 text-[var(--ms-text-success)] hover:bg-[var(--ms-bg-muted)] disabled:opacity-30"
                aria-label={t('save')}
                title={t('save')}
                data-test-id={`saved-filter-rename-save-${f.id}`}
              >
                ✓
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: t('delete_confirm', { name: f.name }),
                    tone: 'destructive',
                  });
                  if (ok) {
                    remove.mutate(f.id);
                    setEditingId(null);
                  }
                }}
                disabled={remove.isPending}
                className="rounded p-0.5 text-[var(--ms-text-destructive)] hover:bg-[var(--ms-bg-muted)]"
                aria-label={t('delete')}
                title={t('delete')}
                data-test-id={`saved-filter-delete-${f.id}`}
              >
                🗑
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded p-0.5 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
                aria-label={t('cancel')}
                title={t('cancel')}
                data-test-id={`saved-filter-cancel-${f.id}`}
              >
                ×
              </button>
            </span>
          );
        }

        return (
          <span
            key={f.id}
            // moysklad parity: pills use rounded-md (NOT rounded-full),
            // a soft-gray surface background, and no border. Verified
            // against docs/.../03-module/customerorder/screenshots/i-default.png
            // («ипадром» + «Фаррухбек касса» pills, plus the «test ✏️»
            // edit-on-hover affordance from the user's screenshot).
            className={`group inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs transition-colors ${
              isActive
                ? 'bg-[var(--ms-text-brand)] text-white'
                : 'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]'
            }`}
            data-test-id={`saved-filter-pill-${f.id}`}
            aria-pressed={isActive}
          >
            <button
              type="button"
              onClick={() => onApply(f.queryString)}
              className={isActive ? 'text-white' : 'text-[var(--ms-text-primary)]'}
            >
              {f.name}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(f.id);
                setEditName(f.name);
              }}
              className={`opacity-0 transition-opacity group-hover:opacity-100 ${
                isActive
                  ? 'text-white/80 hover:text-white'
                  : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
              }`}
              aria-label={t('edit')}
              title={t('edit')}
              data-test-id={`saved-filter-edit-${f.id}`}
            >
              ✏
            </button>
          </span>
        );
      })}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate({ name: name.trim(), queryString: currentQueryString });
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('name_placeholder')}
            className="h-7 rounded-full border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 text-xs"
            // biome-ignore lint/a11y/noAutofocus: explicit user action
            autoFocus
            data-test-id="saved-filter-name-input"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!name.trim() || create.isPending}
          >
            {t('save')}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
          >
            {t('cancel')}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!currentQueryString}
          // moysklad parity: same rounded-md as the saved pills, but
          // dashed border + transparent bg to mark it as the "add" slot.
          className="rounded-md border border-dashed border-[var(--ms-border-default)] bg-transparent px-3 py-1 text-[var(--ms-text-muted)] text-xs hover:border-[var(--ms-text-brand)] hover:text-[var(--ms-text-brand)] disabled:cursor-not-allowed disabled:opacity-50"
          data-test-id="saved-filter-add"
        >
          + {t('add')}
        </button>
      )}
    </div>
  );
}
