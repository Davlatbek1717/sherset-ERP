import { renderWithProviders } from '@/test-utils';
/**
 * SettingsSidebar tests — left rail with categorized settings tabs
 * (organizations, stores, users, audit-log, etc.). Visible on every
 * /settings/* page.
 *
 * Tests guard the active state for the current route, the sub-route
 * matching (e.g., /settings/users/123 highlights /settings/users),
 * the group structure, and the per-link testId for E2E.
 */
import { describe, expect, it, vi } from 'vitest';

// usePathname is a next/navigation hook — mock it per-test to control
// the "current route" the sidebar sees.
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { SettingsSidebar } from '@/components/settings-sidebar';
import { usePathname } from 'next/navigation';

const usePathnameMock = usePathname as unknown as ReturnType<typeof vi.fn>;

describe('SettingsSidebar', () => {
  describe('basic rendering', () => {
    it('renders an <aside> with settings-sidebar testId', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      // testId uses data-testid (no dash) in the source
      expect(container.querySelector('[data-testid="settings-sidebar"]')).toBeInTheDocument();
      expect(container.querySelector('aside')).toBeInTheDocument();
    });

    it('renders the Overview link to /settings at the top', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const links = container.querySelectorAll('a');
      const overview = Array.from(links).find((a) => a.getAttribute('href') === '/settings');
      expect(overview).toBeInTheDocument();
    });

    it('renders one link per settings page (testId per link)', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      // 4 groups × variable links = 14 link testIds (organizations, stores, ...)
      const links = container.querySelectorAll('[data-testid^="settings-link-"]');
      // Don't pin to exact count (groups change); just verify > 10
      expect(links.length).toBeGreaterThan(10);
    });
  });

  describe('active state', () => {
    it('highlights /settings/users when pathname is /settings/users', () => {
      usePathnameMock.mockReturnValue('/settings/users');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const usersLink = container.querySelector('[data-testid="settings-link-users"]');
      expect(usersLink?.className).toContain('font-medium');
      expect(usersLink?.className).toContain('text-[var(--ms-text-brand)]');
      expect(usersLink?.className).toContain('border-l-2');
    });

    it('highlights /settings/users for sub-route /settings/users/abc-123', () => {
      usePathnameMock.mockReturnValue('/settings/users/abc-123');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const usersLink = container.querySelector('[data-testid="settings-link-users"]');
      expect(usersLink?.className).toContain('text-[var(--ms-text-brand)]');
    });

    it('does NOT highlight /settings/stores when on /settings/users', () => {
      usePathnameMock.mockReturnValue('/settings/users');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const stores = container.querySelector('[data-testid="settings-link-stores"]');
      expect(stores?.className).not.toContain('font-medium');
      expect(stores?.className).not.toContain('text-[var(--ms-text-brand)]');
    });

    it('Overview link gets active styling when pathname is exactly /settings', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const overview = container.querySelector('a[href="/settings"]');
      expect(overview?.className).toContain('text-[var(--ms-text-brand)]');
    });

    it('Overview link is NOT active when pathname is /settings/users', () => {
      usePathnameMock.mockReturnValue('/settings/users');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const overview = container.querySelector('a[href="/settings"]');
      expect(overview?.className).not.toContain('text-[var(--ms-text-brand)]');
    });
  });

  describe('group categories', () => {
    it('renders all 5 group titles', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const headers = container.querySelectorAll('h3');
      // 5 group titles (group_user, group_company, group_team, group_references,
      // group_integrations)
      expect(headers).toHaveLength(5);
    });

    it('group titles are uppercased + muted', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const header = container.querySelector('h3');
      expect(header?.className).toContain('uppercase');
      expect(header?.className).toContain('text-[var(--ms-text-muted)]');
    });
  });

  describe('icon rendering', () => {
    it('every link has an icon (svg)', () => {
      usePathnameMock.mockReturnValue('/settings');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const linkEls = container.querySelectorAll('[data-testid^="settings-link-"]');
      for (const link of linkEls) {
        expect(link.querySelector('svg')).toBeInTheDocument();
      }
    });
  });
});
