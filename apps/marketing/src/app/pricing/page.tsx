import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tariflar',
  description: "Sherset ERP — turli o'lchamdagi bizneslar uchun moslashuvchan tariflar.",
};

const TIERS = [
  {
    name: 'Bepul',
    price: '0',
    period: '/oyiga',
    description: 'Yangi boshlovchilar uchun',
    features: [
      '1 foydalanuvchi',
      '1 ombor',
      '50 hujjat / oy',
      'Asosiy hisobotlar',
      'CBRU valyuta kursi',
    ],
    cta: 'Bepul boshlash',
    highlighted: false,
  },
  {
    name: 'Standart',
    price: '199 000',
    period: "so'm / oyiga",
    description: "O'sayotgan bizneslar uchun",
    features: [
      '5 foydalanuvchi',
      '5 ombor',
      'Cheklanmagan hujjatlar',
      'Barcha hisobotlar + dashboard',
      'CRM va voronka',
      'Chakana savdo (POS)',
      'CSV import/eksport',
    ],
    cta: 'Sinov uchun',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '499 000',
    period: "so'm / oyiga",
    description: "Ko'p tarmoqli kompaniyalar uchun",
    features: [
      '20 foydalanuvchi',
      'Cheklanmagan ombor',
      'Ishlab chiqarish moduli',
      'Onlayn savdo integratsiyasi',
      'API kirish',
      "Prioritet qo'llab-quvvatlash",
      'Maxsus integratsiyalar',
    ],
    cta: "Bog'lanish",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="text-center">
        <h1 className="font-bold text-4xl text-slate-900">Tariflar</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
          Sizning bizneszingiz hajmiga mos tarifni tanlang. Istalgan vaqtda yangilash mumkin.
        </p>
      </div>
      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <article
            key={t.name}
            className={
              t.highlighted
                ? 'relative rounded-xl border-2 border-[var(--brand-500)] bg-white p-8 shadow-xl'
                : 'rounded-xl border border-slate-200 bg-white p-8'
            }
          >
            {t.highlighted && (
              <div className="-top-3 -translate-x-1/2 absolute left-1/2 rounded-full bg-[var(--brand-500)] px-3 py-0.5 font-medium text-white text-xs">
                Mashhur
              </div>
            )}
            <h2 className="font-semibold text-2xl text-slate-900">{t.name}</h2>
            <p className="mt-1 text-slate-600 text-sm">{t.description}</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="font-bold text-4xl text-slate-900 tabular-nums">{t.price}</span>
              <span className="text-slate-600 text-sm">{t.period}</span>
            </div>
            <a
              href="https://app.moysklad.uz/register"
              className={
                t.highlighted
                  ? 'mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[var(--brand-500)] font-medium text-white hover:bg-[var(--brand-700)]'
                  : 'mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white font-medium text-slate-900 hover:border-slate-400'
              }
            >
              {t.cta}
            </a>
            <ul className="mt-8 space-y-3 border-slate-200 border-t pt-6">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-slate-700 text-sm">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-12 text-center text-slate-500 text-sm">
        Barcha tariflar QQS bilan ko'rsatilgan. To'lov so'mda yoki bank o'tkazmasi orqali.
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 0 1.42l-7.5 7.5a1 1 0 0 1-1.41 0l-3.5-3.5a1 1 0 1 1 1.41-1.42l2.79 2.8 6.79-6.8a1 1 0 0 1 1.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
