'use client';

import { StoreCard } from '@/components/stores/store-card';

/** Blank warehouse card in the Склад-section chrome (moysklad #warehouse/edit?new). */
export default function NewStockStorePage() {
  return <StoreCard id={null} basePath="/stores" />;
}
