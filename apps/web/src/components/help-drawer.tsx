'use client';

import { api } from '@/lib/api-client';
import { Button, Drawer, Icons, Input, Markdown, useHotkey } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface HelpArticle {
  id: string;
  slug: string;
  routeKey: string | null;
  locale: string;
  title: string;
  bodyMd: string;
  category: string | null;
  tags: string[];
}

interface HelpResponse {
  contextual: HelpArticle[];
  generic: HelpArticle[];
}

/**
 * Right-side knowledge-base drawer surfaced from the global Help button
 * (and the `?` hotkey). Pulls articles whose routeKey matches the
 * current pathname plus a fallback set of generic articles. Selecting
 * an article opens a reading view; the back arrow returns to the list.
 *
 * The article body is markdown — rendered via the in-house `Markdown`
 * component (no heavy lib).
 */
export function HelpDrawer({
  open,
  onOpenChange,
  locale,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  locale: string;
}) {
  const t = useTranslations('help');
  const pathname = usePathname() ?? '/';
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const route = pathname.replace(/^\//, '').split('/')[0] || 'home';

  const { data, isLoading } = useQuery<HelpResponse>({
    queryKey: ['help', route, locale],
    queryFn: () =>
      api.get<HelpResponse>(`/help/articles?route=${encodeURIComponent(route)}&locale=${locale}`),
    enabled: open,
    staleTime: 60_000,
  });

  // ESC/`?` shortcuts when the drawer is open: ESC closes, `?` toggles.
  useHotkey('Escape', () => onOpenChange(false), { enabled: open, ignoreInputs: false });

  const articles = [...(data?.contextual ?? []), ...(data?.generic ?? [])];
  const filtered = search
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.bodyMd.toLowerCase().includes(search.toLowerCase()),
      )
    : articles;

  const grouped = groupByCategory(filtered);
  const active = activeId ? (articles.find((a) => a.id === activeId) ?? null) : null;

  // Resetting transient state when the drawer opens keeps each visit
  // predictable instead of restoring the previous read article.
  const resetState = () => {
    setSearch('');
    setActiveId(null);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        onOpenChange(next);
      }}
      title={active ? active.title : t('title')}
      description={active ? null : t('subtitle')}
      widthClass="w-[440px]"
      testId="help-drawer"
      toolbar={
        active ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setActiveId(null)}
            aria-label={t('back_to_list')}
          >
            <Icons.back className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
      {active ? (
        <div className="px-5 py-4">
          <Markdown source={active.bodyMd} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="border-[var(--ms-border-default)] border-b px-4 py-3">
            <Input
              type="search"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leading={<Icons.search className="h-4 w-4" />}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="px-5 py-8 text-center text-[var(--ms-text-muted)] text-sm">
                {t('loading')}
              </p>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Icons.help className="mx-auto h-8 w-8 text-[var(--ms-text-muted)]" />
                <p className="mt-3 text-[var(--ms-text-secondary)] text-sm">
                  {search ? t('no_results') : t('empty')}
                </p>
              </div>
            ) : (
              grouped.map((group) => (
                <section
                  key={group.key}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                >
                  {group.label && (
                    <h3 className="bg-[var(--ms-bg-app)] px-5 py-2 font-semibold text-[var(--ms-text-muted)] text-[10px] uppercase tracking-wide">
                      {group.label}
                    </h3>
                  )}
                  <ul>
                    {group.items.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(article.id)}
                          className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--ms-bg-hover)] focus-visible:outline-none focus-visible:bg-[var(--ms-bg-hover)]"
                        >
                          <Icons.document className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-[var(--ms-text-primary)] text-sm leading-tight">
                              {article.title}
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[var(--ms-text-muted)] text-xs">
                              {snippet(article.bodyMd)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

interface Group {
  key: string;
  label: string | null;
  items: HelpArticle[];
}

function groupByCategory(articles: HelpArticle[]): Group[] {
  const map = new Map<string, HelpArticle[]>();
  for (const a of articles) {
    const key = a.category ?? '__none__';
    const existing = map.get(key);
    if (existing) {
      existing.push(a);
    } else {
      map.set(key, [a]);
    }
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: key === '__none__' ? null : key,
    items,
  }));
}

function snippet(md: string): string {
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 110)
    .trim();
}
