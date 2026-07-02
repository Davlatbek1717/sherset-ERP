import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Textarea } from '@moysklad/ui';
/**
 * Textarea (from @moysklad/ui) tests — multi-line text input mirror of
 * Input. Used by description fields, comment boxes, address inputs.
 *
 * Tests guard the basic typing flow, invalid styling parity with Input,
 * disabled state, the rows fallback (3), autoResize escape hatch, and
 * the onChange callback wiring.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Textarea', () => {
  describe('basic rendering', () => {
    it('renders as a <textarea> element', () => {
      const { container } = renderWithProviders(<Textarea aria-label="comment" />);
      expect(container.querySelector('textarea')).toBeInTheDocument();
    });

    it('uses the default rows=3', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      expect(container.querySelector('textarea')).toHaveAttribute('rows', '3');
    });

    it('honors custom rows prop', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" rows={10} />);
      expect(container.querySelector('textarea')).toHaveAttribute('rows', '10');
    });

    it('honors placeholder', () => {
      renderWithProviders(<Textarea aria-label="x" placeholder="Enter description..." />);
      expect(screen.getByPlaceholderText('Enter description...')).toBeInTheDocument();
    });
  });

  describe('typing + onChange', () => {
    it('user typing updates the value (uncontrolled)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Textarea aria-label="x" />);
      const ta = screen.getByLabelText('x');
      await user.type(ta, 'Hello world');
      expect(ta).toHaveValue('Hello world');
    });

    it('onChange fires for each keystroke', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Textarea aria-label="x" onChange={onChange} />);
      await user.type(screen.getByLabelText('x'), 'abc');
      expect(onChange).toHaveBeenCalledTimes(3);
    });
  });

  describe('disabled state', () => {
    it('renders with disabled attribute', () => {
      renderWithProviders(<Textarea aria-label="x" disabled />);
      expect(screen.getByLabelText('x')).toBeDisabled();
    });

    it('disabled adds disabled styling classes', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" disabled />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('disabled:cursor-not-allowed');
      expect(ta?.className).toContain('disabled:bg-[var(--ms-bg-muted)]');
    });
  });

  describe('invalid state', () => {
    it('does NOT set aria-invalid by default', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      expect(container.querySelector('textarea')).not.toHaveAttribute('aria-invalid');
    });

    it('sets aria-invalid="true" when invalid=true', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" invalid />);
      expect(container.querySelector('textarea')).toHaveAttribute('aria-invalid', 'true');
    });

    it('uses destructive border class when invalid', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" invalid />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('border-[var(--ms-action-destructive)]');
    });

    it('uses the crisp dark input border when not invalid', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('border-[var(--ms-border-input)]');
    });
  });

  describe('autoResize', () => {
    it('does NOT add resize-none by default (manual resize allowed)', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('resize-y');
      expect(ta?.className ?? '').not.toMatch(/(^|\s)resize-none(\s|$)/);
    });

    it('adds resize-none + overflow-hidden when autoResize=true', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" autoResize />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('resize-none');
      expect(ta?.className).toContain('overflow-hidden');
    });
  });

  describe('layout baseline', () => {
    it('applies block + w-full layout', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('block');
      expect(ta?.className).toContain('w-full');
    });

    it('applies px-3 py-2 padding + 12px font (moysklad parity)', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('px-3');
      expect(ta?.className).toContain('py-2');
      expect(ta?.className).toContain('text-[12px]');
    });
  });

  describe('forwarded ref + className', () => {
    it('forwards ref to the underlying textarea', () => {
      let captured: HTMLTextAreaElement | null = null;
      renderWithProviders(
        <Textarea
          aria-label="x"
          ref={(el) => {
            captured = el;
          }}
        />,
      );
      expect(captured).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('merges user className', () => {
      const { container } = renderWithProviders(<Textarea aria-label="x" className="my-class" />);
      const ta = container.querySelector('textarea');
      expect(ta?.className).toContain('my-class');
      expect(ta?.className).toContain('text-[12px]');
    });
  });
});
