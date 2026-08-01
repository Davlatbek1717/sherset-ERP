'use client';

/**
 * «TOVAR CHEKI» — tor (termal) savdo cheki shabloni (2026-07-17 talab).
 *
 * Foydalanuvchi ko'rsatgan namuna («Elektro sentr» cheki) tuzilishi:
 *   ┌──────── markazda ────────┐
 *   │  Tashkilot nomi (qalin)  │
 *   │  telefonlar qatori       │
 *   │  Tovar cheki № NNNNN     │
 *   │  от DD.MM.YYYY           │
 *   └──────────────────────────┘
 *   Sotuvchi: ...   Xaridor: ...   Telefon: ...   Izoh: ...
 *   № | Nomi | O'lch. | Soni | Narx | Summa   (to'liq chiziqli jadval)
 *   JAMI: ...
 *
 * Buyurtma (customer-order), jo'natma (demand) va xaridordan qaytarish
 * (sales-return) print sahifalari SHU bitta komponentni ishlatadi — eski A4
 * `PrintDoc` bu hujjatlar uchun almashtirildi (imzo-bloklari, TASHKILOT/
 * KONTRAGENT kartalari «tartibsiz» deb topildi). ThermalShell ichida
 * ishlatiladi: 80mm default, `?w=58` bilan 58mm.
 */

import { amountInWords } from '@moysklad/money';
import { useLocale, useTranslations } from 'next-intl';

export interface ChekPosition {
  position: number;
  name: string;
  code: string | null;
  uom: string | null;
  quantity: string;
  priceMinor: string;
  /** Qator jami (chegirma hisobga olingan). */
  sumMinor: string;
}

export interface TovarChekProps {
  /** «Tovar cheki» / «Qaytarish cheki» — i18n bilan chaqiruvchi beradi. */
  title: string;
  docNumber: string;
  /** ISO sana — chekda DD.MM.YYYY ko'rinishida chiqadi. */
  docDate: string;
  orgName: string;
  /** Tashkilot telefon(lar)i — vergul bilan bir qatorda chiqadi. */
  orgPhone?: string | null;
  /** Sotuvchi (hujjat egasi/mas'ul xodim). */
  sellerName?: string | null;
  buyerName: string;
  buyerPhone?: string | null;
  comment?: string | null;
  /** Asos hujjat (masalan qaytarish uchun jo'natma raqami) — ixtiyoriy qator. */
  reference?: string | null;
  positions: ChekPosition[];
  totalMinor: string;
  /** Chegirmasiz oraliq jami — farq bo'lsa «Chegirma» qatori chiqadi. */
  subtotalMinor?: string | null;
  /** Qog'oz eni (mm) — shrift shunga qarab moslashadi. */
  widthMm: number;
}

