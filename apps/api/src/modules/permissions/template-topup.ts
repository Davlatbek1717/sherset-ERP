/**
 * MK29 shablon rollari uchun NUQTALI top-up — yangi entity qo'shilganda
 * mavjud rollarga YETISHMAYOTGAN qatorlarni hisoblaydi.
 *
 * ── Nega kerak (2026-08-10) ────────────────────────────────────────────────
 * `topup-role-permissions.ts` ESKI (`isSystem` + Administrator/Manager/
 * Employee/ReadOnly nomli) rollarni davolaydi. MK29 shablon rollari
 * (`templateSlug` — omborchi, ombor menejeri, kassir…) esa
 * `seed-role-templates.ts` bilan yaratiladi va u MAVJUD rol matritsasini
 * `--rewrite` siz UMUMAN yangilamaydi. Natijada `PermissionEntity` unioniga
 * yangi qiymat qo'shilsa (masalan `storecell`), shablon rollari uni HECH
 * QACHON olmaydi — funksiya kodda tayyor turadi, lekin jonli tizimda 403.
 *
 * ── ⚠️ Yadro shartnomasi: `NO` = QATOR YO'QLIGI ───────────────────────────
 * `roles.service.ts#normalizePermissions` `scope === 'NO'` katakchani
 * TASHLAYDI (`update` esa deleteMany + createMany qiladi), `seed-role-
 * templates.ts` ham `.filter((c) => c.scope !== 'NO')` bilan yozadi. Ya'ni
 * bazada `NO` qatori YO'Q — «admin ataylab olib qo'ygan» katakcha va «hech
 * qachon seed qilinmagan» katakcha qator darajasida BIR XIL ko'rinadi.
 *
 * ── Himoya: BITTA tarkibiy qo'riqchi + bitta xulq qoidasi ──────────────────
 * **1. Allow-list (tarkibiy).** Funksiya `entities` ro'yxatisiz ishlamaydi va
 *    faqat o'sha entity'lar bo'yicha qator taklif qiladi. Qolgan hamma entity
 *    — ko'rinmas. Bu «tiriltirish» xavfini TARKIBIY yo'q qiladi: admin biror
 *    entity'ni roldan BUTUNLAY olib tashlagan bo'lsa (qator qolmaydi!),
 *    skript uni qaytara olmaydi, chunki ro'yxatda yo'q.
 *
 *    Raund-1 da bu qo'riqchi YO'Q edi va aynan shu yoriq bor edi: «rolda bu
 *    entity bo'yicha qator yo'q» sharti «hali seed qilinmagan» degani EMAS —
 *    «admin hammasini o'chirgan» ham bo'lishi mumkin (rol matritsasi
 *    deleteMany+createMany bilan yangilangani uchun bu REAL yo'l).
 *
 * **2. «Tegilmagan entity» qoidasi (xulq).** Allow-list ichida ham: rolda
 *    o'sha entity bo'yicha birorta qator BO'LSA, entity butunlay chetlab
 *    o'tiladi. Bu ikki ishni bir vaqtda qiladi — qo'lda qisman sozlangan
 *    entity qayta yozilmaydi VA takroriy yugurtirish no-op bo'ladi
 *    (idempotentlik), chunki birinchi run qator qoldirib ketadi.
 *
 * > Eslatma (raund-2 review): alohida «bu (entity, action) qatori bormi»
 * > tekshiruvi ORTIQCHA edi — qator bo'lsa entity ham albatta «tegilgan»
 * > hisoblanadi, ya'ni shart natijani hech qachon o'zgartirmasdi. Olib
 * > tashlandi; qavat aslida BITTA.
 *
 * Bu funksiya SOF: DB kerak emas, testi `template-topup.test.ts`.
 */
import type { PermissionEntity } from './permissions.types.js';
import {
  type RoleTemplateSlug,
  type TemplateCell,
  resolveTemplateMatrix,
} from './role-templates.js';

/** Rolda ALLAQACHON mavjud ruxsat qatori (DB'dan o'qilgani). */
export interface ExistingPermissionRow {
  entity: string;
  action: string;
  scope: string;
}

/**
 * JORIY to'lqin — top-up qaysi entity'larni ko'rishi mumkin.
 *
 * ⚠️ Bu ro'yxat O'SIB BORMAYDI. Yangi `PermissionEntity` qo'shilganda shu
 * yerga YOZ; prodda yugurtirilib tasdiqlangach — OLIB TASHLA. Eski entity'ni
 * ro'yxatda qoldirish «tiriltirish» xavfini qaytaradi: admin o'sha entity'ni
 * biror roldan butunlay olib tashlagan bo'lsa, keyingi run uni tiklab qo'yadi.
 *
 * ⚠️ Tipi ATAYLAB `PermissionEntity[]` — `string[]` emas (review 2026-08-10).
 * Xato yozilgan slug (`'storecelll'`) hech qayerda yiqilmaydi: allow-list
 * shablon matritsasidagi hech bir entity'ga mos kelmaydi ⇒ funksiya bo'sh
 * ro'yxat qaytaradi, skript «0 qator qo'shildi» deb muvaffaqiyatli tugaydi va
 * rol jimgina 403 beraveradi. Union tipi shu jim no-op'ni KOMPILYATSIYADA
 * to'xtatadi.
 *
 * 🔴 `customerorder` (F7, 2026-08-11) — bu YANGI entity EMAS, kassir
 * shabloniga yangi qo'shilgan katakcha (`view` + `approve`). Ro'yxatga
 * kirgani uchun uning tiriltirish xavfi storecell'nikidan KATTAROQ:
 * `customerorder` owner/admin/sales_manager/seller shablonlarida ham musbat,
 * ya'ni o'sha rollardan entity'ni BUTUNLAY olib tashlagan akkaunt keyingi
 * run'da uni qaytarib olishi mumkin. Shuning uchun prod run'idan keyin
 * DARHOL olib tashlanadi.
 */
// 🔴 `warehousenumbering` (F3, 2026-08-23) — YANGI entity: jonli bazadagi
// shablon rollari (ombor menejeri, admin…) unga qator olmagan, ya'ni topup
// yugurtirilmaguncha jonlida hamma 403 oladi. Prod run'dan keyin olib tashlanadi.
export const TOPUP_ENTITIES: readonly PermissionEntity[] = [
  'storecell',
  'customerorder',
  'warehousenumbering',
];

/**
 * Shablon matritsasidan roldagi YETISHMAYOTGAN qatorlar.
 *
 * @param slug     rolning `templateSlug` qiymati
 * @param entities allow-list — faqat shu entity'lar ko'riladi (`TOPUP_ENTITIES`)
 * @param existing rolning bazadagi barcha ruxsat qatorlari
 * @returns yaratilishi kerak bo'lgan katakchalar (hech qachon `NO` emas)
 */
export function missingTemplateCells(
  slug: RoleTemplateSlug,
  entities: ReadonlyArray<PermissionEntity>,
  existing: ReadonlyArray<ExistingPermissionRow>,
): TemplateCell[] {
  const allow = new Set(entities);
  if (allow.size === 0) return [];
  // Rolda «ko'rilgan» entity'lar — ular chetlab o'tiladi (qo'lda sozlash
  // himoyasi + idempotentlik).
  const touchedEntity = new Set(existing.map((r) => r.entity));

  return resolveTemplateMatrix(slug).filter(
    (c) => allow.has(c.entity) && !touchedEntity.has(c.entity) && c.scope !== 'NO',
  );
}
