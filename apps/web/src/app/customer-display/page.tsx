'use client';

// Mijoz-ekran (Customer-Facing Display) — kassaning ORQASIDAGI ikkinchi
// monitor. Electron desktop qobig'i (`desktop/main.js`) bu sahifani HDMI
// orqali ulangan 2-ekranda fullscreen ochadi. Kassir savatga mahsulot qo'shsa,
// qobiq savatni IPC (`window.customerDisplay.onCart`) orqali shu oynaga
// uzatadi.
//
// Tuzilma (egasining maketi — `Kassa Ekrani v2.dc.html`, 2026-09-01):
//   • TEPA panel  — logo + tagline · kassa nomi · soat
//   • CHAP yarim  — buyurtmalar navbati → savat → to'lov bloki
//   • O'NG yarim  — savat bo'sh bo'lsa salomlashuv, aks holda mahsulot kartasi
//
// Bu oyna alohida Electron oynasi — kassir tokenini ko'rmaydi. Umumiy session
// cookie'si bo'yicha `refresh()` bilan o'zi token oladi. Rasm esa (Faza Q13)
// URL'da tokensiz yuklanadi: `refresh()` HttpOnly `ms_mt` media-cookie'sini
// ham o'rnatadi va same-origin `<img>` uni o'zi olib ketadi (jwt-auth.guard.ts).
//
// ── NAVBAT (egasining talabi) ───────────────────────────────────────────────
// Kassir «Omborchiga yuborish» bosganda chek `picking` holatiga o'tadi,
// omborchi yig'ib bo'lgach `ready` bo'ladi. Mijoz zalda kutib turadi va O'Z
// buyurtmasi tayyor bo'lganini shu ekrandan bilib oladi.
//
// 🔴 Navbat IPC payload'i orqali KELMAYDI — sahifa uni O'ZI so'raydi.
// Sabab (o'lchangan): `desktop/main.js` dagi `normalizeCart()` payload'ni oq
// ro'yxat bo'yicha qayta quradi (`lines` + `discountPct`), ya'ni qo'shilgan
// har qanday yangi maydon ESKI QOBIQDA YO'QOLADI va navbat uchun yangi `.exe`
// chiqarish kerak bo'lardi. Sahifa o'zi so'raganda esa bugungi qobiqda
// (v1.9.0) ham darhol ishlaydi — kassirlarga hech narsa o'rnatilmaydi.
//
// Brauzerda sinash (Electron'siz):  /customer-display?demo=1

import './cfd-theme.css';
import { api } from '@/lib/api-client';
import { getAccessToken, refresh } from '@/lib/auth-store';
import { normalizeQtyDecimal } from '@/lib/pos/cart-math';
import { scaleMinorByQty } from '@moysklad/money';
import { ShersetLogo, formatMoney } from '@moysklad/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** Maket o'lchami — sahna shu o'lchamda quriladi va ekranga moslashtiriladi. */
const STAGE_W = 1920;
const STAGE_H = 1080;

const CAROUSEL_MS = 5000;
/** Navbat so'rovi — kassirning `sotuv/page.tsx` dagi polling bilan bir ohangda. */
const QUEUE_POLL_MS = 8000;
/** Navbatda ko'rsatiladigan maksimal karta — qolgani «+N» bo'lib yig'iladi. */
const QUEUE_MAX_CARDS = 6;
/** Savat qatori balandligi (maket) — avto-aylanish masofasi shundan hisoblanadi. */
const ROW_H = 64;
const API = '/api/v1';

// ── IPC shartnomasi — kassir oynasi shu shaklda uzatadi ─────────────────────
interface CartLineDTO {
  productId: string;
  name: string;
  /**
   * Miqdor — `Decimal(20,6)` SATRi (kassir oynasi shunday uzatadi).
   *
   * Ilgari `number` edi va bu yerda `BigInt(l.quantity)` hisoblanardi:
   * og'irlik bilan sotilgan tovarda (`1.5`) **RangeError** otilib mijoz-ekran
   * oq bo'lib qolardi — POS savati bilan AYNI bug-klass (F8 audit).
   * Eski `number` payload ham qabul qilinadi (`number | string`).
   */
  quantity: number | string;
  priceMinor: string; // bigint IPC'da string sifatida uzatiladi
}
interface CartPayload {
  lines: CartLineDTO[];
  discountPct: number;
}

