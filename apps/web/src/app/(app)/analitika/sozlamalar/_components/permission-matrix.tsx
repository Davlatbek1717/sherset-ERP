'use client';

import { Input, NativeSelect, StickyHScroll } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export type Scope = 'NO' | 'OWN' | 'OWN_GROUP' | 'OWN_AND_GROUP' | 'ALL';
export type Action = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'print';

export interface MatrixMeta {
  entities: Array<{ key: string; category: string }>;
  categories: string[];
  actions: Action[];
  scopes: Scope[];
}

export interface MatrixCell {
  entity: string;
  action: Action;
  scope: Scope;
}

interface Props {
  meta: MatrixMeta;
  /** Sparse: only cells with scope !== 'NO' need to be present. */
  value: MatrixCell[];
  onChange: (next: MatrixCell[]) => void;
  readOnly?: boolean;
}

/**
 * Entity × Action permission matrix with per-cell scope dropdown.
 * UX choices:
 *   - sticky left column + sticky header row so the user never loses context
 *   - category sections collapsible (first one open by default; the rest
 *     collapsed to keep the page short on first paint)
 *   - search filter applies across entities; expands matching sections
 *   - per-row "ALL/NO" quick toggle so admins don't click 6 dropdowns
 *   - color-coded scope select for instant visual scan of the matrix
 *   - read-only mode renders the same layout with disabled selects
 */
export function PermissionMatrix({ meta, value, onChange, readOnly }: Props) {
  const t = useTranslations('pages.analitika_settings');

  // value → nested map for O(1) lookup.
  const cells = useMemo(() => {
    const m = new Map<string, Map<Action, Scope>>();
    for (const c of value) {
      let row = m.get(c.entity);
      if (!row) {
        row = new Map();
        m.set(c.entity, row);
      }
      row.set(c.action, c.scope);
    }
    return m;
  }, [value]);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([meta.categories[0] ?? '']));

  const filteredEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meta.entities;
    return meta.entities.filter((e) => e.key.toLowerCase().includes(q));
  }, [meta.entities, search]);

  // When searching, force-expand all categories that contain matches.
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expanded;
    const cats = new Set<string>();
    for (const e of filteredEntities) cats.add(e.category);
    return cats;
  }, [search, expanded, filteredEntities]);

  const byCategory = useMemo(() => {
    const m = new Map<string, typeof meta.entities>();
    for (const e of filteredEntities) {
      const list = m.get(e.category) ?? [];
      list.push(e);
      m.set(e.category, list);
    }
    return m;
  }, [filteredEntities]);

  const setCell = (entity: string, action: Action, scope: Scope) => {
    if (readOnly) return;
    const next = value.filter((c) => !(c.entity === entity && c.action === action));
    if (scope !== 'NO') next.push({ entity, action, scope });
    onChange(next);
  };

  const setRow = (entity: string, scope: Scope) => {
    if (readOnly) return;
    const next = value.filter((c) => c.entity !== entity);
    if (scope !== 'NO') {
      for (const a of meta.actions) next.push({ entity, action: a, scope });
    }
    onChange(next);
  };

  const getScope = (entity: string, action: Action): Scope =>
    cells.get(entity)?.get(action) ?? 'NO';

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const totalMatches = filteredEntities.length;

  return (
    <div className="space-y-3">
      {/* Legend + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ms-border)] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--ms-text-muted)]">{t('matrix_legend')}</span>
          {meta.scopes.map((s) => (
            <ScopeChip key={s} scope={s} label={t(`scope_${s}`)} />
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('matrix_search_ph')}
          className="max-w-xs"
        />
      </div>

      {totalMatches === 0 && (
        <div className="rounded-lg border border-[var(--ms-border)] border-dashed bg-white p-6 text-center text-[var(--ms-text-muted)] text-sm">
          {t('matrix_no_match')}
        </div>
      )}

      {/* Matrix table — category sections */}
      <StickyHScroll className="rounded-lg border border-[var(--ms-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="sticky left-0 z-20 min-w-[220px] bg-[var(--ms-bg-subtle)] px-3 py-2 text-left font-semibold">
                {t('matrix_title')}
              </th>
              {meta.actions.map((a) => (
                <th key={a} className="px-3 py-2 text-center font-semibold">
                  {t(`action_${a}`)}
                </th>
              ))}
              {!readOnly && <th className="px-2 py-2 text-right font-semibold">⚙️</th>}
            </tr>
          </thead>
          <tbody>
            {meta.categories.map((cat) => {
              const ents = byCategory.get(cat);
              if (!ents || ents.length === 0) return null;
              const isOpen = effectiveExpanded.has(cat);
              return (
                <CategorySection
                  key={cat}
                  category={cat}
                  entities={ents}
                  actions={meta.actions}
                  scopes={meta.scopes}
                  getScope={getScope}
                  setCell={setCell}
                  setRow={setRow}
                  isOpen={isOpen}
                  onToggle={() => toggleCategory(cat)}
                  readOnly={readOnly}
                  t={t}
                />
              );
            })}
          </tbody>
        </table>
      </StickyHScroll>
    </div>
  );
}

