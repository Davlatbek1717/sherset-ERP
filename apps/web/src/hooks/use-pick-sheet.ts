'use client';

/**
 * Omborchi varag'i (yacheykali) — BITTA joyda yig'iladi.
 *
 * Ilgari bu mantiq faqat `demands/[id]` ichida qo'lda yozilgan edi va uni
 * ko'chirib yurish 4-marta takrorlanishga olib kelardi. Bu hook uni umumiy
 * qiladi va o'sha nusxadagi ikki kamchilikni ham yopadi:
 *
 *  1. **Qatorning O'Z yacheykasi ustun.** Eski nusxa qator `cell`ini butunlay
 *     e'tiborsiz qoldirib, HAR SAFAR tovarning standart yacheykasini so'rardi.
 *     Hujjatda «bu tovar 01-02-03 dan olindi» deb yozilgan bo'lsa ham, varaqda
 *     tovarning boshqa (standart) yacheykasi chiqishi mumkin edi — omborchi
 *     noto'g'ri javonga borardi. Endi: qatorda yacheyka bo'lsa — o'sha,
 *     bo'lmasa — tovarning standarti.
 *  2. **So'rov faqat kerak bo'lganda.** Standart yacheyka faqat yacheykasi
 *     YO'Q qatorlar uchun so'raladi; hammasi to'ldirilgan bo'lsa — tarmoqqa
 *     umuman chiqilmaydi.
 *
 * Sarlavha chaqiruvchidan keladi, chunki ma'no bo'limga qarab teskari:
 * chiqim hujjatlarida bu «yig'ish» (omborchi tovarni javondan OLADI), kirim
 * hujjatlarida esa «joylashtirish» (tovarni javonga QO'YADI).
 */

import type { ReceiptData } from '@/components/pick-list/receipt-print-portal';
import { receiptDate } from '@/components/pick-list/receipt-print-portal';
import { api } from '@/lib/api-client';
import { useCallback, useState } from 'react';

export interface PickSheetRow {
  /** Tovar/variant id — bo'sh qatorlar varaqqa tushmaydi. */
  assortmentId?: string | null;
  productLabel: string;
  productUom?: string | null;
  quantity: string | number;
  /** Qatorning o'z yacheykasi (hujjatda tanlangan) — bo'lsa shu ustun oladi. */
  cell?: string | null;
}

export interface PickSheetInput {
  /** «Yig'ish varag'i» / «Joylashtirish varag'i» — chaqiruvchi lokalizatsiya qiladi. */
  title: string;
  /** Hujjat raqami. */
  number: string;
  /** ISO sana. */
  moment: string;
  agentName?: string | null;
  agentPhone?: string | null;
  ownerName?: string | null;
  description?: string | null;
  rows: PickSheetRow[];
}

/**
 * Hujjat qatoridagi yacheyka yorlig'ini SOF yacheyka kodiga keltiradi.
 *
 * Qatorda yorliq `cellPickerLabel()` bilan «Зона / Ячейка» ko'rinishida
 * saqlanadi (schema: `cell` = denormalizatsiyalangan yorliq, 255 belgigacha).
 * Varaq esa sof kod kutadi va uni ikki joyda ishlatadi:
 *   · `warehouseOfCell()` — kodning `-` bo'yicha BIRINCHI bo'lagi = ombor raqami.
 *     «Zona A / 01-02-03» berilsa, ombor «Zona A / 01» bo'lib chiqadi va har
 *     zona alohida soxta ombor guruhiga bo'linadi;
 *   · yacheyka ustuni — 19mm, `whitespace-nowrap`. Zona prefiksi bilan yorliq
 *     ikki barobar uzayadi va termal printer uni QIRQIB tashlaydi — omborchi
 *     aynan kerakli raqamni yo'qotadi.
 * Shuning uchun oxirgi `/` dan keyingi qism olinadi (zona nomida `/` bo'lsa ham).
 */
export function cellCode(label: string | null | undefined): string | null {
  if (!label) return null;
  const code = label.split('/').pop()?.trim();
  return code ? code : null;
}

export function usePickSheet() {
  const [sheet, setSheet] = useState<ReceiptData | null>(null);

  const openSheet = useCallback(async (input: PickSheetInput) => {
    const rows = input.rows.filter((r) => r.assortmentId);

    // Standart yacheyka FAQAT o'z yacheykasi yo'q qatorlar uchun kerak.
    const missing = [...new Set(rows.filter((r) => !r.cell).map((r) => r.assortmentId as string))];
    let fallback: Record<string, string | null> = {};
    if (missing.length) {
      fallback = await api
        .get<{ cells: Record<string, string | null> }>(
          `/pick-lists/cells-by-products?productIds=${missing.join(',')}`,
        )
        .then((r) => r.cells)
        // Yacheyka topilmasa varaq baribir chiqsin — omborchi «Yacheykasiz»
        // guruhini ko'radi, bu bo'sh sahifadan foydaliroq.
        .catch(() => ({}) as Record<string, string | null>);
    }

    setSheet({
      title: input.title,
      number: input.number,
      dateStr: receiptDate(new Date(input.moment)),
      agentName: input.agentName ?? null,
      agentPhone: input.agentPhone ?? null,
      ownerName: input.ownerName ?? null,
      description: input.description ?? null,
      positions: rows.map((r) => ({
        name: r.productLabel,
        qty: r.quantity,
        uom: r.productUom ?? null,
        // Tovarning standart yacheykasi (`__yacheyka` atributi) allaqachon sof
        // kod; normalizatsiya faqat hujjat qatoridagi yorliqqa kerak.
        cell: cellCode(r.cell) ?? fallback[r.assortmentId as string] ?? null,
      })),
    });
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  return { sheet, openSheet, closeSheet };
}
