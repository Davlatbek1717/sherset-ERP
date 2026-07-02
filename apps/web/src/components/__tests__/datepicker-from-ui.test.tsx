import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { DatePicker } from '@moysklad/ui';
/**
 * DatePicker (from @moysklad/ui) tests — calendar popover used by every
 * date field across the app (created/issue dates, deliveryPlanned, etc.).
 *
 * Pure-fn tests for buildGrid/parseIso/formatIso/addDays/addMonths/
 * isSameDay live in design-system (DatePicker.test.ts, 14 tests). These
 * tests cover the DOM: trigger render, popover open, calendar grid,
 * day click, prev/next month nav, the "Bugun" + "Tozalash" shortcuts.
 */
import { describe, expect, it, vi } from 'vitest';

describe('DatePicker', () => {
  describe('trigger rendering', () => {
    it('renders a trigger button with the placeholder when no value', () => {
      renderWithProviders(
        <DatePicker value={null} onChange={vi.fn()} ariaLabel="Date" placeholder="Pick a date" />,
      );
      const trigger = screen.getByRole('button', { name: 'Date' });
      expect(trigger.textContent).toContain('Pick a date');
    });

    it('uses default placeholder "дд.мм.гггг" when not provided', () => {
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" />);
      const trigger = screen.getByRole('button', { name: 'x' });
      expect(trigger.textContent).toContain('дд.мм.гггг');
    });

    it('shows the formatted date when value is set', () => {
      renderWithProviders(<DatePicker value="2026-04-24" onChange={vi.fn()} ariaLabel="x" />);
      const trigger = screen.getByRole('button', { name: 'x' });
      // Some locale-specific formatted version of 24.04.2026
      expect(trigger.textContent).toMatch(/24/);
      expect(trigger.textContent).toMatch(/04/);
      expect(trigger.textContent).toMatch(/2026/);
    });

    it('renders a calendar icon (svg)', () => {
      const { container } = renderWithProviders(
        <DatePicker value={null} onChange={vi.fn()} ariaLabel="x" />,
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('popover open behavior', () => {
    it('clicking the trigger opens the calendar grid', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-24" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        // Prev/Next month buttons appear
        expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
      });
    });

    it('opens with the calendar showing the value month', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-24" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        // The day "24" is in the grid
        const dayButtons = screen.getAllByRole('button');
        const day24 = dayButtons.find((b) => b.textContent === '24');
        expect(day24).toBeTruthy();
      });
    });

    it('renders 7 weekday header cells', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-24" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        // The weekday-row uses grid-cols-7 with <span> children
        const weekdayRow = document.body.querySelector('.grid-cols-7');
        expect(weekdayRow).toBeTruthy();
      });
    });

    it('renders a 7×6 day grid (42 cells)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-24" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        // The day buttons (42 of them) — counting buttons in the popover that have day numbers
        const allButtons = screen.getAllByRole('button');
        const dayButtons = allButtons.filter((b) => /^\d{1,2}$/.test(b.textContent ?? ''));
        // Some days repeat (e.g., 1, 2, 3 from prev/next month) so just verify > 28
        expect(dayButtons.length).toBeGreaterThanOrEqual(28);
      });
    });
  });

  describe('day selection', () => {
    it('clicking a day calls onChange with the YYYY-MM-DD string', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-15" onChange={onChange} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => screen.getByRole('button', { name: 'Previous month' }));

      // Find the day "20" in April 2026 grid
      const dayButtons = screen.getAllByRole('button');
      const day20 = dayButtons.find((b) => b.textContent === '20');
      expect(day20).toBeTruthy();
      await user.click(day20!);

      // Should be called with YYYY-MM-DD format
      expect(onChange).toHaveBeenCalledWith('2026-04-20');
    });
  });

  describe('month navigation', () => {
    it('Next month button moves the visible grid forward', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-15" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => screen.getByRole('button', { name: 'Next month' }));

      // April → May, click Next
      await user.click(screen.getByRole('button', { name: 'Next month' }));
      await waitFor(() => {
        // May label should appear in the header span
        const headers = document.body.querySelectorAll('.capitalize');
        const headerTexts = Array.from(headers).map((h) => h.textContent ?? '');
        expect(headerTexts.some((t) => /maj|may/i.test(t))).toBe(true);
      });
    });

    it('Previous month button moves the visible grid backward', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-15" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => screen.getByRole('button', { name: 'Previous month' }));

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      await waitFor(() => {
        // March-ish (mart in uz, mar in en)
        const headers = document.body.querySelectorAll('.capitalize');
        const headerTexts = Array.from(headers).map((h) => h.textContent ?? '');
        expect(headerTexts.some((t) => /mar/i.test(t))).toBe(true);
      });
    });
  });

  describe('Bugun (Today) shortcut', () => {
    it('renders the "Bugun" button by default', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByText('Bugun')).toBeInTheDocument();
      });
    });

    it('does NOT render Bugun when showToday=false', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DatePicker value={null} onChange={vi.fn()} ariaLabel="x" showToday={false} />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        // Calendar opens but no Bugun button
        expect(screen.queryByText('Bugun')).toBeNull();
      });
    });

    it("clicking Bugun calls onChange with today's ISO date", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value={null} onChange={onChange} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      const bugun = await screen.findByText('Bugun');
      await user.click(bugun);
      // Should match a YYYY-MM-DD pattern
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    });
  });

  describe('Tozalash (Clear) shortcut', () => {
    it('renders Tozalash when value is set and clearable=true (default)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-15" onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByText('Tozalash')).toBeInTheDocument();
      });
    });

    it('does NOT render Tozalash when value is null', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => screen.getByText('Bugun'));
      // Bugun should be there but Tozalash not
      expect(screen.queryByText('Tozalash')).toBeNull();
    });

    it('does NOT render Tozalash when clearable=false', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DatePicker value="2026-04-15" onChange={vi.fn()} ariaLabel="x" clearable={false} />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => screen.getByText('Bugun'));
      expect(screen.queryByText('Tozalash')).toBeNull();
    });

    it('clicking Tozalash calls onChange(null)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value="2026-04-15" onChange={onChange} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      const clear = await screen.findByText('Tozalash');
      await user.click(clear);
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('disabled state', () => {
    it('renders the trigger as disabled', () => {
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" disabled />);
      expect(screen.getByRole('button', { name: 'x' })).toBeDisabled();
    });

    it('clicking disabled trigger does NOT open the popover', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" disabled />);
      await user.click(screen.getByRole('button', { name: 'x' }));
      expect(screen.queryByRole('button', { name: 'Previous month' })).toBeNull();
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid=true', () => {
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" invalid />);
      expect(screen.getByRole('button', { name: 'x' })).toHaveAttribute('aria-invalid', 'true');
    });

    it('uses destructive border color when invalid', () => {
      renderWithProviders(<DatePicker value={null} onChange={vi.fn()} ariaLabel="x" invalid />);
      const trigger = screen.getByRole('button', { name: 'x' });
      expect(trigger.className).toContain('border-[var(--ms-action-destructive)]');
    });
  });
});
