/**
 * Kassir kesimi — analitika TZ §9 (X2), `report/metrics/` yagona qatlamining
 * bir qismi.
 *
 * MUAMMO (2026-08-09 da kodda o'lchandi): hisobotlarda «xodim» kesimi hujjat
 * **egasi** (`owner_id`) bo'yicha ketardi, kassirniki esa umuman yo'q edi —
 * `report/` bo'ylab `cashierId` 0 marta uchradi. Chekni kim urgani
 * (`cashier_sessions.cashier_id`) va hujjat kimga biriktirilgani (owner) —
 * ikki BOSHQA savol: bitta chekni menejer o'ziga biriktirib, kassir A urishi
 * mumkin. Kassirning bonusi/korreksiyasi aynan birinchi savolga tayanadi.
 *
 * Shu qatlam ikki qoidani muhrlaydi:
 *
 * 1. **Kesim egaga qaytmaydi.** Funksiya `ownerId` ni umuman qabul qilmaydi —
 *    «kassir bo'sh bo'lsa egani olaman» degan jim fallback yozib bo'lmaydi.
 *    Ikki kesim yonma-yon yashaydi (TZ X2 aynan shuni talab qiladi), biri
 *    ikkinchisini almashtirmaydi.
 *
 * 2. **Kassiri yo'q tushum KO'RINADI.** Smenaga bog'lanmagan hujjat (ulgurji
 *    otgruzka, qaytarish, yoki sessiyasi yo'qolgan chek) alohida «noma'lum»
 *    guruhiga tushadi. Uni tashlab yuborish jamini boshqa kesimlarnikidan
 *    ajratib qo'yardi va yo'qolgan pulni ko'rinmas qilardi; 0 deb ko'rsatish
 *    esa o'lchanmagan narsani o'lchangan qilib ko'rsatish bo'lardi.
 */

/**
 * Kassiri aniqlanmagan guruhning barqaror kaliti.
 *
 * Ataylab UUID EMAS: hisobot qatori id'lari bevosita `employees.id` (uuid
 * ustuni) bo'yicha qidiriladi — sentinel u yerga tushib qolsa so'rov jim
 * ishlab ketmasligi, balki darhol yiqilishi kerak. {@link isUnknownCashier}
 * bilan filtrlab tashlanadi.
 */
export const UNKNOWN_CASHIER_ID = '__unknown_cashier__';

/**
 * Hujjat qatorining kassir-kesim kaliti: smenaning kassiri, yoki smena yo'q
 * bo'lsa — «noma'lum» guruhi.
 */
export function cashierSliceKey(cashierId: string | null | undefined): string {
  return cashierId ? cashierId : UNKNOWN_CASHIER_ID;
}

/** Kalit «noma'lum kassir» guruhinikimi (label qidiruvidan chiqarib tashlash uchun). */
export function isUnknownCashier(key: string): boolean {
  return key === UNKNOWN_CASHIER_ID;
}
