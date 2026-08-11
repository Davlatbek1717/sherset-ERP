import { describe, expect, it } from 'vitest';
import { PERMISSION_ENTITIES } from './permissions.types.js';
import { resolveTemplateMatrix } from './role-templates.js';
import {
  type ExistingPermissionRow,
  TOPUP_ENTITIES,
  missingTemplateCells,
} from './template-topup.js';

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
 * Shuning uchun top-up BITTA TARKIBIY qo'riqchi + BITTA XULQ qoidasi bilan
 * ishlaydi:
 *   · tarkibiy — `TOPUP_ENTITIES` allow-list: undan tashqaridagi entity umuman
 *     KO'RINMAYDI, ya'ni olib tashlangan ruxsat tiriltirilishi MUMKIN EMAS;
 *   · xulq — rolda o'sha ENTITY bo'yicha birorta qator BO'LSA, entity butunlay
 *     chetlab o'tiladi (qo'lda sozlash himoyasi + idempotentlik bir yo'la).
 * Aks holda skript adminning ataylab olib qo'ygan ruxsatini jimgina qaytarardi.
 */

/**
 * Joriy to'lqin — PRODUKSIYA ro'yxatining O'ZI import qilinadi, literal
 * takrorlanmaydi: aks holda testdagi `['storecell']` yashil qolib, kod'dagi
 * ro'yxat o'zgarsa (yoki xato yozilsa) hech narsa yiqilmasdi.
 */
const WAVE = TOPUP_ENTITIES;

/** Rolda `storecell` dan BOSHQA hamma narsa bor — ya'ni eski seed holati. */
function storekeeperRowsWithoutStorecell(): ExistingPermissionRow[] {
  return resolveTemplateMatrix('storekeeper')
    .filter((c) => c.scope !== 'NO')
    .filter((c) => c.entity !== 'storecell')
    .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));
}

/**
 * ── `TOPUP_ENTITIES` ning O'ZI (review 2026-08-10) ─────────────────────────
 *
 * Allow-list — butun skriptning yagona «nima qo'shiladi» manbai, va u JIM
 * yiqiladigan tur: xato yozilgan slug (`'storecelll'`) shablon matritsasidagi
 * hech bir entity'ga mos kelmaydi ⇒ funksiya `[]` qaytaradi, skript «0 qator»
 * deb muvaffaqiyatli tugaydi, rol esa 403 beraveradi. Tip (`PermissionEntity`)
 * buni kompilyatsiyada tutadi; bu yerdagi tasdiqlar esa ro'yxatning MA'NOSINI
 * qulflaydi — ro'yxat bo'sh emas, tarkibi haqiqiy entity va u shablonlarda
 * ishlaydigan (musbat scope beradigan) entity.
 */
describe('TOPUP_ENTITIES — joriy to`lqin ro`yxati', () => {
  it('bo`sh emas — aks holda skript butunlay NO-OP bo`lardi', () => {
    expect(TOPUP_ENTITIES.length).toBeGreaterThan(0);
  });

  it('har elementi HAQIQIY PermissionEntity (xato slug jim no-op bo`lmaydi)', () => {
    for (const e of TOPUP_ENTITIES) expect(PERMISSION_ENTITIES, e).toContain(e);
  });

  it('takror element yo`q', () => {
    expect(new Set(TOPUP_ENTITIES).size).toBe(TOPUP_ENTITIES.length);
  });

  /**
   * Ro'yxatdagi entity birorta shablonda MUSBAT katakcha bermasa, to'lqin
   * hech qachon hech kimga qator qo'shmaydi — ya'ni ro'yxat yolg'on. Bu
   * tasdiq «storecell» degan literal'ni takrorlamaydi: manba — ro'yxatning
   * o'zi va shablon matritsasi.
   */
  it('har elementi kamida bitta shablonda musbat scope beradi', () => {
    for (const entity of TOPUP_ENTITIES) {
      const usable = (['storekeeper', 'warehouse_manager'] as const).some((slug) =>
        resolveTemplateMatrix(slug).some((c) => c.entity === entity && c.scope !== 'NO'),
      );
      expect(usable, `${entity} hech bir ombor shablonida musbat emas`).toBe(true);
    }
  });
});

