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
 * Shuning uchun top-up ikki qavatli qo'riqchi bilan ishlaydi:
 *   1. **Mavjud qator hech qachon o'zgartirilmaydi** — tenant qo'lda
 *      tushirgan scope (`ALL` → `OWN_GROUP`) saqlanadi, takroriy yugurtirish
 *      hech nima qilmaydi (idempotentlik).
 *   2. **Rolda o'sha ENTITY bo'yicha birorta ham qator bo'lsa — entity
 *      butunlay chetlab o'tiladi.** Bu `--rewrite` xulqiga qarshi qulf:
 *      admin `storecell.view` ni qoldirib `update` ni olib qo'ygan bo'lsa,
 *      skript uni QAYTA BERMAYDI. Qo'shish faqat «bu entity bu rolda umuman
 *      ko'rilmagan» holatda bo'ladi — aynan yangi entity holati.
 *
 * Bu funksiya SOF: DB kerak emas, testi `template-topup.test.ts`.
 */
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
 * Shablon matritsasidan roldagi YETISHMAYOTGAN qatorlar.
 *
 * @param slug   rolning `templateSlug` qiymati
 * @param existing rolning bazadagi barcha ruxsat qatorlari
 * @returns yaratilishi kerak bo'lgan katakchalar (hech qachon `NO` emas)
 */
export function missingTemplateCells(
  slug: RoleTemplateSlug,
  existing: ReadonlyArray<ExistingPermissionRow>,
): TemplateCell[] {
  // 1-qavat: aynan shu (entity, action) qatori bormi.
  const haveCell = new Set(existing.map((r) => `${r.entity}:${r.action}`));
  // 2-qavat: bu entity rolda umuman ko'rilganmi (qo'lda sozlangan bo'lishi mumkin).
  const touchedEntity = new Set(existing.map((r) => r.entity));

  return resolveTemplateMatrix(slug).filter(
    (c) =>
      c.scope !== 'NO' && !haveCell.has(`${c.entity}:${c.action}`) && !touchedEntity.has(c.entity),
  );
}
