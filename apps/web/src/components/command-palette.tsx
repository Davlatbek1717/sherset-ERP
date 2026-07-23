'use client';

import { Button, Drawer, Icons, Input, Tooltip, useHotkey } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

/**
 * Cmd/Ctrl+K command palette — fast keyboard navigation across the app.
 *
 * V1 surfaces a curated list of jump-to-page actions. Future versions
 * will plug in document search (mongo-style "find invoice INV-12") and
 * action shortcuts (create new doc, switch organization, etc.).
 *
 * Why a Drawer instead of a centred modal? Mirrors moysklad.uz's
 * preference for side-sheets, keeps the visual language consistent with
 * the help / filter / notification panels.
 */

interface Command {
  id: string;
  /** i18n key under `command_palette.commands.*`. */
  labelKey: string;
  /** Optional secondary line (description/hint) — i18n key. */
  hintKey?: string;
  /** Lucide icon key (matches `Icons.*`). */
  icon: keyof typeof Icons;
  /** Tailwind text-* class for the icon. Mirrors the per-module rail colours. */
  iconColorClass?: string;
  href?: string;
  group: 'modules' | 'create' | 'settings' | 'tools';
  /** Extra alias terms used by fuzzy match. */
  keywords?: string[];
}

const COMMANDS: Command[] = [
  // Modules
  {
    id: 'm.home',
    labelKey: 'go_home',
    icon: 'homepage',
    iconColorClass: 'text-emerald-600',
    href: '/',
    group: 'modules',
  },
  {
    id: 'm.sales',
    labelKey: 'go_sales',
    icon: 'sales',
    iconColorClass: 'text-teal-600',
    href: '/customer-orders',
    group: 'modules',
    keywords: ['savdo', 'sotuv'],
  },
  {
    id: 'm.purchases',
    labelKey: 'go_purchases',
    icon: 'purchases',
    iconColorClass: 'text-orange-500',
    href: '/purchase-orders',
    group: 'modules',
    keywords: ['xarid', 'taminot'],
  },
  {
    id: 'm.goods',
    labelKey: 'go_goods',
    icon: 'goods',
    iconColorClass: 'text-sky-600',
    href: '/products',
    group: 'modules',
    keywords: ['mahsulot', 'tovar'],
  },
  {
    id: 'm.crm',
    labelKey: 'go_crm',
    icon: 'crm',
    iconColorClass: 'text-indigo-600',
    href: '/counterparties',
    group: 'modules',
    keywords: ['mijoz', 'kontragent'],
  },
  {
    id: 'm.stock',
    labelKey: 'go_stock',
    icon: 'stock',
    iconColorClass: 'text-blue-600',
    href: '/moves',
    group: 'modules',
    keywords: ['ombor', 'qoldiq'],
  },
  {
    id: 'm.money',
    labelKey: 'go_money',
    icon: 'money',
    iconColorClass: 'text-cyan-600',
    href: '/payments-in',
    group: 'modules',
    keywords: ['pul', 'tolov', 'kassa'],
  },
  {
    id: 'm.reports',
    labelKey: 'go_reports',
    icon: 'reports',
    iconColorClass: 'text-violet-600',
    href: '/reports',
    group: 'modules',
    keywords: ['hisobot'],
  },
  {
    id: 'm.retail',
    labelKey: 'go_retail',
    icon: 'retail',
    iconColorClass: 'text-rose-500',
    href: '/retail',
    group: 'modules',
    keywords: ['kassa', 'pos'],
  },
  {
    id: 'm.production',
    labelKey: 'go_production',
    icon: 'production',
    iconColorClass: 'text-amber-600',
    href: '/production',
    group: 'modules',
  },
  {
    id: 'm.settings',
    labelKey: 'go_settings',
    icon: 'settings',
    iconColorClass: 'text-slate-600',
    href: '/settings',
    group: 'modules',
    keywords: ['sozlama'],
  },

  // Quick create
  {
    id: 'c.demand',
    labelKey: 'create_demand',
    icon: 'create',
    href: '/demands/new',
    group: 'create',
    keywords: ['otkazma', 'sotuv'],
  },
  {
    id: 'c.invoice',
    labelKey: 'create_invoice',
    icon: 'create',
    href: '/invoices-out/new',
    group: 'create',
    keywords: ['hisob faktura'],
  },
  {
    id: 'c.order',
    labelKey: 'create_order',
    icon: 'create',
    href: '/customer-orders/new',
    group: 'create',
    keywords: ['buyurtma'],
  },
  {
    id: 'c.product',
    labelKey: 'create_product',
    icon: 'create',
    href: '/products/new',
    group: 'create',
    keywords: ['mahsulot'],
  },
  {
    id: 'c.counterparty',
    labelKey: 'create_counterparty',
    icon: 'create',
    href: '/counterparties/new',
    group: 'create',
    keywords: ['mijoz', 'taminotchi'],
  },
  {
    id: 'c.payment',
    labelKey: 'create_payment',
    icon: 'create',
    href: '/payments-in/new',
    group: 'create',
    keywords: ['tolov'],
  },

  // Tools
  {
    id: 't.import',
    labelKey: 'import_counterparties',
    icon: 'upload',
    href: '/counterparties/import',
    group: 'tools',
  },
  {
    id: 't.bank',
    labelKey: 'import_bank',
    icon: 'uploadCloud',
    href: '/bank-import',
    group: 'tools',
    keywords: ['1c', 'mt940'],
  },
  {
    id: 't.audit',
    labelKey: 'audit_log',
    icon: 'auditLog',
    href: '/settings/audit-log',
    group: 'tools',
  },

  // Settings
  {
    id: 's.users',
    labelKey: 'settings_users',
    icon: 'users',
    href: '/settings/users',
    group: 'settings',
  },
  {
    id: 's.org',
    labelKey: 'settings_organizations',
    icon: 'organizations',
    href: '/settings/organizations',
    group: 'settings',
  },
  {
    id: 's.email',
    labelKey: 'settings_email',
    icon: 'email',
    href: '/settings/email',
    group: 'settings',
  },
  {
    id: 's.fx',
    labelKey: 'settings_exchange_rates',
    icon: 'exchangeRates',
    href: '/settings/exchange-rates',
    group: 'settings',
  },
];

