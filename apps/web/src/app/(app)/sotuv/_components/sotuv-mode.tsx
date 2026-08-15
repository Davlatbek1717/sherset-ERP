'use client';

/**
 * «Sotuv» rejimi — chap panel (qidiruv + tovar setkasi) va savat paneli
 * (Sotuv rejimining doimiy o'ng paneli).
 *
 * F1 (POS redizayn, 2026-08-14): JSX `page.tsx` dan XULQNI O'ZGARTIRMASDAN
 * ko'chirildi. Savat holati, so'rovlar va mutatsiyalar sahifada QOLADI —
 * bu fayl faqat chizadi; qator ichidagi sof hisob-kitoblar (band, foyda,
 * markdown) esa avvalgidek YAGONA manbadan (`cart-math` / `@moysklad/money`)
 * keladi.
 *
 * F3 (spec §5.1, Q6): sensorli qayta qurish — savat qatori butun-qator
 * tahrir-trigger (± yo'q), o'lchamlar px'da (spec §4 shkalasi), eski
 * smena-strip olib tashlandi (ma'lumot PosHeader chip'ida).
 */

import {
  cartLineMarkdownMinor,
  cartLineProfitMinor,
  cartLineRevenueMinor,
  normalizeQtyDecimal,
} from '@/lib/pos/cart-math';
import { scanFeedback } from '@/lib/pos/scan-feedback';
// Ekranga nima chiqishi (hisob-kitobga tegmaydi) — izohi shu faylda.
import {
  SHOW_COST_IN_SEARCH,
  SHOW_MARGIN_ON_SCREEN,
  SHOW_WHOLESALE_IN_CART,
} from '@/lib/pos/ui-flags';
import { resolveDefaultSalePrice } from '@/lib/sale-price';
import type {
  CurrentSession,
  ListEnvelope as ListResponse,
  PosProductRow as ProductRow,
} from '@moysklad/contracts';
import { classifyPrice, formatPercent, marginPercent, priceFloorMinor } from '@moysklad/money';
import { Alert, Button, Input, formatMoney } from '@moysklad/ui';
import { Search, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import type { CartLine } from './pos-types';

// ── Chap panel: qidiruv + tovar setkasi ─────────────────────────────────────

interface SotuvSearchGridProps {
  session: CurrentSession;
  /** P4 — smena yoshi matni (`formatShiftAge` sahifada hisoblanadi). */
  shiftAge: string;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  /** Savatga qo'shilgandan keyin fokus shu maydonga qaytadi (`addToCart`). */
  searchRef: RefObject<HTMLInputElement | null>;
  products: ListResponse<ProductRow> | undefined;
  isLoading: boolean;
  addToCart: (product: ProductRow) => void;
}

export function SotuvSearchGrid({
  session,
  shiftAge,
  search,
  setSearch,
  searchRef,
  products,
  isLoading,
  addToCart,
}: SotuvSearchGridProps) {
  const t = useTranslations('pages.sotuv');

  // F3 — skaner-javob (spec §5.1): qidiruv/skan hech narsa topmasa PAST ton.
  // Xabar («not_found») allaqachon setkada turadi — bu faqat OVOZ qatlami.
  // Dedup ikki qavat: (1) bir so'rov matni uchun bir marta; (2) 800ms ichida
  // qayta chalinmaydi — qidiruv har tugma-bosishda so'rov yuboradi (debounce
  // yo'q) va qo'l bilan terganda har prefiks «topilmadi» bo'lib qolardi.
  const lastMissRef = useRef<{ q: string; at: number } | null>(null);
  const missNow = !isLoading && search.trim() !== '' && (products?.items.length ?? 0) === 0;
  useEffect(() => {
    if (!missNow) {
      if (search.trim() === '') lastMissRef.current = null;
      return;
    }
    const q = search.trim();
    const now = Date.now();
    const last = lastMissRef.current;
    if (last && (last.q === q || now - last.at < 800)) return;
    lastMissRef.current = { q, at: now };
    scanFeedback.notFound();
  }, [missNow, search]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      {/* P4 — «unutilgan smena» ogohlantirishi.
          Bayroqni SERVER qo'yadi (`stale`): chegara MK13 registrida turadi,
          ekran uni bilmaydi. Avto-yopish YO'Q — sanoqsiz yopilgan smena
          kassa hisobini yolg'onlashtiradi (egasi qarori, 2026-08-12). */}
      {session.stale && (
        <Alert
          tone="warning"
          title={t('shift_stale_title', { age: shiftAge })}
          data-test-id="sotuv-shift-stale"
        >
          {t('shift_stale_action')}
        </Alert>
      )}

      {/* F3: eski smena-strip OLIB TASHLANDI — kassir ismi/yoshi/savdo jami
          endi PosHeader smena-chip'ida (F2, spec §3.1); shu yerda turgani
          ma'lumot dublikati edi. `stale` ogohlantirishi (yuqorida) qoladi —
          u ma'lumot emas, HARAKAT talab qiladigan signal. */}

      {/* Search / barcode */}
      <Input
        ref={searchRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Maydonni `addToCart` o'zi tozalaydi — bu yerda takrorlanmaydi.
            const first = products?.items?.[0];
            if (first) addToCart(first);
          }
        }}
        placeholder={t('search_placeholder')}
        data-test-id="sotuv-search"
        leading={<Search className="h-4 w-4" />}
        className="h-11 rounded-xl text-sm shadow-sm"
      />

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>
        ) : (products?.items.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-[var(--ms-text-muted)] text-sm">
            {t('not_found')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products?.items.map((p) => {
              const sale = resolveDefaultSalePrice(p.salePrices);
              const onHand = Number(p.stock?.onHand ?? '0');
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => addToCart(p)}
                  data-test-id="sotuv-product"
                  className="flex min-h-[var(--pos-touch-min)] flex-col items-start rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--ms-bg-hover)] active:scale-[0.99]"
                >
                  {/* P04 (2026-08-13, egasi): mahsulot nomi boshqa xildagi
                      kattaroq shriftda — font-pos (Segoe UI zanjiri).
                      F3 (spec §4): o'lchamlar px'da — ildiz font 12px,
                      rem-klasslar 0.75× kichik chiqadi (F2 saboqi). */}
                  <span className="font-pos font-semibold text-[18px] text-[var(--ms-text-primary)]">
                    {p.name}
                  </span>
                  <span className="mt-1 font-bold text-[18px] text-[var(--ms-text-destructive)]">
                    {sale != null ? formatMoney(BigInt(sale)) : '—'}
                  </span>
                  <span className="mt-1 text-[14px]">
                    <span
                      className={
                        onHand <= 0
                          ? 'text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-muted)]'
                      }
                    >
                      {t('stock')}: {onHand.toLocaleString('uz-UZ')} {t('pieces')}
                    </span>
                    {/* «Kelgan» — ekranda KO'RSATILMAYDI (P02, 2026-08-13,
                        egasi): mijoz ko'zi oldida tan narx ochiq turmasin.
                        Markup bayroq bilan to'silgan (`lib/pos/ui-flags.ts`). */}
                    {SHOW_COST_IN_SEARCH && p.buyPrice != null && (
                      <span data-test-id="sotuv-grid-cost" className="text-[var(--ms-text-muted)]">
                        {' '}
                        · {t('cost')}: {formatMoney(BigInt(p.buyPrice))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Savat paneli («Savat» tab tarkibi) ──────────────────────────────────────

interface SavatPanelProps {
  cart: CartLine[];
  /** F8 — zakazga bog'langan savat: tahrir/o'chirish yo'q (sabab sahifada). */
  cartLocked: boolean;
  /** Savatni tozalash — zakaz/chek bog'lanishini ham uzadi (sahifada). */
  onClearCart: () => void;
  /** Bitta qatorni o'chirish (egasi so'rovi, 2026-08-15): «Tozalash» hammasini
   *  olib tashlaydi, bitta tovarni esa faqat qator-oynasi ichidan o'chirish
   *  mumkin edi — kassir bu yo'lni topolmadi. Endi har qatorda ochiq ✕ bor. */
  onRemoveLine: (productId: string) => void;
  setEditingProductId: Dispatch<SetStateAction<string | null>>;
  /** F3 — skaner-javob: hozirgina qo'shilgan qator (600ms yashil flash). */
  flashProductId: string | null;
  discountPct: number;
  setDiscountPct: Dispatch<SetStateAction<number>>;
  discountEditing: boolean;
  setDiscountEditing: Dispatch<SetStateAction<boolean>>;
  cartCount: number;
  cartTotal: bigint;
  discountedTotal: bigint;
  cartProfitMinor: bigint | null;
  cartMarginPct: ReturnType<typeof marginPercent>;
  /** P12 — narx siyosati buzilgan qator (0 narx yoki poldan past), bo'lmasa null. */
  pricePolicyBlock: CartLine | null;
  directSellPending: boolean;
  onDirectSell: () => void;
  sendToPickingPending: boolean;
  onSendToPicking: () => void;
}

export function SavatPanel({
  cart,
  cartLocked,
  onClearCart,
  onRemoveLine,
  setEditingProductId,
  flashProductId,
  discountPct,
  setDiscountPct,
  discountEditing,
  setDiscountEditing,
  cartCount,
  cartTotal,
  discountedTotal,
  cartProfitMinor,
  cartMarginPct,
  pricePolicyBlock,
  directSellPending,
  onDirectSell,
  sendToPickingPending,
  onSendToPicking,
}: SavatPanelProps) {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-[var(--ms-border)] border-b px-4 py-2">
        <span className="text-sm text-[var(--ms-text-muted)]">{t('cart_title')}</span>
        {cart.length > 0 && (
          <Button
            variant="link"
            className="ml-auto text-xs"
            onClick={onClearCart}
            data-test-id="sotuv-cart-clear"
          >
            {t('clear')}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--ms-text-muted)]">
            <ShoppingCart className="h-8 w-8 opacity-40" />
            <span className="font-medium text-sm">{t('cart_empty_title')}</span>
            <span className="text-xs">{t('cart_empty_hint')}</span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--ms-border)]">
            {cart.map((line) => {
              // Kassa TZ §5.2 — the row's own profit is taken at the price
              // the cashier typed (the cart-level discount is a separate,
              // footer-level figure), so editing the price moves this number
              // immediately and visibly.
              // P12 — tasma POLga nisbatan (tan narxga emas): karta
              // narxining o'zi tan narxdan past bo'lgan tovarlarda
              // (prodda 46 ta) o'z narxida sotish RUXSAT etilgan, ya'ni
              // ularni qizil «zarar» deb belgilash yolg'on signal edi.
              const lineFloor = priceFloorMinor({
                costMinor: line.costMinor,
                basePriceMinor: line.basePriceMinor,
              });
              const band = classifyPrice({
                priceMinor: line.priceMinor,
                costMinor: lineFloor,
                wholesaleMinor: line.wholesaleMinor,
              });
              // 🔴 Ilgari `BigInt(line.quantity)` edi — kasr miqdorda
              // RangeError otib butun sahifani oq ekranga aylantirardi.
              // Formulalar sahifada QAYTA YOZILMAYDI: ular
              // `lib/pos/cart-math.ts` da, sof va sinalgan holda
              // (`@moysklad/money` variantlari `bigint` miqdor talab
              // qiladi, ya'ni 1.5 kg ni ifodalay olmaydi).
              const qty = normalizeQtyDecimal(line.quantity);
              const lineRevenue = cartLineRevenueMinor(line);
              const lineProfit = cartLineProfitMinor(line);
              const linePct = marginPercent(lineProfit, lineRevenue);
              // «Kassir qancha tushirib berdi» (kassa TZ §5.3) — shown only
              // when the cashier actually went below the card price; a sale
              // at or above it needs no annotation.
              const markdown = cartLineMarkdownMinor(line);
              // F3 — skaner-javob: hozirgina qo'shilgan qator yashil yonadi.
              // ZARAR/optom tasmalarining fonini flash BOSMAYDI (ular nazorat
              // signali) — u yerda faqat yashil halqa ko'rinadi.
              const flashing = line.productId === flashProductId;
              return (
                /* F3 (spec Q6, 2026-08-14): QATOR — katta tahrir-trigger,
                   bosilsa mavjud tahrir oynasi (`cart-line-edit-modal`)
                   ochiladi. −/+ mikro-tugmalar olib tashlangan: sensorli
                   monoblokda 24px nishonlar xato bosilardi. 2026-08-15
                   (egasi): qator yonida KATTA ✕ qaytdi — bitta tovarni
                   o'chirish uchun oynani ochish shart emas; nishon 56px,
                   ya'ni F3 shikoyatidagi mayda tugma emas. Qulflangan
                   savatda (zakaz bog'langan) ✕ chizilmaydi, oyna esa FAQAT
                   KO'RISH rejimida ochiladi — qulfni sahifadagi `readOnly`
                   prop takrorlaydi. */
                <div key={line.productId} className="flex items-stretch">
                  <button
                    type="button"
                    data-test-id="sotuv-cart-line"
                    data-price-band={band}
                    onClick={() => setEditingProductId(line.productId)}
                    title={t('line_edit_open')}
                    data-flash={flashing ? 'true' : undefined}
                    className={`block min-w-0 flex-1 min-h-[var(--pos-row-h)] px-3 py-2 text-left transition-colors ${
                      flashing ? 'ring-2 ring-inset ring-emerald-400 ' : ''
                    }${
                      band === 'loss'
                        ? 'bg-red-50 hover:bg-red-100'
                        : band === 'below-wholesale'
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : flashing
                            ? 'bg-emerald-50'
                            : cartLocked
                              ? ''
                              : 'hover:bg-[var(--ms-bg-hover)]'
                    }`}
                  >
                    {/* Qator 1: nom + qator jamisi (spec §4: 18px) */}
                    <div className="flex items-baseline gap-3">
                      <span
                        data-test-id="sotuv-cart-line-edit"
                        className="min-w-0 flex-1 truncate font-pos font-semibold text-[18px] text-[var(--ms-text-primary)]"
                      >
                        {line.productName}
                      </span>
                      <span className="shrink-0 font-semibold text-[18px] tabular-nums text-[var(--ms-text-primary)]">
                        {formatMoney(lineRevenue)}
                      </span>
                    </div>

                    {/* Qator 2: miqdor × narx + qolgan/tan/optom (kassa TZ §5.2) */}
                    <div className="mt-1 flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-[16px] text-[var(--ms-text-muted)] tabular-nums">
                        <span data-test-id="sotuv-cart-qty">{qty}</span>
                        <span>×</span>
                        <span data-test-id="sotuv-cart-price-edit">
                          {formatMoney(line.priceMinor)}
                        </span>
                      </span>
                      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-1.5 text-[14px] text-[var(--ms-text-muted)]">
                        {line.availableStock !== undefined && (
                          <span>
                            {t('cart_remaining')}:{' '}
                            <span
                              className={
                                line.availableStock <= 0
                                  ? 'text-red-500 font-medium'
                                  : 'tabular-nums'
                              }
                            >
                              {line.availableStock}
                            </span>
                          </span>
                        )}
                        {/* Tan narx — ekranda KO'RSATILMAYDI (egasining
                          qarori): mijoz kassir yoniga kelganda marja
                          ochiq turardi. Hisob-kitob joyida
                          (`lib/pos/ui-flags.ts` izohiga qara). */}
                        {SHOW_MARGIN_ON_SCREEN && (
                          <span data-test-id="sotuv-cart-cost">
                            · {t('cart_cost')}:{' '}
                            <span className="tabular-nums">
                              {line.costMinor != null ? formatMoney(line.costMinor) : '—'}
                            </span>
                          </span>
                        )}
                        {/* «Optom» — savat qatorida KO'RSATILMAYDI (P02,
                          2026-08-13, egasi): faqat qator-tahrir oynasida
                          qoladi (F3). Bayroq — `lib/pos/ui-flags.ts`. */}
                        {SHOW_WHOLESALE_IN_CART && line.wholesaleMinor != null && (
                          <span data-test-id="sotuv-cart-min">
                            · {t('cart_min')}:{' '}
                            <span className="tabular-nums">{formatMoney(line.wholesaleMinor)}</span>
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Qator 3: chegara ogohlantirishi + qator foydasi (shartli) */}
                    {(line.priceMinor <= 0n ||
                      band !== 'ok' ||
                      (markdown != null && markdown > 0n) ||
                      SHOW_MARGIN_ON_SCREEN) && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {/* P12 — narxsiz qator JIM qolmaydi: prodda 488 tovarda
                          chakana narx yo'q va ular savatga 0 so'm bilan
                          tushardi. Chek bunday qator bilan yuborilmaydi. */}
                        {line.priceMinor <= 0n && (
                          <span
                            data-test-id="sotuv-cart-no-price"
                            className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-[10px] text-white"
                          >
                            {t('cart_no_price')}
                          </span>
                        )}
                        {band === 'loss' && (
                          <span
                            data-test-id="sotuv-cart-loss"
                            className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-[10px] text-white uppercase tracking-wide"
                          >
                            {t('cart_loss')}
                          </span>
                        )}
                        {band === 'below-wholesale' && (
                          <span className="rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-[10px] text-white">
                            {t('cart_below_wholesale')}
                          </span>
                        )}
                        {markdown != null && markdown > 0n && (
                          <span
                            data-test-id="sotuv-cart-markdown"
                            className="text-[var(--ms-text-muted)] tabular-nums"
                          >
                            −{formatMoney(markdown)} {t('cart_markdown')}
                          </span>
                        )}
                        {/* Qator foydasi — ekranda KO'RSATILMAYDI (yuqoridagi
                          tan narx bilan bir qaror). ZARAR va «optomdan past»
                          tasmalari qoladi: ular raqam emas, NAZORAT. */}
                        {SHOW_MARGIN_ON_SCREEN && (
                          <span
                            data-test-id="sotuv-cart-profit"
                            className={`ml-auto tabular-nums ${
                              lineProfit == null
                                ? 'text-[var(--ms-text-muted)]'
                                : lineProfit < 0n
                                  ? 'font-semibold text-red-600'
                                  : 'font-medium text-emerald-600'
                            }`}
                          >
                            {t('cart_profit')}:{' '}
                            {lineProfit == null ? (
                              // Tan narx kartochkada yo'q — «0 foyda» EMAS, «noma'lum».
                              <span title={t('cart_cost_missing')}>—</span>
                            ) : (
                              <>
                                {lineProfit > 0n ? '+' : ''}
                                {formatMoney(lineProfit)}
                                {linePct != null && ` (${formatPercent(linePct)})`}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  {!cartLocked && (
                    <button
                      type="button"
                      data-test-id="sotuv-cart-line-remove"
                      aria-label={`${tCommon('delete')}: ${line.productName}`}
                      onClick={() => onRemoveLine(line.productId)}
                      className="flex w-[56px] shrink-0 items-center justify-center border-[var(--ms-border)] border-l text-[20px] text-[var(--ms-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — mijoz turi + Rasmilashtirish */}
      <div className="shrink-0 border-[var(--ms-border)] border-t bg-[var(--ms-bg-surface)] px-4 pt-4 pb-5">
        {/* Jami summa — ikki marta bosib chegirma */}
        <div className="mb-4 text-center">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
            {t('total')}
          </p>

          {/* Summa — ikki marta bosish chegirmani ochadi */}
          <div
            className="cursor-default select-none"
            onDoubleClick={() => setDiscountEditing((v) => !v)}
            title={t('discount_dblclick_hint')}
          >
            {discountPct > 0 && (
              <p className="text-[14px] tabular-nums text-[var(--ms-text-muted)] line-through">
                {formatMoney(cartTotal)}
              </p>
            )}
            {/* F3 (spec §4): jami summa 36–40px qalin — 1 metrdan o'qilsin.
                px'da ataylab (`text-3xl` ildiz 12px da bor-yo'g'i 22.5px edi). */}
            <p
              className={`font-bold tabular-nums leading-none text-[38px] ${discountPct > 0 ? 'text-emerald-600' : 'text-[var(--ms-text-primary)]'}`}
            >
              {formatMoney(discountedTotal)}
            </p>
            {discountPct > 0 && (
              <p className="mt-0.5 text-xs font-medium text-emerald-600">
                {t('discount_applied', { pct: discountPct })}
              </p>
            )}
          </div>

          {cartCount > 0 && (
            <p className="mt-1 text-xs text-[var(--ms-text-muted)]">
              {t('products_count', { n: cartCount })}
            </p>
          )}

          {/* Chek bo'yicha foyda — ekranda KO'RSATILMAYDI (egasining
              qarori, `lib/pos/ui-flags.ts`). Bu eng ko'zga tashlanadigan
              raqam edi: mijoz to'lov paytida ekranga qarasa marjani
              o'qib olardi. */}
          {SHOW_MARGIN_ON_SCREEN && cartCount > 0 && (
            <p
              data-test-id="sotuv-cart-total-profit"
              className={`mt-1 text-xs tabular-nums ${
                cartProfitMinor == null
                  ? 'text-[var(--ms-text-muted)]'
                  : cartProfitMinor < 0n
                    ? 'font-semibold text-red-600'
                    : 'font-medium text-emerald-600'
              }`}
            >
              {t('cart_total_profit')}:{' '}
              {cartProfitMinor == null ? (
                t('cart_cost_missing')
              ) : (
                <>
                  {cartProfitMinor > 0n ? '+' : ''}
                  {formatMoney(cartProfitMinor)}
                  {cartMarginPct != null && ` (${formatPercent(cartMarginPct)})`}
                </>
              )}
            </p>
          )}

          {/* Inline chegirma input */}
          {discountEditing && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs text-[var(--ms-text-muted)]">{t('discount')}:</span>
              <div className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the discount percent immediately when this popover opens.
                  autoFocus
                  value={discountPct === 0 ? '' : discountPct}
                  onChange={(e) =>
                    setDiscountPct(
                      Math.min(100, Math.max(0, Number.parseInt(e.target.value, 10) || 0)),
                    )
                  }
                  onBlur={() => setDiscountEditing(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setDiscountEditing(false)}
                  placeholder="0"
                  className="w-10 bg-transparent text-center text-sm font-bold text-emerald-700 outline-none"
                />
                <span className="text-sm font-bold text-emerald-600">%</span>
              </div>
              {discountPct > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDiscountPct(0);
                    setDiscountEditing(false);
                  }}
                  className="text-xs text-[var(--ms-text-muted)] hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* P12 — sabab tugmadan OLDIN: kassir nega yubora olmayotganini
            ko'rmasa, o'chgan tugmani nosozlik deb o'ylardi. */}
        {pricePolicyBlock != null && (
          <div
            data-test-id="sotuv-price-blocked"
            className="mb-2 rounded-xl bg-red-600 px-3 py-2 font-bold text-sm text-white"
          >
            {pricePolicyBlock.priceMinor <= 0n
              ? `${pricePolicyBlock.productName}: ${t('cart_no_price')}`
              : `${pricePolicyBlock.productName}: ${t('cart_floor_blocked')}`}
          </div>
        )}

        {/* P3 — TO'G'RIDAN-TO'G'RI SOTISH (yig'ishsiz, darhol to'lov).
            Yuqorida turadi va to'q rangda: kichik xaridda ASOSIY yo'l shu.
            «Omborchiga yuborish» pastda, ochiqroq rangda — katta zakaz
            uchun qoladi. Ikkalasi ham AYNI narx-siyosat qulfi ostida
            (P12): 0 narx yoki poldan past narx ikkalasini ham bloklaydi,
            aks holda yangi tugma qulfni chetlab o'tish yo'li bo'lardi.
            F3 (spec §4): asosiy tugma 72px, ikkilamchisi 56px
            (`--pos-touch-min`), yozuv 18px — hammasi px'da (ildiz font
            12px, rem-klasslar 0.75× kichik chiqadi — F2 saboqi). */}
        <button
          type="button"
          onClick={onDirectSell}
          disabled={cart.length === 0 || directSellPending || pricePolicyBlock != null}
          data-test-id="sotuv-sell-direct"
          className="mb-2 flex h-[72px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-semibold text-[18px] text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {directSellPending ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {t('sending')}
            </span>
          ) : (
            <>
              <span>{t('sell_direct')}</span>
              <span className="font-normal text-emerald-100 text-xs">{t('sell_direct_hint')}</span>
            </>
          )}
        </button>

        {/* Omborchiga yuborish */}
        <button
          type="button"
          onClick={onSendToPicking}
          disabled={cart.length === 0 || sendToPickingPending || pricePolicyBlock != null}
          data-test-id="sotuv-pay"
          className="flex h-[var(--pos-touch-min)] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 font-semibold text-[18px] text-white shadow-lg transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sendToPickingPending ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {t('sending')}
            </span>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              {t('send_to_picker')}
            </>
          )}
        </button>
      </div>
    </>
  );
}
