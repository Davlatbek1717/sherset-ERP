import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Maxfiylik siyosati',
  description: "MoySklad ERP — foydalanuvchi ma'lumotlarini qayta ishlash siyosati.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-bold text-3xl text-slate-900">Maxfiylik siyosati</h1>
      <p className="mt-2 text-slate-500 text-sm">Oxirgi yangilangan: 2026-04-27</p>

      <div className="prose prose-slate mt-8 max-w-none text-slate-700 leading-relaxed">
        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          1. Qaysi ma'lumotlarni yig'amiz
        </h2>
        <p>
          1.1. <strong>Hisob ma'lumotlari</strong>: ism, email, telefon raqami,
          tashkilot nomi.
          <br />
          1.2. <strong>Biznes ma'lumotlar</strong>: tizimga siz kiritgan
          mahsulotlar, kontragentlar, hujjatlar, hisobotlar.
          <br />
          1.3. <strong>Texnik ma'lumotlar</strong>: brauzer turi, IP, audit
          jurnali (kim qachon nima qilgan).
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          2. Ma'lumotlardan qanday foydalanamiz
        </h2>
        <p>
          2.1. Xizmatni taqdim etish va sifatini ta'minlash.
          <br />
          2.2. Foydalanuvchi bilan aloqa (texnik xabarnomalar, yangiliklar).
          <br />
          2.3. Statistik tahlil (anonim agregatsiya).
          <br />
          2.4. Soliq va qonunchilik talablariga muvofiq audit.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          3. Ma'lumotlar himoyasi
        </h2>
        <p>
          3.1. Barcha ma'lumotlar shifrlangan kanallar (TLS 1.3) orqali
          uzatiladi.
          <br />
          3.2. Ma'lumotlar bazasidagi hisob parollari argon2id bilan
          xeshlanadi.
          <br />
          3.3. Mijoz ma'lumotlari faqat shu mijoz hisobidan kirib
          ko'rinadi (account-level isolation).
          <br />
          3.4. Backup ma'lumotlari shifrlangan holda saqlanadi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          4. Uchinchi tomonlar
        </h2>
        <p>
          Ma'lumotlaringiz hech qachon uchinchi tomonlarga reklama yoki marketing
          maqsadida sotilmaydi. Faqat siz tomondan ulangan integratsiyalar
          (Soliq.uz EDO, Payme va h.k.) o'sha xizmat doirasida ma'lumot
          almashishiga ruxsat oladi.
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">
          5. Foydalanuvchi huquqlari
        </h2>
        <p>
          5.1. <strong>Ko'rish</strong> — istalgan vaqtda hisobingizdagi
          ma'lumotlarni ko'rish huquqi.
          <br />
          5.2. <strong>O'zgartirish / o'chirish</strong> — eski ma'lumotlarni
          o'zgartirish yoki o'chirish.
          <br />
          5.3. <strong>Eksport</strong> — barcha ma'lumotlaringizni JSON/CSV
          formatda yuklab olish.
          <br />
          5.4. <strong>Hisobni o'chirish</strong> — talabga ko'ra hisob butunlay
          o'chiriladi (audit jurnali qonun talablari uchun saqlanadi).
        </p>

        <h2 className="mt-8 font-semibold text-xl text-slate-900">6. Aloqa</h2>
        <p>
          Maxfiylik bo'yicha har qanday savollar uchun:
          <br />
          <strong>privacy@moysklad.uz</strong>
        </p>
      </div>
    </article>
  );
}
