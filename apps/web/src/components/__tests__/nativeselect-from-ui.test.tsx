import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { NativeSelect } from '@moysklad/ui';
/**
 * NativeSelect (from @moysklad/ui) tests — used for fixed-list enum
 * pickers (reasons, types, statuses) where the OS-native dropdown
 * is the right UX. Wraps a styled <select> with a chevron icon.
 *
 * A regression in the wrapper styling silently flips the field to
 * the browser-default look (mismatched height, missing chevron, no
 * focus ring) — these tests guard the surface.
 */
import { describe, expect, it, vi } from 'vitest';

describe('NativeSelect', () => {
  describe('basic rendering', () => {
    it('renders a <select> element wrapped in a relative div', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option value="a">A</option>
        </NativeSelect>,
      );
      const select = screen.getByTestId('s');
      expect(select.tagName).toBe('SELECT');
      expect(select.parentElement?.className).toContain('relative');
    });

    it('renders the chevron icon (decorative)', () => {
      const { container } = renderWithProviders(
        <NativeSelect>
          <option>X</option>
        </NativeSelect>,
      );
      const svg = container.querySelector('svg[aria-hidden]');
      expect(svg).toBeInTheDocument();
      expect(svg?.getAttribute('class')).toContain('pointer-events-none');
    });

    it('renders option children inside the <select>', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option value="a">Apple</option>
          <option value="b">Banana</option>
        </NativeSelect>,
      );
      const select = screen.getByTestId('s');
      expect(select.querySelectorAll('option')).toHaveLength(2);
    });
  });

  describe('layout + styling baseline', () => {
    it('applies control-height token + padding + pr-7 (room for chevron)', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      const select = screen.getByTestId('s');
      // moysklad density: 19px control (--ms-control-h), not the old h-9 (27px).
      expect(select.className).toContain('h-[var(--ms-control-h)]');
      expect(select.className).toContain('px-2');
      expect(select.className).toContain('pr-7');
    });

    it('applies appearance-none to hide the native arrow (replaced by chevron)', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      expect(screen.getByTestId('s').className).toContain('appearance-none');
    });

    it('uses surface bg + primary text by default', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      const cls = screen.getByTestId('s').className;
      expect(cls).toContain('ms-bg-surface');
      expect(cls).toContain('ms-text-primary');
    });
  });

  describe('disabled state', () => {
    it('renders disabled when disabled prop is true', () => {
      renderWithProviders(
        <NativeSelect disabled data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      expect(screen.getByTestId('s')).toBeDisabled();
    });

    it('applies disabled visual styling (muted bg, disabled text, not-allowed cursor)', () => {
      renderWithProviders(
        <NativeSelect disabled data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      const cls = screen.getByTestId('s').className;
      expect(cls).toContain('disabled:bg-[var(--ms-bg-muted)]');
      expect(cls).toContain('disabled:cursor-not-allowed');
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid prop is true', () => {
      renderWithProviders(
        <NativeSelect invalid data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      expect(screen.getByTestId('s')).toHaveAttribute('aria-invalid', 'true');
    });

    it('does NOT set aria-invalid when invalid is false/omitted', () => {
      renderWithProviders(
        <NativeSelect data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      expect(screen.getByTestId('s')).not.toHaveAttribute('aria-invalid');
    });

    it('uses destructive border class when invalid', () => {
      renderWithProviders(
        <NativeSelect invalid data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      expect(screen.getByTestId('s').className).toContain('ms-action-destructive');
    });
  });

  describe('events', () => {
    it('forwards value (controlled)', () => {
      renderWithProviders(
        <NativeSelect value="b" onChange={() => undefined} data-test-id="s">
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>,
      );
      const select = screen.getByTestId('s') as HTMLSelectElement;
      expect(select.value).toBe('b');
    });

    it('fires onChange when the user picks an option', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <NativeSelect onChange={onChange} data-test-id="s" defaultValue="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>,
      );
      await user.selectOptions(screen.getByTestId('s'), 'b');
      expect(onChange).toHaveBeenCalled();
      expect((screen.getByTestId('s') as HTMLSelectElement).value).toBe('b');
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the underlying select element', () => {
      let captured: HTMLSelectElement | null = null;
      renderWithProviders(
        <NativeSelect
          ref={(el) => {
            captured = el;
          }}
          data-test-id="s"
        >
          <option>X</option>
        </NativeSelect>,
      );
      expect(captured).toBeInstanceOf(HTMLSelectElement);
    });

    it('merges user className onto the wrapper div (not the select)', () => {
      const { container } = renderWithProviders(
        <NativeSelect className="custom-w" data-test-id="s">
          <option>X</option>
        </NativeSelect>,
      );
      const wrapper = container.querySelector('div.relative');
      expect(wrapper?.className).toContain('custom-w');
    });
  });
});
