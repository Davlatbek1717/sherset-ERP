import type { MetadataRoute } from 'next';

/**
 * PWA manifest for the employee davomat app. Scoped to /davomat so installing
 * it gives a focused home-screen app, separate from the desktop ERP.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sherset Davomat',
    short_name: 'Davomat',
    description: 'Ish joyiga kelib-ketishni avtomatik GPS-davomat',
    start_url: '/davomat',
    scope: '/davomat',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'uz',
    theme_color: '#0652ff',
    background_color: '#f7f7f7',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
