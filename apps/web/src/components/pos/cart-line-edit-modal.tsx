'use client';

/**
 * Savat qatori tahrir oynasi — sensorli monoblok uchun (F2).
 *
 * NEGA BOR: savat qatoridagi −/+ tugmalar 24×24px, narx maydoni 96px.
 * Monoblokda 12 dona tovar = 12 marta bosish va sonni to'g'ridan-to'g'ri
 * kiritib bo'lmaydi. Bu oyna bitta qatorni katta numpad bilan tahrirlaydi.
 *
 * NEGA ALOHIDA FAYL: `sotuv/page.tsx` 2000+ satr va uni bo'lish (MK33) hali
 * qarz — yangi ekran o'sha faylga qo'shilsa qarz yana o'sardi.
 *
 * Formulalar bu yerda QAYTA YOZILMAYDI: miqdor `lib/pos/cart-math.ts`,
 * pul-parse `lib/pos/parse-amount.ts`, narx tasmasi `@moysklad/money`
 * (`classifyPrice`) — savat qatori ko'rsatadigan raqamlar bilan AYNAN bir xil
 * manba. Ikkinchi nusxa yozilsa oynadagi raqam savatdagidan farq qilardi.
 */

import { PieceOfferPanel } from '@/components/pos/piece-offer-panel';
import { isShersetShell } from '@/lib/pos-device';
import { cartLineRevenueMinor, normalizeQtyDecimal } from '@/lib/pos/cart-math';
import { parseAmountToMinor } from '@/lib/pos/parse-amount';
import { SHOW_MARGIN_ON_SCREEN } from '@/lib/pos/ui-flags';
import { classifyPrice, priceFloorMinor } from '@moysklad/money';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { formatMoney, noAccidentalClose } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { Lock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Tahrirlanayotgan savat qatori.
 *
 * ⚠️ `quantity` — **DECIMAL SATR** (`Decimal(20,6)`), `number` EMAS: og'irlik
 * bilan sotiladigan tovar 1.5 kg bo'lishi mumkin va `BigInt(1.5)` RangeError
 * otib butun POS ni oq ekranga aylantirardi (F8 audit sabog'i).
 */
export interface CartLineEditTarget {
  productId: string;
  productName: string;
  quantity: string;
  /** Kassir yozgan narx matni (major birlik) — ko'ringan narsa saqlanadi. */
  priceStr: string;
  priceMinor: bigint;
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
  basePriceMinor: bigint | null;
  availableStock?: number;
  /**
   * K3 — «Bo'lak hisobi yuritilsin» (`Product.pieceTracked`): kabel, sim,
   * shlang. Faqat SHU tovarlarda oynada bo'lak paneli ochiladi; qolganlarida
   * ekran bir bayt ham o'zgarmaydi (K3 qabul mezoni).
   */
  pieceTracked?: boolean;
  /** Kassir kelishgan bo'lak uzunliklari (`['150','30']`) — K3/3-vazifa. */
  pieceLengths?: string[];
}

export interface CartLineEditResult {
  /** `normalizeQtyDecimal` dan o'tgan miqdor — server sxemasi shaklida. */
  quantity: string;
  /** Maydonda ko'ringan matn (bo'sh bo'lishi MUMKIN). */
  priceStr: string;
  priceMinor: bigint;
  /**
   * K3 — kassir mijoz bilan kelishgan bo'lak uzunliklari (`['150','30']`).
   * `undefined` = kelishuv yo'q (yoki tovar bo'linadigan emas). Miqdorni
   * O'ZGARTIRMAYDI: `150 + 30 = 180` — bu TARKIB, yangi miqdor emas.
   */
  pieceLengths?: string[];
}

interface Props {
  /** `null` — oyna yopiq. */
  line: CartLineEditTarget | null;
  /** Kassa valyutasi — major→minor scale (FE-08). */
  currency?: CurrencyCode;
  /** Zakazga bog'langan savat (`payingOrderId`) — faqat ko'rish. */
  readOnly?: boolean;
  onClose: () => void;
  onSave: (next: CartLineEditResult) => void;
  onRemove: () => void;
}

type Field = 'qty' | 'price';

/**
 * Numpad — `rasmilashtirish-modal.tsx` dagi naqsh, lekin `000` o'rniga `.`:
 * bu yerda miqdor ham kiritiladi va u kasr bo'lishi mumkin (1.5 kg).
 */
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Maydon uzunligi chegarasi — 13 xonali summa `bigint` da ham xavfsiz. */
const MAX_LEN = 12;

export function CartLineEditModal({
  line,
  currency = 'UZS',
  readOnly = false,
  onClose,
  onSave,
  onRemove,
}: Props) {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');

  const [loadedId, setLoadedId] = useState<string | null>(line?.productId ?? null);
  const [qtyInput, setQtyInput] = useState(line?.quantity ?? '');
  /**
   * K3 — kassir qabul qilgan bo'lak taklifi (`['150','30']`).
   * Miqdor qo'lda o'zgartirilsa TOZALANADI: eski kelishuv yangi miqdorga
   * yolg'on bo'lardi (mijoz 180 ga rozi bo'lgan, kassir 200 yozgan).
   */
  const [pieceLengths, setPieceLengths] = useState<string[] | undefined>(line?.pieceLengths);
  const [priceInput, setPriceInput] = useState(line?.priceStr ?? '');
  const [activeField, setActiveField] = useState<Field>('qty');
  /**
   * Numpadning KEYINGI bosishi maydonni almashtiradimi.
   *
   * Kassa terminallarining odatiy xulqi: oyna ochilgach «5» bosilsa soni 5
   * bo'ladi, 25 emas. Aks holda kassir avval eski qiymatni ⌫ bilan tozalashi
   * kerak bo'lardi — ya'ni oyna hal qilayotgan muammoning o'zi qaytardi.
   * ⌫ esa bu rejimni UZADI: u aynan mavjud qiymatni tahrirlash uchun bor.
   */
  const [replaceNext, setReplaceNext] = useState(true);
  /** Kassa qobig'imi (exe)? Effektda — SSR/hydration xavfsiz. Qobiqda faol
   *  maydon haqiqiy input EMAS (`rasmilashtirish-modal.tsx` bilan bir sabab:
   *  input fokusi qobiq ekran-klaviaturasini chaqirib, oynaning o'z numpadini
   *  bosib qo'yardi). */
  const [shell, setShell] = useState(false);
  useEffect(() => {
    setShell(isShersetShell());
  }, []);

  /**
   * Boshqa qatorga o'tilganda (yoki oyna qayta ochilganda) maydonlar qayta
   * yuklanadi — React'ning «prop o'zgarganda holatni to'g'rilash» naqshi
   * (`useEffect` EMAS: effekt bir render kechikadi va oyna bir kadrga eski
   * qiymat bilan ochilardi). Kuzatiladigan yagona qiymat — `productId`:
   * miqdor/narxni ham kuzatsak, kassir yozayotgan paytda savat massivining
   * har yangilanishi maydonni o'z-o'zidan tiklab turardi.
   */
  if (line != null && line.productId !== loadedId) {
    setLoadedId(line.productId);
    setQtyInput(line.quantity);
    setPriceInput(line.priceStr);
    setPieceLengths(line.pieceLengths);
    setActiveField('qty');
    setReplaceNext(true);
  }
  // Yopilganda «yuklangan» belgisi tozalanadi — aks holda AYNI qator qayta
  // ochilganda saqlanmagan eski tahrir qaytib chiqardi.
  if (line == null && loadedId != null) setLoadedId(null);

  const setActive = activeField === 'qty' ? setQtyInput : setPriceInput;

  /**
   * Miqdorga QO'LDA tegilganda bo'lak kelishuvi bekor bo'ladi (K3).
   * Sabab: `150 + 30` mijoz 180 ga rozi bo'lgani uchun yozilgan; kassir
   * miqdorni 200 qilsa, o'sha tarkib omborchiga YOLG'ON ko'rsatma bo'lardi.
   */
  const clearPiecesOnQtyEdit = () => {
    if (activeField === 'qty') setPieceLengths(undefined);
  };

  const selectField = (field: Field) => {
    setActiveField(field);
    setReplaceNext(true);
  };

  const handleKey = (key: string) => {
    clearPiecesOnQtyEdit();
    if (key === '⌫') {
      setReplaceNext(false);
      setActive((prev) => prev.slice(0, -1));
      return;
    }
    setActive((prev) => {
      const base = replaceNext ? '' : prev;
      if (key === '.') {
        if (base.includes('.')) return base;
        return base === '' ? '0.' : `${base}.`;
      }
      const next = base + key;
      return next.length > MAX_LEN ? base : next;
    });
    setReplaceNext(false);
  };

  if (line == null) return null;

  // ── Jonli hisob (savat qatori bilan AYNI funksiyalar) ─────────────────────
  const quantity = normalizeQtyDecimal(qtyInput);
  // FE-08/FE-09: yagona pul-parse. Bo'sh/buzuq kiritma → `0n`, ESKI narx EMAS
  // (K-3 shartnomasi: ko'ringan narsa = yuboriladigan narsa).
  const priceMinor = parseAmountToMinor(priceInput, currency);
  /**
   * Pol = min(tan narx, karta chakana narxi); tan narx NULL bo'lsa pol YO'Q
   * (NULL ≠ 0). 🔴 2026-08-16 dan bu QULF EMAS — sotishni hech nima to'smaydi;
   * qiymat faqat narx TASMASINI (rang) hisoblash uchun qoldi, ya'ni kassir
   * «bu narx tan narxdan past» ekanini ko'radi, lekin baribir sotaveradi.
   */
  const floorMinor = priceFloorMinor({
    costMinor: line.costMinor,
    basePriceMinor: line.basePriceMinor,
  });
  // Tasma endi POLga nisbatan (tan narxga emas): karta narxining o'zi tan
  // narxdan past bo'lgan 46 tovarda (prodda o'lchangan) o'z narxida sotish
  // ruxsat etilgan — ular qizil «zarar» deb belgilanmasligi kerak.
  const band = classifyPrice({
    priceMinor,
    costMinor: floorMinor,
    wholesaleMinor: line.wholesaleMinor,
  });
  const totalMinor = cartLineRevenueMinor({ quantity, priceMinor });

  const handleSave = () => {
    if (readOnly) return;
    // 🔴 2026-08-16, egasi: NARX CHEKLOVI YO'Q — poldan past ham, 0 ham (bepul)
    // saqlanadi. Ilgari shu yerda `blocked` qulfi turardi.
    // Soni 0 ⇒ qator o'chadi — savatdagi «−» tugmasi bilan AYNI xulq
    // (`addQtyDecimal` manfiy natijani `'0'` ga qisadi, chaqiruvchi qatorni
    // olib tashlaydi). Aks holda savatda 0 dona qator qolib, chek unga
    // 0 summa bilan tushardi.
    if (quantity === '0') {
      onRemove();
      return;
    }
    onSave({ quantity, priceStr: priceInput, priceMinor, pieceLengths });
  };

  const activeValue = activeField === 'qty' ? qtyInput : priceInput;
  const bandClass =
    band === 'loss'
      ? 'border-red-400 bg-red-50'
      : band === 'below-wholesale'
        ? 'border-amber-400 bg-amber-50'
        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)]';

  return (
    /* 🔴 `modal={false}` ATAYLAB — sabab `rasmilashtirish-modal.tsx` dagi izohda
       (Radix modal rejimi qobiq ekran-klaviaturasini bosib qo'yardi). Tashqi
       bosishdan `noAccidentalClose` himoya qiladi; fon — o'z qatlamimiz. */
    <Dialog.Root
      modal={false}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <div aria-hidden className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        {/* K-1: tavsif matni ataylab yo'q — Radix'ning rasmiy opt-out'i. */}
        <Dialog.Content
          {...noAccidentalClose}
          aria-describedby={undefined}
          data-test-id="pos-line-edit"
          data-price-band={band}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[94dvh] w-[min(96vw,34rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none"
        >
          {/* Sarlavha — tovar nomi kassirning yagona mo'ljali */}
          <div className="shrink-0 rounded-t-2xl border-[var(--ms-border)] border-b bg-[var(--ms-bg-app)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
                  {t('line_edit_title')}
                </Dialog.Title>
                {/* P04 (2026-08-13): mahsulot nomi POS shriftida (font-pos). */}
                <div className="mt-0.5 truncate font-pos font-bold text-[var(--ms-text-primary)] text-xl leading-tight">
                  {line.productName}
                </div>
                {line.availableStock !== undefined && (
                  <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                    {t('cart_remaining')}:{' '}
                    <span className="tabular-nums">{line.availableStock}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                data-test-id="pos-line-edit-close"
                onClick={onClose}
                aria-label={tCommon('close')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
            {/* Soni + Narx — katta bosiladigan kartochkalar */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { field: 'qty' as const, label: t('line_edit_qty'), text: quantity },
                  {
                    field: 'price' as const,
                    label: t('cart_price'),
                    text: formatMoney(priceMinor),
                  },
                ] satisfies Array<{ field: Field; label: string; text: string }>
              ).map(({ field, label, text }) =>
                readOnly ? (
                  <div
                    key={field}
                    data-test-id={`pos-line-edit-${field}`}
                    className="rounded-xl border-2 border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-4 py-3"
                  >
                    <div className="font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
                      {label}
                    </div>
                    <div className="mt-0.5 truncate font-bold text-2xl tabular-nums leading-none">
                      {text}
                    </div>
                  </div>
                ) : (
                  <button
                    key={field}
                    type="button"
                    data-test-id={`pos-line-edit-${field}`}
                    onClick={() => selectField(field)}
                    className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                      activeField === field
                        ? 'border-[var(--ms-brand)] bg-[var(--ms-bg-hover)]'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)]'
                    }`}
                  >
                    <div className="font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
                      {label}
                    </div>
                    <div className="mt-0.5 truncate font-bold text-2xl tabular-nums leading-none">
                      {text}
                    </div>
                  </button>
                ),
              )}
            </div>

            {/* Qator jamisi + narx tasmasi — narx oynada tushirilsa,
                ogohlantirish ham shu yerda ko'rinsin (savatda qolib ketmasin) */}
            <div className={`rounded-xl border-2 px-4 py-3 ${bandClass}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
                  {t('total')}
                </span>
                <span
                  data-test-id="pos-line-edit-total"
                  className="font-bold text-2xl tabular-nums leading-none"
                >
                  {formatMoney(totalMinor)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {/* Tan narx — ekranda KO'RSATILMAYDI (`lib/pos/ui-flags.ts`).
                    Oyna savat qatori bilan BIR XIL siyosatga bo'ysunadi: aks
                    holda raqam savatdan yashirilib, oynada ochiq qolardi. */}
                {SHOW_MARGIN_ON_SCREEN && (
                  <span data-test-id="pos-line-edit-cost" className="text-[var(--ms-text-muted)]">
                    {t('cart_cost')}:{' '}
                    <span className="tabular-nums">
                      {line.costMinor != null ? formatMoney(line.costMinor) : '—'}
                    </span>
                  </span>
                )}
                {line.wholesaleMinor != null && (
                  <span className="text-[var(--ms-text-muted)]">
                    {t('cart_min')}:{' '}
                    <span className="tabular-nums">{formatMoney(line.wholesaleMinor)}</span>
                  </span>
                )}
                {/* 🔴 P12 — ZARAR belgisi va «tushirildi» summasi ATAYLAB YO'Q.
                    Egasi (2026-08-11, monoblokda) ularni pastki chegara bilan
                    almashtirdi: kassirga «qancha yo'qotding» emas, «qayergacha
                    tushirsa bo'ladi» kerak. Foyda RAQAMI hamon yashirin
                    (`ui-flags.ts`) — faqat chegara ko'rinadi, egasi buni bilib
                    tanladi. */}
                {band === 'below-wholesale' && (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-[10px] text-white">
                    {t('cart_below_wholesale')}
                  </span>
                )}
              </div>
            </div>

            {/* K3 — bo'linadigan tovar (kabel/sim/shlang): bo'lak TARKIBI,
                «eng uzun uzluksiz» va so'ralgan miqdor uchun taklif. Bayrog'i
                o'chiq tovarda panel UMUMAN chizilmaydi (ichida `null`), ya'ni
                oyna avvalgidek qoladi. Panel FAQAT O'QIYDI. */}
            {line.pieceTracked && (
              <PieceOfferPanel
                productId={line.productId}
                quantity={quantity}
                onApplySplit={
                  readOnly
                    ? undefined
                    : (lengths) => {
                        // Miqdor O'ZGARMAYDI — 150 + 30 aynan o'sha 180.
                        // Yozilgani TARKIB: kassir mijoz bilan nimaga
                        // kelishganini omborchi ko'rsin (savat qatorida).
                        setPieceLengths(lengths);
                      }
                }
              />
            )}

            {/* K3 — kassir qabul qilgan bo'lak kelishuvi (savatga shu tushadi). */}
            {pieceLengths && pieceLengths.length > 1 && (
              <div
                data-test-id="pos-line-edit-pieces"
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[14px] text-amber-900"
              >
                <span className="font-semibold tabular-nums">
                  {t('line_edit_pieces')}: {pieceLengths.join(' + ')}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    data-test-id="pos-line-edit-pieces-clear"
                    onClick={() => setPieceLengths(undefined)}
                    className="min-h-[44px] rounded-lg px-3 font-semibold text-[13px] underline"
                  >
                    {tCommon('cancel')}
                  </button>
                )}
              </div>
            )}

            {readOnly ? (
              // Zakazga bog'langan savat: narx/miqdor zakaz hujjatining ishi.
              // Numpad UMUMAN chizilmaydi — «bosildi-yu hech nima bo'lmadi»
              // holati kassirni chalg'itardi.
              <div
                data-test-id="pos-line-edit-locked"
                className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm"
              >
                <Lock className="h-4 w-4 shrink-0" />
                {t('line_edit_locked')}
              </div>
            ) : (
              <>
                {/* Faol maydon — brauzerda haqiqiy input: qurilma klaviaturasi
                    ham ishlasin. `type="text"` ATAYLAB: `type="number"` oraliq
                    holatni («1.») yeydi va kasr miqdor kiritib bo'lmasdi
                    (FE-02). QOBIQDA esa ko'rsatkich-div (yuqoridagi `shell`
                    izohi) — kiritish faqat oynaning o'z numpadidan. */}
                {shell ? (
                  <div
                    data-test-id="pos-line-edit-display"
                    className="w-full rounded-xl border-2 border-[var(--ms-brand)] bg-white px-4 py-3 text-right font-bold text-3xl tabular-nums"
                  >
                    {activeValue || '0'}
                  </div>
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    data-test-id="pos-line-edit-input"
                    aria-label={activeField === 'qty' ? t('line_edit_qty') : t('cart_price')}
                    value={activeValue}
                    onChange={(e) => {
                      clearPiecesOnQtyEdit();
                      setActive(e.target.value);
                      setReplaceNext(false);
                    }}
                    placeholder="0"
                    className="w-full rounded-xl border-2 border-[var(--ms-brand)] bg-white px-4 py-3 text-right font-bold text-3xl tabular-nums outline-none"
                  />
                )}

                <div className="grid grid-cols-3 gap-2">
                  {NUMPAD_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleKey(k)}
                      className={`h-14 rounded-xl border font-semibold text-2xl transition-all active:scale-95 ${
                        k === '⌫'
                          ? 'border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-[var(--ms-text-muted)]'
                          : 'border-[var(--ms-border)] bg-white text-[var(--ms-text-primary)] shadow-sm'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {!readOnly && (
            <div className="flex shrink-0 gap-3 border-[var(--ms-border)] border-t p-4">
              <button
                type="button"
                data-test-id="pos-line-edit-remove"
                onClick={onRemove}
                className="h-14 rounded-xl border-2 border-red-300 px-6 font-bold text-red-600 text-sm hover:bg-red-50"
              >
                {tCommon('delete')}
              </button>
              {/* Narx cheklovi yo'q ⇒ tugma HAR DOIM faol: istalgan narx,
                  shu jumladan 0 (bepul), saqlanadi. */}
              <button
                type="button"
                data-test-id="pos-line-edit-save"
                onClick={handleSave}
                className="h-14 flex-1 rounded-xl bg-emerald-500 font-bold text-base text-white shadow-md hover:bg-emerald-600 active:scale-[0.99]"
              >
                {tCommon('save')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
