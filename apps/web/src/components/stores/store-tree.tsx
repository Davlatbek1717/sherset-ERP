'use client';

/**
 * «Склады» left navigation tree — moysklad #warehouse parity (LIVE-grounded
 * 2026-07-03, docs/audits/stores-1to1-2026-07-03/GROUND.md).
 *
 * moysklad renders the warehouse hierarchy itself as the tree: root «Склады»
 * + one row per warehouse (children indented 24px, rows 32px, 12px blue
 * labels, always expanded — no chevrons). Selecting the root shows every
 * warehouse; selecting a node filters the right table to that node's
 * CHILDREN (verified live: a leaf node yields an empty list). The selected
 * row gets the light-blue band with the pointed right edge.
 */

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface StoreNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface ListResponse {
  items: StoreNode[];
}

export interface StoreTreeNode extends StoreNode {
  children: StoreTreeNode[];
}

/** Flat rows → nested tree (roots keep list order; orphans fall back to root). */
export function buildStoreTree(rows: StoreNode[]): StoreTreeNode[] {
  const byId = new Map<string, StoreTreeNode>(
    rows.map((r) => [r.id, { ...r, children: [] as StoreTreeNode[] }]),
  );
  const roots: StoreTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Selected row: moysklad's light-blue band + pointed right edge (CSS triangle). */
function SelectedArrow() {
  return (
    <span
      aria-hidden
      className="absolute top-0 left-full h-0 w-0 border-y-[16px] border-y-transparent border-l-[#e4f1fa] border-l-[14px]"
    />
  );
}

function TreeRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: StoreTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect(id: string | null, label: string | null): void;
}) {
  const isSelected = selectedId === node.id;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id, node.name)}
        className={`relative flex h-8 w-full items-center text-left text-[12px] text-[var(--ms-text-link)] hover:underline ${
          isSelected ? 'bg-[#e4f1fa]' : ''
        }`}
        style={{ paddingLeft: `${depth * 24 + 24}px` }}
        data-test-id={`store-tree-node-${node.id}`}
      >
        <span className="truncate pr-2">{node.name}</span>
        {isSelected && <SelectedArrow />}
      </button>
      {node.children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function StoreTree({
  selectedId,
  onSelect,
}: {
  /** Selected warehouse id, or null for the «Склады» root. */
  selectedId: string | null;
  onSelect(id: string | null, label: string | null): void;
}) {
  const t = useTranslations('pages.stores');
  const { data } = useQuery<ListResponse>({
    queryKey: ['stores', 'tree'],
    queryFn: () => api.get<ListResponse>('/admin/stores?limit=500&sortBy=name&sortDir=asc'),
    staleTime: 60_000,
  });

  const roots = buildStoreTree(data?.items ?? []);

  return (
    <aside className="w-[290px] shrink-0 py-1" data-test-id="store-tree">
      {/* moysklad gutter: the selected band ends ~40px BEFORE the table (live:
          band →306, arrow tip →320, table @350), so the arrow floats in empty
          space and never bleeds under the table's checkbox column. */}
      <div className="mr-[40px]">
        <button
          type="button"
          onClick={() => onSelect(null, null)}
          className={`relative flex h-8 w-full items-center pl-6 text-left text-[12px] text-[var(--ms-text-link)] hover:underline ${
            selectedId === null ? 'bg-[#e4f1fa]' : ''
          }`}
          data-test-id="store-tree-root"
        >
          {t('title')}
          {selectedId === null && <SelectedArrow />}
        </button>
        {roots.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}
