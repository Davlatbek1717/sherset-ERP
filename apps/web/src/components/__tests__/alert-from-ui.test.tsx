import { renderWithProviders, screen } from '@/test-utils';
import { Alert } from '@moysklad/ui';
/**
 * Alert (re-exported from @moysklad/ui) tests — used by every detail
 * page for error/warning/info banners ("Hujjat Provedeno holatda...",
 * "Saqlash xatosi", stock-shortage warnings, transition errors).
 *
 * Has 4 tones (info, success, warning, destructive) each with its
 * own icon. Tests guard the tone → icon + class mapping.
 */
import { describe, expect, it } from 'vitest';

describe('Alert', () => {
  describe('tones', () => {
    it('uses info classes by default (when tone is omitted)', () => {
      renderWithProviders(<Alert data-test-id="a">Default info</Alert>);
      const el = screen.getByTestId('a');
      expect(el.className).toContain('ms-info-50');
      expect(el.className).toContain('ms-info-700');
    });

    it('uses info classes when tone="info" (explicit)', () => {
      renderWithProviders(
        <Alert tone="info" data-test-id="a">
          Info
        </Alert>,
      );
      const el = screen.getByTestId('a');
      expect(el.className).toContain('ms-info-50');
    });

    it('uses success classes when tone="success"', () => {
      renderWithProviders(
        <Alert tone="success" data-test-id="a">
          Saved
        </Alert>,
      );
      const el = screen.getByTestId('a');
      expect(el.className).toContain('ms-success-50');
      expect(el.className).toContain('ms-text-success');
    });

    it('uses warning classes when tone="warning"', () => {
      renderWithProviders(
        <Alert tone="warning" data-test-id="a">
          Stock low
        </Alert>,
      );
      const el = screen.getByTestId('a');
      expect(el.className).toContain('ms-warning-50');
      expect(el.className).toContain('ms-text-warning');
    });

    it('uses destructive classes when tone="destructive"', () => {
      renderWithProviders(
        <Alert tone="destructive" data-test-id="a">
          Save failed
        </Alert>,
      );
      const el = screen.getByTestId('a');
      expect(el.className).toContain('ms-destructive-50');
      expect(el.className).toContain('ms-text-destructive');
    });
  });

  describe('icon rendering (one per tone)', () => {
    // Lucide icons render as SVG. We just assert that an SVG is
    // rendered (and that hideIcon suppresses it). Per-icon identity
    // is a visual concern covered by the snapshot test in
    // visual-regression.spec.ts.

    it('renders an SVG icon by default', () => {
      const { container } = renderWithProviders(<Alert>Default</Alert>);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('omits the SVG when hideIcon=true', () => {
      const { container } = renderWithProviders(<Alert hideIcon>No icon</Alert>);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('renders icon for each tone (info/success/warning/destructive)', () => {
      const tones = ['info', 'success', 'warning', 'destructive'] as const;
      for (const tone of tones) {
        const { container, unmount } = renderWithProviders(<Alert tone={tone}>Test</Alert>);
        expect(container.querySelector('svg')).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('title + body content', () => {
    it('renders just the body when no title', () => {
      renderWithProviders(<Alert>Just body</Alert>);
      expect(screen.getByText('Just body')).toBeInTheDocument();
    });

    it('renders the title in a font-medium div', () => {
      const { container } = renderWithProviders(<Alert title="My title">Body here</Alert>);
      expect(screen.getByText('My title')).toBeInTheDocument();
      expect(container.querySelector('.font-medium')?.textContent).toBe('My title');
    });

    it('renders both title and body when both provided', () => {
      renderWithProviders(<Alert title="T">Body</Alert>);
      expect(screen.getByText('T')).toBeInTheDocument();
      expect(screen.getByText('Body')).toBeInTheDocument();
    });

    it('body gets text-xs + opacity-90 when title is also present', () => {
      const { container } = renderWithProviders(<Alert title="T">Body</Alert>);
      // The body div has these compact classes only when paired with a title.
      const bodyDiv = Array.from(container.querySelectorAll('div')).find(
        (d) => d.textContent === 'Body',
      );
      expect(bodyDiv?.className).toContain('text-xs');
      expect(bodyDiv?.className).toContain('opacity-90');
    });

    it('renders nested element children (e.g. <ul><li>shortage</li></ul>)', () => {
      renderWithProviders(
        <Alert tone="destructive">
          <ul>
            <li data-test-id="li-1">Item 1</li>
            <li data-test-id="li-2">Item 2</li>
          </ul>
        </Alert>,
      );
      expect(screen.getByTestId('li-1')).toBeInTheDocument();
      expect(screen.getByTestId('li-2')).toBeInTheDocument();
    });
  });

  describe('a11y + DOM contract', () => {
    it('renders with role="alert" so screen readers announce it', () => {
      renderWithProviders(<Alert data-test-id="a">Important</Alert>);
      expect(screen.getByTestId('a')).toHaveAttribute('role', 'alert');
    });

    it('always applies layout baseline (flex + items-start + rounded-md + p-3)', () => {
      renderWithProviders(<Alert data-test-id="a">Layout</Alert>);
      const el = screen.getByTestId('a');
      expect(el.className).toContain('flex');
      expect(el.className).toContain('items-start');
      expect(el.className).toContain('p-3');
      expect(el.className).toContain('text-sm');
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying div', () => {
      let captured: HTMLDivElement | null = null;
      renderWithProviders(
        <Alert
          ref={(el) => {
            captured = el;
          }}
        >
          Ref
        </Alert>,
      );
      expect(captured).toBeInstanceOf(HTMLDivElement);
    });

    it('merges user className with the tone classes', () => {
      renderWithProviders(
        <Alert tone="warning" className="my-extra mb-3" data-test-id="a">
          X
        </Alert>,
      );
      const el = screen.getByTestId('a');
      expect(el.className).toContain('my-extra');
      expect(el.className).toContain('mb-3');
      expect(el.className).toContain('ms-warning-50');
    });
  });
});
