import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import {
  AppShell,
  type DataTableColumn,
  ListView,
  Pagination,
  PaginationLabelsProvider,
  SubNav,
} from '@moysklad/ui';
/**
 * Navigation + AppShell shells (from @moysklad/ui) tests.
 *
 * - SubNav: module-level cross-page tab strip below the navy navbar.
 * - Pagination: bottom-of-list pager (default uz "Oldingi/Keyingi"
 *   buttons + alt moyskladStyle compact icon-only).
 * - AppShell: top navy navbar with primary nav + user block + optional
 *   trial banner + topRightExtras slot.
 */
import { describe, expect, it, vi } from 'vitest';

describe('SubNav', () => {
  describe('basic rendering', () => {
    it('renders as <nav> with aria-label "Module sub-navigation"', () => {
      renderWithProviders(<SubNav items={[{ key: 'a', label: 'A', href: '/a' }]} />);
      expect(screen.getByRole('navigation', { name: 'Module sub-navigation' })).toBeInTheDocument();
    });

    it('renders one item per array entry', () => {
      const { container } = renderWithProviders(
        <SubNav
          items={[
            { key: 'a', label: 'A', href: '/a' },
            { key: 'b', label: 'B', href: '/b' },
            { key: 'c', label: 'C', href: '/c' },
          ]}
        />,
      );
      // Active items render as <a>; inactive too unless unbuilt
      const links = container.querySelectorAll('nav a');
      expect(links).toHaveLength(3);
    });

    it('non-active items render as <a href> without active classes', () => {
      renderWithProviders(<SubNav items={[{ key: 'a', label: 'A', href: '/items' }]} />);
      // getByRole('link') scopes to the desktop <a> — the 2026-07-20f mobile
      // dropdown trigger is a <button> with the same visible label ("A" is
      // also the current-page fallback text), so getByText would be ambiguous.
      const a = screen.getByRole('link', { name: 'A' }) as HTMLAnchorElement;
      expect(a.tagName).toBe('A');
      expect(a).toHaveAttribute('href', '/items');
      expect(a.className).not.toContain('font-medium');
    });
  });

  describe('active state', () => {
    it('active=true sets data-active="true"', () => {
      renderWithProviders(<SubNav items={[{ key: 'a', label: 'A', href: '/a', active: true }]} />);
      const a = screen.getByRole('link', { name: 'A' }) as HTMLAnchorElement;
      expect(a).toHaveAttribute('data-active', 'true');
    });

    it('active item gets brand color + bottom border + bold (font-semibold)', () => {
      // moysklad parity (2026-06-22): sub-nav links are all brand-blue now, so
      // the active one is distinguished by font-semibold + the brand underline.
      renderWithProviders(<SubNav items={[{ key: 'a', label: 'A', href: '/a', active: true }]} />);
      const a = screen.getByRole('link', { name: 'A' });
      expect(a.className).toContain('font-semibold');
      expect(a.className).toContain('text-[var(--ms-text-brand)]');
      expect(a.className).toContain('border-[var(--ms-brand-500)]');
    });

    it('inactive items do NOT have data-active', () => {
      renderWithProviders(<SubNav items={[{ key: 'a', label: 'A', href: '/a' }]} />);
      expect(screen.getByRole('link', { name: 'A' })).not.toHaveAttribute('data-active');
    });
  });

  // The legacy "unbuilt" tab rendering (greyed span + WIP dot) was
  // removed in commit 275088a as part of the "hammasi free" decision —
  // every section is now a real, clickable tab. Tests for that
  // behaviour deleted here to keep the suite tight; the field itself
  // is gone from SubNavItem so callers can no longer set it.
});

