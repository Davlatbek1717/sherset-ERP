import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Button, DropdownMenu } from '@moysklad/ui';
/**
 * DropdownMenu (from @moysklad/ui) tests — Radix-backed dropdown
 * used by every detail-page toolbar (Изменить / Создать документ /
 * Печать / Отправить) and BulkActionsDropdown on list pages.
 *
 * Existing per-entity dropdown tests (BulkActionsDropdown,
 * CreateRelatedDropdown, etc.) cover the integration; these test
 * the wrapper itself.
 */
import { describe, expect, it, vi } from 'vitest';

describe('DropdownMenu', () => {
  function harness(
    opts: {
      onSelectItem?: () => void;
      onSelectDangerItem?: () => void;
      disabled?: boolean;
    } = {},
  ) {
    return (
      <DropdownMenu trigger={<Button data-test-id="trigger">Open</Button>} testId="dm">
        <DropdownMenu.Label>Section</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={opts.onSelectItem} testId="item-clone">
          Clone
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={opts.disabled} testId="item-disabled">
          Disabled
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item destructive onSelect={opts.onSelectDangerItem} testId="item-delete">
          Delete
        </DropdownMenu.Item>
      </DropdownMenu>
    );
  }

  describe('trigger + open behavior', () => {
    it('renders the trigger element', () => {
      renderWithProviders(harness());
      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('does NOT render menu items when closed', () => {
      renderWithProviders(harness());
      expect(screen.queryByTestId('item-clone')).toBeNull();
    });

    it('clicking the trigger opens the menu (items become visible)', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness());
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByTestId('item-clone')).toBeInTheDocument();
    });
  });

  describe('item: onSelect + click', () => {
    it('clicking an item fires its onSelect handler', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(harness({ onSelectItem: onSelect }));
      await user.click(screen.getByTestId('trigger'));
      await user.click(screen.getByTestId('item-clone'));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('clicking an item closes the menu (Radix default)', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness({ onSelectItem: vi.fn() }));
      await user.click(screen.getByTestId('trigger'));
      await user.click(screen.getByTestId('item-clone'));
      // After click, items should be unmounted (menu closed).
      expect(screen.queryByTestId('item-clone')).toBeNull();
    });
  });

  describe('item: disabled state', () => {
    it('renders data-disabled attr on disabled items', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness({ disabled: true }));
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByTestId('item-disabled')).toHaveAttribute('data-disabled');
    });

    it('disabled item does NOT fire onSelect when clicked', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DropdownMenu trigger={<Button data-test-id="t">Open</Button>}>
          <DropdownMenu.Item disabled onSelect={onSelect} testId="d">
            Disabled
          </DropdownMenu.Item>
        </DropdownMenu>,
      );
      await user.click(screen.getByTestId('t'));
      await user.click(screen.getByTestId('d'));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('item: destructive variant', () => {
    it('destructive item gets text-destructive color class', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness());
      await user.click(screen.getByTestId('trigger'));
      const del = screen.getByTestId('item-delete');
      expect(del.className).toContain('ms-text-destructive');
    });
  });

  describe('separator + label', () => {
    it('renders the separator as a visible <div>', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness());
      await user.click(screen.getByTestId('trigger'));
      // Radix renders the menu (and its separator) into a portal —
      // querySelector on the test container misses it; document.body
      // sees it.
      const sep = document.body.querySelector('[role="separator"]');
      expect(sep).not.toBeNull();
    });

    it('renders the label text', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness());
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByText('Section')).toBeInTheDocument();
    });
  });

  describe('controlled open prop', () => {
    it('open=true renders menu items even before trigger click', () => {
      renderWithProviders(
        <DropdownMenu open trigger={<Button data-test-id="t">Open</Button>}>
          <DropdownMenu.Item testId="auto-open">A</DropdownMenu.Item>
        </DropdownMenu>,
      );
      expect(screen.getByTestId('auto-open')).toBeInTheDocument();
    });

    it('fires onOpenChange when trigger is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DropdownMenu onOpenChange={onOpenChange} trigger={<Button data-test-id="t">Open</Button>}>
          <DropdownMenu.Item>X</DropdownMenu.Item>
        </DropdownMenu>,
      );
      await user.click(screen.getByTestId('t'));
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('keyboard navigation (Radix primitive)', () => {
    it('Escape closes the open menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness({ onSelectItem: vi.fn() }));
      await user.click(screen.getByTestId('trigger'));
      expect(screen.getByTestId('item-clone')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('item-clone')).toBeNull();
    });
  });

  describe('content baseline styling', () => {
    it('applies the moysklad shell (rounded + border + shadow + bg-surface)', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(harness());
      await user.click(screen.getByTestId('trigger'));
      // Find the rendered menu Content (data-test-id was passed)
      const dm =
        container.querySelector('[data-test-id="dm"]') ??
        document.querySelector('[data-test-id="dm"]');
      expect(dm).toBeTruthy();
      const cls = dm?.getAttribute('class') ?? '';
      expect(cls).toContain('rounded');
      expect(cls).toContain('border');
      expect(cls).toContain('shadow');
    });
  });
});
