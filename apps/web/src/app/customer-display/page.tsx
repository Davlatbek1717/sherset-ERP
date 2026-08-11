'use client';

// Mijoz-ekran (Customer-Facing Display) — kassaning ORQASIDAGI ikkinchi
// monitor. Electron desktop qobig'i (sherset-desktop/desktop/main.js) bu
// sahifani HDMI orqali ulangan 2-ekranda fullscreen ochadi. Kassir savatga
// mahsulot qo'shsa, qobiq savatni IPC (`window.electronAPI.onCart`) orqali shu
// oynaga uzatadi.
//
// Ekran ikkiga bo'linadi:
//   • CHAP yarim  — jonli savat (nom, soni, narx, summa) + jami/chegirma/to'lov
//   • O'NG yarim — har 5 sekundda savatdagi mahsulotning KATTA rasmi + izohi
//
// Bu oyna alohida Electron oynasi — kassir tokenini ko'rmaydi. Umumiy session
// cookie'si bo'yicha `refresh()` bilan o'zi token oladi. Rasm esa (Faza Q13)
// URL'da tokensiz yuklanadi: `refresh()` HttpOnly `ms_mt` media-cookie'sini
// ham o'rnatadi va same-origin `<img>` uni o'zi olib ketadi (jwt-auth.guard.ts).
//
// Brauzerda sinash (Electron'siz):  /customer-display?demo=1

import { getAccessToken, refresh } from '@/lib/auth-store';
import { normalizeQtyDecimal } from '@/lib/pos/cart-math';
import { scaleMinorByQty } from '@moysklad/money';
import { ShersetLogo, formatMoney } from '@moysklad/ui';
import { useEffect, useRef, useState } from 'react';

const CAROUSEL_MS = 5000;
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

// ── Demo (brauzer) uchun soxta savat — layout/karuselni Electron'siz ko'rish ──
const DEMO_PAYLOAD: CartPayload = {
  discountPct: 10,
  lines: [
    { productId: 'demo-1', name: 'Coca-Cola 1.5L', quantity: 2, priceMinor: '1200000' },
    { productId: 'demo-2', name: 'Nestle suv 0.5L', quantity: 3, priceMinor: '350000' },
    { productId: 'demo-3', name: 'Snickers 50g', quantity: 1, priceMinor: '650000' },
  ],
};
// Demo rasm — inline SVG data-URL (tashqi so'rov yo'q).
function demoImage(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e8eef5"/><text x="50%" y="50%" font-family="sans-serif" font-size="34" fill="#64748b" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function CustomerDisplayPage() {
  // `?demo=1` — brauzerda Electron'siz sinash. Lazy initializer bilan BIR MARTA
  // aniqlaymiz (state+effect emas) — aks holda auth-effekt demo aniqlanmasdan
  // oldin bir marta ishlab, keraksiz `refresh()` chaqirar va race tug'dirardi.
  // useSearchParams ishlatmaymiz: u Next build'da Suspense chegarasini talab qiladi.
  const [demo] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1',
  );

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
      setPayload(DEMO_PAYLOAD);
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
  }, [demo]);

  const lines = payload.lines;

  // ── 3. Har mahsulot uchun media'ni bir marta yuklab, keshlab qo'yish ──────
  // (karusel 5s'da almashganda "sekin ochilish" bo'lmasin — oldindan preload.)
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!tokenReady) return;
    for (const line of lines) {
      const id = line.productId;
      if (media[id] || inFlight.current.has(id)) continue;
      inFlight.current.add(id);

      if (demo) {
        const img = demoImage(line.name);
        preload(img);
        setMedia((m) => ({
          ...m,
          [id]: { imageUrl: img, description: `${line.name} — namuna izohi (demo).` },
        }));
        continue;
      }

      void loadMedia(id).then((med) => {
        if (med.imageUrl) preload(med.imageUrl);
        setMedia((m) => ({ ...m, [id]: med }));
      });
    }
  }, [lines, media, tokenReady, demo]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      <CartPanel lines={lines} discountPct={payload.discountPct} />
      <MediaPanel lines={lines} media={media} />
    </div>
  );
}

