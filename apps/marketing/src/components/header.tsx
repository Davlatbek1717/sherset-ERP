import Link from 'next/link';

const NAV = [
  { label: 'Imkoniyatlar', href: '/features' },
  { label: 'Tariflar', href: '/pricing' },
  { label: 'Biz haqimizda', href: '/about' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-slate-200 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <img
            src="/brand/sherset-wordmark.png"
            alt="Sherset"
            style={{ height: 28, width: 'auto' }}
          />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-slate-700 text-sm transition-colors hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://app.moysklad.uz/login"
            className="hidden h-9 items-center px-3 text-slate-700 text-sm hover:text-slate-950 sm:inline-flex"
          >
            Tizimga kirish
          </a>
          <a
            href="https://app.moysklad.uz/register"
            className="inline-flex h-9 items-center rounded-md bg-[var(--brand-500)] px-4 font-medium text-sm text-white hover:bg-[var(--brand-700)]"
          >
            Bepul boshlash
          </a>
        </div>
      </div>
    </header>
  );
}
