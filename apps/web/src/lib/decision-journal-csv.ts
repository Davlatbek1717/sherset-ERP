import type { CsvColumn } from '@moysklad/ui';

/**
 * MK21 — «Qaror jurnali» eksport ustunlari (4M TZ §8.1/8).
 *
 * **Nega alohida modul:** eksport EKRANDAGI qatorlar massivining o'zidan
 * quriladi (ikkinchi so'rov emas) — shu tanlov «eksport ekran raqamiga mos»
 * talabini tuzilish darajasida kafolatlaydi: mos kelmaslik uchun ikkinchi
 * ma'lumot manbai kerak bo'lardi, u esa yo'q. Ustunlar sof funksiyada
 * bo'lgani uchun parity testda tekshiriladi.
 */

export interface DecisionMoneyRow {
  kind: string;
  /** Tiyin, BigInt JSON'da satr. Teskari (bekor qilish) yozuvi MANFIY. */
  amountMinor: string;
}

export interface DecisionJournalRow {
  key: string;
  source: string;
  eventId: string;
  occurredAt: string;
  action: string;
  fromState: string;
  toState: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  subjectId: string;
  subjectLabel: string;
  subjectEmployeeId: string | null;
  subjectEmployeeName: string | null;
  reasonCode: string | null;
  comment: string | null;
  money: DecisionMoneyRow[];
  voided: boolean;
  voidedByKey: string | null;
}

/**
 * Ko'p qatorli izohni BIR CSV katagiga siqadi.
 *
 * RFC 4180 bo'yicha qo'shtirnoq ichidagi `\n` to'g'ri, lekin fayl qatorlari
 * soni qatorlar sonidan ko'p bo'lib qolardi — «eksportda 40 qator» degan
 * savolga ikki xil javob paydo bo'lardi. Shuning uchun matn ichidagi qator
 * uzilishi ko'rinadigan ajratgichga aylantiriladi.
 */
export function flattenCell(text: string | null | undefined): string {
  return (text ?? '').replace(/\r?\n/g, ' / ').trim();
}

/** «Natijasi» ustunining pul yarmi: `bonus +50 000 · fine −10 000`. */
export function moneyText(money: DecisionMoneyRow[]): string {
  return money
    .map((m) => {
      const n = BigInt(m.amountMinor);
      const sign = n < 0n ? '-' : '+';
      const abs = n < 0n ? -n : n;
      return `${m.kind} ${sign}${abs.toString()}`;
    })
    .join(' · ');
}

/**
 * Eksport ustunlari. `t` — ekranning o'z tarjimoni: sarlavhalar va kod
 * nomlari ekranda nima ko'rinsa, faylda ham SHU ko'rinadi.
 */
export function decisionCsvColumns(
  t: (key: string) => string,
  formatDate: (iso: string) => string,
): CsvColumn<DecisionJournalRow>[] {
  return [
    { header: t('col_when'), cellText: (r) => formatDate(r.occurredAt) },
    { header: t('col_source'), cellText: (r) => t(`source_${r.source}`) },
    { header: t('col_subject'), cellText: (r) => flattenCell(r.subjectLabel) },
    { header: t('col_subject_employee'), cellText: (r) => flattenCell(r.subjectEmployeeName) },
    { header: t('col_action'), cellText: (r) => t(`action_${r.action}`) },
    { header: t('col_transition'), cellText: (r) => `${r.fromState} → ${r.toState}` },
    // Ism topilmasa — kimligi ID bilan qoladi, «Tizim» deb yozilmaydi.
    {
      header: t('col_actor'),
      cellText: (r) => flattenCell(r.actorName ?? r.actorId ?? ''),
    },
    { header: t('col_actor_role'), cellText: (r) => t(`actor_${r.actorType}`) },
    {
      header: t('col_reason'),
      cellText: (r) => (r.reasonCode ? t(`reason_${r.reasonCode}`) : ''),
    },
    { header: t('col_comment'), cellText: (r) => flattenCell(r.comment) },
    { header: t('col_result_money'), cellText: (r) => moneyText(r.money) },
    // Bekor qilingan qaror faylda ham KO'RINADI — jimgina tushib qolmaydi.
    { header: t('col_voided'), cellText: (r) => (r.voided ? t('voided_yes') : '') },
  ];
}
