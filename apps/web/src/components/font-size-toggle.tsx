'use client';

import { useEffect, useRef, useState } from 'react';

const MIN = 12;
const MAX = 22;
const DEFAULT = 16;
const LS_KEY = 'sherset-font-size';

function useFontSize() {
  const [size, setSize] = useState(DEFAULT);

  useEffect(() => {
    const stored = Number(localStorage.getItem(LS_KEY));
    if (stored >= MIN && stored <= MAX) {
      setSize(stored);
      document.documentElement.style.fontSize = `${stored}px`;
    }
  }, []);

  const apply = (next: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, next));
    setSize(clamped);
    document.documentElement.style.fontSize = `${clamped}px`;
    localStorage.setItem(LS_KEY, String(clamped));
  };

  return {
    size,
    inc: () => apply(size + 1),
    dec: () => apply(size - 1),
    reset: () => apply(DEFAULT),
  };
}

export function FontSizeToggle() {
  const { size, inc, dec, reset } = useFontSize();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Shrift o'lchami"
        className="flex h-8 w-8 items-center justify-center rounded-md font-bold text-[var(--ms-nav-text)] text-sm transition-colors hover:bg-white/10 select-none"
      >
        A
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 shadow-2xl">
          <p className="mb-3 text-center text-xs font-medium text-[var(--ms-text-muted)]">
            Shrift o'lchami
          </p>

          {/* Preview */}
          <div className="mb-3 flex items-baseline justify-center gap-1">
            <span className="font-semibold text-[var(--ms-text-primary)] text-2xl tabular-nums">
              {size}
            </span>
            <span className="text-[var(--ms-text-muted)] text-xs">px</span>
          </div>

          {/* + / − controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dec}
              disabled={size <= MIN}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-xl font-bold text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={inc}
              disabled={size >= MAX}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-xl font-bold text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>

          {/* Reset */}
          {size !== DEFAULT && (
            <button
              type="button"
              onClick={reset}
              className="mt-2 w-full rounded-lg border border-[var(--ms-border)] py-1.5 text-xs text-[var(--ms-text-muted)] transition-colors hover:bg-[var(--ms-bg-hover)]"
            >
              Standart ({DEFAULT}px)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