/** Miqdorni server sxemasi shakliga keltiradi (`BigInt(1.5)` otilishini yopadi). */
function qtyStr(q: number | string): string {
  return normalizeQtyDecimal(String(q));
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAP YARIM — jonli savat
// ─────────────────────────────────────────────────────────────────────────────
function CartPanel({ lines, discountPct }: { lines: CartLineDTO[]; discountPct: number }) {
  const subtotal = lines.reduce(
    (sum, l) => sum + scaleMinorByQty(BigInt(l.priceMinor), qtyStr(l.quantity)),
    0n,
  );
  const total = discountPct > 0 ? subtotal - (subtotal * BigInt(discountPct)) / 100n : subtotal;
  const count = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);

  return (
    <div className="flex h-full w-1/2 flex-col border-slate-200 border-r bg-slate-50">
      <div className="flex items-center justify-between px-8 py-6">
        <ShersetLogo height={36} />
        <span className="rounded-full bg-slate-200 px-4 py-1 font-semibold text-lg text-slate-700 tabular-nums">
          {count} dona
        </span>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-2xl text-slate-400">
          Xaridlaringiz shu yerda ko'rinadi
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8">
          {lines.map((l) => (
            <div
              key={l.productId}
              className="flex items-baseline gap-4 border-slate-200 border-b py-4"
            >
              <span className="min-w-[3rem] font-semibold text-2xl text-slate-500 tabular-nums">
                {qtyStr(l.quantity)}×
              </span>
              <span className="flex-1 truncate font-medium text-3xl text-slate-800">{l.name}</span>
              <span className="font-semibold text-3xl text-slate-900 tabular-nums">
                {formatMoney(scaleMinorByQty(BigInt(l.priceMinor), qtyStr(l.quantity)))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Jami / chegirma / to'lov */}
      <div className="border-slate-200 border-t bg-white px-8 py-6">
        {discountPct > 0 && (
          <div className="mb-2 flex justify-between text-2xl text-slate-500">
            <span>Chegirma ({discountPct}%)</span>
            <span className="tabular-nums">−{formatMoney(subtotal - total)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-bold text-4xl text-slate-900">To'lov</span>
          <span className="font-bold text-5xl text-emerald-600 tabular-nums">
            {formatMoney(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O'NG YARIM — har 5 sekundda mahsulot rasmi + izohi
// ─────────────────────────────────────────────────────────────────────────────
function MediaPanel({
  lines,
  media,
}: {
  lines: CartLineDTO[];
  media: Record<string, Media>;
}) {
  const [index, setIndex] = useState(0);
  const prevLen = useRef(0);

  // Yangi mahsulot qo'shilsa — darhol o'shani ko'rsat (mijoz o'zi olganini ko'rsin).
  useEffect(() => {
    if (lines.length > prevLen.current) setIndex(lines.length - 1);
    if (lines.length === 0) setIndex(0);
    else if (index >= lines.length) setIndex(lines.length - 1);
    prevLen.current = lines.length;
  }, [lines.length, index]);

  // 5 sekundlik aylanma.
  useEffect(() => {
    if (lines.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % lines.length);
    }, CAROUSEL_MS);
    return () => clearInterval(t);
  }, [lines.length]);

  if (lines.length === 0) return <IdlePanel />;

  const current = lines[Math.min(index, lines.length - 1)];
  const med = current ? media[current.productId] : undefined;

  return (
    <div className="flex h-full w-1/2 flex-col items-center justify-center bg-white px-12 py-10">
      <div className="flex flex-1 items-center justify-center">
        {med?.imageUrl ? (
          <img
            key={current?.productId}
            src={med.imageUrl}
            alt={current?.name ?? ''}
            className="max-h-[60vh] max-w-full rounded-3xl object-contain shadow-lg"
          />
        ) : (
          <div className="flex h-[50vh] w-[50vh] items-center justify-center rounded-3xl bg-slate-100 text-slate-300">
            <ShersetLogo height={96} className="opacity-40" />
          </div>
        )}
      </div>
      <div className="mt-8 w-full text-center">
        <h2 className="font-bold text-5xl text-slate-900">{current?.name}</h2>
        {med?.description && (
          <p className="mx-auto mt-4 max-w-2xl text-2xl text-slate-500 leading-relaxed">
            {med.description}
          </p>
        )}
      </div>
      {/* Karusel indikatori (nuqtalar) */}
      {lines.length > 1 && (
        <div className="mt-8 flex gap-2">
          {lines.map((l, i) => (
            <span
              key={l.productId}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? 'w-8 bg-emerald-500' : 'w-2.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Savat bo'sh — do'kon logotipi + xush kelibsiz (kelajakda reklama roliki).
function IdlePanel() {
  return (
    <div className="flex h-full w-1/2 flex-col items-center justify-center gap-8 bg-white">
      <ShersetLogo height={80} />
      <p className="text-3xl text-slate-400">Xush kelibsiz!</p>
    </div>
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