describe('missingTemplateCells — shablon roliga yetishmagan qatorlar', () => {
  it('yetishmagan `storecell` qatorlarini qo`shadi (omborchi)', () => {
    const out = missingTemplateCells('storekeeper', WAVE, storekeeperRowsWithoutStorecell());

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

    expect(missingTemplateCells('warehouse_manager', WAVE, rows)).toContainEqual({
      entity: 'storecell',
      action: 'update',
      scope: 'ALL',
    });
  });

  it('IDEMPOTENT — ikkinchi yugurtirishda qo`shadigan narsa qolmaydi', () => {
    const rows = storekeeperRowsWithoutStorecell();
    const first = missingTemplateCells('storekeeper', WAVE, rows);
    expect(first.length).toBeGreaterThan(0);

    const second = missingTemplateCells('storekeeper', WAVE, [...rows, ...first]);
    expect(second).toEqual([]);
  });

  it('to`liq seed qilingan rolga hech narsa qo`shmaydi', () => {
    const full = resolveTemplateMatrix('storekeeper')
      .filter((c) => c.scope !== 'NO')
      .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));

    expect(missingTemplateCells('storekeeper', WAVE, full)).toEqual([]);
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

    const out = missingTemplateCells('storekeeper', WAVE, rows);
    expect(out.filter((c) => c.entity === 'storecell')).toEqual([]);
  });

  it('`NO` katakchani HECH QACHON qator sifatida taklif qilmaydi', () => {
    const out = missingTemplateCells('storekeeper', WAVE, []);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.scope !== 'NO')).toBe(true);
  });

  it('chiqish har doim shablon matritsasining KICHIK to`plami', () => {
    const tplKeys = new Set(
      resolveTemplateMatrix('storekeeper')
        .filter((c) => c.scope !== 'NO')
        .map((c) => `${c.entity}:${c.action}:${c.scope}`),
    );
    for (const c of missingTemplateCells('storekeeper', WAVE, [])) {
      expect(tplKeys.has(`${c.entity}:${c.action}:${c.scope}`)).toBe(true);
    }
  });
});

/**
 * ── RAUND 2 (review 2026-08-10) — «TIRILTIRISH» yorig'i ────────────────────
 *
 * Oldingi yechim faqat QISMAN sozlangan entity'ni himoya qilardi. Admin
 * shablonli roldan biror entity'ning HAMMA katakchasini olib tashlasa
 * (`roles.service.ts` matritsani `deleteMany` + `createMany` bilan yangilaydi
 * — bu REAL yo'l), o'sha entity bo'yicha birorta qator qolmasdi ⇒ keyingi
 * top-up run shablon scope'ini QAYTARARDI. Bu — `--rewrite` ning aynan
 * yopmoqchi bo'lgan yorig'i, faqat sekinroq shaklda.
 *
 * Yechim: funksiya endi ANIQ entity ro'yxatini (`entities` allow-list) talab
 * qiladi va faqat o'shalar bo'yicha ishlaydi. Xavf tarkibiy jihatdan
 * yo'qoladi: skript boshqa entity'ni UMUMAN ko'rmaydi, shuning uchun uni
 * tiriltira ham olmaydi.
 */
