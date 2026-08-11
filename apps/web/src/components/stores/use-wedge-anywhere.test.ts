import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWedgeAnywhere } from './use-wedge-anywhere';

/**
 * TZ v3 §3 (kirish yo'li 1): «USB/wedge skaner — kursor QAYERDA bo'lishidan
 * qat'i nazar ishlaydi».
 *
 * Qulflanadigan shartnoma:
 *   · fokus maydondan TASHQARIDA bo'lsa — burst + Enter kodni beradi;
 *   · fokus `INPUT`/`TEXTAREA`/contentEditable ICHIDA bo'lsa — tutqich
 *     ARALASHMAYDI (maydonning o'z tutqichi bor: «Sanash» dagi `wedgeGuard`);
 *   · `enabled:false` — umuman tinglamaydi (yopiq oyna);
 *   · `isBlocked()` — bloklaydi va yarim burst'ni tashlaydi;
 *   · printable klavishlar yutiladi (fokusdagi tugma skanerning Enter'i bilan
 *     «bosilib» ketmasin);
 *   · 900ms dan uzoq tanaffus — chala burst tashlanadi.
 */

/** Bir «skan»: har harf + yakuniy Enter, ko'rsatilgan element ustida. */
function wedge(target: Element | Document, code: string) {
  for (const ch of code) fireEvent.keyDown(target, { key: ch });
  fireEvent.keyDown(target, { key: 'Enter' });
}

let input: HTMLInputElement;

beforeEach(() => {
  input = document.createElement('input');
  document.body.appendChild(input);
});
afterEach(() => {
  input.remove();
  vi.useRealTimers();
});

describe('useWedgeAnywhere', () => {
  it('fokus TASHQARIDA — burst + Enter kodni beradi', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    wedge(document.body, 'CELLA');

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith('CELLA');
  });

  it('fokus INPUT ichida — tutqich ARALASHMAYDI (maydon o`zi uddalaydi)', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    wedge(input, 'CELLA');

    expect(onCode).not.toHaveBeenCalled();
  });

  it('TEXTAREA va contentEditable ham chetlab o`tiladi', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    const area = document.createElement('textarea');
    const rich = document.createElement('div');
    rich.contentEditable = 'true';
    // jsdom `isContentEditable` ni atributdan hisoblamaydi — aniq qo'yamiz.
    Object.defineProperty(rich, 'isContentEditable', { value: true });
    document.body.append(area, rich);

    wedge(area, 'CELLA');
    wedge(rich, 'CELLB');

    expect(onCode).not.toHaveBeenCalled();
    area.remove();
    rich.remove();
  });

  it('`inputRef` FOKUSDA bo`lsa chetlab o`tiladi (target boshqa bo`lsa ham)', () => {
    const onCode = vi.fn();
    input.focus();
    renderHook(() =>
      useWedgeAnywhere({ enabled: true, onCode, inputRef: { current: input } as never }),
    );

    // Hodisa document'ga kelmoqda, lekin skan-maydon fokusda — u o'zi yozadi.
    wedge(document, 'CELLA');

    expect(onCode).not.toHaveBeenCalled();
  });

  it('`enabled:false` — umuman tinglamaydi', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: false, onCode }));

    wedge(document.body, 'CELLA');

    expect(onCode).not.toHaveBeenCalled();
  });

  it('`isBlocked` — bloklaydi va yarim burst KEYINGI kodga yopishmaydi', () => {
    const onCode = vi.fn();
    let blocked = true;
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode, isBlocked: () => blocked }));

    wedge(document.body, 'CELLA');
    expect(onCode).not.toHaveBeenCalled();

    blocked = false;
    wedge(document.body, 'CELLB');
    expect(onCode).toHaveBeenCalledTimes(1);
    // «CELLACELLB» EMAS — bloklangan payt yig'ilgani tashlangan.
    expect(onCode).toHaveBeenCalledWith('CELLB');
  });

  it('printable klavish YUTILADI (fokusdagi tugma skanerdan bosilmaydi)', () => {
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode: vi.fn() }));

    // `fireEvent` → `dispatchEvent` natijasi: preventDefault chaqirilsa `false`.
    expect(fireEvent.keyDown(document.body, { key: 'A' })).toBe(false);
  });

  it('BO`SH bufer ustidagi Enter — tutqich tegmaydi (oddiy klaviatura ishi)', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(true);
    expect(onCode).not.toHaveBeenCalled();
  });

  it('Ctrl/Meta/Alt bilan bosilgan klavish burst`ga kirmaydi', () => {
    const onCode = vi.fn();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    fireEvent.keyDown(document.body, { key: 'A' });
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'B' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(onCode).toHaveBeenCalledWith('AB');
  });

  it('900ms dan uzoq tanaffus — CHALA burst tashlanadi', () => {
    const onCode = vi.fn();
    vi.useFakeTimers();
    renderHook(() => useWedgeAnywhere({ enabled: true, onCode }));

    fireEvent.keyDown(document.body, { key: 'A' });
    fireEvent.keyDown(document.body, { key: 'B' });
    vi.advanceTimersByTime(1500); // odam turib ketdi — skan chala qoldi
    wedge(document.body, 'CELLA');

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith('CELLA');
  });

  it('`onCode` yangilansa listener QAYTA ULANMAYDI (yarim burst yo`qolmaydi)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (code: string) => void }) =>
        useWedgeAnywhere({ enabled: true, onCode: cb, isBlocked: () => false }),
      { initialProps: { cb: first } },
    );

    fireEvent.keyDown(document.body, { key: 'A' });
    rerender({ cb: second }); // yangi render, yangi callback havolasi
    fireEvent.keyDown(document.body, { key: 'B' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('AB');
  });
});
