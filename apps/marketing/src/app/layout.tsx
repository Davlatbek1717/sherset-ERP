import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: "Sherset — O'zbekiston uchun bulutli ERP",
    template: '%s | Sherset',
  },
  description:
    'Sotuvlar, omborlar, pul, hisobotlar — barchasi bitta tizimda. ' +
    'Soliq.uz, Payme, Click, Eskiz va MXIK katalog bilan integratsiya.',
  keywords: ['ERP', 'CRM', 'Moysklad', "O'zbekiston", 'savdo', 'ombor', 'soliq'],
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    url: 'https://moysklad.uz',
    siteName: 'Sherset',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="bg-white text-slate-900 antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
