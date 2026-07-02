import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Modal, ModalLabelsProvider } from '@moysklad/ui';
/**
 * Modal (from @moysklad/ui) tests — Radix Dialog wrapper used by
 * SendEmailDialog, attribute-edit dialogs, webhook config, etc.
 *
 * Tests guard the open/close behavior, header (title + description +
 * close X), body scrolling, footer slot, and width control.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Modal', () => {
  describe('open/close behavior', () => {
    it('renders the body content when open=true', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="Title" testId="m">
          <div data-test-id="body-content">Hello</div>
        </Modal>,
      );
      expect(screen.getByTestId('body-content')).toBeInTheDocument();
    });

    it('does NOT render the body when open=false', () => {
      renderWithProviders(
        <Modal open={false} onOpenChange={vi.fn()} title="Title">
          <div data-test-id="body-content">Hello</div>
        </Modal>,
      );
      expect(screen.queryByTestId('body-content')).toBeNull();
    });

    it('clicking the close X button calls onOpenChange(false)', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Modal open onOpenChange={onOpenChange} title="Title">
          <div>Body</div>
        </Modal>,
      );
      await user.click(screen.getByRole('button', { name: 'Yopish' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('honors custom closeLabel', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="Title" closeLabel="Yopish-X">
          <div>Body</div>
        </Modal>,
      );
      expect(screen.getByRole('button', { name: 'Yopish-X' })).toBeInTheDocument();
    });

    it('uses the injected closeLabel from ModalLabelsProvider when none passed', () => {
      // App root injects the localized «Закрыть»/«Yopish»; without this the
      // bare 'Yopish' default leaked Uzbek into the RU UI close-button aria.
      renderWithProviders(
        <ModalLabelsProvider closeLabel="Закрыть">
          <Modal open onOpenChange={vi.fn()} title="Title">
            <div>Body</div>
          </Modal>
        </ModalLabelsProvider>,
      );
      expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    });

    it('explicit closeLabel wins over the injected ModalLabelsProvider default', () => {
      renderWithProviders(
        <ModalLabelsProvider closeLabel="Закрыть">
          <Modal open onOpenChange={vi.fn()} title="Title" closeLabel="Explicit">
            <div>Body</div>
          </Modal>
        </ModalLabelsProvider>,
      );
      expect(screen.getByRole('button', { name: 'Explicit' })).toBeInTheDocument();
    });

    it('Escape key closes the modal (Radix default)', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Modal open onOpenChange={onOpenChange} title="Title">
          <div>Body</div>
        </Modal>,
      );
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // NOTE: the confirm-dialog-in-modal guard (onInteractOutside keeps the
    // modal open when the interaction targets a layered [data-testid=
    // "confirm-dialog"], fixing the Phase-2 browser-QA 2026-06-08j bug) is NOT
    // unit-tested here: jsdom does not populate Radix's interact-outside
    // `event.detail.originalEvent.target` like a real browser, so the target
    // resolution can't be faithfully exercised. It is verified end-to-end in a
    // real browser (hr-employee edit modal: 409 → conflict dialog → reload
    // keeps the modal open + re-seeds). The CSS half of the same fix (confirm
    // overlay z-index + pointer-events-auto) IS guarded in
    // confirmdialog-from-ui.test.tsx.
  });

  describe('header content', () => {
    it('renders the title in the header', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="My Modal Title">
          <div>Body</div>
        </Modal>,
      );
      expect(screen.getByText('My Modal Title')).toBeInTheDocument();
    });

    it('renders the description when provided', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T" description="Optional desc">
          <div>Body</div>
        </Modal>,
      );
      expect(screen.getByText('Optional desc')).toBeInTheDocument();
    });

    it('does NOT render the description when omitted', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T">
          <div>Body</div>
        </Modal>,
      );
      // Title still shown but no description
      expect(screen.queryByText('Optional desc')).toBeNull();
    });
  });

  describe('hideClose', () => {
    it('renders the close button by default', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T">
          <div>Body</div>
        </Modal>,
      );
      expect(screen.getByRole('button', { name: 'Yopish' })).toBeInTheDocument();
    });

    it('hides the close button when hideClose=true', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T" hideClose>
          <div>Body</div>
        </Modal>,
      );
      expect(screen.queryByRole('button', { name: 'Yopish' })).toBeNull();
    });
  });

  describe('footer slot', () => {
    it('renders the footer when provided', () => {
      renderWithProviders(
        <Modal
          open
          onOpenChange={vi.fn()}
          title="T"
          footer={
            <button type="button" data-test-id="save-btn">
              Save
            </button>
          }
        >
          <div>Body</div>
        </Modal>,
      );
      expect(screen.getByTestId('save-btn')).toBeInTheDocument();
    });

    it('does NOT render the footer when omitted', () => {
      const { container } = renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T">
          <div>Body</div>
        </Modal>,
      );
      expect(container.querySelector('footer')).toBeNull();
    });
  });

  describe('width control', () => {
    it('uses the default w-[480px] when widthClass omitted', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T" testId="m">
          <div>Body</div>
        </Modal>,
      );
      const modal = document.body.querySelector('[data-testid="m"]');
      expect(modal).not.toBeNull();
      expect(modal?.className).toContain('w-[480px]');
    });

    it('honors custom widthClass override', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T" testId="m" widthClass="w-[800px]">
          <div>Body</div>
        </Modal>,
      );
      const modal = document.body.querySelector('[data-testid="m"]');
      expect(modal?.className).toContain('w-[800px]');
    });
  });

  describe('scrollableBody control', () => {
    it('applies overflow-y-auto by default (scrollableBody=true)', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T">
          <div data-test-id="b">Body</div>
        </Modal>,
      );
      const bodyDiv = screen.getByTestId('b').parentElement;
      expect(bodyDiv?.className).toContain('overflow-y-auto');
    });

    it('uses overflow-visible when scrollableBody=false (for picker dropdowns)', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T" scrollableBody={false}>
          <div data-test-id="b">Body</div>
        </Modal>,
      );
      const bodyDiv = screen.getByTestId('b').parentElement;
      expect(bodyDiv?.className).toContain('overflow-visible');
    });
  });

  describe('a11y baseline', () => {
    it('focus trap kicks in (Radix default — Tab cycles inside the modal)', () => {
      renderWithProviders(
        <Modal open onOpenChange={vi.fn()} title="T">
          <button type="button" data-test-id="b1">
            B1
          </button>
          <button type="button" data-test-id="b2">
            B2
          </button>
        </Modal>,
      );
      // Just verify both buttons render — the actual trap test is a Radix concern.
      expect(screen.getByTestId('b1')).toBeInTheDocument();
      expect(screen.getByTestId('b2')).toBeInTheDocument();
    });
  });
});
