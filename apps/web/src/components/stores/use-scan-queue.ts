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
 * Bir skanning xatosi zanjirni UZMAYDI — keyingi skan baribir ishlanadi.
 *
 * ## Xato bilan ishlash — CHAQIRUVCHI UCHUN MAJBURIY QOIDA
 *
 * Qaytgan promise xatoni SAQLAYDI: `await enqueue(code)` qilgan joy xatoni
 * o'zi ko'radi va o'zi ko'rsatadi. Lekin zanjirni tirik saqlash uchun hook
 * xatoni ichkarida ham ushlaydi — ya'ni `void enqueue(code)` deb chaqirsang
 * (input `onKeyDown`, kamera callback, wedge tutqichi aynan shunday qiladi)
 * xato NA ekranga chiqadi, NA `unhandledrejection` sifatida ko'rinadi:
 * skan JIM yo'qoladi. Omborchi uchun bu TZ §3 «jim rad etish yo'q» talabiga zid.
 *
 * Shuning uchun: **`void enqueue(...)` ishlatuvchi chaqiruvchi `onError`
 * berishi SHART** (yoki handler ichida o'zi `try/catch` qilib toast
 * ko'rsatishi). `onError` berilmasa — xulq eski holicha: xato faqat
 * chaqiruvchiga uzatiladi, zanjir esa uzilmaydi.
 *
 * `handler` ham, `onError` ham ref'ga «qadaladi», shuning uchun qaytgan
 * `enqueue` havolasi qayta render'da O'ZGARMAYDI — kamera hooki qayta ishga
 * tushmaydi.
 */

import { useCallback, useEffect, useRef } from 'react';

export function useScanQueue(
  handler: (code: string) => Promise<void> | void,
  onError?: (err: unknown, code: string) => void,
) {
  const handlerRef = useRef(handler);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    handlerRef.current = handler;
    onErrorRef.current = onError;
  }, [handler, onError]);

  /**
   * Zanjirning oxiri. Bu yerga HAR DOIM xatosi yutilgan promise yoziladi
   * (pastdagi `.catch`), shuning uchun `chainRef.current` hech qachon reject
   * bo'lmaydi — oldiga yana bitta himoya `.catch` qo'yish o'lik shox bo'lardi.
   */
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback((code: string) => {
    const next = chainRef.current.then(() => handlerRef.current(code));
    chainRef.current = next.catch((err) => {
      onErrorRef.current?.(err, code);
    });
    return next;
  }, []);
}
