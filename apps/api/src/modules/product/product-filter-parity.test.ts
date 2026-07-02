import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * moysklad «Товары и услуги» Фильтр-panel parity — backend wiring lock
 * (2026-06-11j).
 *
 * The products list filter was enriched to mirror the captured moysklad panel
 * (products/states/02-filter-applied.png, §4 DOM-rendered grounding). Each new
 * schema field MUST reach a real `where`-clause in the repository, otherwise it
 * is a dead filter — the page sends the param, the API parses it, and then
 * silently ignores it (the exact «accepted-but-unapplied» bug-class the
 * Convention-4 audit and the below-minimum fix were about). typecheck/lint
 * can't see a missing spread, so this source-scan is the guard.
 */

const REPO = join(__dirname, 'product.repository.ts');
const SCHEMA = join(__dirname, 'product.schema.ts');

// Strip comments so the doc-comments that *describe* the filters don't satisfy
// the scans — only live code counts (non-vacuity).
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('product list filter — moysklad Фильтр parity is wired end-to-end (BE)', () => {
  const schema = stripComments(readFileSync(SCHEMA, 'utf8'));
  const repo = stripComments(readFileSync(REPO, 'utf8'));

  it('schema declares every new discrete filter field', () => {
    expect(schema).toMatch(/\bdescription:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bmxikCode:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bbarcode:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bweighed:\s*boolFromString\.optional\(\)/);
    expect(schema).toMatch(/\bshared:\s*boolFromString\.optional\(\)/);
    expect(schema).toMatch(/\bupdatedFrom:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bupdatedTo:\s*z\.string\(\)\.optional\(\)/);
    // «Кто изменил» — last-modifier picker (Product.modifiedById), 2026-06-13.
    expect(schema).toMatch(/\bmodifiedById:\s*uuid\.optional\(\)/);
    // Live-2026-06-16 1:1: discrete Наименование/Артикул/Код/Внешний код inputs
    // + the «Группа товаров (с подгруппами)» folder variant.
    expect(schema).toMatch(/\bname:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\barticle:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bcode:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bexternalCode:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/\bproductFolderIdDeep:\s*uuid\.nullable\(\)\.optional\(\)/);
    // «Код упаковки ТАСНИФ» (2026-06-16) — filter + ProductPack.tasnifCode.
    expect(schema).toMatch(/\bpackTasnifCode:\s*z\.string\(\)\.optional\(\)/);
    expect(schema).toMatch(/ProductPackSchema[\s\S]{0,200}\btasnifCode:\s*z\.string\(\)/);
  });

  it('Код упаковки ТАСНИФ → packs.some.tasnifCode contains (insensitive)', () => {
    expect(repo).toMatch(
      /filter\.packTasnifCode[\s\S]{0,120}packs:\s*\{\s*some:\s*\{\s*tasnifCode:\s*\{\s*contains:\s*filter\.packTasnifCode/,
    );
  });

  it('pack create + update persist tasnifCode (so the filter is not over a never-written column)', () => {
    expect(repo).toMatch(/tasnifCode:\s*p\.tasnifCode/);
  });

  it('Наименование / Артикул / Код / Внешний код → discrete contains (insensitive)', () => {
    expect(repo).toMatch(/filter\.name\b[\s\S]{0,60}name:\s*\{\s*contains:\s*filter\.name\b/);
    expect(repo).toMatch(
      /filter\.article\b[\s\S]{0,60}article:\s*\{\s*contains:\s*filter\.article\b/,
    );
    expect(repo).toMatch(/filter\.code\b[\s\S]{0,60}code:\s*\{\s*contains:\s*filter\.code\b/);
    expect(repo).toMatch(
      /filter\.externalCode\b[\s\S]{0,80}externalCode:\s*\{\s*contains:\s*filter\.externalCode\b/,
    );
  });

  it('Группа товаров (с подгруппами) → productFolderIdDeep expands the pathName subtree', () => {
    expect(repo).toMatch(/filter\.productFolderIdDeep/);
    expect(repo).toMatch(/pathName:\s*\{\s*startsWith:/);
  });

  it('Описание → description contains (insensitive)', () => {
    expect(repo).toMatch(
      /filter\.description[\s\S]{0,80}description:\s*\{\s*contains:\s*filter\.description/,
    );
  });

  it('ИКПУ (MXIK) → mxikCode contains', () => {
    expect(repo).toMatch(
      /filter\.mxikCode[\s\S]{0,60}mxikCode:\s*\{\s*contains:\s*filter\.mxikCode/,
    );
  });

  it('Штрихкод → barcodes has (exact token)', () => {
    expect(repo).toMatch(/filter\.barcode\b[\s\S]{0,60}barcodes:\s*\{\s*has:\s*filter\.barcode\b/);
  });

  it('Весовой товар / Общий доступ → weighed / shared booleans (applied only when sent)', () => {
    expect(repo).toMatch(/filter\.weighed !== undefined[\s\S]{0,40}weighed:\s*filter\.weighed/);
    expect(repo).toMatch(/filter\.shared !== undefined[\s\S]{0,40}shared:\s*filter\.shared/);
  });

  it('Когда изменен → updatedAt Asia/Tashkent half-open range via tashkentRangeBounds', () => {
    // Anchor on the range being CONSTRUCTED *and* SPREAD into the where (not a
    // bare `updatedAt: {` token that an unrelated orderBy/select could satisfy).
    // 2026-06-13 list date-tz sweep: the buggy `lte: new Date(`${to}T23:59:59`)`
    // UTC end-of-day was replaced with the shared half-open Tashkent window.
    expect(repo).toMatch(/const updatedRange =/);
    expect(repo).toMatch(/\.\.\.updatedRange/);
    expect(repo).toMatch(
      /updatedAt:\s*tashkentRangeBounds\(filter\.updatedFrom,\s*filter\.updatedTo\)/,
    );
    // The day-dropping UTC end-of-day idiom must be gone.
    expect(repo).not.toMatch(/T23:59:59\.999Z/);
  });

  it('Владелец-отдел / Владелец-сотрудник → groupId/ownerId multi-select `in` (checkbox dropdown)', () => {
    // moysklad renders these as multi-select checkbox dropdowns (grounded
    // 2026-06-18); the schema yields a string[] and the repo matches ANY id.
    expect(repo).toMatch(
      /filter\.groupId\?\.length\s*\?\s*\{\s*groupId:\s*\{\s*in:\s*filter\.groupId/,
    );
    expect(repo).toMatch(
      /filter\.ownerId\?\.length\s*\?\s*\{\s*ownerId:\s*\{\s*in:\s*filter\.ownerId/,
    );
  });

  it('Кто изменил → modifiedById equality (last-modifier filter is wired to the where)', () => {
    expect(repo).toMatch(/filter\.modifiedById\s*\?\s*\{\s*modifiedById:\s*filter\.modifiedById/);
  });
});

/**
 * «Кто изменил» write-path lock (2026-06-13). The filter is only meaningful if
 * Product.modifiedById is actually stamped with the request actor — a filter
 * over a never-written column is a dead control. typecheck can't see a missing
 * assignment, so source-scan the repo/service wiring (non-vacuous: removing
 * either stamp fails this).
 */
describe('product modifiedById — the last-modifier is stamped from the actor', () => {
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const repo = stripComments(readFileSync(REPO, 'utf8'));
  const service = stripComments(readFileSync(join(__dirname, 'product.service.ts'), 'utf8'));

  it('create stamps modifiedById with the actor (= ownerId on create)', () => {
    expect(repo).toMatch(/modifiedById:\s*ownerId/);
  });

  it('update connects modifiedBy to the actor inside the version-bumping write', () => {
    // repo.update takes the actor and sets the relation connect.
    expect(repo).toMatch(/async update\(\s*accountId:\s*string,\s*userId:\s*string,/);
    expect(repo).toMatch(/modifiedBy:\s*\{\s*connect:\s*\{\s*id:\s*userId\s*\}\s*\}/);
  });

  it('the service threads the request actor into repo.update', () => {
    expect(service).toMatch(/this\.repo\.update\(accountId,\s*userId,\s*id,/);
  });
});
