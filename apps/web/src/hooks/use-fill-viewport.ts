'use client';

/**
 * Elementga «viewport'ning QOLGAN balandligi»ni beradi.
 *
 * Nima uchun kerak: POS ekrani (`/sotuv`) to'liq-balandlikdagi qobiq — ichida
 * o'z scroll sohalari bor va pastda JAMI + to'lov tugmasi DOIM ko'rinib turishi
 * shart. Bunday qobiq ota-elementdan chegaralangan balandlik kutadi, climart
 * qobig'i esa uni ataylab BERMAYDI: `(app)/layout.tsx` `<div className="flex
 * flex-col">{children}</div>` — «ichki scroll YO'Q, hujjat tanasi scroll bo'ladi»
 * (ro'yxat sahifalari uchun egasining talabi).
 *
 * Sherset'da sahifa `h-[calc(100dvh-58px)]` deb yozilgan edi — faqat 58px
 * navbar'ni hisobga olgan. climart'da navbar USTIGA subnav ham qo'shiladi
 * (Kassir joyi · Smenalar · Cheklar · Z-hisobot · Sotuv), shuning uchun qobiq
 * ~46px ortiqcha uzun bo'lib, pastki blok ekrandan CHIQIB KETARDI — to'lov
 * tugmasi qirqilgan holda ko'rinardi (egasi 2026-08-01 da suratda ko'rsatdi).
 *
 * Qat'iy raqam yozish o'rniga element O'Z tepa-offsetini o'lchaydi va qolgan
 * balandlikni oladi. Shunda qobiq yuqoridagi xrom (navbar/subnav/banner)
 * qanday bo'lishidan qat'i nazar to'g'ri ishlaydi — bu butun bug-klassni yopadi,
 * bitta raqamni tuzatib qo'ymaydi.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useFillViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  // SSR va birinchi bo'yashda: to'liq viewport (qirqilgandan ko'ra uzunroq
  // xavfsizroq — o'lchov effektdan keyin darhol aniqlashtiradi).
  const [height, setHeight] = useState('100dvh');

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // `getBoundingClientRect().top` — viewport'ga nisbatan; sahifa scroll
    // bo'lgan bo'lsa hujjat boshiga keltiramiz.
    const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY));
    setHeight(`calc(100dvh - ${top}px)`);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return { ref, height, remeasure: measure };
}
