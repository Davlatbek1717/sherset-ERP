import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Imkoniyatlar',
  description:
    'Sherset ERP tizimining 14 ta moduli — savdo, ombor, pul, CRM, ' +
    'hisobotlar, chakana savdo, ishlab chiqarish va boshqalar.',
};

const SECTIONS = [
  {
    title: 'Savdo va xaridlar',
    items: [
      'Mijoz buyurtmalari (8 holat FSM)',
      'Otgazma va schyot-faktura',
      "Ta'minotchi buyurtmalari",
      'Qaytarishlar (sotuvchidan / mijozga)',
      "To'liq E2E oqim: buyurtma → otgazma → schyot → to'lov",
    ],
  },
  {
    title: 'Ombor',
    items: [
      'Real vaqt qoldiqlari (materializatsiyalashgan)',
      'FIFO partiya hisobi',
      "Ko'chirish, inventarizatsiya, daromad/chiqim",
      'Salbiy stok ruxsati per-ombor sozlamasi',
      'Soliq-qabul ledgeri (audit-ready append-only)',
    ],
  },
  {
    title: 'Pul',
    items: [
      'Naqd kassalar va bank hisoblari',
      'Kirim/chiqim orderlar (PKO/RKO)',
      'Bank vypiska CSV import',
      'Kontragent qarzlari (debitor/kreditor)',
      'CBRU valyuta kursi LIVE',
    ],
  },
  {
    title: 'CRM',
    items: [
      'Kontragentlar (UZ STIR validatsiya)',
      "Kontakt shaxslar va qo'ng'iroqlar jurnali",
      'Sotuvlar voronkasi (Pipeline + Stage)',
      "Kanban ko'rinish (drag-and-drop)",
      'Vazifalar (Tasks)',
    ],
  },
  {
    title: 'Hisobotlar',
    items: [
      'Sotuvlar (10 ta groupBy rejim)',
      'Pul oqimi (4 jadval UNION)',
      'Foyda/zarar (P&L)',
      'Qoldiqlar (per-ombor + product roll-up)',
      'Kontragent qarzlari',
      'Bosh sahifa dashboard charts',
    ],
  },
  {
    title: 'Chakana savdo',
    items: [
      'Kassir interfeysi',
      'Smenalar (atomic open/close)',
      'Cheklarlar (Stock cascade)',
      'Z-hisobot',
      'Termo printer template',
    ],
  },
  {
    title: 'Ishlab chiqarish',
    items: [
      'BOM (Bill of Materials)',
      'Ishlab chiqarish topshiriqlari (Work Orders)',
      'Avtomatik komponent dekrement',
      'Tayyor mahsulot inkrement',
      'Cancel-after-complete teskari kaskad',
    ],
  },
  {
    title: 'Mahalliy integratsiyalar',
    items: [
      'CBRU valyuta kursi (LIVE)',
      "MXIK katalog (qo'lda + CSV import)",
      'Soliq EDO (kelajak)',
      "Payme/Click/Uzum to'lovlari (kelajak)",
      'Eskiz SMS (kelajak)',
      'VCR REGOS fiskal (kelajak)',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="text-center">
        <h1 className="font-bold text-4xl text-slate-900">Imkoniyatlar</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
          Biznesingiz uchun zarur bo'lgan barcha modullar — bitta tizimda.
        </p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <article key={s.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-slate-900 text-xl">{s.title}</h2>
            <ul className="mt-4 space-y-2">
              {s.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-slate-700 text-sm">
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 0 1.42l-7.5 7.5a1 1 0 0 1-1.41 0l-3.5-3.5a1 1 0 1 1 1.41-1.42l2.79 2.8 6.79-6.8a1 1 0 0 1 1.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
