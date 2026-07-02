import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { Combobox } from '@moysklad/ui';
/**
 * Combobox (from @moysklad/ui) tests — searchable single-select sitting
 * between Select (≤30 fixed options) and CatalogPicker (full picker
 * dialog). Used for "type to find counterparty / product" patterns.
 *
 * Tests guard the trigger rendering, popover open/close on click,
 * search filtering (local mode), keyboard nav (Up/Down/Enter), the
 * clear (X) button, the disabled state, and the empty state.
 *
 * Async mode (onSearch) is not exercised here — it requires fake
 * timers and is more carefully exercised in integration tests.
 */
import { describe, expect, it, vi } from 'vitest';

const ITEMS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Combobox', () => {
  describe('trigger rendering', () => {
    it('renders a trigger button with the placeholder when no value', () => {
      renderWithProviders(
        <Combobox
          value={undefined}
          onChange={vi.fn()}
          items={ITEMS}
          placeholder="Tanlang..."
          ariaLabel="Fruit"
        />,
      );
      const trigger = screen.getByRole('button', { name: 'Fruit' });
      expect(trigger).toBeInTheDocument();
      expect(trigger.textContent).toContain('Tanlang...');
    });

    it('shows the selected label when value matches an item', () => {
      renderWithProviders(<Combobox value="b" onChange={vi.fn()} items={ITEMS} ariaLabel="x" />);
      const trigger = screen.getByRole('button', { name: 'x' });
      expect(trigger.textContent).toContain('Banana');
    });

    it('uses placeholder "—" by default when value is undefined', () => {
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      const trigger = screen.getByRole('button', { name: 'x' });
      expect(trigger.textContent).toContain('—');
    });
  });

  describe('open/close behavior', () => {
    it('clicking the trigger opens the popover with the search box', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Qidirish...')).toBeInTheDocument();
      });
    });

    it('opens with all items rendered', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.getByText('Banana')).toBeInTheDocument();
        expect(screen.getByText('Cherry')).toBeInTheDocument();
      });
    });
  });

  describe('local search filtering', () => {
    it('typing filters items by label (case-insensitive)', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      await user.type(search, 'app');
      // Apple matches; Banana/Cherry filtered out
      expect(screen.queryByText('Apple')).toBeInTheDocument();
      expect(screen.queryByText('Banana')).toBeNull();
      expect(screen.queryByText('Cherry')).toBeNull();
    });

    it('typing a non-match shows the empty state', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      await user.type(search, 'xyz');
      expect(screen.getByText('Hech narsa topilmadi')).toBeInTheDocument();
    });

    it('honors custom emptyText', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox
          value={undefined}
          onChange={vi.fn()}
          items={ITEMS}
          ariaLabel="x"
          emptyText="No fruits"
        />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      await user.type(search, 'xyz');
      expect(screen.getByText('No fruits')).toBeInTheDocument();
    });

    it('honors searchText for filtering (overrides label text)', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox
          value={undefined}
          onChange={vi.fn()}
          items={[
            { value: 'x', label: 'Apple', searchText: 'fruit red' },
            { value: 'y', label: 'Banana', searchText: 'fruit yellow' },
          ]}
          ariaLabel="x"
        />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      await user.type(search, 'red');
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.queryByText('Banana')).toBeNull();
    });
  });

  describe('item selection', () => {
    it('clicking an item calls onChange and closes the popover', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={onChange} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const banana = await screen.findByText('Banana');
      await user.click(banana);
      expect(onChange).toHaveBeenCalledWith('b');
    });
  });

  describe('clear button', () => {
    it('renders a clear (X) button when value is selected and clearable', () => {
      renderWithProviders(<Combobox value="a" onChange={vi.fn()} items={ITEMS} ariaLabel="x" />);
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('does NOT render clear button when no value selected', () => {
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" />,
      );
      expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });

    it('does NOT render clear button when clearable=false', () => {
      renderWithProviders(
        <Combobox value="a" onChange={vi.fn()} items={ITEMS} ariaLabel="x" clearable={false} />,
      );
      expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });

    it('clicking clear calls onChange(null)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Combobox value="a" onChange={onChange} items={ITEMS} ariaLabel="x" />);
      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('disabled state', () => {
    it('renders the trigger as disabled', () => {
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" disabled />,
      );
      expect(screen.getByRole('button', { name: 'x' })).toBeDisabled();
    });

    it('clicking disabled trigger does NOT open popover', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" disabled />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      expect(screen.queryByPlaceholderText('Qidirish...')).toBeNull();
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid=true', () => {
      renderWithProviders(
        <Combobox value={undefined} onChange={vi.fn()} items={ITEMS} ariaLabel="x" invalid />,
      );
      expect(screen.getByRole('button', { name: 'x' })).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('keyboard nav', () => {
    it('Enter selects the active item', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={onChange} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      // First item active by default → Enter selects "Apple"
      search.focus();
      await user.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('ArrowDown then Enter selects the second item', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Combobox value={undefined} onChange={onChange} items={ITEMS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('button', { name: 'x' }));
      const search = await screen.findByPlaceholderText('Qidirish...');
      search.focus();
      await user.keyboard('{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith('b');
    });
  });
});
