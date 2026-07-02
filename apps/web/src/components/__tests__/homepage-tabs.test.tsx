import { HomepageTabs } from '@/components/homepage-tabs';
import { renderWithProviders, screen } from '@/test-utils';
/**
 * HomepageTabs tests — page-level tab strip on /homepage views
 * (Показатели, Документы, Корзина, Журнал аудита, Файлы, Onboarding).
 *
 * Tests guard the active state styling, the disabled (href=null) tab
 * variant, the active underline span, the aria-current="page" attr,
 * and the navigation order.
 */
import { describe, expect, it } from 'vitest';

describe('HomepageTabs', () => {
  describe('basic rendering', () => {
    it('renders as <nav aria-label="Homepage sections">', () => {
      renderWithProviders(<HomepageTabs activeKey="metrics" />);
      expect(screen.getByRole('navigation', { name: 'Homepage sections' })).toBeInTheDocument();
    });

    it('renders all 6 tabs', () => {
      const { container } = renderWithProviders(<HomepageTabs activeKey="metrics" />);
      // 6 tabs total — all wired to real pages (no dead tabs).
      const items = container.querySelectorAll('li');
      expect(items).toHaveLength(6);
    });
  });

  describe('active state', () => {
    it('active tab gets aria-current="page"', () => {
      renderWithProviders(<HomepageTabs activeKey="documents" />);
      const link = screen
        .getByText(/Документы|Hujjatlar|documents/i, { exact: false })
        .closest('a, span');
      expect(link).toHaveAttribute('aria-current', 'page');
    });

    it('inactive tabs do NOT have aria-current', () => {
      renderWithProviders(<HomepageTabs activeKey="metrics" />);
      const inactive = screen
        .getByText(/Документы|Hujjatlar|documents/i, { exact: false })
        .closest('a, span');
      expect(inactive).not.toHaveAttribute('aria-current');
    });

    it('active tab gets brand text color + bold + bottom underline', () => {
      const { container } = renderWithProviders(<HomepageTabs activeKey="metrics" />);
      const activeLink = container.querySelector('a[aria-current="page"]');
      expect(activeLink?.className).toContain('font-semibold');
      expect(activeLink?.className).toContain('text-[var(--ms-text-brand)]');
      // Underline span
      const underline = activeLink?.querySelector('span[aria-hidden]');
      expect(underline).toBeInTheDocument();
      expect(underline?.className).toContain('bg-[var(--ms-bg-brand)]');
    });
  });

  describe('all tabs are wired (no dead tabs)', () => {
    it('renders zero disabled spans — every tab links to a real page', () => {
      const { container } = renderWithProviders(<HomepageTabs activeKey="metrics" />);
      // §120/§ files+onboarding pages were built and wired — there are
      // no href=null tabs anymore; regression guard if one reappears.
      expect(container.querySelectorAll('span[aria-disabled="true"]')).toHaveLength(0);
      expect(container.querySelectorAll('a')).toHaveLength(6);
    });

    it('the formerly-dead tabs now resolve (files → /files, onboarding → /getting-started)', () => {
      const { container } = renderWithProviders(<HomepageTabs activeKey="metrics" />);
      const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/files');
      expect(hrefs).toContain('/getting-started');
    });
  });

  describe('navigation links', () => {
    it('active links use the correct href', () => {
      const { container } = renderWithProviders(<HomepageTabs activeKey="metrics" />);
      const links = container.querySelectorAll('a');
      const hrefs = Array.from(links).map((a) => a.getAttribute('href'));
      // metrics → /, documents → /customer-orders, trash → /korzina, audit → /settings/audit-log
      expect(hrefs).toContain('/');
      expect(hrefs).toContain('/customer-orders');
      expect(hrefs).toContain('/korzina');
      expect(hrefs).toContain('/settings/audit-log');
    });
  });
});
