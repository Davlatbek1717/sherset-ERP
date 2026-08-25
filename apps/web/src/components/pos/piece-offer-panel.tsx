'use client';

import { api } from '@/lib/api-client';
import { formatPieceComposition } from '@/lib/piece-composition';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

/**
 * K3 — KASSIR bo'laklarni ko'radi (kabel, sim, shlang).
 *
 * Muammo (K-reja 1-bo'lim, egasining so'zi): omborda `250+250+250+200+150+70+50`
 * yotibdi, tizimda esa bitta son — `1220 m`. Kassir 1220 ni ko'rib mijozga
 * «4 ta rulon bor» deydi, omborda 3 ta butun rulon chiqadi — mijoz oldida
 * sharmandalik. Bu panel o'sha bitta sonning O'RNIGA TARKIBNI ko'rsatadi.
 *
 * 🔴 **FAQAT O'QISH.** Panel na savatga, na qoldiqqa, na reyestrga yozadi:
 * u bitta `GET /stock-pieces/availability` so'rovi qiladi. Yagona chiqishi —
 * `onApplySplit` callback'i, ya'ni KASSIR bosgan taklifni chaqiruvchiga
 * qaytarish. Tizim hech qachon o'zi tanlamaydi (K-reja 4-bo'lim):
 *   · nechta bo'lak va qaysi uzunliklar — KASSIR mijoz bilan kelishadi (K-Q5);
 *   · qaysi JISMONIY bo'lakdan kesish — OMBORCHI hal qiladi (K-Q4).
 *
 * 🔴 **Reyestr bo'sh bo'lsa panel HECH NARSA chizmaydi** (`no-registry`).
 * Bayroq yoqilgan, lekin bo'laklar hali kiritilmagan holat NORMAL (K5 gacha
 * reyestr qo'lda to'ladi) — o'sha paytda ogohlantirish chiqarish kassirni
 * yo'q muammo bilan to'xtatardi. Kassa hech qachon to'xtamaydi: bu panel
 * biror tugmani ham bloklamaydi.
 */

interface CompositionWholeGroup {
  length: string;
  count: number;
}

interface CompositionPiece {
  id: string;
  label: string | null;
  length: string;
  cellName: string | null;
}

interface PieceComposition {
  wholeGroups: CompositionWholeGroup[];
  pieces: CompositionPiece[];
  registryQty: string;
  activePieces: number;
  wholeCount: number;
  longest: string | null;
}

type OfferVerdict = 'no-registry' | 'single' | 'needs-split' | 'not-enough';

interface PieceOffer {
  requested: string;
  verdict: OfferVerdict;
  single: { id: string; label: string | null; length: string; whole: boolean } | null;
  suggestion: string[];
  longest: string | null;
  registryQty: string;
  missing: string;
}

export interface PieceAvailability {
  product: { id: string; name: string; uom: string | null; pieceTracked: boolean };
  stores: Array<{ storeId: string; storeName: string; composition: PieceComposition }>;
  composition: PieceComposition;
  offer: PieceOffer;
}

interface Props {
  productId: string;
  /** Kassir kiritayotgan miqdor (decimal satr). Taklif shundan hisoblanadi. */
  quantity: string;
  /**
   * Kassir taklifni qabul qilsa — uzunliklar ro'yxati (`['150','30']`).
   * `undefined` bo'lsa tugma umuman chizilmaydi (faqat ko'rish rejimi).
   */
  onApplySplit?: (lengths: string[]) => void;
}

export function PieceOfferPanel({ productId, quantity, onApplySplit }: Props) {
  const t = useTranslations('pages.pieces');

  const { data } = useQuery<PieceAvailability>({
    // Miqdor KALITDA: hukm miqdorga bog'liq, kesh esa har raqam uchun alohida.
    // Panel faqat O'QIYDI, shuning uchun kesh xavfsiz.
    queryKey: ['piece-availability', productId, quantity],
    queryFn: () =>
      api.get<PieceAvailability>(
        `/stock-pieces/availability?assortmentId=${encodeURIComponent(productId)}` +
          `&quantity=${encodeURIComponent(quantity || '0')}`,
      ),
    enabled: productId !== '',
    staleTime: 15_000,
  });

  // Bayroq o'chiq yoki reyestr bo'sh ⇒ ekran BIR BAYT ham o'zgarmaydi.
  if (!data || !data.product.pieceTracked || data.composition.activePieces === 0) return null;

  const uom = data.product.uom ?? t('uom_fallback');
  const parts = formatPieceComposition(data.composition, t('times'));
  const offer = data.offer;

  return (
    <div
      data-test-id="pos-piece-offer"
      data-verdict={offer.verdict}
      className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-4 py-3"
    >
      <div className="font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
        {t('title')}
      </div>

      {/* Tarkib: `250 m × 3 · 200 · 150 · 70 · 50` */}
      <div
        data-test-id="pos-piece-composition"
        className="mt-1 font-semibold text-[16px] tabular-nums leading-snug"
      >
        {parts.join(' · ')} <span className="font-normal text-[13px]">{uom}</span>
      </div>

      {/* Eng uzun uzluksiz — ALOHIDA qator (K3/1-vazifa): kassir mijozga
          «shuncha uzunlikda uzluksiz bor» deb aytadigan yagona raqam. */}
      <div data-test-id="pos-piece-longest" className="mt-1 text-[14px] tabular-nums">
        {t('longest')}: <span className="font-bold">{offer.longest ?? '—'}</span> {uom}
      </div>

      {offer.verdict === 'single' && offer.single && (
        <div
          data-test-id="pos-piece-verdict-single"
          className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[14px] text-emerald-900"
        >
          {t('single', { qty: offer.requested, uom, from: offer.single.length })}
        </div>
      )}

      {offer.verdict === 'needs-split' && (
        <div
          data-test-id="pos-piece-verdict-split"
          className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900"
        >
          <div>
            {t('needs_split', {
              qty: offer.requested,
              uom,
              longest: offer.longest ?? '0',
            })}
          </div>
          <div className="mt-1 font-bold tabular-nums">
            {t('suggestion')}: {offer.suggestion.join(' + ')} {uom}
          </div>
          {/* 🔴 Tugma TAKLIFNI qabul qiladi, tovarni EMAS: kesim ham, qoldiq
              ham o'zgarmaydi (kesim — omborchining ishi, K4). Mijoz rozi
              bo'lmasa kassir shunchaki bosmaydi. */}
          {onApplySplit && offer.suggestion.length > 1 && (
            <button
              type="button"
              data-test-id="pos-piece-apply-split"
              onClick={() => onApplySplit(offer.suggestion)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold text-[14px] text-amber-900 active:scale-[0.99]"
            >
              {t('apply_split')}
            </button>
          )}
        </div>
      )}

      {offer.verdict === 'not-enough' && (
        <div
          data-test-id="pos-piece-verdict-short"
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-900"
        >
          {t('not_enough', { registry: offer.registryQty, missing: offer.missing, uom })}
        </div>
      )}

      {/* Ombor kesimi — bo'lak qayerda turibdi (bittadan ko'p ombor bo'lsa). */}
      {data.stores.length > 1 && (
        <div
          data-test-id="pos-piece-stores"
          className="mt-2 text-[12px] text-[var(--ms-text-muted)]"
        >
          {data.stores.map((s) => (
            <div key={s.storeId} className="tabular-nums">
              {s.storeName}: {formatPieceComposition(s.composition, t('times')).join(' · ')} {uom}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
