import type { Page } from 'playwright';
import { settle } from '../utils/wait.ts';

/**
 * API docs entity schema extractor.
 * Works on `dev.moysklad.ru/doc/api/remap/1.2/#/dictionaries/<slug>` or `documents/<slug>`.
 *
 * The page renders as a long article with multiple field tables:
 *   | Название | Тип | Фильтрация | Описание |
 *
 * Each row: field name, type, filter operators, description (+ tags: required, readOnly, ...).
 */

export interface ApiField {
  name: string;
  type: string;
  filtering: string | null;
  description: string;
  flags: {
    required: boolean; // "Обязательное при ответе"
    readOnly: boolean; // "Только для чтения"
    requiredOnCreate: boolean; // "Необходимо при создании"
    expandable: boolean; // "Expand"
    onDemand: boolean; // "Выводится по запросу"
    immutableAfterSet: boolean; // "После заполнения недоступно для изменения"
    regionTag: 'RU' | 'UZ' | 'KZ' | null; // field marked for specific country
  };
}

export interface ApiEntityCapture {
  slug: string;
  title: string | null;
  section: 'dictionaries' | 'documents' | 'reports' | 'other';
  url: string;
  capturedAt: string;
  /** All H2 sections found on the page (for structure understanding) */
  sections: { title: string; level: number }[];
  /** Field tables — grouped. First table is usually the main entity; subsequent are nested types. */
  tables: { heading: string | null; fields: ApiField[] }[];
  /** External cross-links we saw (for graph traversal) */
  crossRefs: { label: string; href: string }[];
  /** Raw tables count for sanity check */
  rawTableCount: number;
}

const FLAG_PATTERNS = {
  required: /Обязательное при ответе/,
  readOnly: /Только для чтения/,
  requiredOnCreate: /Необходимо при создании/,
  expandable: /Expand/,
  onDemand: /Выводится по запросу/,
  immutableAfterSet: /После заполнения недоступно для изменения/,
} as const;

export async function extractApiEntity(
  page: Page,
  slug: string,
  section: ApiEntityCapture['section'],
): Promise<ApiEntityCapture> {
  await settle(page, 700);

  // Wait for at least one field table
  try {
    await page.waitForSelector('table', { timeout: 10_000 });
  } catch {
    // No tables — may be a general section, not an entity
  }

  const result = await page.evaluate(() => {
    function text(el: Element | null): string {
      return (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
    }

    // Walk the DOM, pair h1/h2/h3 with the tables that follow them
    const article = document.querySelector('article, main, [role=main]') ?? document.body;

    const titleEl = article.querySelector('h1, h2');
    const title = titleEl ? text(titleEl) : null;

    const sections: { title: string; level: number }[] = [];
    article.querySelectorAll('h2, h3').forEach((h) => {
      sections.push({ title: text(h), level: h.tagName === 'H2' ? 2 : 3 });
    });

    const tables: { heading: string | null; rows: string[][] }[] = [];
    article.querySelectorAll('table').forEach((tbl) => {
      // Find the nearest preceding h2/h3/h4 as heading
      let heading: string | null = null;
      let prev: Element | null = tbl.previousElementSibling;
      let walk: Element | null = tbl;
      while (walk && !heading) {
        if (walk.previousElementSibling) {
          prev = walk.previousElementSibling;
          if (prev && /^H[234]$/.test(prev.tagName)) {
            heading = text(prev);
            break;
          }
          walk = prev;
        } else {
          walk = walk.parentElement;
        }
        if (!walk || walk === article) break;
      }
      const rows: string[][] = [];
      tbl.querySelectorAll('tr').forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((c) => text(c));
        rows.push(cells);
      });
      tables.push({ heading, rows });
    });

    const crossRefs: { label: string; href: string }[] = [];
    article.querySelectorAll('a[href^="#/"]').forEach((a) => {
      const label = text(a);
      const href = a.getAttribute('href') ?? '';
      if (label && href && label.length < 80) {
        crossRefs.push({ label, href });
      }
    });

    return { title, sections, tables, crossRefs };
  });

  // Post-process tables → structured fields
  const tables = result.tables
    .filter((t) => t.rows.length > 1)
    .map((t) => {
      const header = t.rows[0];
      const hasFiltering = header?.some((h) => /филь/i.test(h));
      const fields: ApiField[] = [];
      for (const row of t.rows.slice(1)) {
        const [name, type, third, fourth] = row;
        if (!name || !type) continue;
        const filtering = hasFiltering ? (third ?? null) : null;
        const description = hasFiltering ? (fourth ?? '') : (third ?? '');
        fields.push({
          name: name.trim(),
          type: (type ?? '').trim(),
          filtering: filtering?.trim() || null,
          description: (description ?? '').trim(),
          flags: deriveFlags(description ?? ''),
        });
      }
      return { heading: t.heading, fields };
    })
    .filter((t) => t.fields.length > 0);

  return {
    slug,
    title: result.title,
    section,
    url: page.url(),
    capturedAt: new Date().toISOString(),
    sections: result.sections,
    tables,
    crossRefs: dedupeCrossRefs(result.crossRefs),
    rawTableCount: result.tables.length,
  };
}

function deriveFlags(description: string): ApiField['flags'] {
  const regionTag = /\bRU\b/.test(description)
    ? 'RU'
    : /\bUZ\b/.test(description)
      ? 'UZ'
      : /\bKZ\b/.test(description)
        ? 'KZ'
        : null;
  return {
    required: FLAG_PATTERNS.required.test(description),
    readOnly: FLAG_PATTERNS.readOnly.test(description),
    requiredOnCreate: FLAG_PATTERNS.requiredOnCreate.test(description),
    expandable: FLAG_PATTERNS.expandable.test(description),
    onDemand: FLAG_PATTERNS.onDemand.test(description),
    immutableAfterSet: FLAG_PATTERNS.immutableAfterSet.test(description),
    regionTag,
  };
}

function dedupeCrossRefs(
  refs: { label: string; href: string }[],
): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const r of refs) {
    const key = `${r.label}|${r.href}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}
