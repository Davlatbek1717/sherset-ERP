import { renderWithProviders } from '@/test-utils';
/**
 * SettingsSidebar tests — moysklad 1:1 left rail (owner screenshots
 * 2026-07-16): three moysklad groups (НАСТРОЙКИ · ОБМЕН ДАННЫМИ ·
 * СПРАВОЧНИКИ [+ Справочник]) as flat icon-less text rows with a pale-blue
 * active tint, plus our trailing ПРОЧЕЕ group (⛔ preserve-custom-features:
 * МХИК, Кассы, Журнал аудита, … stay reachable).
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

describe('SettingsSidebar (moysklad 1:1, 2026-07-16)', () => {
  describe('basic rendering', () => {
    it('renders an <aside> with settings-sidebar testId', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      expect(container.querySelector('[data-testid="settings-sidebar"]')).toBeInTheDocument();
      expect(container.querySelector('aside')).toBeInTheDocument();
    });

    it('renders exactly the 3 moysklad group headers (extras hidden) in heading color', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const headers = container.querySelectorAll('h3');
      expect(headers).toHaveLength(3);
      for (const h of headers) {
        expect(h.className).toContain('uppercase');
        expect(h.className).toContain('text-[var(--ms-settings-heading)]');
      }
    });

    it('rows are flat text — no icons inside links (moysklad settings nav)', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const links = container.querySelectorAll('[data-testid^="settings-link-"]');
      // 3+3+8 moysklad rows + «Удалить аккаунт» (custom entities load async)
      expect(links.length).toBeGreaterThanOrEqual(15);
      for (const link of links) {
        expect(link.querySelector('svg')).toBeNull();
      }
    });

    it('ends with the standalone «Удалить аккаунт» row (moysklad bottom)', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const del = container.querySelector('[data-testid="settings-link-delete_account"]');
      expect(del).toBeInTheDocument();
      expect(del?.getAttribute('href')).toBe('/settings/delete-account');
    });

    it('СПРАВОЧНИКИ carries the «+ Справочник» button → custom-entities/new', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const btn = container.querySelector('[data-testid="settings-add-custom-entity"]');
      expect(btn).toBeInTheDocument();
      expect(btn?.getAttribute('href')).toBe('/settings/custom-entities/new');
    });

    it('moysklad reference rows exist: Юр. лица · Сотрудники · Каналы продаж · Страны', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      for (const key of ['organizations', 'employees', 'sales_channels', 'countries']) {
        const link = container.querySelector(`[data-testid="settings-link-${key}"]`);
        expect(link).toBeInTheDocument();
      }
      expect(
        container.querySelector('[data-testid="settings-link-employees"]')?.getAttribute('href'),
      ).toBe('/settings/employees');
    });
  });

  describe('active state (pale-blue row tint)', () => {
    it('highlights /settings/employees when pathname is /settings/employees', () => {
      usePathnameMock.mockReturnValue('/settings/employees');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const link = container.querySelector('[data-testid="settings-link-employees"]');
      expect(link?.className).toContain('bg-[var(--ms-bg-hover)]');
    });

    it('highlights /settings/employees for sub-route /settings/employees/abc-123', () => {
      usePathnameMock.mockReturnValue('/settings/employees/abc-123');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const link = container.querySelector('[data-testid="settings-link-employees"]');
      expect(link?.className).toContain('bg-[var(--ms-bg-hover)]');
    });

    it('does NOT highlight organizations when on /settings/employees', () => {
      usePathnameMock.mockReturnValue('/settings/employees');
      const { container } = renderWithProviders(<SettingsSidebar />);
      const orgs = container.querySelector('[data-testid="settings-link-organizations"]');
      expect(orgs?.className).not.toContain('bg-[var(--ms-bg-hover)]');
    });
  });

  describe('hidden extras (owner 2026-07-16: hide, do NOT delete — ⛔ preserve rule)', () => {
    it('МХИК/Кассы/Журнал аудита links are hidden from the nav (code kept behind a flag)', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      for (const key of ['mxik', 'audit_log', 'cash_desks', 'exchange_rates', 'all_settings']) {
        expect(container.querySelector(`[data-testid="settings-link-${key}"]`)).toBeNull();
      }
    });

    it('has NO «Склады» link — moysklad settings has no warehouses (live 2026-07-03)', () => {
      usePathnameMock.mockReturnValue('/settings/company');
      const { container } = renderWithProviders(<SettingsSidebar />);
      expect(container.querySelector('[data-testid="settings-link-stores"]')).toBeNull();
      expect(container.querySelector('a[href="/settings/stores"]')).toBeNull();
    });
  });
});
