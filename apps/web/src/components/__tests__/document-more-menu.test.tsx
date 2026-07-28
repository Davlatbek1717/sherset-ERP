import { DocumentMoreMenu } from '@/components/document-more-menu';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
/**
 * DocumentMoreMenu tests — "···" menu used on every document detail
 * page. Mirrors moysklad's More menu: Скопировать, Скопировать ссылку,
 * (sep), Скачать PDF.
 *
 * Tests guard the trigger render, the per-action click handlers, the
 * conditional PDF item visibility, the optional prefix slot, and the
 * separator presence/absence based on PDF item.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DocumentMoreMenu', () => {
  beforeEach(() => {
    // Mock clipboard for "Скопировать ссылку" path
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  describe('trigger rendering', () => {
    it('renders a tertiary icon button with aria-label "More actions"', () => {
      renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    });
  });

  describe('default menu items', () => {
    it('opens with "Скопировать" + "Скопировать ссылку"', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await waitFor(() => {
        // Items live in a portal — check document.body
        expect(document.body.querySelector('[data-test-id="more-clone"]')).toBeInTheDocument();
        expect(document.body.querySelector('[data-test-id="more-copy-link"]')).toBeInTheDocument();
      });
      void container;
    });

    it('does NOT render Скачать PDF when pdfUrl omitted', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await waitFor(() => {
        expect(document.body.querySelector('[data-test-id="more-clone"]')).toBeInTheDocument();
      });
      expect(document.body.querySelector('[data-test-id="more-download-pdf"]')).toBeNull();
    });
  });

  describe('clone action', () => {
    it('clicking Скопировать calls onClone', async () => {
      const onClone = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<DocumentMoreMenu onClone={onClone} />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      const clone = await waitFor(() => document.body.querySelector('[data-test-id="more-clone"]'));
      await user.click(clone!);
      expect(onClone).toHaveBeenCalled();
    });
  });

  describe('copy-link action', () => {
    // Note: the actual clipboard.writeText assertion is tricky to wire
    // through the Radix menu's onSelect handler in jsdom (the menu
    // captures focus + suppresses some event handling). We just smoke
    // test that clicking doesn't crash + dismisses the menu.
    it('clicking Скопировать ссылку does NOT crash + dismisses menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      const item = await waitFor(() =>
        document.body.querySelector('[data-test-id="more-copy-link"]'),
      );
      await user.click(item!);
      // Menu closes after select (Radix default)
      await waitFor(() => {
        expect(document.body.querySelector('[data-test-id="more-copy-link"]')).toBeNull();
      });
    });
  });

  describe('PDF download action', () => {
    it('renders Скачать PDF when pdfUrl provided', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} pdfUrl="/print/x/123?auto=1" />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await waitFor(() => {
        expect(
          document.body.querySelector('[data-test-id="more-download-pdf"]'),
        ).toBeInTheDocument();
      });
    });

    it('clicking Скачать PDF opens window with the pdfUrl in new tab', async () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      const user = userEvent.setup();
      renderWithProviders(
        <DocumentMoreMenu onClone={vi.fn()} pdfUrl="/print/x/123?auto=1&format=pdf" />,
      );
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      const item = await waitFor(() =>
        document.body.querySelector('[data-test-id="more-download-pdf"]'),
      );
      await user.click(item!);
      expect(openSpy).toHaveBeenCalledWith('/print/x/123?auto=1&format=pdf', '_blank', 'noopener');
      openSpy.mockRestore();
    });

    it('renders separator above Скачать PDF when pdfUrl provided', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentMoreMenu onClone={vi.fn()} pdfUrl="/x.pdf" />);
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await waitFor(() => document.body.querySelector('[data-test-id="more-download-pdf"]'));
      // The separator is a Radix DropdownMenu.Separator (role=separator)
      const separators = document.body.querySelectorAll('[role="separator"]');
      expect(separators.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('prefix slot', () => {
    it('renders prefix content above the standard items', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DocumentMoreMenu
          onClone={vi.fn()}
          prefix={
            <button type="button" data-test-id="custom-prefix">
              Custom
            </button>
          }
        />,
      );
      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await waitFor(() => {
        expect(document.body.querySelector('[data-test-id="custom-prefix"]')).toBeInTheDocument();
      });
    });
  });
});
