import { renderWithProviders, screen } from '@/test-utils';
import { Badge } from '@moysklad/ui';
/**
 * Badge (re-exported from @moysklad/ui) tests — guard the tone matrix
 * used for every state pill across the app: customer-order states
 * (draft/confirmed/paid/cancelled), payment statuses (To'lanmagan,
 * Bekor qilindi), document-state pills, archived flags, etc.
 *
 * Hosted in apps/web because design-system has no DOM env wired up
 * for primitive tests. Import goes through @moysklad/ui boundary.
 */
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  describe('tones', () => {
    it('uses neutral classes by default (when tone is omitted)', () => {
      renderWithProviders(<Badge data-test-id="b">Default</Badge>);
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-bg-muted');
      expect(el.className).toContain('ms-text-secondary');
    });

    it('uses brand classes when tone="brand"', () => {
      renderWithProviders(
        <Badge tone="brand" data-test-id="b">
          Tasdiqlangan
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-brand-50');
      expect(el.className).toContain('ms-text-brand');
    });

    it('uses success classes when tone="success"', () => {
      renderWithProviders(
        <Badge tone="success" data-test-id="b">
          Provedeno
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-success-50');
      expect(el.className).toContain('ms-text-success');
    });

    it('uses warning classes when tone="warning"', () => {
      renderWithProviders(
        <Badge tone="warning" data-test-id="b">
          To'lanmagan
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-warning-50');
      expect(el.className).toContain('ms-text-warning');
    });

    it('uses destructive classes when tone="destructive"', () => {
      renderWithProviders(
        <Badge tone="destructive" data-test-id="b">
          Bekor qilindi
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-destructive-50');
      expect(el.className).toContain('ms-text-destructive');
    });

    it('uses info classes when tone="info"', () => {
      renderWithProviders(
        <Badge tone="info" data-test-id="b">
          Yangi
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('ms-info-50');
      expect(el.className).toContain('ms-info-700');
    });
  });

  describe('layout + typography baseline (moysklad-parity sizing)', () => {
    it('always applies inline-flex + items-center + small padding + rounded-sm', () => {
      renderWithProviders(<Badge data-test-id="b">Pill</Badge>);
      const el = screen.getByTestId('b');
      expect(el.className).toContain('inline-flex');
      expect(el.className).toContain('items-center');
      expect(el.className).toContain('px-2');
      expect(el.className).toContain('py-0.5');
      expect(el.className).toContain('text-xs');
      expect(el.className).toContain('font-medium');
      expect(el.className).toContain('leading-tight');
    });

    it('renders as a <span> (so it can sit inline next to text)', () => {
      renderWithProviders(<Badge data-test-id="b">×</Badge>);
      expect(screen.getByTestId('b').tagName).toBe('SPAN');
    });
  });

  describe('content', () => {
    it('renders text children', () => {
      renderWithProviders(<Badge>Hello</Badge>);
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('renders nested element children (e.g. icon + text)', () => {
      renderWithProviders(
        <Badge>
          <svg data-test-id="icon" aria-hidden /> Tasdiqlangan
        </Badge>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText(/Tasdiqlangan/)).toBeInTheDocument();
    });
  });

  describe('className merge', () => {
    it('merges user className with the tone classes', () => {
      renderWithProviders(
        <Badge tone="success" className="custom-extra" data-test-id="b">
          OK
        </Badge>,
      );
      const el = screen.getByTestId('b');
      expect(el.className).toContain('custom-extra');
      expect(el.className).toContain('ms-success-50');
    });
  });

  describe('forwarded ref + spread', () => {
    it('forwards ref to the underlying span', () => {
      let captured: HTMLSpanElement | null = null;
      renderWithProviders(
        <Badge
          ref={(el) => {
            captured = el;
          }}
          data-test-id="b"
        >
          Ref
        </Badge>,
      );
      expect(captured).toBeInstanceOf(HTMLSpanElement);
    });

    it('forwards arbitrary HTMLSpanElement props (data-test-id, aria-*, role)', () => {
      renderWithProviders(
        // biome-ignore lint/a11y/useSemanticElements: this test intentionally passes role="status" to verify Badge forwards arbitrary props.
        <Badge data-test-id="state-confirmed" aria-label="Confirmed state" role="status">
          C
        </Badge>,
      );
      const el = screen.getByTestId('state-confirmed');
      expect(el).toHaveAttribute('aria-label', 'Confirmed state');
      expect(el).toHaveAttribute('role', 'status');
    });
  });
});