// Electron preload (preload-customer.js) ochadigan ko'prik.
interface CustomerBridge {
  onCart(cb: (payload: CartPayload) => void): void;
}
declare global {
  interface Window {
    customerDisplay?: CustomerBridge;
  }
}

// Bir mahsulotning displey uchun media'si (rasm URL + izoh).
interface Media {
  imageUrl: string | null;
  description: string | null;
}

/** Navbat kartasi — `/retail-sales` ro'yxatidan kerak bo'lgani. */
interface QueueSale {
  id: string;
  name: string;
}

// ── Demo (brauzer) uchun soxta savat — layout/karuselni Electron'siz ko'rish ──
const DEMO_PAYLOAD: CartPayload = {
  discountPct: 10,
  lines: [
    { productId: 'demo-1', name: 'sip 2x25', quantity: 2, priceMinor: '12000000' },
    { productId: 'demo-2', name: 'Kabel VVG 3x2.5', quantity: '1.5', priceMinor: '12500000' },
    {
      productId: 'demo-3',
      name: 'Delixi stabilizator 1500V',
      quantity: 1,
      priceMinor: '106000000',
    },
    { productId: 'demo-4', name: 'Chint 2p dif 63A', quantity: 2, priceMinor: '17800000' },
    { productId: 'demo-5', name: 'Alight led 60x60 120W', quantity: 4, priceMinor: '38000000' },
  ],
};
const DEMO_PICKING: QueueSale[] = [
  { id: 'd1', name: 'TRN-2026-02489' },
  { id: 'd3', name: 'TRN-2026-02490' },
];
const DEMO_READY: QueueSale[] = [{ id: 'd2', name: 'TRN-2026-02494' }];

