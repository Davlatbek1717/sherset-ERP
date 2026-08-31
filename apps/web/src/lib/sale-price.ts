import { toBaseMinor as toBaseMinorExact } from '@moysklad/money';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './api-client';

/**
 * Sale-price resolution shared across every product/variant/service/document
 * screen. The model (matching moysklad) keys each stored price by the real
 * PriceType id. Some legacy rows still use the string sentinels below; this
 * layer reads BOTH so the app stays correct during + after the id migration.
 */

/** Legacy sentinel for the retail (account-default) tier — pre-id storage. */
export const RETAIL_SENTINEL = 'default';
/** Legacy sentinel for the second (wholesale) tier — pre-id storage. */
export const WHOLESALE_SENTINEL = 'wholesale';

export interface SalePriceEntry {
  priceTypeId: string;
  value: string;
  currencyCode?: string;
}

type SalePricesLike =
  | ReadonlyArray<{ priceTypeId?: string; value?: string; currencyCode?: string | null }>
  | null
  | undefined;

/** Bitta valyutaning kurs ma'lumoti (server `/currencies` javobidan). */
export interface CurrencyRateLite {
  /** rate × 1e8, butun son satr ko'rinishida. */
  rateValue: string;
  /** «Кратность» — kurs necha birlik uchun berilgan (sukut 1). */
  multiplicity?: number;
  /** Teskari kotirovka: 1 baza = rate/multiplicity xorijiy. */
  indirect?: boolean;
}

/**
 * Akkauntning valyuta jadvali — `useCurrencyRates()` dan keladi.
 *
 * `base` — hisobga olish valyutasi kodi (`Currency.default`). U SHART, chunki
 * server sxemasida `salePrices[].currencyCode` MAJBURIY va sukut qiymati
 * `'UZS'` (`SalePriceSchema`): ya'ni saqlangan har bir yangi narxda kod
 * bo'ladi. Bazani alohida bilmasak, oddiy so'mlik narx ham «noma'lum valyuta»
 * bo'lib ko'rinmay qolardi.
 *
 * `loaded` — jadval hali kelmaganini bildiradi (quyidagi `toBaseMinor` ga qara).
 */
export interface CurrencyRates {
  base: string | null;
  loaded: boolean;
  byCode: Readonly<Record<string, CurrencyRateLite>>;
}

/**
 * Bir narx yozuvini baza valyutasiga o'giradi.
 *
 * Shartnoma (2026-08-23, egasining qarori «kurs bilan o'qilsin»):
 *   • valyuta ko'rsatilmagan → qiymat allaqachon bazada, tegilmaydi;
 *   • kursi ma'lum → yagona kanonik formula (`convertByRateE8`) bilan o'giriladi;
 *   • kursi NOMA'LUM → `null`. Xom sonni qaytarish «10 dollar = 10 so'm»
 *     xatosini qayta tug'diradi, shuning uchun bunday narx KO'RSATILMAYDI —
 *     loyihaning «kursi yo'q pul jamiga qo'shilmaydi» shartnomasi bilan bir xil.
 *
 * EKSPORT — POS savat qatori tannarxni (`Product.buyPrice` +
 * `buyPriceCurrency`) AYNI shu shartnoma bilan o'giradi («Tannarx: ***»,
 * 2026-09-01): sotuv narxi va tannarx ikki xil formula bilan o'girilsa,
 * band-tasma (zarar/optomdan past) o'z-o'ziga zid raqamlarga qarab qolardi.
 */
export function toBaseMinor(
  value: string | undefined,
  currencyCode: string | null | undefined,
  rates: CurrencyRates | undefined,
): string | null {
  if (value == null) return null;
  // Kod yo'q — eski yozuvlar (import shu shaklda yozgan): allaqachon bazada.
  if (!currencyCode) return value;
  // Chaqiruvchi kurs jadvalini UMUMAN uzatmagan — bu chaqiruvchi xatosi
  // (qo'riqchi test uni mexanik taqiqlaydi). Xom sonni o'tkazish «10 dollar =
  // 10 so'm» xatosini qaytaradi, shuning uchun bunday narx ko'rsatilmaydi.
  if (!rates) return null;
  // Jadval yo'lda: qiymat XOMLIGICHA ko'rsatiladi — bu aynan kechagi xulq.
  // Muqobili — har sahifa yuklanishida barcha narxlarni bir zumga bo'shatib
  // qo'yish bo'lardi. Jadval kelgach qoida qat'iy ishlaydi.
  if (!rates.loaded) return value;
  // Baza valyutasining o'zi — o'girish kerak emas (identity).
  if (currencyCode === rates.base) return value;
  const r = rates.byCode[currencyCode];
  if (r == null) return null;
  return toBaseMinorExact(BigInt(value), {
    rateValue: BigInt(r.rateValue),
    multiplicity: BigInt(r.multiplicity ?? 1),
    indirect: r.indirect ?? false,
  }).toString();
}

/**
 * Resolve the DEFAULT (retail) sale price value (minor-unit string) for a
 * product/variant/service. Matches, in order: the real default PriceType id
 * (when known) → the legacy 'default' sentinel → the first listed price.
 * Returns null when there is no price.
 */
export function resolveDefaultSalePrice(
  salePrices: SalePricesLike,
  defaultPriceTypeId?: string | null,
  rates?: CurrencyRates,
): string | null {
  const list = salePrices ?? [];
  if (list.length === 0) return null;
  const byId = defaultPriceTypeId
    ? list.find((p) => p.priceTypeId === defaultPriceTypeId)
    : undefined;
  const chosen = byId ?? list.find((p) => p.priceTypeId === RETAIL_SENTINEL) ?? list[0];
  return toBaseMinor(chosen?.value, chosen?.currencyCode, rates);
}

