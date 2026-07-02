import Link from 'next/link';

/**
 * Blog landing page. V1 ships with 6 evergreen pillar posts. Real CMS
 * integration follows in Sprint 34b — for now articles are static.
 */

interface Post {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  readMin: number;
  category: 'guides' | 'updates' | 'industries' | 'integrations';
}

const POSTS: Post[] = [
  {
    slug: 'nima-uchun-erp',
    title: 'Nima uchun kichik biznesga ERP kerak?',
    excerpt:
      'Excel jadvallaridan ERP-ga o\'tish — savdoyi 30%+ oshirish, ombor xatoliklarini yo\'q qilish, vaqt tejash. Real misollar va ROI hisobi.',
    publishedAt: '2026-04-15',
    readMin: 7,
    category: 'guides',
  },
  {
    slug: 'soliq-uz-edo-yondashuv',
    title: 'Soliq.uz EDO va e-faktura — to\'liq qo\'llanma',
    excerpt:
      'EHF formati nima, ECP bilan imzolash qanday ishlaydi, qanday qilib avtomat tarzda har sotuvdan keyin yuborish kerak.',
    publishedAt: '2026-04-08',
    readMin: 12,
    category: 'integrations',
  },
  {
    slug: 'asl-belgisi-markirovka',
    title: 'ASL Belgisi (markirovka) — qaysi tovar uchun majburiy',
    excerpt:
      'Alkohol, sigaret, dori, suv, oyoq kiyim, sut mahsulotlari. DataMatrix kod hayotiy yo\'li va biz buni qanday avtomat qilamiz.',
    publishedAt: '2026-03-30',
    readMin: 9,
    category: 'integrations',
  },
  {
    slug: 'ombor-yuritishni-yaxshilash',
    title: '5 ta xato — ombor yuritishda eng ko\'p uchraydigan',
    excerpt:
      'Manual hisob, FIFO buzilishi, inventarizatsiyada chetma-chet tekshirmaslik. Har birini avto bartaraf etish.',
    publishedAt: '2026-03-22',
    readMin: 6,
    category: 'guides',
  },
  {
    slug: 'kassir-smena-z-otchet',
    title: 'Kassir smenasi va Z-hisobot — to\'liq jarayon',
    excerpt:
      'Smena ochish, sotuv jarayoni, oraliq X-hisobot, smena yopish, Z-hisobot. Soliq tekshiruvi uchun kerakli barcha hujjatlar.',
    publishedAt: '2026-03-15',
    readMin: 8,
    category: 'guides',
  },
  {
    slug: 'apteka-uchun-erp',
    title: 'Apteka uchun ideal ERP — qanday tanlash',
    excerpt:
      'Dori muddati, MXIK kod, ASL Belgisi, multi-aptekachi xatti-harakati. Apteka domeni uchun kalit funksiyalar.',
    publishedAt: '2026-03-01',
    readMin: 10,
    category: 'industries',
  },
];

const CATEGORY_LABEL: Record<Post['category'], string> = {
  guides: 'Qo\'llanmalar',
  updates: 'Yangiliklar',
  industries: 'Sohalar',
  integrations: 'Integratsiyalar',
};

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-3 font-bold text-3xl">Blog</h1>
      <p className="mb-8 text-zinc-600">
        Foydali maqolalar, qo&apos;llanmalar, va ERP tajribalari.
      </p>

      <div className="space-y-8">
        {POSTS.map((post) => (
          <article
            key={post.slug}
            className="border-zinc-200 border-b pb-8 transition-opacity hover:opacity-90"
          >
            <div className="mb-2 flex items-center gap-3 text-sm text-zinc-500">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700 text-xs">
                {CATEGORY_LABEL[post.category]}
              </span>
              <time dateTime={post.publishedAt}>{post.publishedAt}</time>
              <span>· {post.readMin} daqiqa o&apos;qish</span>
            </div>
            <Link href={`/blog/${post.slug}`}>
              <h2 className="mb-2 font-semibold text-2xl hover:text-blue-600">{post.title}</h2>
            </Link>
            <p className="text-zinc-600">{post.excerpt}</p>
          </article>
        ))}
      </div>

      <section className="mt-16 rounded-lg bg-blue-50 p-8 text-center">
        <h2 className="mb-3 font-semibold text-xl">Yangi maqolalardan xabardor bo&apos;ling</h2>
        <p className="mb-4 text-sm text-zinc-700">
          Telegram kanal yoki email — siz xohlagandek yangiliklarni yuboramiz.
        </p>
        <Link
          href="/contact"
          className="inline-block rounded bg-blue-600 px-5 py-2 text-white transition hover:bg-blue-700"
        >
          Obuna bo&apos;lish
        </Link>
      </section>
    </main>
  );
}
