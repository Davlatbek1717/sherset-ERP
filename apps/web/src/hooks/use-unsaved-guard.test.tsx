import { renderHook } from '@testing-library/react';
/**
 * useUnsavedGuard tests — the hook publishes a mounted-dirty count that the
 * global <UnsavedNavGuard> reads to show the in-app ConfirmDialog modal.
 *
 * Key regression lock: it must NOT register a native `beforeunload` listener
 * (project rule bans native alerts; the modal replaces it). The count must
 * track mount/unmount and isDirty flips so the guard never fires on a clean
 * form nor stays armed after the form is saved or left.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnsavedDirty, useUnsavedGuard } from './use-unsaved-guard';

describe('useUnsavedGuard', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
  });

  it('NEVER attaches a native beforeunload listener (no native alert)', () => {
    renderHook(() => useUnsavedGuard(true));
    const calls = addSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(calls.length).toBe(0);
  });

  it('isUnsavedDirty() is false for a clean form', () => {
    renderHook(() => useUnsavedGuard(false));
    expect(isUnsavedDirty()).toBe(false);
  });

  it('isUnsavedDirty() is true while a dirty form is mounted', () => {
    renderHook(() => useUnsavedGuard(true));
    expect(isUnsavedDirty()).toBe(true);
  });

  it('clears on unmount (left/closed form no longer guarded)', () => {
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    expect(isUnsavedDirty()).toBe(true);
    unmount();
    expect(isUnsavedDirty()).toBe(false);
  });

  it('clears when isDirty flips back to false (form saved)', () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedGuard(dirty), {
      initialProps: { dirty: true },
    });
    expect(isUnsavedDirty()).toBe(true);
    rerender({ dirty: false });
    expect(isUnsavedDirty()).toBe(false);
  });

  it('counts independently across multiple mounted forms', () => {
    const a = renderHook(() => useUnsavedGuard(true));
    const b = renderHook(() => useUnsavedGuard(true));
    expect(isUnsavedDirty()).toBe(true);
    a.unmount();
    expect(isUnsavedDirty()).toBe(true); // b still dirty
    b.unmount();
    expect(isUnsavedDirty()).toBe(false);
  });
});
