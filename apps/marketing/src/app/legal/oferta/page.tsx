import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ommaviy oferta',
  description: 'MoySklad ERP foydalanish shartlari (ommaviy oferta).',
};

export default function OfertaPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-bold text-3xl text-slate-900">Ommaviy oferta</h1>
      <p className="mt-2 text-slate-500 text-sm">Oxirgi yangilangan: 2026-04-27</p>

      <div className="prose prose-slate mt-8 max-w-none text-slate-700 leading-relaxed">
        <p>
          Bu hujjat MoySklad ERP tizimi (keyingi o'rinlarda — "Xizmat") foydalanish
          shartlarini belgilaydi. Tizimdan foydalanish orqali siz quyidagi
          shartlarga rozi bo'lasiz.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">1. Umumiy qoidalar</h2>
        <p>
          1.1. Xizmat O'zbekiston Respublikasi qonunchiligiga muvofiq taqdim
          etiladi.
          <br />
          1.2. Xizmat — bulutli SaaS platforma. Foydalanuvchi internet orqali
          kiradi va o'z ma'lumotlarini saqlaydi.
          <br />
          1.3. Bu hujjat Foydalanuvchi va Xizmat ko'rsatuvchi o'rtasidagi
          shartnoma sanaladi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          2. Foydalanuvchining majburiyatlari
        </h2>
        <p>
          2.1. Tizimga kiritilgan ma'lumotlarning to'g'riligi uchun javobgar.
          <br />
          2.2. Hisob ma'lumotlarini boshqalarga oshkor qilmaydi.
          <br />
          2.3. Tizimdan O'zbekiston qonunchiligiga zid maqsadlarda
          foydalanmaydi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          3. Ma'lumotlar himoyasi
        </h2>
        <p>
          Foydalanuvchi ma'lumotlarining maxfiyligi alohida{' '}
          <a
            href="/legal/privacy"
            className="text-[var(--brand-500)] underline hover:text-[var(--brand-700)]"
          >
            Maxfiylik siyosati
          </a>{' '}
          hujjati bilan tartibga solinadi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">4. To'lov va tariflar</h2>
        <p>
          4.1. Tariflar narxlari alohida sahifada e'lon qilinadi.
          <br />
          4.2. Bepul tarif cheklangan funksiyalarni o'z ichiga oladi.
          <br />
          4.3. Pulli tariflar oldindan to'lov asosida ishlaydi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          5. Yakuniy qoidalar
        </h2>
        <p>
          Xizmat ko'rsatuvchi ushbu hujjat shartlarini istalgan vaqtda
          o'zgartirish huquqini saqlaydi. O'zgarishlar haqida foydalanuvchilar
          email orqali xabardor qilinadi.
        </p>

        <p className="mt-8 text-slate-500 text-sm">
          Savollar bo'lsa: <strong>support@moysklad.uz</strong>
        </p>
      </div>
    </article>
  );
}
