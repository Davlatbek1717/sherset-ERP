import Link from 'next/link';

/**
 * Industries landing — solutions tailored per vertical (mirrors moysklad.uz
 * "Sohalar uchun yechimlar" section). Each industry gets:
 *  - Hook line (problem statement specific to that industry)
 *  - 3-5 features that matter most
 *  - Suggested module path
 *
 * V1 ships 12 verticals — the most-requested in UZ market. Adding more
 * is one entry in the INDUSTRIES array.
 */

interface Industry {
  slug: string;
  title: string;
  hook: string;
  features: string[];
  /** Path inside /app — what to direct the trial signup to. */
  primaryModule: string;
}

const INDUSTRIES: Industry[] = [
  {
    slug: 'apteka',
    title: 'Aptekalar',
    hook: 'Soliq.uz markirovkasi · Dori serial muddatini avto-tekshirish · MXIK kodlari · POS chek',
    features: [
      'ASL Belgisi DataMatrix qo\'llab-quvvatlash',
      'Dori muddati FIFO + ekspirasiya alert',
      'Soliq.uz EHF avtomat yuborish',
      'Multi-aptekachi sotuv tarixi (MA / FA)',
    ],
    primaryModule: 'retail',
  },
  {
    slug: 'restoran',
    title: 'Restoranlar va kafelar',
    hook: 'Modifikatorlar (kam tuz / extra cheese) · Stol xizmati · Kuxnya printerlari · Smena yopish',
    features: [
      'Menyu modifikatsiyalari',
      'Stol-bazasi POS terminal',
      'Kuxnya/bar printer marshrutlash',
      'Inventarizatsiya kuniga 2 marta',
    ],
    primaryModule: 'retail',
  },
  {
    slug: 'do\'kon',
    title: 'Do\'konlar va supermarketlar',
    hook: 'Barkod skanerlash · Multi-kassir · Loyalti dasturi · Aksiyalar',
    features: [
      'EAN/UPC barkod tezkor sotuv',
      'Bonus dasturi (Sprint 24)',
      'Aksiya / chegirma qoidalari',
      'Smena hisobotlari (X / Z)',
    ],
    primaryModule: 'retail',
  },
  {
    slug: 'ulgurji',
    title: 'Ulgurji savdo',
    hook: 'Multi-narx turlari · Mijoz qarzi · Kontrakt narxlari · Toll faqturasi',
    features: [
      'Klient pricing tier (5+ narx turi)',
      'Kontrakt asosida narxlar',
      'Counterparty balance',
      'Faktura batch yaratish',
    ],
    primaryModule: 'sales',
  },
  {
    slug: 'ishlab-chiqarish',
    title: 'Ishlab chiqarish',
    hook: 'BOM (recipe) · Multi-stage operatsiyalar · Tex karta · Norma',
    features: [
      'Bill of Materials bilan komplekt yig\'ish',
      'Production order FSM',
      'Tex karta (ProcessingPlan) ko\'p bosqichli',
      'Komponent FIFO consumption',
    ],
    primaryModule: 'production',
  },
  {
    slug: 'xizmat',
    title: 'Xizmatlar',
    hook: 'Service Desk · Ish vaqti hisobi · Tasks · CRM voronka',
    features: [
      'Service Desk (Sprint 20)',
      'Tasks + Calendar',
      'Pipeline / Kanban',
      'Mijoz qo\'ng\'iroq jurnali',
    ],
    primaryModule: 'crm',
  },
  {
    slug: 'avtomashina',
    title: 'Avtomobil zapchastlari',
    hook: 'VIN qidiruv · O\'zaro almashtirish · Ko\'p brand katalogi · MXIK',
    features: [
      'Variants matrix (modifikatsiya)',
      'Bundle (komplekt) sotuvi',
      'Ta\'minlovchi orderlar batch',
      'Shtrix-kod printer',
    ],
    primaryModule: 'goods',
  },
  {
    slug: 'qurilish',
    title: 'Qurilish materiallari',
    hook: 'Bo\'lim/zona ombor · Yetkazib berish rejasi · M3 / M2 / kg birliklar · Chala summa',
    features: [
      'Multi-zone warehouse',
      'Loss + Enter cost basis',
      'Inventory variance hisoboti',
      'B2B Faktura batch',
    ],
    primaryModule: 'stock',
  },
  {
    slug: 'tikuvchilik',
    title: 'Tikuvchilik / kiyim do\'koni',
    hook: 'O\'lchov × rang matritsa · Sezon · Ranglar palitrasi · Sotuv chegirmasi',
    features: [
      'Variant (size/color) matrix',
      'Lot / partiya tracking',
      'PriceType: oddiy + sezon',
      'Bonus dasturi sotuv tarixi',
    ],
    primaryModule: 'goods',
  },
  {
    slug: 'elektronika',
    title: 'Elektronika',
    hook: 'Serial raqam tracking · Kafolat · Service Desk · Trade-in',
    features: [
      'Marking codes per-unit',
      'Service request linkage',
      'Warranty start dating',
      'Trade-in via SalesReturn',
    ],
    primaryModule: 'goods',
  },
  {
    slug: 'kosmetika',
    title: 'Kosmetika',
    hook: 'Sezon kolleksiya · Markirovka · Tester / sample · Aksiya',
    features: [
      'ASL Belgisi (markirovka)',
      'Test sample alohida lot',
      'Bonus / loyalti integration',
      'Multi-store transfer',
    ],
    primaryModule: 'retail',
  },
  {
    slug: 'ulgurji-oziq-ovqat',
    title: 'Oziq-ovqat ulgurji',
    hook: 'Muddat (best-before) · Trafik / mavsumiy talab · Soliq EHF · MXIK',
    features: [
      'Expiry FIFO + alert',
      'Avtopilot to\'lov rejasi',
      'EHF tax flow (Sprint 27)',
      'Bank statement import',
    ],
    primaryModule: 'goods',
  },
];

export default function IndustriesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-3 font-bold text-3xl">Soha bo&apos;yicha yechimlar</h1>
      <p className="mb-8 max-w-2xl text-zinc-600">
        Har soha uchun moslashtirilgan ish jarayoni va modul to&apos;plami. moysklad.uz
        platformasi ustida quriladi — barcha boshqaruv funksiyalari bir tizimda.
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {INDUSTRIES.map((industry) => (
          <article
            key={industry.slug}
            className="rounded-lg border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <h2 className="mb-2 font-semibold text-xl">{industry.title}</h2>
            <p className="mb-4 text-sm text-zinc-600">{industry.hook}</p>
            <ul className="mb-4 space-y-1 text-sm">
              {industry.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span className="text-zinc-700">{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/industries/${industry.slug}`}
              className="text-blue-600 text-sm hover:underline"
            >
              Batafsil →
            </Link>
          </article>
        ))}
      </div>

      <section className="mt-16 rounded-lg bg-zinc-50 p-8 text-center">
        <h2 className="mb-3 font-semibold text-2xl">Sizning sohangiz ro&apos;yxatda yo&apos;qmi?</h2>
        <p className="mb-6 text-zinc-600">
          Moysklad clone har soha uchun moslashtirilishi mumkin. Bizga aytib bering — alohida
          yechim taklif qilamiz.
        </p>
        <Link
          href="/contact"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700"
        >
          Bog&apos;lanish
        </Link>
      </section>
    </main>
  );
}
