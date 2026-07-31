import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `GET /demands/:id/position` — detail-toolbar record navigator (2026-07-31).
 *
 * Topilishi: prod'da jo'natma detal sahifasi har yuklanishda 404 ×3 berardi.
 * FE `useDetailNavigation({ server: true })` bu endpointni chaqiradi; 9 ta
 * sahifa server rejimida edi, backendda esa 8 ta endpoint bor edi — aynan
 * demand yetishmasdi.
 *
 * Bu yerda SUKUT bilan buziladigan narsalar qulflanadi (test tushmaydi,
 * xato faqat brauzerda ko'rinadi):
 *
 * 1. SCOPED O'QISH. Sanashdan oldin `findByIdScoped` chaqirilmasa, ko'rish
 *    huquqi yo'q yozuvning MAVJUDLIGI hisoblagich orqali oshkor bo'ladi
 *    (404 o'rniga «3 dan 2» chiqadi).
 * 2. TARTIB MANTIG'I. prev/next tuple-solishtiruvi va `moment` tengligida
 *    id ga tushish — ommaviy yaratilgan hujjatlar bir xil timestamp'ga ega,
 *    id-fallback bo'lmasa navigator ularni o'tkazib yuboradi yoki aylanadi.
 *
 * MARSHRUT TARTIBI tekshirilMAYDI: `@Get(':id/position')` ni `@Get(':id')`
 * dan keyin yozish ham ishlaydi — Nest segment SONI bo'yicha ajratadi.
 * Buni `@Get(':id/related')` (u `:id` dan KEYIN e'lon qilingan, lokal API'da
 * 200 qaytardi) tasdiqlaydi. Avval bu yerda «tartib muhim» degan test bor
 * edi — noto'g'ri asosga qurilgan edi, olib tashlandi.
 *
 * Xulq-tekshiruvi ALOHIDA bajarilgan (lokal API, real HTTP): 1-yozuv
 * {current:1,total:7,prevId:null}, 2-yozuv prevId aynan 1-yozuvga qaytadi,
 * 7-yozuv {current:7,total:7,nextId:null}.
 */

const CONTROLLER = readFileSync(join(__dirname, 'demand.controller.ts'), 'utf8');
const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');

describe('GET /demands/:id/position', () => {
  it('the route exists and delegates to findPosition', () => {
    expect(CONTROLLER).toMatch(/@Get\('\:id\/position'\)/);
    // Params carry `)` (@Param('id')), so match across them non-greedily.
    expect(CONTROLLER).toMatch(/async position\([\s\S]*?return this\.demand\.findPosition\(/);
  });

  it('findPosition does a SCOPED read before counting (no existence leak)', () => {
    const body = SERVICE.slice(SERVICE.indexOf('async findPosition('));
    const scopedIdx = body.indexOf('findByIdScoped');
    const countIdx = body.indexOf('.count(');
    expect(scopedIdx, 'findPosition never calls findByIdScoped').toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(-1);
    expect(scopedIdx, 'the scope check must run BEFORE the counts').toBeLessThan(countIdx);
  });

  it('walks the DEFAULT (moment desc, id desc) order in both directions', () => {
    const body = SERVICE.slice(
      SERVICE.indexOf('async findPosition('),
      SERVICE.indexOf('async create('),
    );
    // prev = smallest tuple still ABOVE → ascending; next = largest still BELOW → descending.
    expect(body).toMatch(/orderBy: \[\{ moment: 'asc' \}, \{ id: 'asc' \}\]/);
    expect(body).toMatch(/orderBy: \[\{ moment: 'desc' \}, \{ id: 'desc' \}\]/);
    // Ties on `moment` must fall back to id, else rows with equal moments
    // (bulk-created docs share a timestamp) would loop or skip.
    expect(body).toMatch(/moment: current\.moment, id: \{ gt: current\.id \}/);
    expect(body).toMatch(/moment: current\.moment, id: \{ lt: current\.id \}/);
  });

  it('counts against the unfiltered list where + record scope', () => {
    const body = SERVICE.slice(
      SERVICE.indexOf('async findPosition('),
      SERVICE.indexOf('async create('),
    );
    expect(body).toMatch(/DemandFilterSchema\.parse\(\{\}\)/);
    expect(body).toMatch(/this\.buildListWhere\(accountId, filter\)/);
    expect(body).toMatch(/recordScopeWhere\(accountId, userId, 'demand', 'view'\)/);
  });
});
