import { redirect } from 'next/navigation';

/**
 * moysklad parity (LIVE-verified 2026-07-03): warehouses do NOT exist in the
 * settings area — they live only at Склад → Склады. Old bookmarks land there.
 */
export default function SettingsStoresRedirect() {
  redirect('/stores');
}
