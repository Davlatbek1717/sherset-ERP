'use client';

/**
 * «Выбор склада» — warehouse-tree picker modal (moysklad `selector-load-popup`,
 * LIVE-grounded 2026-07-03: title «Выбор склада», the same tree as the list
 * sidebar (root «Склады» + 32px rows), footer «Выбрать» / «Отменить»).
 *
 * Used by: the store card «Группа» field (pick a parent warehouse) and the
 * list «Изменить ▾ → Переместить» bulk action. `excludeIds` hides the stores
 * being moved (a warehouse can't become its own parent — BE re-guards).
 */

import { api } from '@/lib/api-client';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import { Button, Modal } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type StoreTreeNode, buildStoreTree } from './store-tree';

function PickRow({
  node,
  depth,
  excluded,
  selectedId,
  onPick,
}: {
  node: StoreTreeNode;
  depth: number;
  excluded: Set<string>;
  selectedId: string | null;
  onPick(id: string, name: string): void;
}) {
  if (excluded.has(node.id)) return null;
  const isSelected = selectedId === node.id;
  return (
    <div>
      <button
        type="button"
        onClick={() => onPick(node.id, node.name)}
        className={`flex h-8 w-full items-center text-left text-[12px] text-[var(--ms-text-link)] hover:bg-[var(--ms-bg-muted)] ${
          isSelected ? 'bg-[#e4f1fa]' : ''
        }`}
        style={{ paddingLeft: `${depth * 24 + 24}px` }}
        data-test-id={`store-pick-${node.id}`}
      >
        <span className="truncate pr-2">{node.name}</span>
      </button>
      {node.children.map((c) => (
        <PickRow
          key={c.id}
          node={c}
          depth={depth + 1}
          excluded={excluded}
          selectedId={selectedId}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

export function StorePickerDialog({
  open,
  onClose,
  onSelect,
  excludeIds,
  allowRoot = false,
}: {
  open: boolean;
  onClose(): void;
  /** Fires with the picked store (or null when the «Склады» root is chosen with allowRoot). */
  onSelect(picked: { id: string; name: string } | null): void;
  excludeIds?: string[];
  /** «Переместить» allows dropping to the root (no parent); the «Группа» field also
   *  uses the root row to clear the group. */
  allowRoot?: boolean;
}) {
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [rootPicked, setRootPicked] = useState(false);

  const { data } = useQuery<ListResponse<{ id: string; name: string; parentId: string | null }>>({
    queryKey: ['stores', 'tree'],
    queryFn: () =>
      api.get<ListResponse<{ id: string; name: string; parentId: string | null }>>(
        '/admin/stores?limit=500&sortBy=name&sortDir=asc',
      ),
    enabled: open,
    staleTime: 60_000,
  });

  const excluded = new Set(excludeIds ?? []);
  const roots = buildStoreTree(data?.items ?? []);

  const confirm = () => {
    if (rootPicked) onSelect(null);
    else if (picked) onSelect(picked);
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t('picker_title')}
      widthClass="w-[420px]"
      testId="store-picker-dialog"
      footer={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={confirm}
            disabled={!picked && !rootPicked}
            data-test-id="store-picker-select"
          >
            {t('picker_select')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            data-test-id="store-picker-cancel"
          >
            {tCommon('cancel')}
          </Button>
        </div>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => {
            if (!allowRoot) return;
            setRootPicked(true);
            setPicked(null);
          }}
          className={`flex h-8 w-full items-center pl-6 text-left text-[12px] ${
            allowRoot
              ? `text-[var(--ms-text-link)] hover:bg-[var(--ms-bg-muted)] ${rootPicked ? 'bg-[#e4f1fa]' : ''}`
              : 'cursor-default text-[var(--ms-text-primary)]'
          }`}
          data-test-id="store-pick-root"
        >
          {t('title')}
        </button>
        {roots.map((node) => (
          <PickRow
            key={node.id}
            node={node}
            depth={1}
            excluded={excluded}
            selectedId={picked?.id ?? null}
            onPick={(id, name) => {
              setPicked({ id, name });
              setRootPicked(false);
            }}
          />
        ))}
      </div>
    </Modal>
  );
}
