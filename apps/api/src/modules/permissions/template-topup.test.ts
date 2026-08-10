import { describe, expect, it } from 'vitest';
import { resolveTemplateMatrix } from './role-templates.js';
import { type ExistingPermissionRow, missingTemplateCells } from './template-topup.js';

/**
 * TZ v3 §3 — shablon rollariga YANGI entity qatorlarini nuqtali qo'shish.
 *
 * Muammo (2026-08-10 review'da o'lchandi): `topup-role-permissions.ts` faqat
 * `isSystem:true` VA nomi Administrator/Manager/Employee/ReadOnly bo'lgan ESKI
 * rollarni davolaydi. Omborchi esa MK29 shablon roli (`templateSlug`), uni
 * `seed-role-templates.ts` yaratadi — va u MAVJUD rol matritsasini `--rewrite`
 * siz umuman yangilamaydi. Ya'ni `storecell` qo'shilgach, hech bir skript
 * omborchiga uni bermaydi: rol jimgina 403 beraveradi.
 *
 * ⚠️ SHU FUNKSIYANING ENG MUHIM SHARTNOMASI — `NO` = QATOR YO'QLIGI.
 * `roles.service.ts#normalizePermissions` `scope === 'NO'` katakchani
 * TASHLAYDI, `update` esa deleteMany+createMany qiladi. Ya'ni «admin qo'lda
 * NO ga tushirgan» katakcha bazada QATOR QOLDIRMAYDI va uni «hech qachon
 * seed qilinmagan» katakchadan qator darajasida AJRATIB BO'LMAYDI.
 * Shuning uchun top-up ikki qavatli qo'riqchi bilan ishlaydi:
 *   (1) mavjud qator hech qachon o'zgartirilmaydi (idempotentlik + tenant tweak),
 *   (2) rolda o'sha ENTITY bo'yicha HECH QANDAY qator bo'lmasa gina qo'shiladi —
 *       ya'ni entity qo'lda sozlangan bo'lsa (birorta qatori bor), butunlay
 *       chetlab o'tiladi.
 * Aks holda skript adminning ataylab olib qo'ygan ruxsatini jimgina qaytarardi.
 */

/** Rolda `storecell` dan BOSHQA hamma narsa bor — ya'ni eski seed holati. */
function storekeeperRowsWithoutStorecell(): ExistingPermissionRow[] {
  return resolveTemplateMatrix('storekeeper')
    .filter((c) => c.scope !== 'NO')
    .filter((c) => c.entity !== 'storecell')
    .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));
}

describe('missingTemplateCells — shablon roliga yetishmagan qatorlar', () => {
  it('yetishmagan `storecell` qatorlarini qo`shadi (omborchi)', () => {
    const out = missingTemplateCells('storekeeper', storekeeperRowsWithoutStorecell());

    expect(out).toEqual([
      { entity: 'storecell', action: 'view', scope: 'ALL' },
      { entity: 'storecell', action: 'update', scope: 'ALL' },
    ]);
  });

  it('ombor menejeriga ham qo`shadi', () => {
    const rows = resolveTemplateMatrix('warehouse_manager')
      .filter((c) => c.scope !== 'NO')
      .filter((c) => c.entity !== 'storecell')
      .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));

    expect(missingTemplateCells('warehouse_manager', rows)).toContainEqual({
      entity: 'storecell',
      action: 'update',
      scope: 'ALL',
    });
  });

  it('IDEMPOTENT — ikkinchi yugurtirishda qo`shadigan narsa qolmaydi', () => {
    const rows = storekeeperRowsWithoutStorecell();
    const first = missingTemplateCells('storekeeper', rows);
    expect(first.length).toBeGreaterThan(0);

    const second = missingTemplateCells('storekeeper', [...rows, ...first]);
    expect(second).toEqual([]);
  });

  it('to`liq seed qilingan rolga hech narsa qo`shmaydi', () => {
    const full = resolveTemplateMatrix('storekeeper')
      .filter((c) => c.scope !== 'NO')
      .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));

    expect(missingTemplateCells('storekeeper', full)).toEqual([]);
  });

  /**
   * ⚠️ Bu qator — `--rewrite` xulqiga qarshi qulf. Admin qo'lda sozlagan
   * entity'ga skript TEGMASLIGI shart.
   */
  it('QO`LDA sozlangan entity`ga TEGMAYDI (bitta qatori bo`lsa ham)', () => {
    // Admin `storecell.view` ni qoldirib, `update` ni ATAYLAB olib tashlagan
    // (NO = qator yo'qligi). Skript `update` ni QAYTA BERMASLIGI kerak.
    const rows: ExistingPermissionRow[] = [
      ...storekeeperRowsWithoutStorecell(),
      { entity: 'storecell', action: 'view', scope: 'ALL' },
    ];

    const out = missingTemplateCells('storekeeper', rows);
    expect(out.filter((c) => c.entity === 'storecell')).toEqual([]);
  });

  it('MAVJUD qatorni hech qachon qayta yozmaydi (scope tweak saqlanadi)', () => {
    // Tenant `store.view` ni `OWN_GROUP` ga tushirgan — shablonda `ALL`.
    const rows: ExistingPermissionRow[] = storekeeperRowsWithoutStorecell().map((r) =>
      r.entity === 'store' && r.action === 'view' ? { ...r, scope: 'OWN_GROUP' } : r,
    );

    const out = missingTemplateCells('storekeeper', rows);
    expect(out.some((c) => c.entity === 'store' && c.action === 'view')).toBe(false);
  });

  it('`NO` katakchani HECH QACHON qator sifatida taklif qilmaydi', () => {
    // Bo'sh roldan boshlaymiz — bu eng katta chiqish.
    const out = missingTemplateCells('storekeeper', []);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.scope !== 'NO')).toBe(true);
    // Omborchida `store.update` YO'Q (TZ §3 chegarasi) — taklifga tushmasin.
    expect(out.some((c) => c.entity === 'store' && c.action === 'update')).toBe(false);
  });

  it('chiqish har doim shablon matritsasining KICHIK to`plami', () => {
    const tplKeys = new Set(
      resolveTemplateMatrix('storekeeper')
        .filter((c) => c.scope !== 'NO')
        .map((c) => `${c.entity}:${c.action}:${c.scope}`),
    );
    for (const c of missingTemplateCells('storekeeper', [])) {
      expect(tplKeys.has(`${c.entity}:${c.action}:${c.scope}`)).toBe(true);
    }
  });
});