export default function CustomerDisplayPage() {
  // `?demo=1` — brauzerda Electron'siz sinash. Lazy initializer bilan BIR MARTA
  // aniqlaymiz (state+effect emas) — aks holda auth-effekt demo aniqlanmasdan
  // oldin bir marta ishlab, keraksiz `refresh()` chaqirar va race tug'dirardi.
  // useSearchParams ishlatmaymiz: u Next build'da Suspense chegarasini talab qiladi.
  // `?demo=1` — to'la savat · `?demo=empty` — bo'sh savat (kutish holati,
  // ekran kun davomida ENG KO'P shu ko'rinishda turadi).
  const [demoMode] = useState<'off' | 'full' | 'empty'>(() => {
    if (typeof window === 'undefined') return 'off';
    const v = new URLSearchParams(window.location.search).get('demo');
    if (v === 'empty') return 'empty';
    return v === '1' ? 'full' : 'off';
  });
  const demo = demoMode !== 'off';

  const [payload, setPayload] = useState<CartPayload>({ lines: [], discountPct: 0 });
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [tokenReady, setTokenReady] = useState(false);

  // ── 1. Autentifikatsiya — umumiy cookie'dan token ol (Electron oynasi) ─────
  useEffect(() => {
    if (demo) {
      setTokenReady(true); // demo'da API chaqirilmaydi, token kerak emas
      return;
    }
    let alive = true;
    refresh()
      .then((ok) => {
        if (alive) setTokenReady(ok);
      })
      .catch(() => {
        if (alive) setTokenReady(false);
      });
    return () => {
      alive = false;
    };
  }, [demo]);

  // ── 2. Savat manbasi — demo / Electron IPC / brauzer BroadcastChannel ──────
  useEffect(() => {
    if (demo) {
      setPayload(demoMode === 'empty' ? { lines: [], discountPct: 0 } : DEMO_PAYLOAD);
      return;
    }
    // (a) Sherset dasturi — Electron IPC.
    if (typeof window !== 'undefined' && window.customerDisplay) {
      window.customerDisplay.onCart((p) => setPayload(p));
      return;
    }
    // (b) Brauzer oynasi (window.open) — kassa sahifasi bilan BroadcastChannel.
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('sherset-cart');
      ch.onmessage = (e) => {
        if (e.data?.type === 'cart' && e.data.payload) setPayload(e.data.payload as CartPayload);
      };
      ch.postMessage({ type: 'cfd-ready' }); // kassa sahifasidan joriy savatni so'rash
      return () => ch.close();
    }
    return undefined; // manba topilmadi (SSR / BroadcastChannel yo'q)
  }, [demo, demoMode]);

  const lines = payload.lines;
  const { picking, ready, cashDeskName } = useQueue(tokenReady, demo);

  // ── 3. Har mahsulot uchun media'ni bir marta yuklab, keshlab qo'yish ──────
  // (karusel 5s'da almashganda "sekin ochilish" bo'lmasin — oldindan preload.)
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!tokenReady || demo) return;
    for (const line of lines) {
      const id = line.productId;
      if (media[id] || inFlight.current.has(id)) continue;
      inFlight.current.add(id);
      void loadMedia(id).then((med) => {
        if (med.imageUrl) preload(med.imageUrl);
        setMedia((m) => ({ ...m, [id]: med }));
      });
    }
  }, [lines, media, tokenReady, demo]);

  const scale = useFitScale();
  const hasQueue = picking.length + ready.length > 0;

  return (
    <div
      className="cfd-theme relative h-screen w-screen overflow-hidden"
      style={{ background: 'var(--cfd-bg)' }}
    >
      {/* Maket 1920×1080 uchun ANIQ piksellarda chizilgan. Sahna shu o'lchamda
          quriladi va ekranga moslashtiriladi — shunda Windows masshtabi 100%,
          125% yoki 150% bo'lishidan qat'i nazar dizayn devorda BIR XIL fizik
          o'lchamda chiqadi.

          🔴 JOYLASHTIRISH — bu yerda 2026-09-01 da REGRESSIYA bo'lgan, takrorlanmasin:
          `transform: scale()` elementning LAYOUT o'lchamini o'zgartirmaydi —
          u brauzer uchun hamon 1920×1080 joy egallaydi. Shuning uchun ilgari
          ishlatilgan `grid place-items-center` uni markazlashtira OLMAGAN
          (grid konteynerdan katta elementni `(0,0)` ga qo'yadi), va sukutdagi
          `transform-origin: 960px 540px` vizual qutini o'ngga-pastga surib
          yuborgan. Natijada 1536×864 ekranda (1920×1080 @ 125%) dizaynning
          ~24% i ekrandan tashqarida qolgan — jonli televizorda o'ng tomon
          va past kesilgan.

          To'g'ri yo'l: `absolute` + `left/top: 50%` layout qutisining CHAP-YUQORI
          burchagini viewport markaziga qo'yadi, `translate(-50%, -50%)` esa uni
          O'Z (masshtablanmagan) yarim o'lchamiga qaytaradi. Natija matematik
          jihatdan har doim markazda: quti [W/2 − 960s, W/2 + 960s] oralig'ida. */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale ?? 1})`,
          // O'lchanmaguncha ko'rsatilmaydi — sababi `useFitScale` izohida.
          visibility: scale === null ? 'hidden' : 'visible',
          background: 'var(--cfd-bg)',
        }}
      >
        <TopBar cashDeskName={cashDeskName} />
        <div className="flex min-h-0 flex-1">
          <div
            className="box-border flex flex-col gap-9"
            style={{ width: STAGE_W / 2, padding: '44px 56px 48px' }}
          >
            <QueuePanel picking={picking} ready={ready} />
            <CartPanel lines={lines} hasQueue={hasQueue} />
            <PaymentPanel lines={lines} discountPct={payload.discountPct} />
          </div>
          <div
            className="box-border flex flex-col items-center justify-center"
            style={{
              width: STAGE_W / 2,
              padding: '56px 64px',
              gap: 34,
              background: 'var(--cfd-bg-right)',
              borderLeft: '1px solid var(--cfd-hairline)',
            }}
          >
            {lines.length === 0 ? <WelcomePanel /> : <FeaturedPanel lines={lines} media={media} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sahnani ekranga sig'dirish koeffitsiyenti.
 *
 * Maket 1920×1080. Televizor 4K bo'lsa (yoki Electron oynasi boshqa o'lchamda
 * ochilsa) CSS pikseli o'zgaradi va maketdagi o'lchamlar mos kelmay qoladi.
 * `scale` bilan sahna butunicha cho'ziladi/qisqaradi — nisbatlar saqlanadi.
 */
function useFitScale(): number | null {
  // 🔴 Boshlang'ich `null` — «hali o'lchanmagan». Sabab: sahifa serverda ham
  // chiziladi va o'sha yerda oyna o'lchami NOMA'LUM. Ilgari boshlang'ich `1`
  // edi va natijada har yuklanishda bir kadr davomida sahna to'liq 1920×1080
  // o'lchamda — ya'ni ekrandan chiqib ketgan holda — ko'rinardi: biz endigina
  // tuzatgan nuqsonning aynan o'zi, faqat qisqa muddat.
  //
  // `null` bo'lganda sahna `visibility: hidden` bilan chiziladi. Bu server va
  // brauzerning BIRINCHI render'ini bir xil qiladi (gidratatsiya nomuvofiqligi
  // yo'q) va mijoz buzuq kadrni umuman ko'rmaydi — fon ko'rinadi, keyin
  // to'g'ri o'lchamdagi sahna paydo bo'ladi.
  const [scale, setScale] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

/**
 * Navbat manbasi — sahifaning O'Z so'rovi (IPC EMAS, sababi fayl boshida).
 *
 * Har turda avval joriy smena-sessiyasi so'raladi: kassirlar bitta qurilmada
 * PIN bilan ALMASHADI (`auth/pos-pin/switch`), ya'ni sessiya sessiya davomida
 * o'zgarishi mumkin va uni bir marta keshlab qo'yib bo'lmaydi. `api` klienti
 * 401'da token'ni o'zi yangilaydi (`api-client.ts`) — shuning uchun kassir
 * almashganda ekran o'zi to'g'ri sessiyaga o'tadi.
 *
 * Xato bo'lsa navbat JIM bo'shab qoladi: savat va narx ishlashda davom etadi.
 * Mijoz oldidagi ekranda xato matni chiqarish savdodan yomonroq.
 */
function useQueue(
  tokenReady: boolean,
  demo: boolean,
): { picking: QueueSale[]; ready: QueueSale[]; cashDeskName: string | null } {
  const [picking, setPicking] = useState<QueueSale[]>([]);
  const [ready, setReady] = useState<QueueSale[]>([]);
  const [cashDeskName, setCashDeskName] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setPicking(DEMO_PICKING);
      setReady(DEMO_READY);
      setCashDeskName('Kassa №1');
      return;
    }
    if (!tokenReady) return;

    let alive = true;
    async function tick(): Promise<void> {
      try {
        const session = await api.get<{ id?: string; cashDesk?: { name?: string } } | null>(
          '/cashier-sessions/current',
        );
        if (!alive) return;
        setCashDeskName(session?.cashDesk?.name ?? null);
        if (!session?.id) {
          setPicking([]);
          setReady([]);
          return;
        }
        const q = `sessionId=${encodeURIComponent(session.id)}&limit=${QUEUE_MAX_CARDS}`;
        const [p, r] = await Promise.all([
          api.get<{ items?: QueueSale[] }>(`/retail-sales?${q}&state=picking`),
          api.get<{ items?: QueueSale[] }>(`/retail-sales?${q}&state=ready`),
        ]);
        if (!alive) return;
        setPicking(p?.items ?? []);
        setReady(r?.items ?? []);
      } catch {
        // Jim — yuqoridagi izohga qara.
      }
    }
    void tick();
    const id = setInterval(() => void tick(), QUEUE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tokenReady, demo]);

  return { picking, ready, cashDeskName };
}

/** Miqdorni server sxemasi shakliga keltiradi (`BigInt(1.5)` otilishini yopadi). */
function qtyStr(q: number | string): string {
  return normalizeQtyDecimal(String(q));
}

/** Qator summasi — miqdor × birlik narxi (server bilan bir xil fixed-point yo'l). */
function lineSum(l: CartLineDTO): bigint {
  return scaleMinorByQty(BigInt(l.priceMinor), qtyStr(l.quantity));
}

/**
 * Chek raqamini ikkiga bo'ladi: `TRN-2026-02494` → prefiks + `02494`.
 * Mijoz chekidagi oxirgi raqamlarni izlaydi, shuning uchun ular KATTA.
 * Ajratgich topilmasa butun satr «dum» bo'lib qoladi (hech narsa yo'qolmaydi).
 */
export function splitDocNo(name: string): { prefix: string; tail: string } {
  const at = name.lastIndexOf('-');
  if (at < 0 || at === name.length - 1) return { prefix: '', tail: name };
  return { prefix: name.slice(0, at + 1), tail: name.slice(at + 1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEPA PANEL — logo · kassa nomi · soat
// ─────────────────────────────────────────────────────────────────────────────
function TopBar({ cashDeskName }: { cashDeskName: string | null }) {
  const t = useTranslations('pages.customer_display');
  const locale = useLocale();
  // 🔴 Soat `null` dan boshlanadi va faqat mount'dan keyin to'ladi: server va
  // brauzer vaqti bir xil bo'lmasligi mumkin va React gidratatsiya nomuvofiqligi
  // haqida ogohlantirardi (ekran mijoz oldida — konsol xatosi kerak emas).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex flex-none items-center justify-between"
      style={{
        height: 88,
        padding: '0 56px',
        borderBottom: '1px solid var(--cfd-hairline)',
        background: 'var(--cfd-topbar-bg)',
      }}
    >
      <div className="flex items-center" style={{ gap: 20 }}>
        <ShersetLogo variant="white" height={34} />
        <div
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--cfd-dim)',
            letterSpacing: '0.04em',
          }}
        >
          {t('tagline')}
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 28 }}>
        {cashDeskName && (
          <>
            <div style={{ fontSize: 26, fontWeight: 500, color: 'var(--cfd-muted)' }}>
              {cashDeskName}
            </div>
            <div style={{ width: 1, height: 34, background: 'rgba(255,255,255,0.12)' }} />
          </>
        )}
        <div
          className="tabular-nums"
          style={{ fontSize: 34, fontWeight: 700, color: 'var(--cfd-ink)' }}
        >
          {now
            ? now.toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </div>
      </div>
    </div>
  );
}

/** Bo'lim sarlavhasi — yozuv + qolgan joyni to'ldiruvchi soch-chiziq (maket). */
function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      <div
        style={{
          fontSize: 23,
          fontWeight: 800,
          letterSpacing: '0.22em',
          color: 'var(--cfd-legend)',
        }}
      >
        {label}
      </div>
      <div className="flex-1" style={{ height: 1, background: 'var(--cfd-rule)' }} />
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAP-TEPA — buyurtmalar navbati
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navbat. TAYYOR buyurtma — TO'LDIRILGAN yashil karta, yig'ilayotgani esa to'q.
 *
 * Sabab (egasining maketidagi asosiy g'oya): mijoz zalda yurgan bo'ladi va
 * ekranga tikilib turmaydi. «Tayyor» holati periferik ko'rish bilan ilinishi
 * kerak — kichik chiroq buni uddalamaydi, to'la yashil karta uddalaydi.
 *
 * Tartib: TAYYOR birinchi. Mijoz ekranga aynan shuning uchun qaraydi.
 *
 * Summa ATAYLAB ko'rsatilmaydi (egasi, 2026-09-01): yonidagi odam kimning
 * qancha pul sarflaganini ko'rmasligi kerak. Faqat raqam va holat.
 */
export function QueuePanel({ picking, ready }: { picking: QueueSale[]; ready: QueueSale[] }) {
  const t = useTranslations('pages.customer_display');
  const cards = [
    ...ready.map((sale) => ({ sale, done: true })),
    ...picking.map((sale) => ({ sale, done: false })),
  ];
  if (cards.length === 0) return null; // navbat bo'sh — chiziq ham chizilmaydi

  const shown = cards.slice(0, QUEUE_MAX_CARDS);
  const rest = cards.length - shown.length;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <SectionHead label={t('queue_title')} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {shown.map(({ sale, done }) => (
          <QueueCard key={sale.id} sale={sale} done={done} />
        ))}
        {rest > 0 && (
          <div
            className="flex flex-col items-center justify-center"
            style={{
              border: '2px dashed rgba(255,255,255,0.15)',
              borderRadius: 20,
              gap: 2,
            }}
          >
            <div
              className="tabular-nums"
              style={{ fontSize: 44, fontWeight: 800, color: 'var(--cfd-muted)', lineHeight: 1 }}
            >
              +{rest}
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--cfd-dim)' }}>
              {t('in_queue')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ sale, done }: { sale: QueueSale; done: boolean }) {
  const t = useTranslations('pages.customer_display');
  const { tail } = splitDocNo(sale.name);

  if (done) {
    return (
      <div
        data-test-id="cfd-queue-card"
        data-state="ready"
        className="cfd-ready-pulse relative flex flex-col"
        style={{
          background: 'linear-gradient(150deg, var(--cfd-ready-from), var(--cfd-ready-to))',
          borderRadius: 20,
          padding: '18px 20px 16px',
          gap: 6,
        }}
      >
        {/* 🔴 Prefiks («TRN-2026-») ATAYLAB chizilmaydi: u navbatdagi HAR
            kartada bir xil, ya'ni zaldan qaraganda hech narsani ajratmaydi —
            faqat joy egallab, raqamni kichraytirardi. Mijoz chekidagi oxirgi
            raqamlar bo'yicha topadi va ular noyob. */}
        <div
          className="tabular-nums"
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: 'var(--cfd-ready-ink)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {tail}
        </div>
        <div className="flex items-center" style={{ gap: 10 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill="var(--cfd-ready-ink)" />
            <path
              d="m7.5 12.5 3 3 6-6.5"
              stroke="var(--cfd-ready-from)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: 'var(--cfd-ready-ink)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {t('queue_ready')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-test-id="cfd-queue-card"
      data-state="picking"
      className="flex flex-col"
      style={{
        background: 'var(--cfd-work-card)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '18px 20px 16px',
        gap: 6,
      }}
    >
      {/* Prefiks chizilmaydi — sababi yuqorida (tayyor karta). */}
      <div
        className="tabular-nums"
        style={{
          fontSize: 58,
          fontWeight: 800,
          color: 'var(--cfd-ink-soft)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {tail}
      </div>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span
          aria-hidden="true"
          className="cfd-lamp-glow inline-block"
          style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--cfd-work-lamp)' }}
        />
        <span style={{ fontSize: 28, fontWeight: 600, color: '#b9c8dd' }}>
          {t('queue_picking')}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAP-O'RTA — jonli savat
// ─────────────────────────────────────────────────────────────────────────────
function CartPanel({ lines, hasQueue }: { lines: CartLineDTO[]; hasQueue: boolean }) {
  const t = useTranslations('pages.customer_display');
  // Ekranga sig'adigan qator soni — navbat turgan bo'lsa joy kamayadi (maket).
  const rowCap = hasQueue ? 4 : 7;
  const overflows = lines.length > rowCap;

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: 18 }}>
      <SectionHead
        label={t('cart_title')}
        right={
          lines.length > 0 ? (
            <div
              style={{
                fontSize: 25,
                fontWeight: 600,
                color: 'var(--cfd-muted)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 999,
                padding: '4px 20px',
              }}
            >
              {t('items_count', { count: lines.length })}
            </div>
          ) : undefined
        }
      />

      {lines.length === 0 ? (
        <div className="grid flex-1 place-items-center">
          <div className="flex flex-col items-center" style={{ gap: 22, maxWidth: 560 }}>
            <svg width="88" height="88" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18H17.6a2 2 0 0 0 1.96-1.6L21 8H6"
                stroke="#31445f"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="21" r="1.4" fill="#31445f" />
              <circle cx="17" cy="21" r="1.4" fill="#31445f" />
            </svg>
            <div
              style={{
                fontSize: 36,
                fontWeight: 500,
                color: 'var(--cfd-dim)',
                textAlign: 'center',
              }}
            >
              {t('cart_empty')}
            </div>
          </div>
        </div>
      ) : (
        // Qatorlar sig'masa ro'yxat sekin aylanadi: mijoz-ekranda skroll qiladigan
        // odam yo'q, ya'ni sig'magan qator boshqa hech qachon ko'rinmasdi.
        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={
            overflows
              ? {
                  maskImage:
                    'linear-gradient(to bottom, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)',
                }
              : undefined
          }
        >
          <div
            className={overflows ? 'cfd-cart-scroll' : undefined}
            style={
              overflows
                ? ({
                    '--cfd-scroll-d': `-${(lines.length - rowCap) * ROW_H}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {lines.map((l) => (
              <div
                key={l.productId}
                className="flex items-baseline"
                style={{ minHeight: ROW_H, borderBottom: '1px solid var(--cfd-row-line)' }}
              >
                <div
                  className="flex-none tabular-nums"
                  style={{ width: 108, fontSize: 31, fontWeight: 700, color: 'var(--cfd-accent)' }}
                >
                  {qtyStr(l.quantity)}×
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 35, fontWeight: 600, color: 'var(--cfd-ink)', maxWidth: 460 }}
                >
                  {l.name}
                </div>
                <div className="flex-1" />
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: 35,
                    fontWeight: 700,
                    color: 'var(--cfd-ink)',
                    paddingLeft: 24,
                  }}
                >
                  {formatMoney(lineSum(l))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAP-PAST — to'lov bloki (ekranning eng yorqin elementi)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentPanel({ lines, discountPct }: { lines: CartLineDTO[]; discountPct: number }) {
  const t = useTranslations('pages.customer_display');
  if (lines.length === 0) return null;

  const subtotal = lines.reduce((sum, l) => sum + lineSum(l), 0n);
  const total = discountPct > 0 ? subtotal - (subtotal * BigInt(discountPct)) / 100n : subtotal;

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'linear-gradient(145deg, var(--cfd-pay-from), var(--cfd-pay-to))',
        borderRadius: 24,
        padding: '32px 44px',
        gap: 8,
        boxShadow: '0 18px 50px rgba(30,90,168,0.35)',
      }}
    >
      {discountPct > 0 && (
        <div
          className="flex items-baseline justify-between"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.25)',
            paddingBottom: 14,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 31, fontWeight: 600, color: 'var(--cfd-pay-sub)' }}>
            {t('discount')} ({discountPct}%)
          </div>
          <div
            className="tabular-nums"
            style={{ fontSize: 35, fontWeight: 700, color: 'var(--cfd-pay-discount)' }}
          >
            −{formatMoney(subtotal - total)}
          </div>
        </div>
      )}
      <div className="flex items-baseline justify-between" style={{ gap: 20 }}>
        <div
          className="flex-none"
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          {t('total')}
        </div>
        {/* 🔴 Raqam va valyuta AJRATILGAN (maket), lekin tiyin QOLDIRILGAN:
            chegirma bo'linishi butun bo'lmagan qoldiq berishi mumkin va
            ekranda chekdagidan boshqa summa turishi bu ekranning butun
            maqsadini buzardi. O'lcham shunga qarab tanlangan — 8 xonali
            summa ham («12 000 000,00») kartaga sig'adi. */}
        <div className="flex items-baseline" style={{ gap: 12, minWidth: 0 }}>
          <div
            className="tabular-nums"
            style={{ fontSize: 60, fontWeight: 900, color: '#fff', lineHeight: 1 }}
          >
            {formatMoney(total, 'UZS', { displayAs: 'none' })}
          </div>
          <div
            className="flex-none"
            style={{ fontSize: 30, fontWeight: 600, color: 'var(--cfd-pay-sub)' }}
          >
            {t('som')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O'NG YARIM — salomlashuv (savat bo'sh) yoki mahsulot kartasi
