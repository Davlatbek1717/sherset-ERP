import { act, renderHook } from '@testing-library/react';
/**
 * useColumnVisibility tests — verify per-user column visibility
 * persists to localStorage, hydrates on mount, ignores corrupt
 * storage, and the reset() helper restores defaults + clears
 * storage. Used by 14 list pages so a regression here would
 * silently flip columns for every user.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useColumnVisibility } from './use-column-visibility';

const STORAGE_PREFIX = 'ms:column-visibility:';

describe('useColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default visible set when storage is empty', () => {
    const { result } = renderHook(() =>
      useColumnVisibility('test-entity', ['name', 'state', 'sum']),
    );
    expect(Array.from(result.current.visibleKeys).sort()).toEqual(['name', 'state', 'sum']);
  });

  it('hydrates from localStorage on mount when a saved set exists', () => {
    localStorage.setItem(`${STORAGE_PREFIX}test-entity`, JSON.stringify(['name', 'agent']));
    const { result } = renderHook(() =>
      useColumnVisibility('test-entity', ['name', 'state', 'sum']),
    );
    expect(Array.from(result.current.visibleKeys).sort()).toEqual(['agent', 'name']);
  });

  it('persists to localStorage when setVisibleKeys is called', () => {
    const { result } = renderHook(() => useColumnVisibility('test-entity', ['name', 'state']));
    act(() => {
      result.current.setVisibleKeys(new Set(['name', 'agent', 'moment']));
    });
    const raw = localStorage.getItem(`${STORAGE_PREFIX}test-entity`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as string[];
    expect(parsed.sort()).toEqual(['agent', 'moment', 'name']);
  });

  it('reset() restores the default set + clears storage', () => {
    localStorage.setItem(`${STORAGE_PREFIX}test-entity`, JSON.stringify(['agent']));
    const { result } = renderHook(() =>
      useColumnVisibility('test-entity', ['name', 'state', 'sum']),
    );
    // After hydration, only 'agent' is visible.
    expect(Array.from(result.current.visibleKeys)).toEqual(['agent']);
    act(() => {
      result.current.reset();
    });
    expect(Array.from(result.current.visibleKeys).sort()).toEqual(['name', 'state', 'sum']);
    expect(localStorage.getItem(`${STORAGE_PREFIX}test-entity`)).toBeNull();
  });

  it('falls back to defaults when storage is corrupt JSON', () => {
    localStorage.setItem(`${STORAGE_PREFIX}test-entity`, 'not-valid-json{{{');
    const { result } = renderHook(() => useColumnVisibility('test-entity', ['name', 'state']));
    expect(Array.from(result.current.visibleKeys).sort()).toEqual(['name', 'state']);
  });

  it('falls back to defaults when stored value is not a string array', () => {
    localStorage.setItem(`${STORAGE_PREFIX}test-entity`, JSON.stringify({ not: 'an array' }));
    const { result } = renderHook(() => useColumnVisibility('test-entity', ['name']));
    expect(Array.from(result.current.visibleKeys)).toEqual(['name']);
  });

  it('falls back to defaults when stored array contains non-strings', () => {
    localStorage.setItem(`${STORAGE_PREFIX}test-entity`, JSON.stringify(['name', 42, null]));
    const { result } = renderHook(() => useColumnVisibility('test-entity', ['name', 'state']));
    expect(Array.from(result.current.visibleKeys).sort()).toEqual(['name', 'state']);
  });

  it('scopes storage per entity (different entities do not collide)', () => {
    localStorage.setItem(`${STORAGE_PREFIX}entity-a`, JSON.stringify(['col-a-1', 'col-a-2']));
    localStorage.setItem(`${STORAGE_PREFIX}entity-b`, JSON.stringify(['col-b-1']));

    const { result: resultA } = renderHook(() => useColumnVisibility('entity-a', ['default']));
    const { result: resultB } = renderHook(() => useColumnVisibility('entity-b', ['default']));

    expect(Array.from(resultA.current.visibleKeys).sort()).toEqual(['col-a-1', 'col-a-2']);
    expect(Array.from(resultB.current.visibleKeys)).toEqual(['col-b-1']);
  });

  it('an empty set persists as an empty array (no key drops back to defaults)', () => {
    const { result } = renderHook(() => useColumnVisibility('test-entity', ['name', 'state']));
    act(() => {
      result.current.setVisibleKeys(new Set());
    });
    const raw = localStorage.getItem(`${STORAGE_PREFIX}test-entity`);
    expect(raw).toBe('[]');
    expect(Array.from(result.current.visibleKeys)).toEqual([]);
  });
});
