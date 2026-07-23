'use client';

import { StoreCard } from '@/components/stores/store-card';
import { useParams } from 'next/navigation';

/**
 * Warehouse card inside the Склад-section chrome — moysklad parity: the card
 * opens at #Warehouse/edit under the Склад module (NO settings sidebar). The
 * /settings/stores/[id] route renders the same card in the settings chrome.
 */
export default function StockStorePage() {
  const params = useParams<{ id: string }>();
  return <StoreCard id={params?.id ?? ''} basePath="/stores" />;
}
