'use client';

import { StoresListView } from '@/components/stores/stores-list-view';

/**
 * «Склады» — warehouse list inside the Склад section chrome (top-nav module
 * `stock`). moysklad parity: rows/create open the card at /stores/[id] —
 * still inside the Склад chrome (no settings sidebar).
 */
export default function StockStoresPage() {
  return <StoresListView formBasePath="/stores" />;
}