function CategorySection({
  category,
  entities,
  actions,
  scopes,
  getScope,
  setCell,
  setRow,
  isOpen,
  onToggle,
  readOnly,
  t,
}: {
  category: string;
  entities: Array<{ key: string; category: string }>;
  actions: Action[];
  scopes: Scope[];
  getScope: (e: string, a: Action) => Scope;
  setCell: (e: string, a: Action, s: Scope) => void;
  setRow: (e: string, s: Scope) => void;
  isOpen: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const colSpan = actions.length + 1 + (readOnly ? 0 : 1);
  return (
    <>
      <tr className="border-[var(--ms-border)] border-t bg-[var(--ms-bg-subtle)]/50">
        <td colSpan={colSpan} className="px-3 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-2 text-left font-semibold text-[var(--ms-text-primary)] text-xs uppercase tracking-wider"
          >
            <span className="inline-block w-3 text-[var(--ms-text-muted)]">
              {isOpen ? '▾' : '▸'}
            </span>
            {category}
            <span className="ml-auto text-[10px] text-[var(--ms-text-muted)] normal-case tracking-normal">
              {entities.length}
            </span>
          </button>
        </td>
      </tr>
      {isOpen &&
        entities.map((e) => (
          <tr
            key={e.key}
            className="border-[var(--ms-border)] border-t hover:bg-[var(--ms-bg-subtle)]/30"
          >
            <td className="sticky left-0 z-[1] min-w-[220px] bg-white px-3 py-1.5 font-mono text-[var(--ms-text-primary)] text-xs">
              {e.key}
            </td>
            {actions.map((a) => {
              const scope = getScope(e.key, a);
              return (
                <td key={a} className="px-1 py-1 text-center">
                  <ScopeSelect
                    value={scope}
                    scopes={scopes}
                    onChange={(s) => setCell(e.key, a, s)}
                    disabled={readOnly}
                    labelFor={(s) => t(`scope_${s}`)}
                  />
                </td>
              );
            })}
            {!readOnly && (
              <td className="px-1 py-1 text-right">
                <NativeSelect
                  value=""
                  onChange={(ev) => {
                    const v = ev.target.value as 'all' | 'none' | '';
                    if (v === 'all') setRow(e.key, 'ALL');
                    if (v === 'none') setRow(e.key, 'NO');
                  }}
                  className="w-[36px]"
                  aria-label="Row bulk action"
                  title="Row bulk action"
                >
                  <option value="">…</option>
                  <option value="all">{t('row_all_to_all')}</option>
                  <option value="none">{t('row_all_to_no')}</option>
                </NativeSelect>
              </td>
            )}
          </tr>
        ))}
    </>
  );
}

const SCOPE_TONE: Record<Scope, string> = {
  NO: 'bg-slate-100 text-slate-500 border-slate-200',
  OWN: 'bg-blue-50 text-blue-700 border-blue-200',
  OWN_GROUP: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  OWN_AND_GROUP: 'bg-violet-50 text-violet-700 border-violet-200',
  ALL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function ScopeChip({ scope, label }: { scope: Scope; label: string }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-medium ${SCOPE_TONE[scope]}`}>
      {label}
    </span>
  );
}

function ScopeSelect({
  value,
  scopes,
  onChange,
  disabled,
  labelFor,
}: {
  value: Scope;
  scopes: Scope[];
  onChange: (s: Scope) => void;
  disabled?: boolean;
  labelFor: (s: Scope) => string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Scope)}
      className={`h-7 cursor-pointer appearance-none rounded border px-2 text-center font-medium text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--ms-border-focus)] disabled:cursor-default disabled:opacity-60 ${SCOPE_TONE[value]}`}
      aria-label={labelFor(value)}
    >
      {scopes.map((s) => (
        <option key={s} value={s}>
          {labelFor(s)}
        </option>
      ))}
    </select>
  );
}
