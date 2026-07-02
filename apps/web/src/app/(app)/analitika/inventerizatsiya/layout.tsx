'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { InventoryNav } from './_components/inventory-nav';

/**
 * Inventerizatsiya bo'limining yagona shell: sarlavha + 5 sahifali sub-nav
 * (Bosh panel / Sanab kiritish / ABC sanash / Tasdiqlash / Hisobot).
 * Har sub-route faqat o'z view'ini render qiladi; nav + sarlavha shu yerda.
 */
export default function InventerizatsiyaLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('pages.analitika_inventory');
  return (
    <div className="space-y-4 p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
      <InventoryNav />
      <div className="mt-5">{children}</div>
    </div>
  );
}
