import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Biz haqimizda',
  description: "Sherset — O'zbekiston bozori uchun tayyorlangan zamonaviy ERP tizim.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-bold text-4xl text-slate-900">Biz haqimizda</h1>
      <div className="prose prose-slate mt-8 max-w-none text-lg text-slate-700 leading-relaxed">
        <p>
          Sherset O'zbekiston bozori uchun maxsus tayyorlangan bulutli ERP tizimidir. Mijozlarimiz
          savdo, ombor, pul va CRM jarayonlarini bitta tizimda boshqarishlari uchun moslashuvchan
          platforma yaratdik.
        </p>
        <h2 className="mt-10 font-semibold text-2xl text-slate-900">Bizning maqsadimiz</h2>
        <p>
          O'zbekiston bizneslariga zamonaviy, tezkor va arzon ERP yechimini taqdim etish. Mahalliy
          soliq, to'lov va katalog standartlariga to'liq mos kelishni ta'minlaymiz.
        </p>
        <h2 className="mt-10 font-semibold text-2xl text-slate-900">Tamoyillarimiz</h2>
        <ul>
          <li>Sifat — har funksiya to'liq ishlaydi, "keyinroq tuzataman" yo'q</li>
          <li>Halollik — biz nima qila olamiz va qila olmaymiz, aniq aytamiz</li>
          <li>Mahalliy — har bir element O'zbekiston bizneslari uchun moslangan</li>
          <li>Tezkor — yangi imkoniyatlar haftalik chiqadi</li>
        </ul>
      </div>
    </article>
  );
}
