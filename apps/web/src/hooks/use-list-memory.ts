'use client';

/**
 * RO'YXAT XOTIRASI (2026-07-13 talab).
 *
 * Muammo: operator qarzdor kartochkasiga kirib, orqaga qaytganda ro'yxat
 * BOSHIGA tashlanardi — «kimga telefon qilayotgandim?» degan savol paydo
 * bo'lardi va navbat yo'qolardi.
 *
 * Yechim ikki qism:
 *   1. FILTR/SAHIFA holati sessionStorage'da saqlanadi — qaytganda aynan
 *      o'sha ko'rinish tiklanadi (o'sha sahifa, o'sha tab, o'sha qidiruv).
 *   2. Oxirgi ochilgan QATOR eslab qolinadi — qaytganda ekran o'sha qatorga
 *      suriladi va u qisqa vaqt sariq bilan yoritiladi («mana shu yerda
 *      edingiz»).
 *
 * sessionStorage — tab yopilguncha yashaydi, boshqa tab/foydalanuvchiga
 * o'tmaydi. Server-render paytida (window yo'q) xavfsiz ishlaydi.
 */

import { useCallback, useEffect, useState } from 'react';

/** SSR-xavfsiz o'qish. */
function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — xotira bo'lmasa ham sahifa ishlayveradi */
  }
}

/**
 * Ro'yxat filtr/sahifa holatini saqlaydi va qaytganda tiklaydi.
 * `initial` — birinchi kirishdagi standart holat.
 */
export function useListState<T extends Record<string, unknown>>(
  key: string,
  initial: T,
): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(() => ({ ...initial, ...read<Partial<T>>(key, {}) }));

  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        write(key, next);
        return next;
      });
    },
    [key],
  );

  return [state, update];
}

/**
 * Oxirgi ochilgan qatorni eslab qoladi va qaytganda o'sha joyga suradi.
 *
 * @param key         — sahifa kaliti (masalan 'debts')
 * @param ready       — ro'yxat yuklandimi (scroll shundan keyin ma'noli)
 * @param rowSelector — qator DOM selektorini quruvchi funksiya
 * @returns  { remember, highlightId } — qatorga bosishda `remember(id)` chaqiring;
 *           `highlightId` yoritilishi kerak bo'lgan qator.
 */
export function useReturnToRow(
  key: string,
  ready: boolean,
  rowSelector: (id: string) => string,
): { remember: (id: string) => void; highlightId: string | null } {
  const storageKey = `${key}:last-row`;
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const remember = useCallback(
    (id: string) => {
      if (typeof window === 'undefined') return;
      try {
        window.sessionStorage.setItem(storageKey, id);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    let id: string | null = null;
    try {
      id = window.sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!id) return;

    // Qator DOM'da paydo bo'lishini kutamiz (jadval endigina render bo'ldi).
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(rowSelector(id as string));
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
        setHighlightId(id);
        // Yoritish 2.5s — ko'z ilg'aydi, lekin bezmaydi.
        setTimeout(() => setHighlightId(null), 2500);
      }
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [ready, storageKey, rowSelector]);

  return { remember, highlightId };
}
