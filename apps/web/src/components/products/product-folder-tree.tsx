'use client';

/**
 * Product folder-tree sidebar — moysklad parity.
 *
 * moysklad's «Товары и услуги» (#good) page renders a left navigation
 * tree of product folders; clicking a folder filters the list to that
 * category (and its descendants). The root «Товары и услуги» entry
 * clears the filter.
 *
 * Data comes from GET /product-folders/tree — a pre-built nested tree
 * (`items: Node[]`, each Node has `children` + `productCount`). This
 * component renders it recursively with expand/collapse chevrons and a
 * selected-row highlight, and reports the chosen folder id (or null for
 * the root) via `onSelect`.
 */

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FolderNode {
  id: string;
  name: string;
  pathName: string | null;
  productCount: number;
  children: FolderNode[];
}

interface TreeResponse {
  items: FolderNode[];
  total: number;
}

export interface ProductFolderTreeProps {
  /** Currently selected folder id, or null for «all». */
  selectedId: string | null;
  /** Fires with the folder id + label, or (null, rootLabel) for the root. */
  onSelect(id: string | null, label: string | null): void;
  /** Divider line under every row (owner 2026-07-20 — the product picker
   *  sidebar; the products page keeps its divider-less moysklad look). */
  dividers?: boolean;
  /** Extra classes on the aside (mobile overlay positioning in the picker). */
  className?: string;
}

export function ProductFolderTree({
  selectedId,
  onSelect,
  dividers,
  className,
}: ProductFolderTreeProps) {
  const t = useTranslations('pages.products');
  const { data } = useQuery<TreeResponse>({
    queryKey: ['product-folders', 'tree'],
    queryFn: () => api.get<TreeResponse>('/product-folders/tree'),
    staleTime: 60_000,
  });

  const dividerCls = dividers ? 'border-[var(--ms-border-default)] border-b' : '';

  return (
    <aside
      className={`w-60 shrink-0 overflow-y-auto border-[var(--ms-border-default)] border-r bg-[var(--ms-bg-surface)] py-2 ${className ?? ''}`}
      data-test-id="product-folder-tree"
    >
      {/* Root «Товары и услуги» — clears the folder filter. */}
      <button
        type="button"
        onClick={() => onSelect(null, null)}
        className={`flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-muted)] ${dividerCls} ${
          selectedId === null
            ? 'bg-[var(--ms-bg-brand-soft)] font-medium text-[var(--ms-text-brand)]'
            : 'text-[var(--ms-text-primary)]'
        }`}
        data-test-id="product-folder-root"
      >
        {t('title')}
      </button>
      {(data?.items ?? []).map((node) => (
        <FolderRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          dividerCls={dividerCls}
        />
      ))}
    </aside>
  );
}

function FolderRow({
  node,
  depth,
  selectedId,
  onSelect,
  dividerCls = '',
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect(id: string | null, label: string | null): void;
  dividerCls?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-0.5 pr-2 text-sm hover:bg-[var(--ms-bg-muted)] ${dividerCls} ${
          isSelected ? 'bg-[var(--ms-bg-brand-soft)]' : ''
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'collapse' : 'expand'}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
            data-test-id={`folder-toggle-${node.id}`}
          >
            <span aria-hidden className="text-[10px]">
              {expanded ? '▾' : '▸'}
            </span>
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id, node.pathName ?? node.name)}
          className={`flex flex-1 items-center justify-between gap-2 py-1.5 text-left ${
            isSelected ? 'font-medium text-[var(--ms-text-brand)]' : 'text-[var(--ms-text-primary)]'
          }`}
          data-test-id={`folder-select-${node.id}`}
        >
          <span className="truncate">{node.name}</span>
          {node.productCount > 0 && (
            <span className="shrink-0 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
              {node.productCount}
            </span>
          )}
        </button>
      </div>
      {expanded &&
        node.children.map((child) => (
          <FolderRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            dividerCls={dividerCls}
          />
        ))}
    </div>
  );
}
