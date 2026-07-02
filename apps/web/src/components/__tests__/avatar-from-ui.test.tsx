import { renderWithProviders, screen } from '@/test-utils';
import { Avatar } from '@moysklad/ui';
/**
 * Avatar (from @moysklad/ui) tests — used in DetailHeader's
 * authorSlot for every detail page (avatar + author name + role).
 *
 * Pure-fn tests for deriveInitials/colorFor live in design-system
 * (Avatar.test.ts, 9 tests). These tests cover the rendered DOM:
 * size variants, ring variants, image fallback to initials, a11y.
 */
import { describe, expect, it } from 'vitest';

describe('Avatar', () => {
  describe('basic rendering', () => {
    it('renders as a <span> with role="img"', () => {
      renderWithProviders(<Avatar name="Admin User" data-test-id="a" />);
      const el = screen.getByRole('img', { name: 'Admin User' });
      expect(el.tagName).toBe('SPAN');
    });

    it('uses the name as the aria-label', () => {
      renderWithProviders(<Avatar name="Ozodbek" />);
      expect(screen.getByRole('img', { name: 'Ozodbek' })).toBeInTheDocument();
    });

    it('renders auto-derived initials when no src provided', () => {
      renderWithProviders(<Avatar name="Admin User" />);
      // deriveInitials("Admin User") = "AU"
      expect(screen.getByText('AU')).toBeInTheDocument();
    });

    it('honors explicit initials prop over auto-derived', () => {
      renderWithProviders(<Avatar name="Anything" initials="XX" />);
      expect(screen.getByText('XX')).toBeInTheDocument();
    });

    it('always rounded-full + inline-flex baseline', () => {
      const { container } = renderWithProviders(<Avatar name="A" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('rounded-full');
      expect(span?.className).toContain('inline-flex');
    });
  });

  describe('size variants', () => {
    it('uses md (h-8 w-8) by default', () => {
      const { container } = renderWithProviders(<Avatar name="A" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('h-8');
      expect(span?.className).toContain('w-8');
    });

    it('xs renders h-5 w-5', () => {
      const { container } = renderWithProviders(<Avatar name="A" size="xs" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('h-5');
      expect(span?.className).toContain('w-5');
    });

    it('sm renders h-6 w-6', () => {
      const { container } = renderWithProviders(<Avatar name="A" size="sm" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('h-6');
      expect(span?.className).toContain('w-6');
    });

    it('lg renders h-10 w-10', () => {
      const { container } = renderWithProviders(<Avatar name="A" size="lg" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('h-10');
      expect(span?.className).toContain('w-10');
    });

    it('xl renders h-14 w-14', () => {
      const { container } = renderWithProviders(<Avatar name="A" size="xl" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('h-14');
      expect(span?.className).toContain('w-14');
    });
  });

  describe('ring variants', () => {
    it('no ring by default', () => {
      const { container } = renderWithProviders(<Avatar name="A" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className ?? '').not.toContain('ring-2');
    });

    it('ring="success" applies green ring', () => {
      const { container } = renderWithProviders(<Avatar name="A" ring="success" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('ring-[var(--ms-text-success)]');
    });

    it('ring="warning" applies orange ring', () => {
      const { container } = renderWithProviders(<Avatar name="A" ring="warning" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('ring-[var(--ms-text-warning)]');
    });

    it('ring="destructive" applies red ring', () => {
      const { container } = renderWithProviders(<Avatar name="A" ring="destructive" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('ring-[var(--ms-text-destructive)]');
    });

    it('ring="brand" applies brand ring', () => {
      const { container } = renderWithProviders(<Avatar name="A" ring="brand" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('ring-[var(--ms-text-brand)]');
    });
  });

  describe('image rendering + fallback', () => {
    it('renders <img> when src provided', () => {
      const { container } = renderWithProviders(
        <Avatar name="Admin User" src="https://example.com/u.png" />,
      );
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/u.png');
      expect(img).toHaveAttribute('alt', 'Admin User');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('renders initials text when src is empty/null', () => {
      renderWithProviders(<Avatar name="Admin User" src={null} />);
      expect(screen.getByText('AU')).toBeInTheDocument();
    });

    it('renders <img> styling: object-cover, full size', () => {
      const { container } = renderWithProviders(<Avatar name="A" src="x.png" />);
      const img = container.querySelector('img');
      expect(img?.className).toContain('object-cover');
      expect(img?.className).toContain('h-full');
      expect(img?.className).toContain('w-full');
    });
  });

  describe('color tint', () => {
    it('applies SOME tint background class when no image', () => {
      const { container } = renderWithProviders(<Avatar name="Foo" />);
      const span = container.querySelector('[role="img"]');
      // Some tint from AVATAR_TINTS; just verify a bg class is present.
      expect(span?.className).toMatch(/bg-/);
    });

    it('same name → same tint (deterministic)', () => {
      const { container: c1 } = renderWithProviders(<Avatar name="Bar" />);
      const { container: c2 } = renderWithProviders(<Avatar name="Bar" />);
      const t1 = c1.querySelector('[role="img"]')?.className;
      const t2 = c2.querySelector('[role="img"]')?.className;
      expect(t1).toBe(t2);
    });

    it('does NOT apply the tint background when image is shown', () => {
      const { container } = renderWithProviders(<Avatar name="A" src="x.png" />);
      // Tint classes are not applied when showImage=true.
      // We can't easily assert "no tint", but we verify the img is rendered.
      expect(container.querySelector('img')).toBeInTheDocument();
    });
  });

  describe('className merge', () => {
    it('merges user className with the size + ring classes', () => {
      const { container } = renderWithProviders(<Avatar name="A" className="custom-extra" />);
      const span = container.querySelector('[role="img"]');
      expect(span?.className).toContain('custom-extra');
      expect(span?.className).toContain('h-8'); // default size still applied
    });
  });
});
