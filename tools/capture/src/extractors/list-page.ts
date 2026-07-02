import type { Page } from 'playwright';
import { settle } from '../utils/wait.ts';

/**
 * List-page extractor for moysklad app list views
 * (Заказы поставщикам, Контрагенты, etc.).
 *
 * Captures: toolbar, filter button, bulk-actions bar, table columns, empty state,
 * submenu tabs, and all interactive elements with positions.
 */

export interface ListPageCapture {
  route: string;
  url: string;
  capturedAt: string;
  title: string | null;
  subNavTabs: string[];
  toolbar: {
    primaryAction: { label: string; bbox: Bbox } | null;
    secondaryActions: { label: string; bbox: Bbox }[];
    iconButtons: { role: 'help' | 'refresh' | 'settings' | 'unknown'; bbox: Bbox }[];
    search: { placeholder: string | null; bbox: Bbox } | null;
  };
  bulkToolbar: {
    selectionCount: { bbox: Bbox } | null;
    actions: { label: string; disabled: boolean; bbox: Bbox }[];
    rightSide: { label: string; bbox: Bbox }[];
  };
  tableColumns: string[];
  hasData: boolean;
  emptyState: {
    heading: string | null;
    cta: string | null;
    learningLinks: string[];
  } | null;
  bodyHeight: number;
  interactiveCount: number;
}

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function extractListPage(page: Page, route: string): Promise<ListPageCapture> {
  await settle(page, 700);

  const data = await page.evaluate(() => {
    type Bbox = { x: number; y: number; w: number; h: number };

    function bbox(el: Element): Bbox {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
    function text(el: Element | null): string {
      return (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
    }

    const h1El = document.querySelector('h1, [class*=title]:not(a)');
    const title = h1El ? text(h1El) : null;

    // Submenu tabs (top sub-nav)
    const subNavTabs: string[] = [];
    document.querySelectorAll('nav a, [class*=sub-nav] a, [role=tablist] a').forEach((a) => {
      const t = text(a);
      if (t && t.length < 50 && !subNavTabs.includes(t)) subNavTabs.push(t);
    });

    // Toolbar — by heuristic: buttons in top ~200px after title
    const toolbarButtons: { label: string; bbox: Bbox }[] = [];
    document.querySelectorAll('button, a').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > 100 && r.top < 260 && r.width > 20 && r.height > 18) {
        const label = text(el);
        if (label && label.length < 40) {
          toolbarButtons.push({ label, bbox: bbox(el) });
        }
      }
    });

    // Search input
    const searchEl = document.querySelector(
      'input[placeholder*="омер"], input[placeholder*="омментарий"], input[type=search], [class*=search] input',
    );
    const search = searchEl
      ? {
          placeholder: searchEl.getAttribute('placeholder'),
          bbox: bbox(searchEl),
        }
      : null;

    // Bulk toolbar actions (row ~210-240px)
    const bulkActions: { label: string; disabled: boolean; bbox: Bbox }[] = [];
    document.querySelectorAll('button').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > 200 && r.top < 250 && r.width > 20) {
        const label = text(el);
        if (label && label.length < 30) {
          bulkActions.push({ label, disabled: (el as HTMLButtonElement).disabled, bbox: bbox(el) });
        }
      }
    });

    // Table columns
    const columnEls = Array.from(document.querySelectorAll('th, [role=columnheader]'));
    const tableColumns = columnEls.map((c) => text(c)).filter((t) => t && t.length < 40);

    // Empty state detection
    const emptyStateEl = document.querySelector('[class*=empty], [class*=no-data]');
    const hasRows = document.querySelectorAll('tbody tr, [role=row]').length > 1;
    const learningLinks: string[] = [];
    if (!hasRows) {
      document.querySelectorAll('a').forEach((a) => {
        const t = text(a);
        if (t && /руководство|видео|курс|инструкц/i.test(t)) {
          learningLinks.push(t);
        }
      });
    }

    const emptyState = !hasRows
      ? {
          heading: emptyStateEl ? text(emptyStateEl.querySelector('h1, h2, h3')) : null,
          cta: emptyStateEl ? text(emptyStateEl.querySelector('button, a[class*=button]')) : null,
          learningLinks,
        }
      : null;

    // Iconic 16x16-ish buttons next to title (help, refresh, settings)
    const iconButtons: { role: 'help' | 'refresh' | 'settings' | 'unknown'; bbox: Bbox }[] = [];
    document.querySelectorAll('button').forEach((btn) => {
      const r = btn.getBoundingClientRect();
      if (r.width >= 14 && r.width <= 36 && r.height >= 14 && r.height <= 36 && r.top < 260) {
        const t = text(btn);
        if (!t) {
          const role = /refresh/i.test(btn.className)
            ? 'refresh'
            : /help|question/i.test(btn.className)
              ? 'help'
              : /setting|gear/i.test(btn.className)
                ? 'settings'
                : 'unknown';
          iconButtons.push({ role, bbox: bbox(btn) });
        }
      }
    });

    // Everything interactive count
    const interactiveCount = document.querySelectorAll(
      'button, a, input, select, textarea, [role=button], [role=tab], [role=menuitem]',
    ).length;

    return {
      title,
      subNavTabs,
      toolbarButtons,
      search,
      bulkActions,
      tableColumns,
      hasRows,
      emptyState,
      iconButtons,
      interactiveCount,
      bodyHeight: document.body.scrollHeight,
    };
  });

  // Classify toolbar buttons
  const primaryAction =
    data.toolbarButtons.find((b) => /^\+/.test(b.label) || /^Создать/.test(b.label)) ?? null;
  const secondaryActions = data.toolbarButtons.filter(
    (b) => b !== primaryAction && !/^\+/.test(b.label),
  );

  return {
    route,
    url: page.url(),
    capturedAt: new Date().toISOString(),
    title: data.title,
    subNavTabs: data.subNavTabs,
    toolbar: {
      primaryAction,
      secondaryActions,
      iconButtons: data.iconButtons,
      search: data.search,
    },
    bulkToolbar: {
      selectionCount: null,
      actions: data.bulkActions,
      rightSide: [],
    },
    tableColumns: data.tableColumns,
    hasData: data.hasRows,
    emptyState: data.emptyState,
    bodyHeight: data.bodyHeight,
    interactiveCount: data.interactiveCount,
  };
}
