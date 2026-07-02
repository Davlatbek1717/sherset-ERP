import Link from 'next/link';
import { BrandIcon } from '@/components/brand-icon';

const FEATURES = [
  {
    title: 'Sotuvlar va xaridlar',
    description:
      "Mijoz buyurtmasidan to'lovgacha — barcha bosqichlar bitta tizimda. " +
      'Avtomatik schyot-faktura va to\'lov nazorati.',
    icon: 'cart',
    color: 'text-teal-600',
  },
  {
    title: 'Ombor boshqaruvi',
    description:
      "Real vaqt rejimida qoldiqlar, FIFO partiya hisobi, perimetr " +
      "inventarizatsiya va ko'p ombor o'rtasida ko'chirishlar.",
    icon: 'box',
    color: 'text-sky-600',
  },
  {
    title: 'Pul ledgeri',
    description:
      'Naqd kassalar, bank hisoblari, valyuta kursi (CBRU) — barcha pul ' +
      'oqimi avtomatik audit jurnalga yoziladi.',
    icon: 'wallet',
    color: 'text-cyan-600',
  },
  {
    title: 'CRM va voronka',
    description:
      "Kontragentlar, kontaktlar, qo'ng'iroqlar va Kanban-ko'rinishida " +
      'sotuvlar voronkasi.',
    icon: 'users',
    color: 'text-indigo-600',
  },
  {
    title: 'Hisobotlar',
    description:
      'Sotuvlar, pul oqimi, foyda/zarar, qoldiqlar, kontragent ' +
      'qarzlari — har biri filtr va eksport bilan.',
    icon: 'chart',
    color: 'text-violet-600',
  },
  {
    title: 'Chakana savdo',
    description:
      "Kassir interfeysi, smenalar, cheklarlar, Z-hisobot. Mahalliy " +
      "fiskal va to'lov shlyuzlari bilan integratsiyaga tayyor.",
    icon: 'store',
    color: 'text-rose-600',
  },
] as const;

const INTEGRATIONS = [
  { name: 'CBRU', label: 'Markaziy Bank kursi' },
  { name: 'MXIK', label: 'Soliq tasniflagichi' },
  { name: 'Soliq.uz', label: 'EDO (kelajak)' },
  { name: 'Payme', label: "Onlayn to'lov (kelajak)" },
  { name: 'Click', label: "Onlayn to'lov (kelajak)" },
  { name: 'Eskiz', label: 'SMS bildirishnomalar (kelajak)' },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="border-slate-200 border-b bg-gradient-to-b from-[var(--brand-50)] to-white">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="font-bold text-4xl text-slate-900 leading-tight sm:text-5xl">
                O'zbekiston uchun
                <br />
                bulutli ERP tizim
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                Sotuvlar, omborlar, pul, hisobotlar — barchasi bitta tizimda.
                Mahalliy soliq, to'lov va katalog standartlariga moslashgan.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="https://app.moysklad.uz/register"
                  className="inline-flex h-12 items-center rounded-md bg-[var(--brand-500)] px-6 font-medium text-base text-white hover:bg-[var(--brand-700)]"
                >
                  Bepul boshlash
                </a>
                <Link
                  href="/features"
                  className="inline-flex h-12 items-center rounded-md border border-slate-300 bg-white px-6 font-medium text-base text-slate-900 hover:border-slate-400"
                >
                  Imkoniyatlar
                </Link>
              </div>
              <p className="mt-3 text-slate-500 text-sm">
                Karta talab qilinmaydi · 14 kunlik bepul sinov
              </p>
            </div>
            <div className="relative">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-[var(--brand-100)] to-white p-12 text-center">
                  <div className="flex justify-center text-[var(--brand-500)]">
                    <BrandIcon name="dashboard" className="h-20 w-20" />
                  </div>
                  <p className="mt-4 font-medium text-slate-700 text-sm">
                    Dashboard ekrani
                  </p>
                  <p className="mt-1 text-slate-500 text-xs">
                    KPI · Sotuvlar · Pul oqimi · Vazifalar
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
        <div className="text-center">
          <h2 className="font-bold text-3xl text-slate-900">Barcha ehtiyojlar — bitta joyda</h2>
          <p className="mt-3 text-lg text-slate-600">
            Ko'p modulli tizim. Har bir bo'lim alohida ishlayotgan boshqa
            xizmatlardan ko'ra ko'p miqdorda kuchli.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <div className={f.color}>
                <BrandIcon name={f.icon} className="h-9 w-9" />
              </div>
              <h3 className="mt-4 font-semibold text-lg text-slate-900">{f.title}</h3>
              <p className="mt-2 text-slate-600 text-sm leading-relaxed">{f.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section className="border-slate-200 border-y bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <h2 className="text-center font-bold text-2xl text-slate-900">
            Mahalliy integratsiyalar
          </h2>
          <p className="mt-3 text-center text-slate-600">
            O'zbekiston bozori uchun maxsus tayyorlangan ulanmalar.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {INTEGRATIONS.map((i) => (
              <div
                key={i.name}
                className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4 text-center"
              >
                <div className="font-semibold text-slate-900">{i.name}</div>
                <div className="mt-1 text-slate-500 text-xs">{i.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="font-bold text-3xl text-slate-900">Hozir boshlang</h2>
        <p className="mt-3 text-lg text-slate-600">
          Bizning bulutli platformamiz bilan biznesingizni yangi darajaga olib chiqing.
        </p>
        <a
          href="https://app.moysklad.uz/register"
          className="mt-8 inline-flex h-12 items-center rounded-md bg-[var(--brand-500)] px-8 font-medium text-base text-white hover:bg-[var(--brand-700)]"
        >
          14 kunlik bepul sinov
        </a>
      </section>
    </>
  );
}
