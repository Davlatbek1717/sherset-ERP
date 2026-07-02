import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { ColumnCustomizer, type ColumnCustomizerColumn } from '@moysklad/ui';
/**
 * ColumnCustomizer (from @moysklad/ui) tests — popover-based column-
 * visibility toggle (gear icon) at the top of every list page.
 * Matches moysklad's "Настройка колонок" dropdown.
 *
 * Tests guard the trigger rendering, popover open behavior, the
 * checkbox per column, the alwaysVisible lock (cannot toggle off),
 * the onChange called with the next visibleKeys Set, and the
 * optional Reset button.
 */
import { describe, expect, it, vi } from 'vitest';

const COLS: ColumnCustomizerColumn[] = [
  { key: 'name', label: 'Name', alwaysVisible: true },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
];

describe('ColumnCustomizer', () => {
  describe('trigger rendering', () => {
    it('renders the gear-icon trigger button', () => {
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name', 'date'])}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId('column-customizer-trigger')).toBeInTheDocument();
    });

    it('uses aria-label "Customize columns"', () => {
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: 'Customize columns' })).toBeInTheDocument();
    });

    it('renders custom label next to icon', () => {
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name'])}
          onChange={vi.fn()}
          label="Columns"
        />,
      );
      expect(screen.getByText('Columns')).toBeInTheDocument();
    });
  });

  describe('popover behavior', () => {
    it('clicking trigger opens the panel with all columns', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name', 'date'])}
          onChange={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('column-customizer-panel')).toBeInTheDocument();
      });
    });

    it('opened panel shows all 3 column toggles', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('column-toggle-name')).toBeInTheDocument();
        expect(screen.getByTestId('column-toggle-date')).toBeInTheDocument();
        expect(screen.getByTestId('column-toggle-amount')).toBeInTheDocument();
      });
    });
  });

  describe('checkbox state', () => {
    it('checkbox is checked when key is in visibleKeys', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name', 'date'])}
          onChange={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-name'));
      const nameToggle = screen.getByTestId('column-toggle-name');
      const dateToggle = screen.getByTestId('column-toggle-date');
      const amountToggle = screen.getByTestId('column-toggle-amount');
      expect(nameToggle.querySelector('[role="checkbox"]')).toHaveAttribute(
        'data-state',
        'checked',
      );
      expect(dateToggle.querySelector('[role="checkbox"]')).toHaveAttribute(
        'data-state',
        'checked',
      );
      expect(amountToggle.querySelector('[role="checkbox"]')).toHaveAttribute(
        'data-state',
        'unchecked',
      );
    });
  });

  describe('toggle behavior', () => {
    it('clicking an unchecked column adds it to the next set', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={onChange} />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-amount'));
      // Click amount → should be added
      await user.click(screen.getByTestId('column-toggle-amount'));
      expect(onChange).toHaveBeenCalled();
      const next = onChange.mock.calls[0]![0] as Set<string>;
      expect(next.has('amount')).toBe(true);
      expect(next.has('name')).toBe(true);
    });

    it('clicking a checked column removes it from the next set', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name', 'date'])}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-date'));
      // Click date → should be removed
      await user.click(screen.getByTestId('column-toggle-date'));
      const next = onChange.mock.calls[0]![0] as Set<string>;
      expect(next.has('date')).toBe(false);
      expect(next.has('name')).toBe(true);
    });
  });

  describe('alwaysVisible lock', () => {
    it('alwaysVisible checkbox is rendered as disabled', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-name'));
      const nameToggle = screen.getByTestId('column-toggle-name');
      const cb = nameToggle.querySelector('[role="checkbox"]');
      expect(cb).toBeDisabled();
    });

    it('clicking an alwaysVisible row does NOT call onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name', 'date'])}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-name'));
      // Try to click name (alwaysVisible)
      await user.click(screen.getByTestId('column-toggle-name'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('alwaysVisible row uses cursor-not-allowed + opacity-60', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-toggle-name'));
      const nameRow = screen.getByTestId('column-toggle-name');
      expect(nameRow.className).toContain('cursor-not-allowed');
      expect(nameRow.className).toContain('opacity-60');
    });
  });

  describe('Reset button', () => {
    it('does NOT render Reset when onReset is omitted', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer columns={COLS} visibleKeys={new Set(['name'])} onChange={vi.fn()} />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-customizer-panel'));
      expect(screen.queryByTestId('column-reset')).toBeNull();
    });

    it('renders Reset when onReset is provided', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name'])}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-reset'));
      expect(screen.getByTestId('column-reset')).toHaveTextContent('Reset');
    });

    it('clicking Reset calls onReset', async () => {
      const onReset = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name'])}
          onChange={vi.fn()}
          onReset={onReset}
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-reset'));
      await user.click(screen.getByTestId('column-reset'));
      expect(onReset).toHaveBeenCalled();
    });

    it('honors custom resetLabel', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColumnCustomizer
          columns={COLS}
          visibleKeys={new Set(['name'])}
          onChange={vi.fn()}
          onReset={vi.fn()}
          resetLabel="Standartni qayta tiklash"
        />,
      );
      await user.click(screen.getByTestId('column-customizer-trigger'));
      await waitFor(() => screen.getByTestId('column-reset'));
      expect(screen.getByTestId('column-reset')).toHaveTextContent('Standartni qayta tiklash');
    });
  });
});