/** Tiyin → «15 600» ko'rinishidagi so'm (butun bo'lsa kasrsiz — namuna kabi). */
function fmtSom(minor: string): string {
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const som = abs / 100n;
  const tiyin = abs % 100n;
  const grouped = som.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body = tiyin === 0n ? grouped : `${grouped},${tiyin.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** "10.000" / "10" → «10», "2.5" → «2,5» (namuna: Кол-во ustuni butun). */
function fmtQty(q: string): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return q;
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function TovarChek({
  title,
  docNumber,
  docDate,
  orgName,
  orgPhone,
  sellerName,
  buyerName,
  buyerPhone,
  comment,
  reference,
  positions,
  totalMinor,
  subtotalMinor,
  widthMm,
}: TovarChekProps) {
  const t = useTranslations('pages.print');
  const wordsLocale = useLocale() === 'uz' ? 'uz' : 'ru';
  // 58mm tor lentada shrift bir pog'ona kichikroq (retail-sale cheki bilan bir intizom).
  const fs = widthMm === 58 ? 9 : 11;

  // Chegirma: oraliq jami bilan yakuniy summa farqi (musbat bo'lsagina ko'rsatiladi).
  const discountMinor =
    subtotalMinor != null ? (BigInt(subtotalMinor) - BigInt(totalMinor)).toString() : null;

  const cell: React.CSSProperties = {
    border: '1px solid #000',
    padding: '2px 3px',
    verticalAlign: 'top',
  };
  const num: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div
      style={{
        padding: '3mm 2.5mm',
        fontSize: fs,
        lineHeight: 1.3,
        color: '#000',
        // Namuna chek serif (Times) bilan — Courier (ThermalShell default) emas.
        fontFamily: '"Times New Roman", Times, serif',
      }}
      data-test-id="tovar-chek"
    >
      {/* ── Sarlavha: tashkilot + telefonlar + chek raqami + sana (markazda) ── */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: fs + 5 }}>{orgName}</div>
        {orgPhone && <div style={{ fontSize: fs }}>{orgPhone}</div>}
        <div style={{ fontWeight: 700, fontSize: fs + 4, marginTop: 2 }}>
          {title} № {docNumber}
        </div>
        <div style={{ fontWeight: 600 }}>{t('chek_dated', { date: fmtDate(docDate) })}</div>
      </div>

      {/* ── Rekvizit qatorlari (namunadagidek chapdan, qalin label bilan) ── */}
      <div style={{ marginTop: 4, fontWeight: 600 }}>
        {sellerName && (
          <div>
            {t('chek_seller')}: {sellerName}
          </div>
        )}
        <div>
          {t('chek_buyer')}: {buyerName}
        </div>
        {buyerPhone && (
          <div>
            {t('chek_phone')}: {buyerPhone}
          </div>
        )}
        <div>
          {t('chek_comment')}: {comment ?? ''}
        </div>
        {reference && (
          <div style={{ fontWeight: 400 }}>
            {t('chek_reference')}: {reference}
          </div>
        )}
      </div>

      {/* ── Pozitsiyalar jadvali — to'liq chiziqli, namunadagi 6 ustun ── */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginTop: 4,
          fontSize: fs,
        }}
      >
        <thead>
          <tr style={{ fontWeight: 700 }}>
            <td style={{ ...cell, width: 14, textAlign: 'center' }}>№</td>
            <td style={cell}>{t('chek_col_name')}</td>
            <td style={{ ...cell, width: 24, textAlign: 'center' }}>{t('chek_col_uom')}</td>
            <td style={{ ...cell, width: 26, textAlign: 'center' }}>{t('chek_col_qty')}</td>
            <td style={{ ...num, width: 52 }}>{t('chek_col_price')}</td>
            <td style={{ ...num, width: 58 }}>{t('chek_col_sum')}</td>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr key={p.position}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={cell}>{p.name}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{p.uom ?? '—'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{fmtQty(p.quantity)}</td>
              <td style={num}>{fmtSom(p.priceMinor)}</td>
              <td style={num}>{fmtSom(p.sumMinor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* Egasining namunasi (chek.png, 2026-08-01) UCHALA qatorni ham DOIM
              ko'rsatadi — chegirma 0 bo'lsa ham «Chegirma: 0» chiqadi. Ilgari
              chegirmasiz chekda faqat JAMI qatori chizilardi. */}
          <tr>
            <td colSpan={5} style={{ ...cell, textAlign: 'center', overflowWrap: 'anywhere' }}>
              {t('chek_subtotal')}:
            </td>
            <td style={num}>{fmtSom(subtotalMinor ?? totalMinor)}</td>
          </tr>
          <tr>
            <td colSpan={5} style={{ ...cell, textAlign: 'center', overflowWrap: 'anywhere' }}>
              {t('chek_discount')}:
            </td>
            <td style={num} data-test-id="chek-discount">
              {discountMinor ? fmtSom(discountMinor) : '0'}
            </td>
          </tr>
          <tr style={{ fontWeight: 700, fontSize: fs + 2 }}>
            <td
              colSpan={5}
              style={{ ...cell, textAlign: 'center', fontWeight: 700, overflowWrap: 'anywhere' }}
            >
              {t('chek_total')}:
            </td>
            <td style={num}>{fmtSom(totalMinor)}</td>
          </tr>
        </tfoot>
      </table>

      {/* ── Jadval ostidagi ikki qator (namunada bor edi, bizda YO'Q edi) ── */}
      {/* 80mm lenta ~302px — «Raqam bilan» satri uzun bo'lgani uchun o'ralishi
          SHART, aks holda termal printer o'ng chetini qirqib tashlaydi. */}
      <div style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
        <div>
          {t('chek_items_count')}:{' '}
          <b>
            {positions.length} {t('chek_items_unit')}
          </b>
        </div>
        {/* «Raqam bilan» — summa so'z bilan. Chek qog'ozda raqam
            o'zgartirilmasligi uchun yonida so'z bilan ham yoziladi. */}
        <div style={{ marginTop: 2 }}>
          {t('chek_in_words')}: <b>{amountInWords(totalMinor, 'UZS', wordsLocale)}</b>
        </div>
      </div>

      {/* ── Ajratgich + minnatdorchilik (namunadagidek markazda) ── */}
      <div style={{ borderTop: '1px solid #000', margin: '14px 0 8px' }} />
      <div style={{ textAlign: 'center', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <div>{t('chek_footer_legal')}</div>
        <div>{t('chek_footer_thanks')}</div>
      </div>
    </div>
  );
}
