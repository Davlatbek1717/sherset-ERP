import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MoySklad → omborchi → yacheykali chek oqimining ulanish qulfi.
 *
 * Bu yerdagi invariantlarni typecheck ham, sof modul testlari ham tutmaydi:
 *
 * 1. **Ro'yxat MoySklad qatorlarini o'qishi.** Sync 30 soniyada bir ishlab,
 *    `MsPickList` ga yozadi. Servis uni o'qimasa — sync jimgina bekorga
 *    ishlaydi va omborchi bo'sh ekran ko'radi. Aynan shu holat 2026-07-28
 *    dan beri mavjud edi (jadval «DORMANT» bo'lib qolgan).
 * 2. **Holat o'tishi optimistik qulf bilan.** Ikki omborchi bir buyurtmani
 *    birga yig'masligi kerak.
 * 3. **Sync mahalliy holatni ustidan yozmasligi.** MoySklad'da `pickState`
 *    tushunchasi YO'Q — upsert uni tiklab tashlasa, har 30 soniyada
 *    omborchining ishi «yangi» ga qaytardi.
 * 4. **Yacheyka o'qish vaqtida yechilishi** (snapshot saqlanmasin).
 */
const DIR = import.meta.dirname;
const SERVICE = readFileSync(join(DIR, 'pick-list.service.ts'), 'utf8');
const SYNC = readFileSync(join(DIR, 'pick-list-sync.service.ts'), 'utf8');
const CONTROLLER = readFileSync(join(DIR, 'pick-list.controller.ts'), 'utf8');

describe('MoySklad buyurtmalari ro`yxatga yetib boradi', () => {
  it('servis msPickList ni O`QIYDI (sync bekorga ishlamasin)', () => {
    expect(SERVICE).toMatch(/msPickList\.findMany/);
  });

  it('controller `listPick` ni chaqiradi (o`z-hujjat yo`liga qotib qolmagan)', () => {
    expect(CONTROLLER).toMatch(/this\.svc\.listPick\(/);
  });

  it('tasdiqlanmagan buyurtma ro`yxatga tushmaydi', () => {
    // «Проведено» bo'lmagan buyurtmani omborchi yig'a boshlasa, kassir uni
    // o'chirib qo'yishi mumkin.
    const list = SERVICE.slice(SERVICE.indexOf('private async listMoysklad'));
    expect(list.slice(0, 1200)).toMatch(/applicable: true/);
  });

  it('detal yo`li ham MoySklad qatoridan o`qiydi', () => {
    expect(SERVICE).toMatch(/msPickList\.findFirst/);
    expect(CONTROLLER).toMatch(/findMoyskladById\(/);
  });
});

describe('omborchi zanjiri — poyga himoyasi', () => {
  function stateBody(): string {
    const start = SERVICE.indexOf('async setPickState');
    expect(start, 'setPickState topilmadi').toBeGreaterThan(-1);
    const end = SERVICE.indexOf('\n  /** Chek chop etilgani', start);
    return SERVICE.slice(start, end === -1 ? start + 4000 : end);
  }

  it('holat SHART sifatida beriladi (updateMany optimistik qulf)', () => {
    const body = stateBody();
    expect(body).toMatch(/updateMany\(\{/);
    // `where` ichida joriy holat bo'lishi shart — busiz ikki omborchi
    // bir vaqtda «boshlash» bosса ikkisi ham o'tardi.
    expect(body).toMatch(/where: \{ id, accountId, pickState: from \}/);
  });

  it('qulf ushlanmasa aniq xato beriladi', () => {
    expect(stateBody()).toMatch(/flip\.count === 0/);
  });

  it('ruxsatsiz o`tish rad etiladi', () => {
    expect(stateBody()).toMatch(/PICK_TRANSITIONS\[from\]\?\.includes/);
  });

  it('boshiga qaytarilsa «kim yig`di» izi tozalanadi', () => {
    // Aks holda «Aliyev yig'gan» yolg'on yozuv qolardi.
    expect(stateBody()).toMatch(/pickedById: null/);
  });
});

describe('sync mahalliy yig`ish holatini USTIDAN YOZMAYDI', () => {
  it('upsert `pickState` ga tegmaydi', () => {
    // MoySklad'da bu tushuncha yo'q. Upsert uni tiklasa, har 30 soniyada
    // omborchining ishi «yangi» ga qaytardi.
    const upsert = SYNC.slice(SYNC.indexOf('msPickList.upsert'));
    expect(upsert.slice(0, 600)).not.toMatch(/pickState/);
  });

  it('sync yozadigan maydonlar ro`yxatida pick* maydonlari yo`q', () => {
    const fields = SYNC.slice(SYNC.indexOf('const fields = {'), SYNC.indexOf('msPickList.upsert'));
    expect(fields).not.toMatch(/pickState|pickedById|pickedAt|pickNote/);
  });
});

describe('yacheyka O`QISH vaqtida yechiladi', () => {
  it('sof moduldan foydalanadi (servisda takroriy mantiq yo`q)', () => {
    expect(SERVICE).toMatch(/resolvePickCells\(/);
    expect(SERVICE).toMatch(/pickCoverage\(/);
  });

  it('yacheyka snapshot sifatida SAQLANMAYDI', () => {
    // Tovar boshqa javonga ko'chirilsa, keyingi chek yangi joyni ko'rsatishi
    // kerak — snapshot buni muzlatib qo'yardi.
    const detail = SERVICE.slice(SERVICE.indexOf('async findMoyskladById'));
    expect(detail.slice(0, 3000)).not.toMatch(/msPickList\.update/);
  });

  it('faqat kerakli tovarlar o`qiladi (butun katalog emas)', () => {
    const detail = SERVICE.slice(SERVICE.indexOf('async findMoyskladById'));
    expect(detail.slice(0, 3000)).toMatch(/code: \{ in: codes \}/);
    expect(detail.slice(0, 3000)).toMatch(/barcodes: \{ hasSome: barcodes \}/);
  });
});

describe('sync avtorizatsiyasi', () => {
  it('TOKEN birinchi tekshiriladi (qutida allaqachon bor)', () => {
    const auth = SYNC.slice(SYNC.indexOf('private authHeader'));
    const tokenAt = auth.indexOf('MOYSKLAD_TOKEN');
    const loginAt = auth.indexOf('MOYSKLAD_SYNC_LOGIN');
    expect(tokenAt, 'token qo`llab-quvvatlanmaydi').toBeGreaterThan(-1);
    expect(loginAt, 'login zaxira yo`li yo`qolgan').toBeGreaterThan(-1);
    // Token birinchi: yangi maxfiy ma'lumot so'ramaslik uchun.
    expect(tokenAt).toBeLessThan(loginAt);
  });

  it('hech qanday ma`lumot yo`q bo`lsa xizmat JIM turadi', () => {
    // Dev qutida bu normal holat — xato bilan to'ldirmasin.
    expect(SYNC).toMatch(/if \(!auth\) return/);
  });

  it('yuklash oynasi va o`chirilganlarni tekshirish BIR XIL oynani ishlatadi', () => {
    // Farq bo'lsa: kengroq yuklangan eski qatorlar tor oynadan tashqarida
    // qolib «MoySklad'da o'chirilgan» deb yo'q qilinardi.
    const uses = SYNC.match(/this\.backfillHours/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    expect(SYNC).not.toMatch(/48 \* 3600_000/);
  });
});
