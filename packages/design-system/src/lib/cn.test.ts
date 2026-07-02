/**
 * cn helper tests — wraps clsx + twMerge for Tailwind-aware class
 * deduplication. Critical because every component in the design
 * system relies on it for safe className composition.
 */
import { describe, expect, it } from 'vitest';
import { cn } from './cn.ts';

describe('cn', () => {
  describe('basic concatenation', () => {
    it('joins multiple string args with spaces', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c');
    });

    it('returns empty string when no args', () => {
      expect(cn()).toBe('');
    });

    it('returns single class for single arg', () => {
      expect(cn('a')).toBe('a');
    });
  });

  describe('falsy filtering (clsx behavior)', () => {
    it('drops false', () => {
      expect(cn('a', false, 'b')).toBe('a b');
    });

    it('drops null', () => {
      expect(cn('a', null, 'b')).toBe('a b');
    });

    it('drops undefined', () => {
      expect(cn('a', undefined, 'b')).toBe('a b');
    });

    it('drops 0', () => {
      expect(cn('a', 0, 'b')).toBe('a b');
    });

    it('drops empty string', () => {
      expect(cn('a', '', 'b')).toBe('a b');
    });
  });

  describe('object/array support (clsx)', () => {
    it('supports object form: { class: condition }', () => {
      expect(cn({ a: true, b: false, c: true })).toBe('a c');
    });

    it('supports array form', () => {
      expect(cn(['a', 'b'], 'c')).toBe('a b c');
    });

    it('supports nested arrays', () => {
      expect(cn(['a', ['b', 'c']])).toBe('a b c');
    });

    it('supports mixed forms', () => {
      expect(cn('a', { b: true, c: false }, ['d'], false, 'e')).toBe('a b d e');
    });
  });

  describe('Tailwind dedup (twMerge)', () => {
    it('later padding class wins (px-2 → px-4)', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('later text color wins', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('keeps unrelated classes', () => {
      expect(cn('px-2 py-3', 'px-4')).toBe('py-3 px-4');
    });

    it('user override beats default (typical pattern)', () => {
      // Component default: bg-white px-2; user passes: bg-red-500 px-4
      const result = cn('bg-white px-2', 'bg-red-500 px-4');
      expect(result).toBe('bg-red-500 px-4');
    });

    it('preserves modifier-prefixed classes (hover:, focus:)', () => {
      expect(cn('hover:bg-white', 'hover:bg-blue-500')).toBe('hover:bg-blue-500');
    });

    it('does NOT collapse different modifier classes', () => {
      // hover and focus aren't equivalent → both kept
      expect(cn('hover:bg-red-500', 'focus:bg-blue-500')).toContain('hover:bg-red-500');
      expect(cn('hover:bg-red-500', 'focus:bg-blue-500')).toContain('focus:bg-blue-500');
    });
  });

  describe('practical use cases', () => {
    it('typical component pattern: defaults + variant + user className', () => {
      const variant = 'primary';
      const userCls = 'mt-2';
      const result = cn(
        'inline-flex items-center px-3 py-1',
        variant === 'primary' && 'bg-blue-500 text-white',
        userCls,
      );
      expect(result).toContain('inline-flex');
      expect(result).toContain('px-3');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('mt-2');
    });

    it('conditional class based on variable', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active');
      expect(result).toBe('base active');
    });

    it('handles undefined className prop gracefully', () => {
      const result = cn('base', undefined);
      expect(result).toBe('base');
    });
  });
});
