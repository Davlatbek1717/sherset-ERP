'use client';

import { StoresListView } from '@/components/stores/stores-list-view';

/**
 * «Склады» — warehouse list inside the Склад section chrome (top-nav module
 * `stock`). Same list as Settings → Склады; only the surrounding chrome
 * differs (driven by the URL in the app layout). Create/edit reuse the
 * existing warehouse forms under /settings/stores.
 */
export default function StockStoresPage() {
  return <StoresListView />;
}
