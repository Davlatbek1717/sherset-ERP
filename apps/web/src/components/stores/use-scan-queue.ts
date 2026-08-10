'use client';

/**
 * useScanQueue — skanlarni KETMA-KET qayta ishlaydigan navbat (TZ v3 §3).
 *
 * Skaner tugmasi bosib turilganda kodlar 100ms oralig'ida keladi, har biri
 * esa `await api.get(...)` qiladi. Navbatsiz ikkinchi skan birinchisining
 * o'rtasida ishga tushadi va eskirgan holatni (staged ro'yxat, joriy
 * yacheyka) o'qiydi — natija skan tartibiga bog'liq bo'lmay qoladi.
 *
 * Navbat — oddiy promise-zanjir: har chaqiruv oldingisi tugagach boshlanadi.
 * Bir skanning xatosi zanjirni UZMAYDI (`.catch` bilan yutiladi) — keyingi
 * skan baribir ishlanadi va o'z xabarini o'zi ko'rsatadi. E'tibor bering:
 * `.catch` faqat ZANJIRGA qo'yiladi; chaqiruvchiga qaytgan promise xatoni
 * saqlaydi, ya'ni `await enqueue(code)` qilgan joy xatoni o'zi ko'radi.
 */

import { useCallback, useEffect, useRef } from 'react';

export function useScanQueue(handler: (code: string) => Promise<void> | void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const chainRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback((code: string) => {
    const next = chainRef.current.catch(() => undefined).then(() => handlerRef.current(code));
    chainRef.current = next.catch(() => undefined);
    return next;
  }, []);
}