describe('allow-list — skript faqat aytilgan entity`ni ko`radi', () => {
  it('(a) allow-listdan TASHQARIDAGI entity qatorsiz bo`lsa ham TIRILMAYDI', () => {
    // Admin `label` ni omborchidan BUTUNLAY olib tashlagan (birorta qator yo'q).
    const rows = storekeeperRowsWithoutStorecell().filter((r) => r.entity !== 'label');
    expect(rows.some((r) => r.entity === 'label')).toBe(false);
    // Shablonda `label` bor — ya'ni himoya bo'lmasa qaytarilardi.
    expect(
      resolveTemplateMatrix('storekeeper').some((c) => c.entity === 'label' && c.scope !== 'NO'),
    ).toBe(true);

    const out = missingTemplateCells('storekeeper', WAVE, rows);
    expect(out.some((c) => c.entity === 'label')).toBe(false);
    // Va faqat allow-listdagi entity qaytadi.
    expect([...new Set(out.map((c) => c.entity))]).toEqual(['storecell']);
  });

  it('(b) allow-listdagi YANGI entity odatdagidek qo`shiladi', () => {
    const rows = storekeeperRowsWithoutStorecell().filter((r) => r.entity !== 'label');
    expect(missingTemplateCells('storekeeper', WAVE, rows)).toEqual([
      { entity: 'storecell', action: 'view', scope: 'ALL' },
      { entity: 'storecell', action: 'update', scope: 'ALL' },
    ]);
  });

  it('(c) IDEMPOTENT — allow-list bilan ham ikkinchi run bo`sh', () => {
    const rows = storekeeperRowsWithoutStorecell().filter((r) => r.entity !== 'label');
    const first = missingTemplateCells('storekeeper', WAVE, rows);
    expect(first.length).toBeGreaterThan(0);
    expect(missingTemplateCells('storekeeper', WAVE, [...rows, ...first])).toEqual([]);
  });

  it('bo`sh allow-list = NO-OP (hatto bo`sh rolda ham)', () => {
    expect(missingTemplateCells('storekeeper', [], [])).toEqual([]);
  });

  it('shablonda YO`Q entity so`ralsa ham hech narsa qaytmaydi', () => {
    // Omborchida `store.update` YO'Q (TZ §3 chegarasi) — allow-listga
    // qo'shilsa ham faqat shablonning MUSBAT katakchalari qaytadi.
    const out = missingTemplateCells('storekeeper', ['store'], []);
    expect(out.some((c) => c.action === 'update')).toBe(false);
    expect(out).toEqual([{ entity: 'store', action: 'view', scope: 'ALL' }]);
  });
});

/**
 * F7 — kassirga `customerorder` (view + approve) berildi. Bu YANGI entity
 * emas, MAVJUD entity'ning yangi shablon-katakchasi: ya'ni allaqachon
 * seed qilingan bazalarda kassir roli uchun qator YO'Q va u prodda 403
 * olaveradi (xotira: «eski seed'li bazada ruxsat qatorlari yo'q»).
 *
 * ⚠️ Shu sababdan `customerorder` allow-listga QO'SHILDI — va aynan shu
 * sababdan prod run'idan keyin OLIB TASHLANISHI shart: `customerorder`
 * boshqa shablonlarda (owner/admin/sales_manager/seller) ham musbat, ya'ni
 * ro'yxatda qolsa «admin butun entity'ni olib tashlagan» rolni keyingi run
 * tiriltirib qo'yishi mumkin.
 */
describe('F7 — kassir zakaz ruxsati eski bazaga ham yetib boradi', () => {
  it('joriy to`lqin allow-listida `customerorder` bor', () => {
    expect(TOPUP_ENTITIES).toContain('customerorder');
  });

  it('kassir roliga AYNAN view + approve qo`shadi', () => {
    const rows = resolveTemplateMatrix('cashier')
      .filter((c) => c.scope !== 'NO' && c.entity !== 'customerorder')
      .map((c) => ({ entity: c.entity, action: c.action, scope: c.scope }));

    expect(missingTemplateCells('cashier', ['customerorder'], rows)).toEqual([
      { entity: 'customerorder', action: 'view', scope: 'ALL' },
      { entity: 'customerorder', action: 'approve', scope: 'ALL' },
    ]);
  });

  it('zakaz qatori ALLAQACHON bor rol chetlab o`tiladi (tiriltirish himoyasi)', () => {
    // Admin kassirga faqat `view` qoldirgan bo'lsa — `approve` QAYTARILMAYDI.
    const rows: ExistingPermissionRow[] = [
      { entity: 'customerorder', action: 'view', scope: 'ALL' },
    ];
    expect(missingTemplateCells('cashier', ['customerorder'], rows)).toEqual([]);
  });
});
