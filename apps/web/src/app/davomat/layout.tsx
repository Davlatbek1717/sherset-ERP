import type { Metadata, Viewport } from 'next';
import { DavomatGate } from './_gate';

export const metadata: Metadata = {
  title: 'Davomat — Sherset',
  description: 'Ish joyiga kelib-ketishni avtomatik GPS-davomat',
};

// PWA viewport: fill the device, disable zoom (a kiosk-like status app),
// brand theme-color for the mobile browser chrome + standalone splash.
export const viewport: Viewport = {
  themeColor: '#0652ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

/**
 * Bare, mobile-first, authed layout for the employee davomat PWA — deliberately
 * OUTSIDE the (app) route group so it escapes the dense desktop AppShell.
 * Auth bootstrap + the touch shell live in the client <DavomatGate>.
 */
export default function DavomatLayout({ children }: { children: React.ReactNode }) {
  return <DavomatGate>{children}</DavomatGate>;
}