/**
 * As {@link resolveDefaultSalePrice} but yields '0' instead of null — the
 * convention used when prefilling a document position price.
 */
export function resolveDefaultSalePriceOrZero(
  salePrices: SalePricesLike,
  defaultPriceTypeId?: string | null,
  rates?: CurrencyRates,
): string {
  return resolveDefaultSalePrice(salePrices, defaultPriceTypeId, rates) ?? '0';
}

/**
 * Resolve the WHOLESALE («Оптовая цена») tier — the negotiated floor the POS
 * cart warns below (kassa TZ §5.1). Matches the real wholesale PriceType id
 * (when known) → the legacy 'wholesale' sentinel. Unlike the retail resolver
 * there is deliberately NO "first listed price" fallback: guessing here would
 * invent a floor out of the retail price and paint every normal sale yellow.
 * Returns null when the product has no wholesale tier.
 */
/**
 * Aniq narx qavati bo'yicha qiymat — «Расценить» (reprice) uchun.
 *
 * Hujjat sahifalari bu ishni `salePrices.find(...)?.value` bilan XOM qilardi
 * va valyuta o'girishni chetlab o'tardi (2026-08-23 auditi) — resolver
 * shartnomasi to'sib turgan xatoni boshqa eshikdan qaytarardi.
 *
 * `null` — qavat topilmadi YOKI kursi noma'lum: ikkala holatda ham chaqiruvchi
 * qator narxiga TEGMASLIGI kerak (noto'g'ri son yozishdan ko'ra eskisi qolgani
 * yaxshi).
 */
export function resolveSalePriceByType(
  salePrices: SalePricesLike,
  priceTypeId: string,
  rates?: CurrencyRates,
): string | null {
  const chosen = (salePrices ?? []).find((p) => p.priceTypeId === priceTypeId);
  if (!chosen) return null;
  return toBaseMinor(chosen.value, chosen.currencyCode, rates);
}

export function resolveWholesaleSalePrice(
  salePrices: SalePricesLike,
  wholesalePriceTypeId?: string | null,
  rates?: CurrencyRates,
): string | null {
  const list = salePrices ?? [];
  if (list.length === 0) return null;
  const chosen =
    (wholesalePriceTypeId ? list.find((p) => p.priceTypeId === wholesalePriceTypeId) : undefined) ??
    list.find((p) => p.priceTypeId === WHOLESALE_SENTINEL);
  return toBaseMinor(chosen?.value, chosen?.currencyCode, rates);
}

interface CurrencyLite {
  code: string;
  /** Canonical ×10^8 rate to the account's base currency. */
  rateValue: string;
  multiplicity?: number;
  indirect?: boolean;
  default: boolean;
}

/**
 * Valyuta kurslari (kod → ×10^8), narx o'girish uchun.
 *
 * Baza valyutasi ATAYLAB chiqarib tashlanadi: uning kursi 1 va uni jadvalda
 * saqlash «bazani bazaga o'girish» degan ortiqcha yo'l ochadi. Narx yozuvida
 * valyuta ko'rsatilmagan bo'lsa u allaqachon bazada deb qabul qilinadi.
 */
export function useCurrencyRates(): CurrencyRates {
  const { data } = useQuery<{ items: CurrencyLite[] }>({
    queryKey: ['currencies', 'rates'],
    queryFn: () => api.get<{ items: CurrencyLite[] }>('/currencies?limit=100'),
    staleTime: 60_000,
  });
  // Referens BARQAROR bo'lishi shart: chaqiruvchilar `rates` ni `useMemo` /
  // `useCallback` bog'liqliklariga qo'shadi, har renderda yangi obyekt qaytarish
  // esa o'sha memo'larni har safar qayta hisoblatadi (POS savati, jadval
  // ustunlari). Kurslar faqat so'rov javobi o'zgarganda qayta quriladi.
  return useMemo(() => {
    const byCode: Record<string, CurrencyRateLite> = {};
    let base: string | null = null;
    for (const c of data?.items ?? []) {
      if (!c.code) continue;
      if (c.default) base = c.code;
      if (c.rateValue != null) {
        byCode[c.code] = {
          rateValue: String(c.rateValue),
          multiplicity: c.multiplicity,
          indirect: c.indirect,
        };
      }
    }
    return { base, loaded: data != null, byCode };
  }, [data]);
}

interface PriceTypeLite {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  currency: string;
  archived: boolean;
}

/**
 * Account price types (cached) plus the resolved default + wholesale ids that
 * WRITE paths stamp onto salePrices. `wholesaleId` is the first non-default
 * type by position (the «Оптовая» tier), or null when the account has only one.
 */
export function usePriceTypeIds(): {
  priceTypes: PriceTypeLite[];
  defaultId: string | null;
  wholesaleId: string | null;
} {
  const { data } = useQuery<{ items: PriceTypeLite[] }>({
    queryKey: ['price-types', 'ids'],
    queryFn: () => api.get<{ items: PriceTypeLite[] }>('/price-types?limit=50'),
    staleTime: 60_000,
  });
  const priceTypes = [...(data?.items ?? [])]
    .filter((t) => !t.archived)
    .sort((a, b) => a.position - b.position);
  const defaultId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;
  const wholesaleId = priceTypes.find((t) => t.id !== defaultId)?.id ?? null;
  return { priceTypes, defaultId, wholesaleId };
}
