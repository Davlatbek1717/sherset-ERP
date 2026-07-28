import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { PeriodPicker } from '@moysklad/ui';
/**
 * PeriodPicker (from @moysklad/ui) tests — moysklad-style date-range
 * picker with shortcut row (вч · сег · нед · мес) + two always-visible
 * date inputs. Used by every list page's inline filter (9+ list pages).
 *
 * The shortcut math is timezone-relative (uses today). Tests assert
 * the SHAPE of the onChange call (from/to are present + form valid
 * ISO YYYY-MM-DD) rather than literal day values, so they pass in
 * any timezone.
 */
import { describe, expect, it, vi } from 'vitest';

const ISO_RX = /^\d{4}-\d{2}-\d{2}$/;

describe('PeriodPicker', () => {
  describe('shortcut row', () => {
    it('renders all 4 shortcut buttons (вч · сег · нед · мес)', () => {
      renderWithProviders(<PeriodPicker onChange={vi.fn()} />);
      expect(screen.getByTestId('period-yesterday')).toBeInTheDocument();
      expect(screen.getByTestId('period-today')).toBeInTheDocument();
      expect(screen.getByTestId('period-week')).toBeInTheDocument();
      expect(screen.getByTestId('period-month')).toBeInTheDocument();
    });

    it('uses default labels (вч/сег/нед/мес) when no labels prop', () => {
      renderWithProviders(<PeriodPicker onChange={vi.fn()} />);
      expect(screen.getByTestId('period-yesterday').textContent).toBe('вч');
      expect(screen.getByTestId('period-today').textContent).toBe('сег');
      expect(screen.getByTestId('period-week').textContent).toBe('нед');
      expect(screen.getByTestId('period-month').textContent).toBe('мес');
    });

    it('honors custom labels (e.g. uz translations)', () => {
      renderWithProviders(
        <PeriodPicker
          onChange={vi.fn()}
          labels={{ yesterday: 'kech', today: 'bug', week: 'haf', month: 'oy' }}
        />,
      );
      expect(screen.getByTestId('period-yesterday').textContent).toBe('kech');
      expect(screen.getByTestId('period-today').textContent).toBe('bug');
      expect(screen.getByTestId('period-week').textContent).toBe('haf');
      expect(screen.getByTestId('period-month').textContent).toBe('oy');
    });
  });

  describe('shortcut: today', () => {
    it('clicking сег sets from=to=today (single-day range)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PeriodPicker onChange={onChange} />);
      await user.click(screen.getByTestId('period-today'));
      expect(onChange).toHaveBeenCalledTimes(1);
      const arg = onChange.mock.calls[0]?.[0] as { from?: string; to?: string };
      expect(arg.from).toMatch(ISO_RX);
      expect(arg.to).toMatch(ISO_RX);
      expect(arg.from).toBe(arg.to); // single-day range
    });
  });

  describe('shortcut: yesterday', () => {
    it('clicking вч sets from=to=yesterday (1 day before today)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PeriodPicker onChange={onChange} />);
      await user.click(screen.getByTestId('period-yesterday'));
      const arg = onChange.mock.calls[0]?.[0] as { from?: string; to?: string };
      expect(arg.from).toMatch(ISO_RX);
      expect(arg.from).toBe(arg.to);
    });
  });

  describe('shortcut: week', () => {
    it('clicking нед sets a 7-day range ending today (week-to-date)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PeriodPicker onChange={onChange} />);
      await user.click(screen.getByTestId('period-week'));
      const arg = onChange.mock.calls[0]?.[0] as { from: string; to: string };
      // from = today-6, to = today → span = 7 days
      const span =
        (new Date(`${arg.to}T00:00:00Z`).getTime() - new Date(`${arg.from}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24);
      expect(span).toBe(6); // 6 day-deltas between endpoints = 7-day window
    });
  });

  describe('shortcut: month', () => {
    it('clicking мес sets a 30-day range ending today (month-to-date)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<PeriodPicker onChange={onChange} />);
      await user.click(screen.getByTestId('period-month'));
      const arg = onChange.mock.calls[0]?.[0] as { from: string; to: string };
      const span =
        (new Date(`${arg.to}T00:00:00Z`).getTime() - new Date(`${arg.from}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24);
      expect(span).toBe(29); // 30-day window
    });
  });

  describe('date pickers', () => {
    // moysklad parity: the from/to fields are a CUSTOM DatePicker (dd.MM.yyyy
    // + calendar popover), NOT a native <input type="date"> (which would show
    // the browser-locale mm/dd/yyyy). Calendar-open + select + filter-fires is
    // browser-verified (scripts/cert-datepicker.cjs); here we lock the trigger
    // render + the dd.MM.yyyy display format.
    // DatePicker renders its testId as `data-testid` (Radix), but this repo's
    // testIdAttribute is `data-test-id`, so query the triggers by aria-label.
    it('renders two date-picker triggers (from / to)', () => {
      renderWithProviders(<PeriodPicker onChange={vi.fn()} />);
      expect(screen.getByLabelText('from')).toBeInTheDocument();
      expect(screen.getByLabelText('to')).toBeInTheDocument();
    });

    // MASTER-TODO #14 (2026-07-28): this rendered with from+to set and read the
    // `from`/`to` triggers directly. The component now COLLAPSES when both ends
    // are set — it shows one summary label plus ◀/▶ day-shift buttons — and the
    // two triggers only exist in the expanded (editing) state. So the guard was
    // querying elements the current UI intentionally hides, not catching a
    // formatting regression.
    //
    // Re-expressed: expand first, then keep the ORIGINAL assertion verbatim —
    // day-before-month with a non-digit separator, i.e. never the native
    // mm/dd/yyyy that this widget exists to avoid.
    it('reflects from/to props as dd.MM.yyyy in the triggers (after expanding)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PeriodPicker from="2026-04-01" to="2026-04-07" onChange={vi.fn()} />);
      await user.click(screen.getByTestId('period-collapsed-label'));
      expect(screen.getByLabelText('from').textContent).toMatch(/01\D+04\D+2026/);
      expect(screen.getByLabelText('to').textContent).toMatch(/07\D+04\D+2026/);
    });

    // The collapsed mode itself had ZERO coverage — locking it here so the
    // behaviour that displaced the assertion above cannot silently regress.
    it('collapses to one label with day-shift buttons when both ends are set', () => {
      renderWithProviders(<PeriodPicker from="2026-04-01" to="2026-04-07" onChange={vi.fn()} />);
      expect(screen.getByTestId('period-collapsed-label')).toBeInTheDocument();
      expect(screen.getByTestId('period-shift-prev')).toBeInTheDocument();
      expect(screen.getByTestId('period-shift-next')).toBeInTheDocument();
      // Collapsed → the editing triggers are not mounted.
      expect(screen.queryByLabelText('from')).toBeNull();
    });
  });

  describe('testId', () => {
    it('attaches data-test-id to the root element when testId is provided', () => {
      renderWithProviders(<PeriodPicker onChange={vi.fn()} testId="my-pp" />);
      expect(screen.getByTestId('my-pp')).toBeInTheDocument();
    });
  });
});
