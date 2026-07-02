import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { BulkActionBar } from '@moysklad/ui';
/**
 * BulkActionBar (from @moysklad/ui) tests — inline action bar
 * shown above the DataTable when rows are selected. Used by every
 * list page (~14 list pages) via useBulkDocumentActions.
 *
 * Tests guard the contract: bar hidden when 0 selected, count
 * label rendered, action buttons + clear button rendered with
 * proper variant + onClick wiring.
 */
import { describe, expect, it, vi } from 'vitest';

describe('BulkActionBar', () => {
  describe('visibility', () => {
    it('returns null (renders nothing) when selectedIds is empty', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set()}
          onClear={vi.fn()}
          actions={[]}
          countLabel={(n) => `${n} ta`}
        />,
      );
      // The bar's own testId is absent (the rest of the tree is just
      // the test-providers' toast viewport, etc).
      expect(screen.queryByTestId('bulk-action-bar')).toBeNull();
    });

    it('renders the bar when at least 1 row is selected', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={(n) => `${n} ta`}
        />,
      );
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    });
  });

  describe('count label', () => {
    it('renders the count label using the supplied template', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1', 'id-2', 'id-3'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={(n) => `${n} ta tanlandi`}
        />,
      );
      expect(screen.getByTestId('bulk-count').textContent).toBe('3 ta tanlandi');
    });
  });

  describe('action buttons', () => {
    it('renders one button per action', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[
            { key: 'archive', label: 'Archive', onClick: vi.fn() },
            { key: 'delete', label: 'Delete', destructive: true, onClick: vi.fn() },
          ]}
          countLabel={() => '1'}
        />,
      );
      expect(screen.getByTestId('bulk-action-archive')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-action-delete')).toBeInTheDocument();
    });

    it('uses custom testId when provided', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[{ key: 'k', label: 'L', onClick: vi.fn(), testId: 'my-custom-id' }]}
          countLabel={() => '1'}
        />,
      );
      expect(screen.getByTestId('my-custom-id')).toBeInTheDocument();
    });

    it('action onClick fires with the selected ids array', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1', 'id-2'])}
          onClear={vi.fn()}
          actions={[{ key: 'archive', label: 'Archive', onClick }]}
          countLabel={() => '2'}
        />,
      );
      await user.click(screen.getByTestId('bulk-action-archive'));
      expect(onClick).toHaveBeenCalledTimes(1);
      const args = onClick.mock.calls[0]?.[0];
      expect(Array.isArray(args)).toBe(true);
      expect((args as string[]).sort()).toEqual(['id-1', 'id-2']);
    });

    it('disabled action does not fire onClick', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[{ key: 'k', label: 'L', onClick, disabled: true }]}
          countLabel={() => '1'}
        />,
      );
      await user.click(screen.getByTestId('bulk-action-k'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('destructive action gets destructive Button variant (red)', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[{ key: 'delete', label: 'Delete', destructive: true, onClick: vi.fn() }]}
          countLabel={() => '1'}
        />,
      );
      const btn = screen.getByTestId('bulk-action-delete');
      expect(btn.className).toContain('ms-action-destructive');
    });

    it('non-destructive action gets secondary variant (border + surface bg)', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[{ key: 'archive', label: 'Archive', onClick: vi.fn() }]}
          countLabel={() => '1'}
        />,
      );
      const btn = screen.getByTestId('bulk-action-archive');
      expect(btn.className).toContain('ms-bg-surface');
    });

    it('renders icon when provided', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[
            {
              key: 'k',
              label: 'L',
              icon: <span data-test-id="my-icon">📦</span>,
              onClick: vi.fn(),
            },
          ]}
          countLabel={() => '1'}
        />,
      );
      expect(screen.getByTestId('my-icon')).toBeInTheDocument();
    });
  });

  describe('clear button', () => {
    it('renders a clear button on the right', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={() => '1'}
          clearLabel="Tozalash"
        />,
      );
      const clear = screen.getByTestId('bulk-clear');
      expect(clear).toBeInTheDocument();
      expect(clear.textContent).toContain('Tozalash');
    });

    it('uses default "Bekor qilish" label when clearLabel is omitted', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={() => '1'}
        />,
      );
      expect(screen.getByTestId('bulk-clear').textContent).toContain('Bekor qilish');
    });

    it('clear button fires onClear callback', async () => {
      const onClear = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={onClear}
          actions={[]}
          countLabel={() => '1'}
        />,
      );
      await user.click(screen.getByTestId('bulk-clear'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('layout + className merge', () => {
    it('applies brand-tinted bg + rounded + border baseline', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={() => '1'}
        />,
      );
      const bar = screen.getByTestId('bulk-action-bar');
      expect(bar.className).toContain('rounded');
      expect(bar.className).toContain('border');
      expect(bar.className).toContain('px-3');
      expect(bar.className).toContain('py-2');
    });

    it('merges user className', () => {
      renderWithProviders(
        <BulkActionBar
          selectedIds={new Set(['id-1'])}
          onClear={vi.fn()}
          actions={[]}
          countLabel={() => '1'}
          className="my-bar-extra"
        />,
      );
      expect(screen.getByTestId('bulk-action-bar').className).toContain('my-bar-extra');
    });
  });
});
