'use client';

import { StoresListView } from '@/components/stores/stores-list-view';

/**
 * «Склады» — warehouse list inside the Склад section chrome (top-nav module
 * `stock`). Same list as Settings → Склады; only the surrounding chrome
 * differs (driven by the URL in the app layout). Create reuses the existing
 * warehouse form under /settings/stores; a ROW CLICK opens the moysklad-1:1
 * ombor kartochkasi (`/stores/[id]`) with the «Адресное хранение» /
 * yacheykalar section (2026-07-16: Sozlamalar formasiga adashib o'tish fix).
 */
export default function StockStoresPage() {
  return <StoresListView detailBasePath="/stores" />;
}