describe('Pagination (default uz style)', () => {
  describe('summary text', () => {
    it('renders "Jami: N ta yozuv" (default itemLabel)', () => {
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      expect(screen.getByText(/Jami:/)).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText(/ta yozuv/)).toBeInTheDocument();
    });

    it('honors custom itemLabel', () => {
      renderWithProviders(
        <Pagination
          total={5}
          limit={10}
          hasPrevious={false}
          hasNext={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          itemLabel="ta hujjat"
        />,
      );
      expect(screen.getByText(/ta hujjat/)).toBeInTheDocument();
    });

    it('shows the truncation hint when total > limit', () => {
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      // "10 ta ko'rsatildi"
      expect(screen.getByText(/ko'rsatildi/)).toBeInTheDocument();
    });

    it('does NOT show truncation hint when total <= limit', () => {
      renderWithProviders(
        <Pagination
          total={5}
          limit={10}
          hasPrevious={false}
          hasNext={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      expect(screen.queryByText(/ko'rsatildi/)).toBeNull();
    });
  });

  describe('Oldingi/Keyingi buttons', () => {
    it('renders both buttons with uz aria-labels', () => {
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Oldingi sahifa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keyingi sahifa' })).toBeInTheDocument();
    });

    it('clicking Oldingi calls onPrevious', async () => {
      const onPrevious = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={onPrevious}
          onNext={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Oldingi sahifa' }));
      expect(onPrevious).toHaveBeenCalled();
    });

    it('clicking Keyingi calls onNext', async () => {
      const onNext = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={onNext}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Keyingi sahifa' }));
      expect(onNext).toHaveBeenCalled();
    });

    it('Oldingi disabled when hasPrevious=false', () => {
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Oldingi sahifa' })).toBeDisabled();
    });

    it('Keyingi disabled when hasNext=false', () => {
      renderWithProviders(
        <Pagination
          total={42}
          limit={10}
          hasPrevious={true}
          hasNext={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Keyingi sahifa' })).toBeDisabled();
    });
  });
});

describe('Pagination (moyskladStyle)', () => {
  describe('range label', () => {
    it('renders "1-N из {total}" with ru-RU thin-space formatting', () => {
      renderWithProviders(
        <Pagination
          total={27338}
          limit={100}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      const range = screen.getByTestId('pagination-range');
      expect(range.textContent).toMatch(/^1-100/);
      expect(range.textContent).toContain('из');
      // Thin-space-separated 27 338
      expect(range.textContent).toMatch(/27[\s  ]?338/);
    });

    it('honors custom ofLabel', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={50}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
          ofLabel="dan"
        />,
      );
      expect(screen.getByTestId('pagination-range').textContent).toContain('dan');
    });

    it('uses visibleCount over limit when smaller', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={50}
          visibleCount={37}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-range').textContent).toMatch(/^1-37/);
    });

    it('shows "0-0" when total=0', () => {
      renderWithProviders(
        <Pagination
          total={0}
          limit={100}
          hasPrevious={false}
          hasNext={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      // total=0 → from=0, visible=Math.min(100,0)=0, to=0
      expect(screen.getByTestId('pagination-range').textContent).toMatch(/^0-0/);
    });
  });

  describe('chevron buttons', () => {
    it('renders prev + next icon buttons by default', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-prev')).toBeInTheDocument();
      expect(screen.getByTestId('pagination-next')).toBeInTheDocument();
    });

    it('does NOT render first/last when handlers omitted', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.queryByTestId('pagination-first')).toBeNull();
      expect(screen.queryByTestId('pagination-last')).toBeNull();
    });

    it('renders first + last when handlers provided', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onFirst={vi.fn()}
          onLast={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-first')).toBeInTheDocument();
      expect(screen.getByTestId('pagination-last')).toBeInTheDocument();
    });

    it('clicking prev/next/first/last calls the handlers', async () => {
      const user = userEvent.setup();
      const onPrevious = vi.fn();
      const onNext = vi.fn();
      const onFirst = vi.fn();
      const onLast = vi.fn();
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={true}
          hasNext={true}
          onPrevious={onPrevious}
          onNext={onNext}
          onFirst={onFirst}
          onLast={onLast}
          moyskladStyle
        />,
      );
      await user.click(screen.getByTestId('pagination-first'));
      expect(onFirst).toHaveBeenCalled();
      await user.click(screen.getByTestId('pagination-prev'));
      expect(onPrevious).toHaveBeenCalled();
      await user.click(screen.getByTestId('pagination-next'));
      expect(onNext).toHaveBeenCalled();
      await user.click(screen.getByTestId('pagination-last'));
      expect(onLast).toHaveBeenCalled();
    });

    it('first + prev disabled when hasPrevious=false', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onFirst={vi.fn()}
          onLast={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-first')).toBeDisabled();
      expect(screen.getByTestId('pagination-prev')).toBeDisabled();
    });

    it('next + last disabled when hasNext=false', () => {
      renderWithProviders(
        <Pagination
          total={100}
          limit={10}
          hasPrevious={true}
          hasNext={false}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onFirst={vi.fn()}
          onLast={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-next')).toBeDisabled();
      expect(screen.getByTestId('pagination-last')).toBeDisabled();
    });
  });
});

/**
 * Pagination i18n leak fix (2026-06-08 — design-system-default-leak bug-class,
 * same class as ModalLabelsProvider / ConfirmDialog / CatalogPicker).
 *
 * Two leaks fixed:
 *  (1) The DEFAULT (text) pager hardcoded Latin-uz ("Jami:/Oldingi/Keyingi")
 *      that leaked into the RU UI. Fixed by making ListView ALWAYS render the
 *      moysklad-parity icon-only pager (§4-grounded: moysklad.uz pagination is
 *      image buttons + "1-N из total" range, NO "Предыдущая/Следующая" text).
 *  (2) The moyskladStyle range connector defaulted to Russian «из» — leaked
 *      into the UZ UI on every list. Fixed by injecting it (+ the icon-button
 *      aria-labels) via PaginationLabelsProvider at the app root.
 */
describe('Pagination i18n leak fix', () => {
  describe('PaginationLabelsProvider injection (moyskladStyle)', () => {
    it('injects the localized range connector (uz "dan", not «из»)', () => {
      renderWithProviders(
        <PaginationLabelsProvider labels={{ of: 'dan' }}>
          <Pagination
            total={100}
            limit={50}
            hasPrevious={false}
            hasNext={true}
            onPrevious={vi.fn()}
            onNext={vi.fn()}
            moyskladStyle
          />
        </PaginationLabelsProvider>,
      );
      const range = screen.getByTestId('pagination-range');
      expect(range.textContent).toContain('dan');
      expect(range.textContent).not.toContain('из');
    });

    it('injects localized aria-labels onto the icon buttons (no English leak)', () => {
      renderWithProviders(
        <PaginationLabelsProvider
          labels={{
            first: 'Birinchi sahifa',
            previous: 'Oldingi sahifa',
            next: 'Keyingi sahifa',
            last: 'Oxirgi sahifa',
          }}
        >
          <Pagination
            total={100}
            limit={10}
            hasPrevious={true}
            hasNext={true}
            onPrevious={vi.fn()}
            onNext={vi.fn()}
            onFirst={vi.fn()}
            onLast={vi.fn()}
            moyskladStyle
          />
        </PaginationLabelsProvider>,
      );
      expect(screen.getByRole('button', { name: 'Birinchi sahifa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oldingi sahifa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keyingi sahifa' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oxirgi sahifa' })).toBeInTheDocument();
      // The English design-system defaults are gone.
      expect(screen.queryByRole('button', { name: 'prev' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'next' })).toBeNull();
    });

    it('explicit ofLabel prop still wins over the provider', () => {
      renderWithProviders(
        <PaginationLabelsProvider labels={{ of: 'dan' }}>
          <Pagination
            total={100}
            limit={50}
            hasPrevious={false}
            hasNext={true}
            onPrevious={vi.fn()}
            onNext={vi.fn()}
            moyskladStyle
            ofLabel="/"
          />
        </PaginationLabelsProvider>,
      );
      expect(screen.getByTestId('pagination-range').textContent).toContain('/');
    });

    it('falls back to «из» + English aria with no provider (standalone parity)', () => {
      renderWithProviders(
        <Pagination
          total={10}
          limit={5}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          moyskladStyle
        />,
      );
      expect(screen.getByTestId('pagination-range').textContent).toContain('из');
      expect(screen.getByRole('button', { name: 'prev' })).toBeInTheDocument();
    });
  });

  describe('ListView renders the moysklad-parity icon-only pager', () => {
    type Row = { id: string; name: string };
    const COLS: DataTableColumn<Row>[] = [{ key: 'name', header: 'Name', cell: (r) => r.name }];
    const ROWS: Row[] = [{ id: '1', name: 'Alpha' }];

    it('shows the «1-N из total» range, NOT the Latin-uz "Oldingi/Keyingi" text pager', () => {
      renderWithProviders(
        <ListView<Row>
          title="List"
          columns={COLS}
          rows={ROWS}
          keyField="id"
          total={100}
          limit={25}
          hasPrevious={false}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />,
      );
      // moyskladStyle range present...
      expect(screen.getByTestId('pagination-range')).toBeInTheDocument();
      // ...and the old text-style pager is absent — no visible Latin-uz leak.
      expect(screen.queryByText(/Jami:/)).toBeNull();
      expect(screen.queryByText('ta yozuv')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Oldingi sahifa' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Keyingi sahifa' })).toBeNull();
    });
  });

  describe('regression lock — ListView wiring + i18n parity', () => {
    it('ListView passes moyskladStyle (not the coupled moyskladToolbar flag) to Pagination', () => {
      // Source-scan: re-coupling pagination style to `moyskladToolbar` would
      // reintroduce the default text pager (Latin-uz leak) on the ~19 pages
      // that don't opt into the moysklad toolbar.
      const listViewSrc = readFileSync(
        join(__dirname, '../../../../../packages/design-system/src/patterns/ListView.tsx'),
        'utf8',
      );
      expect(listViewSrc).not.toContain('moyskladStyle={moyskladToolbar}');
      expect(listViewSrc).toMatch(/<Pagination[\s\S]*?\n\s*moyskladStyle\n/);
    });

    it('pagination i18n keys exist in both ru + uz with no cross-locale leak', () => {
      const ru = JSON.parse(readFileSync(join(__dirname, '../../messages/ru.json'), 'utf8'))
        .pagination as Record<string, string>;
      const uz = JSON.parse(readFileSync(join(__dirname, '../../messages/uz.json'), 'utf8'))
        .pagination as Record<string, string>;
      for (const key of ['of', 'first', 'previous', 'next', 'last']) {
        expect(ru[key], `ru.pagination.${key}`).toBeTruthy();
        expect(uz[key], `uz.pagination.${key}`).toBeTruthy();
      }
      // RU connector is «из»; UZ must NOT be the Russian word (the leak we fixed).
      expect(ru.of).toBe('из');
      expect(uz.of).not.toBe('из');
      // UZ aria labels must not be Cyrillic (Latin-uz parity).
      for (const key of ['first', 'previous', 'next', 'last']) {
        expect(uz[key]).not.toMatch(/[А-Яа-яЁё]/);
      }
    });
  });
});

describe('AppShell', () => {
  const NAV = [
    { key: 'sales', label: 'Sotuvlar', href: '/sales', active: true },
    { key: 'purchase', label: "Ta'minot", href: '/purchase' },
  ];

  describe('basic rendering', () => {
    it('renders the children inside <main>', () => {
      const { container } = renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div data-test-id="page-body">Body</div>
        </AppShell>,
      );
      expect(screen.getByTestId('page-body')).toBeInTheDocument();
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('renders the header as the .ms-navbar bar (NOT pinned — moysklad parity)', () => {
      // moysklad parity (2026-06-20): the module navbar is NOT sticky — it
      // scrolls away with the page (the document SAVE toolbar pins instead).
      // This test previously asserted `sticky top-0`; that became stale when
      // the navbar was un-pinned, so it now asserts the real .ms-navbar bar.
      const { container } = renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header?.className).toContain('ms-navbar');
      expect(header?.className).not.toContain('sticky');
    });
  });

  describe('brand slot', () => {
    it('does NOT render brand wrapper when omitted', () => {
      const { container } = renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      // No brand → no shrink-0 mr-4 div before nav
      expect(container.querySelector('header > div > div.shrink-0.mr-4')).toBeNull();
    });

    it('renders brand content when provided', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV} brand={<span data-test-id="my-brand">Logo</span>}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.getByTestId('my-brand')).toBeInTheDocument();
    });
  });

  describe('primary nav', () => {
    it('renders one <a> per nav item', () => {
      const { container } = renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      const navLinks = container.querySelectorAll('header nav a');
      expect(navLinks).toHaveLength(2);
    });

    it('active item is rendered as a SOFT WHITE PILL with BRAND-BLUE text + icon (moysklad parity)', () => {
      // Pre-parity used dark `bg-white/10` overlay on the navy navbar;
      // moysklad's live navbar uses a white pill with brand-blue
      // label + icon (the screenshot shows a clearly two-tone effect:
      // white background + dark blue chart icon + dark blue label).
      renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      const sales = screen.getByText('Sotuvlar').closest('a');
      expect(sales?.className).toContain('bg-white');
      expect(sales?.className).toContain('text-[var(--ms-text-brand)]');
    });

    it('inactive item is text-white/85 with hover bg only (no resting fill)', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      const purchase = screen.getByText("Ta'minot").closest('a');
      expect(purchase?.className).toContain('text-white/85');
      // Only hover bg (not a resting bg-white)
      expect(purchase?.className).toContain('hover:bg-white/10');
      // Resting bg-white is NOT applied — distinguish from active
      expect(purchase?.className).not.toMatch(/(?<!hover:)bg-white(?!\/)/);
    });

    it('active pill is square-cornered at the bottom (rounded-t-md)', () => {
      // moysklad's pill flushes to the bottom of the navbar so it
      // shouldn't have a bottom rounded corner — only the top is rounded.
      renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      const sales = screen.getByText('Sotuvlar').closest('a');
      expect(sales?.className).toContain('rounded-t-md');
    });

    it('renders icon when provided + uses iconColorClass on inactive', () => {
      renderWithProviders(
        <AppShell
          primaryNav={[
            {
              key: 'p',
              label: 'P',
              href: '/p',
              icon: <span data-test-id="icon">📦</span>,
              iconColorClass: 'text-orange-500',
            },
          ]}
        >
          <div>Body</div>
        </AppShell>,
      );
      // Icon span renders the iconColorClass on inactive
      const iconWrapper = screen.getByTestId('icon').parentElement;
      expect(iconWrapper?.className).toContain('text-orange-500');
    });

    it("renders badge slot anchored to the icon's top-right corner", () => {
      // moysklad parity: the count badge (e.g. red "7" on Задачи) sits
      // on top of the icon, not inline next to the label. AppShell
      // wraps the badge in an absolute-positioned span when an icon is
      // present so we get the overlay behaviour for free.
      renderWithProviders(
        <AppShell
          primaryNav={[
            {
              key: 'p',
              label: 'P',
              href: '/p',
              icon: <span data-test-id="icon">📦</span>,
              badge: <span data-test-id="badge">3</span>,
            },
          ]}
        >
          <div>Body</div>
        </AppShell>,
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      // Wrapped in an absolutely-positioned overlay so it floats on
      // the icon's top-right edge (matches moysklad's red number).
      const overlay = badge.parentElement;
      expect(overlay?.className).toContain('absolute');
      expect(overlay?.className).toContain('-top-1');
      expect(overlay?.className).toContain('-right-2');
    });
  });

  describe('top banner', () => {
    it('does NOT render banner by default', () => {
      const { container } = renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      expect(container.querySelector('div.bg-\\[var\\(--ms-warning-500\\)\\]')).toBeNull();
    });

    it('renders banner content when provided', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV} topBanner={<span data-test-id="trial">Free trial</span>}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.getByTestId('trial')).toBeInTheDocument();
    });
  });

  describe('topRightExtras + user', () => {
    it('renders topRightExtras when provided', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV} topRightExtras={<span data-test-id="locale">UZ/RU</span>}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.getByTestId('locale')).toBeInTheDocument();
    });

    it('does NOT render user block by default', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.queryByText('Admin User')).toBeNull();
    });

    it('renders user name + email + avatar initial when user provided', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV} user={{ name: 'Admin User', email: 'a@x.com' }}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('a@x.com')).toBeInTheDocument();
      // Avatar uses the first character of the name (no avatar prop)
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('honors explicit avatar prop over the auto-derived initial', () => {
      renderWithProviders(
        <AppShell primaryNav={NAV} user={{ name: 'Admin', avatar: 'XX' }}>
          <div>Body</div>
        </AppShell>,
      );
      expect(screen.getByText('XX')).toBeInTheDocument();
    });
  });
});
