import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ColumnSettings } from '@/components/column-settings';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
/**
 * ColumnSettings i18n guard — the app-level wrapper around the locale-
 * agnostic design-system <ColumnCustomizer>. Catches the bug-class where
 * the column-settings gear leaked a hardcoded Latin-uz "Ustunlar" label
 * into the RU locale and an English "Reset" into both (the design-system
 * defaults). The wrapper injects localized strings in ONE place; these
 * tests lock that in + a source-scan keeps pages from re-importing the
 * raw component.
 *
 * Grounding (CLAUDE.md §4): moysklad renders this control ICON-ONLY with
 * the accessible name "Настроить колонки" (RU) — element content appears
 * 2549× in the captures, uniquely carrying a `hideLabel` modifier, so the
 * trigger shows no visible text. We mirror that: gear icon + localized
 * aria-label, no visible label.
 */
import { describe, expect, it, vi } from 'vitest';
import ruMessages from '../../messages/ru.json';

const COLS = [
  { key: 'name', label: 'Name', alwaysVisible: true },
  { key: 'date', label: 'Date' },
];

describe('ColumnSettings (localized column-customizer wrapper)', () => {
  it('trigger uses the localized accessible name (uz)', () => {
    renderWithProviders(
      <ColumnSettings columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Ustunlarni sozlash' })).toBeInTheDocument();
  });

  it('trigger uses the localized accessible name (ru)', () => {
    renderWithProviders(
      <ColumnSettings columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      { messages: ruMessages as Record<string, unknown> },
    );
    expect(screen.getByRole('button', { name: 'Настроить колонки' })).toBeInTheDocument();
  });

  it('trigger is ICON-ONLY — no visible "Ustunlar" / "Columns" text leak', () => {
    renderWithProviders(
      <ColumnSettings columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
    );
    const trigger = screen.getByTestId('column-customizer-trigger');
    // The accessible name lives in aria-label, not visible text content.
    expect(trigger.textContent).toBe('');
    expect(screen.queryByText('Ustunlar')).toBeNull();
  });

  it('reset button shows the localized label, not English "Reset" (uz)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSettings
        columns={COLS}
        visibleKeys={new Set(['name'])}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('column-customizer-trigger'));
    await waitFor(() => screen.getByTestId('column-reset'));
    expect(screen.getByTestId('column-reset')).toHaveTextContent('Tiklash');
    expect(screen.getByTestId('column-reset')).not.toHaveTextContent('Reset');
  });

  it('reset button shows the localized label (ru)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSettings
        columns={COLS}
        visibleKeys={new Set(['name'])}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
      { messages: ruMessages as Record<string, unknown> },
    );
    await user.click(screen.getByTestId('column-customizer-trigger'));
    await waitFor(() => screen.getByTestId('column-reset'));
    expect(screen.getByTestId('column-reset')).toHaveTextContent('Сбросить');
  });

  it('forwards toggle behaviour to the underlying customizer', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSettings columns={COLS} visibleKeys={new Set(['name'])} onChange={onChange} />,
    );
    await user.click(screen.getByTestId('column-customizer-trigger'));
    await waitFor(() => screen.getByTestId('column-toggle-date'));
    await user.click(screen.getByTestId('column-toggle-date'));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Set<string>;
    expect(next.has('date')).toBe(true);
  });

  /**
   * Regression lock: every list page must go through the localized
   * wrapper. A page importing the raw <ColumnCustomizer> from @moysklad/ui
   * would re-introduce the un-localized "Ustunlar"/"Reset" leak that this
   * whole change fixes.
   */
  it('no app page imports the raw ColumnCustomizer directly', () => {
    const appDir = join(__dirname, '..', '..', 'app', '(app)');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          const src = readFileSync(full, 'utf-8');
          // Flag a JSX usage of the raw component — the wrapper is <ColumnSettings>.
          if (/<ColumnCustomizer[\s/>]/.test(src)) offenders.push(full);
        }
      }
    };
    walk(appDir);
    expect(offenders).toEqual([]);
  });
});