export interface CommandPaletteProps {
  /**
   * Hide the visible search-icon trigger button. The cmd/ctrl+K hotkey
   * still opens the palette, so power users keep their shortcut while
   * the navbar drops the icon for moysklad parity (their navbar has no
   * global search trigger).
   */
  hideTrigger?: boolean;
}

export function CommandPalette({ hideTrigger = false }: CommandPaletteProps = {}) {
  const t = useTranslations('command_palette');
  const tCommands = useTranslations('command_palette.commands');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useHotkey('mod+k', () => setOpen((p) => !p));
  useHotkey('Escape', () => setOpen(false), { enabled: open, ignoreInputs: false });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((cmd) => {
      const label = tCommands(cmd.labelKey).toLowerCase();
      const aliases = (cmd.keywords ?? []).join(' ').toLowerCase();
      return label.includes(q) || aliases.includes(q);
    });
  }, [search, tCommands]);

  // Reset selection whenever the result set shrinks past the cursor.
  if (activeIndex >= filtered.length && filtered.length > 0) {
    setActiveIndex(0);
  }

  const groups = useMemo(() => {
    const out: { key: Command['group']; items: Command[] }[] = [];
    for (const cmd of filtered) {
      const last = out[out.length - 1];
      if (last && last.key === cmd.group) {
        last.items.push(cmd);
      } else {
        out.push({ key: cmd.group, items: [cmd] });
      }
    }
    return out;
  }, [filtered]);

  const handleSelect = (cmd: Command) => {
    if (cmd.href) router.push(cmd.href);
    setOpen(false);
    setSearch('');
    setActiveIndex(0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) handleSelect(cmd);
    }
  };

  return (
    <>
      {!hideTrigger && (
        <Tooltip content={`${t('open')} · ⌘K`} side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label={t('open')}
            data-testid="command-palette-button"
          >
            <Icons.search className="h-[18px] w-[18px]" />
          </Button>
        </Tooltip>
      )}

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        description={t('hint')}
        widthClass="w-[480px]"
        testId="command-palette"
      >
        <div className="flex h-full flex-col">
          <div className="border-[var(--ms-border-default)] border-b px-4 py-3">
            <Input
              autoFocus
              type="search"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKey}
              leading={<Icons.search className="h-4 w-4" />}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[var(--ms-text-muted)] text-sm">
                {t('no_results')}
              </p>
            ) : (
              groups.map((group) => (
                <section
                  key={group.key}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                >
                  <h3 className="bg-[var(--ms-bg-app)] px-4 py-2 font-semibold text-[var(--ms-text-muted)] text-[10px] uppercase tracking-wide">
                    {t(`group_${group.key}`)}
                  </h3>
                  <ul>
                    {group.items.map((cmd) => {
                      const idx = filtered.indexOf(cmd);
                      const Icon = Icons[cmd.icon];
                      const active = idx === activeIndex;
                      return (
                        <li key={cmd.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect(cmd)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none ${active ? 'bg-[var(--ms-bg-hover)]' : ''}`}
                          >
                            <Icon
                              className={`h-4 w-4 shrink-0 ${cmd.iconColorClass ?? 'text-[var(--ms-text-muted)]'}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-[var(--ms-text-primary)] text-sm">
                                {tCommands(cmd.labelKey)}
                              </p>
                            </div>
                            {active && (
                              <span className="text-[var(--ms-text-muted)] text-xs">↵</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-app)] px-4 py-2 text-[var(--ms-text-muted)] text-xs">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--ms-border-default)] bg-white px-1.5 py-0.5 font-mono text-[10px]">
                ↑↓
              </kbd>
              {t('hint_navigate')}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--ms-border-default)] bg-white px-1.5 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>
              {t('hint_select')}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--ms-border-default)] bg-white px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>
              {t('hint_close')}
            </span>
          </footer>
        </div>
      </Drawer>
    </>
  );
}