// ─────────────────────────────────────────────────────────────────────────────
function WelcomePanel() {
  const t = useTranslations('pages.customer_display');
  return (
    <div className="flex flex-col items-center" style={{ gap: 30 }}>
      <ShersetLogo variant="white" height={104} />
      <div style={{ fontSize: 34, fontWeight: 500, color: '#7c8ea8', letterSpacing: '0.06em' }}>
        {t('tagline')}
      </div>
      <div style={{ width: 120, height: 6, borderRadius: 3, background: 'var(--cfd-brand)' }} />
      <div style={{ fontSize: 54, fontWeight: 700, color: 'var(--cfd-ink-soft)' }}>
        {t('welcome')}
      </div>
    </div>
  );
}

/**
 * Mahsulot kartasi — savatdagi tovarlar `CAROUSEL_MS` da bir almashadi.
 * Pastdagi progress-chiziq keyingi almashuvgacha qancha qolganini ko'rsatadi
 * (maket): mijoz ekran «qotib qolgan» deb o'ylamaydi.
 */
function FeaturedPanel({
  lines,
  media,
}: {
  lines: CartLineDTO[];
  media: Record<string, Media>;
}) {
  const t = useTranslations('pages.customer_display');
  const [index, setIndex] = useState(0);
  const prevLen = useRef(0);

  // Yangi mahsulot qo'shilsa — darhol o'shani ko'rsat (mijoz o'zi olganini ko'rsin).
  useEffect(() => {
    if (lines.length > prevLen.current) setIndex(lines.length - 1);
    if (lines.length === 0) setIndex(0);
    else if (index >= lines.length) setIndex(lines.length - 1);
    prevLen.current = lines.length;
  }, [lines.length, index]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), CAROUSEL_MS);
    return () => clearInterval(id);
  }, [lines.length]);

  const current = lines[Math.min(index, lines.length - 1)];
  if (!current) return null;
  const med = media[current.productId];

  return (
    <>
      <div
        className="grid place-items-center overflow-hidden"
        style={{
          width: 720,
          height: 460,
          borderRadius: 28,
          background: 'var(--cfd-media-box)',
          border: '1px solid var(--cfd-hairline)',
          position: 'relative',
        }}
      >
        {med?.imageUrl ? (
          <img
            key={current.productId}
            src={med.imageUrl}
            alt={current.name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <>
            <ShersetLogo variant="white" height={96} className="opacity-20" />
            <div
              style={{
                position: 'absolute',
                bottom: 22,
                right: 26,
                fontSize: 22,
                fontWeight: 500,
                color: '#44597a',
              }}
            >
              {t('photo_soon')}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center" style={{ gap: 14, maxWidth: 790 }}>
        {lines.length > 1 && (
          <div
            className="tabular-nums"
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--cfd-accent)',
              background: 'rgba(30,90,168,0.25)',
              border: '1px solid rgba(127,178,236,0.25)',
              borderRadius: 999,
              padding: '5px 22px',
            }}
          >
            {index + 1} / {lines.length}
          </div>
        )}
        <div
          style={{
            fontSize: 62,
            fontWeight: 800,
            color: 'var(--cfd-ink)',
            textAlign: 'center',
            lineHeight: 1.15,
          }}
        >
          {current.name}
        </div>
        {med?.description && (
          <div
            style={{
              fontSize: 33,
              fontWeight: 500,
              color: 'var(--cfd-muted)',
              textAlign: 'center',
            }}
          >
            {med.description}
          </div>
        )}
        <div
          className="tabular-nums"
          style={{ fontSize: 46, fontWeight: 800, color: 'var(--cfd-accent)', marginTop: 6 }}
        >
          {formatMoney(BigInt(current.priceMinor))}
        </div>
      </div>

      {lines.length > 1 && (
        <div
          style={{
            width: 280,
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          {/* `key` — indeks o'zgarganda chiziq boshidan qayta yuguradi. */}
          <div
            key={index}
            className="cfd-rotate-bar"
            style={
              {
                height: '100%',
                borderRadius: 3,
                background: 'var(--cfd-accent)',
                '--cfd-rotate-dur': `${CAROUSEL_MS}ms`,
              } as React.CSSProperties
            }
          />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Yordamchilar
// ─────────────────────────────────────────────────────────────────────────────

// Rasmni oldindan brauzer keshiga yuklaydi (5s almashuvda "sekin ochilish" yo'q).
function preload(url: string): void {
  if (typeof window === 'undefined') return;
  const img = new window.Image();
  img.src = url;
}

// Bitta mahsulotning asosiy rasm URL'i + izohini yuklaydi.
// Faza Q13: rasm URL'ida token YO'Q — `<img>` bearer header yubormaydi, lekin
// so'rov same-origin, shuning uchun HttpOnly `ms_mt` media-cookie'si o'zi
// ketadi (bu oyna `refresh()` chaqirganda o'rnatilgan). JSON so'rovlari
// avvalgidek bearer bilan.
async function loadMedia(productId: string): Promise<Media> {
  const token = getAccessToken();
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const [imageUrl, description] = await Promise.all([
    fetchMainImageUrl(productId, auth),
    fetchDescription(productId, auth),
  ]);
  return { imageUrl, description };
}

interface ImageItem {
  id: string;
  isMain: boolean;
  position: number;
}

async function fetchMainImageUrl(
  productId: string,
  auth: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(`${API}/products/${productId}/images`, {
      headers: { Accept: 'application/json', ...auth },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: ImageItem[] };
    const items = body.items ?? [];
    if (items.length === 0) return null;
    const main =
      items.find((i) => i.isMain) ?? [...items].sort((a, b) => a.position - b.position)[0];
    if (!main) return null;
    return `${API}/images/${main.id}/raw`;
  } catch {
    return null;
  }
}

async function fetchDescription(
  productId: string,
  auth: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(`${API}/products/${productId}`, {
      headers: { Accept: 'application/json', ...auth },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { description?: string | null };
    return body.description ?? null;
  } catch {
    return null;
  }
}
