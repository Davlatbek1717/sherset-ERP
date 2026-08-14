'use client';

/**
 * «Sotuv» rejimi — chap panel (qidiruv + tovar setkasi + smena-strip) va
 * savat paneli («Savat» tab tarkibi).
 *
 * F1 (POS redizayn, 2026-08-14): JSX `page.tsx` dan XULQNI O'ZGARTIRMASDAN
 * ko'chirildi. Savat holati, so'rovlar va mutatsiyalar sahifada QOLADI —
 * bu fayl faqat chizadi; qator ichidagi sof hisob-kitoblar (band, foyda,
 * markdown) esa avvalgidek YAGONA manbadan (`cart-math` / `@moysklad/money`)
 * keladi. Ikkala blok bitta faylda, lekin ikki komponent: chap panel har
 * doim ko'rinadi, savat esa faqat «Savat» tabida (DOM tuzilishi o'zgarmagan).
 */

import {
  cartLineMarkdownMinor,
  cartLineProfitMinor,
  cartLineRevenueMinor,
  normalizeQtyDecimal,
} from '@/lib/pos/cart-math';
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
import { Alert, Badge, Button, Input, formatMoney } from '@moysklad/ui';
import { Search, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Dispatch, RefObject, SetStateAction } from 'react';
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

      {/* Session strip */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-3 py-2 text-sm">
        <Badge tone={session.stale ? 'warning' : 'success'}>{t('shift_open')}</Badge>
        <span className="text-[var(--ms-text-muted)]">
          {session.cashier.name}
          {session.store ? ` · ${session.store.name}` : ''}
        </span>
        {/* Yosh HAR DOIM ko'rinadi — chegaragacha ham. Egasi shuni so'radi:
            «ochildi degandan yopildi qilguncha» ko'rinib tursin. */}
        <span data-test-id="sotuv-shift-age" className="text-[var(--ms-text-muted)]">
          · {t('shift_open_age', { age: shiftAge })}
        </span>
        <span className="ml-auto font-medium">
          {session.salesCount} · {formatMoney(BigInt(session.salesSumMinor))}
        </span>
        <Button asChild variant="link" className="ml-2 text-xs">
          <a href="/retail">{t('shift_manage')}</a>
        </Button>
      </div>

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
                  className="flex flex-col items-start rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--ms-bg-hover)]"
                >
                  {/* P04 (2026-08-13, egasi): mahsulot nomi boshqa xildagi
                      kattaroq shriftda — font-pos (Segoe UI zanjiri). */}
                  <span className="font-pos font-semibold text-[var(--ms-text-primary)] text-base">
                    {p.name}
                  </span>
                  <span className="mt-1 font-bold text-[var(--ms-text-destructive)] text-base">
                    {sale != null ? formatMoney(BigInt(sale)) : '—'}
                  </span>
                  <span className="mt-1 text-xs">
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
  setEditingProductId: Dispatch<SetStateAction<string | null>>;
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
  setEditingProductId,
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
              return (
                /* F3 (spec Q6, 2026-08-14): BUTUN QATOR — bitta 64px tugma,
                   bosilsa mavjud tahrir oynasi (`cart-line-edit-modal`)
                   ochiladi. −/+/✕ mikro-tugmalar olib tashlandi: sensorli
                   monoblokda 24px nishonlar xato bosilardi; miqdor/narx/
                   o'chirishning yagona yo'li endi oyna. Qulflangan savatda
                   (zakaz bog'langan) oyna FAQAT KO'RISH rejimida ochiladi —
                   qulfni sahifadagi `readOnly` prop takrorlaydi. */
                <button
                  type="button"
                  key={line.productId}
                  data-test-id="sotuv-cart-line"
                  data-price-band={band}
                  onClick={() => setEditingProductId(line.productId)}
                  title={t('line_edit_open')}
                  className={`block w-full min-h-[var(--pos-row-h)] px-3 py-2 text-left transition-colors ${
                    band === 'loss'
                      ? 'bg-red-50 hover:bg-red-100'
                      : band === 'below-wholesale'
                        ? 'bg-amber-50 hover:bg-amber-100'
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
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-x-1.5 text-[13px] text-[var(--ms-text-muted)]">
                      {line.availableStock !== undefined && (
                        <span>
                          {t('cart_remaining')}:{' '}
                          <span
                            className={
                              line.availableStock <= 0 ? 'text-red-500 font-medium' : 'tabular-nums'
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
              <p className="text-sm tabular-nums text-[var(--ms-text-muted)] line-through">
                {formatMoney(cartTotal)}
              </p>
            )}
            <p
              className={`font-bold tabular-nums leading-none text-3xl ${discountPct > 0 ? 'text-emerald-600' : 'text-[var(--ms-text-primary)]'}`}
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
            aks holda yangi tugma qulfni chetlab o'tish yo'li bo'lardi. */}
        <button
          type="button"
          onClick={onDirectSell}
          disabled={cart.length === 0 || directSellPending || pricePolicyBlock != null}
          data-test-id="sotuv-sell-direct"
          className="mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-semibold text-base text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 font-semibold text-base text-white shadow-lg transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
