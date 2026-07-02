import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-slate-200 border-t bg-slate-50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Sherset</h3>
          <p className="mt-2 text-slate-600 text-sm">O'zbekiston uchun bulutli ERP</p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Mahsulot</h3>
          <ul className="mt-3 space-y-2 text-slate-600 text-sm">
            <li>
              <Link href="/features" className="hover:text-slate-900">
                Imkoniyatlar
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-slate-900">
                Tariflar
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Kompaniya</h3>
          <ul className="mt-3 space-y-2 text-slate-600 text-sm">
            <li>
              <Link href="/about" className="hover:text-slate-900">
                Biz haqimizda
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Yuridik</h3>
          <ul className="mt-3 space-y-2 text-slate-600 text-sm">
            <li>
              <Link href="/legal/oferta" className="hover:text-slate-900">
                Oferta
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="hover:text-slate-900">
                Maxfiylik siyosati
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-slate-200 border-t">
        <div className="mx-auto max-w-7xl px-6 py-4 text-slate-500 text-xs">
          © {year} Sherset. Barcha huquqlar himoyalangan.
        </div>
      </div>
    </footer>
  );
}
