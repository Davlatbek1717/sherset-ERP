/*
 * moysklad-style-capture.console.js — COMPLETE ground-truth for 100% 1:1 parity.
 *
 * WHY: pixel + behaviour 1:1 needs moysklad's REAL numbers — exact px sizes,
 * colours, fonts, borders, spacing, the FIELD ORDER, the column layout, the
 * toolbar buttons (with/without icons), the table header styling, the status
 * pills. Screenshots only get us ~90%; this measures the remaining 10% exactly.
 * The clone runner cannot log into moysklad, so YOU capture it once per page.
 *
 * HOW TO RUN (~10 seconds):
 *   1. Open moysklad LOGGED IN, on the page you want cloned, e.g. an edit form:
 *        https://online.moysklad.ru/app/#customerorder/edit?new
 *      (To capture a dropdown/picker's look, OPEN it first, then run this.)
 *   2. F12 → Console.
 *   3. Paste this ENTIRE file → Enter.
 *   4. A file `moysklad-blueprint-<page>.json` DOWNLOADS automatically.
 *      Send me that file (or save it to docs/moysklad-reference/).
 *   5. Repeat on a LIST page (e.g. #customerorder); open «Фильтр» FIRST so the
 *      filter panel + field order is captured too.
 *
 * It only READS the page (getComputedStyle / getBoundingClientRect) — it changes
 * NOTHING in your account.
 */
(() => {
  const r2 = (n) => Math.round(n);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const PROPS = [
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'color',
    'text-transform',
    'text-align',
    'background-color',
    'background-image',
    'width',
    'height',
    'min-height',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'border-top-width',
    'border-bottom-width',
    'border-left-width',
    'border-color',
    'border-style',
    'border-radius',
    'box-shadow',
    'cursor',
    'transition',
    'display',
    'gap',
    'opacity',
  ];
  const pick = (el, props = PROPS) => {
    const s = cs(el);
    if (!s) return null;
    const o = {};
    for (const p of props) {
      const v = s.getPropertyValue(p);
      if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'auto') o[p] = v;
    }
    return o;
  };
  const rect = (el) => {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r2(r.x), y: r2(r.y), w: r2(r.width), h: r2(r.height) };
  };
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 1 && r.height > 1 && s && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.replace(/\s+/g, ' ').trim();
  };
  const safe = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      console.warn('capture section failed:', label, e);
      return { _error: String(e) };
    }
  };

  const out = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight },
  };

  // ── THEME (root + body typography/colour) ───────────────────────────────
  out.theme = safe('theme', () => ({
    root: pick(document.documentElement, ['font-family', 'font-size', 'color']),
    body: pick(document.body, [
      'font-family',
      'font-size',
      'line-height',
      'color',
      'background-color',
    ]),
  }));

  // ── FORM FIELDS sweep → reveals ORDER, COLUMNS, WIDTHS, exact control box ─
  out.fields = safe('fields', () => {
    const controlSel =
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea,' +
      ' [role=combobox], [class*="ComboBox" i], [class*="SelectBox" i]';
    const controls = [...document.querySelectorAll(controlSel)].filter(visible);
    const labels = [...document.querySelectorAll('label, span, div, td, th, legend')]
      .filter((e) => {
        const t = ownText(e);
        return t && t.length > 0 && t.length < 40 && visible(e);
      })
      .map((e) => ({ t: ownText(e), r: e.getBoundingClientRect() }));
    const nearestLabel = (cr) => {
      let best = null;
      let bestD = 1e9;
      for (const lc of labels) {
        const vOverlap = lc.r.bottom > cr.top && lc.r.top < cr.bottom;
        if (!vOverlap) continue;
        if (lc.r.right > cr.left + 6) continue; // label must sit left of the control
        const d =
          cr.left - lc.r.right + Math.abs((lc.r.top + lc.r.bottom) / 2 - (cr.top + cr.bottom) / 2);
        if (d >= 0 && d < bestD) {
          bestD = d;
          best = lc.t;
        }
      }
      return best;
    };
    const fields = controls
      .map((c) => {
        const cr = c.getBoundingClientRect();
        return {
          label: nearestLabel(cr),
          control: c.tagName.toLowerCase() + (c.type ? `[${c.type}]` : ''),
          placeholder: c.placeholder || null,
          value: (c.value || '').slice(0, 40) || null,
          ...rect(c),
          style: pick(c),
        };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    // cluster x-positions into columns
    const cols = [];
    for (const f of fields) {
      if (!cols.some((c) => Math.abs(c - f.x) < 60)) cols.push(f.x);
    }
    cols.sort((a, b) => a - b);
    for (const f of fields) f.column = cols.findIndex((c) => Math.abs(c - f.x) < 60);
    out.columns = cols;
    return fields;
  });

  // ── TOOLBAR buttons (top region) in left-to-right order + icon detection ──
  out.toolbar = safe('toolbar', () => {
    const btns = [
      ...document.querySelectorAll('button, [role=button], a.btn, [class*="Button" i]'),
    ].filter((b) => visible(b) && b.getBoundingClientRect().top < 340);
    return btns
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      .slice(0, 14)
      .map((b) => ({
        text: txt(b).slice(0, 30),
        hasIcon: !!b.querySelector('img, svg, [class*="icon" i], [style*="background-image"]'),
        ...rect(b),
        style: pick(b, [
          'font-size',
          'font-weight',
          'color',
          'background-color',
          'padding-left',
          'padding-right',
          'height',
          'border-radius',
          'border-color',
        ]),
      }));
  });

  // ── POSITIONS TABLE (header cells in order + cell styling) ───────────────
  out.table = safe('table', () => {
    const ths = [...document.querySelectorAll('th, [class*="header" i] [class*="cell" i]')]
      .filter(visible)
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return {
      headers: ths.map((h) => ({
        text: txt(h),
        hasSortArrow: !!h.querySelector('img, svg, [class*="sort" i], [class*="arrow" i]'),
        style: pick(h, [
          'font-size',
          'font-weight',
          'text-transform',
          'text-align',
          'color',
          'background-color',
          'padding-left',
          'padding-right',
          'height',
        ]),
      })),
      headerCell: pick(ths[0]),
      bodyCell: pick(document.querySelector('td')),
    };
  });

  // ── STATUS ROW (payment pill / doc status dropdown) ──────────────────────
  out.statuses = safe('statuses', () => {
    const re =
      /Не оплачено|Оплачено|Проведено|Текшир|Черновик|Запросить оплату|Отгружено|Подтвержд|Ожидание/;
    return [...document.querySelectorAll('span, div, button, a')]
      .filter((e) => {
        const t = txt(e);
        return t && t.length < 28 && re.test(t) && visible(e) && e.children.length < 3;
      })
      .slice(0, 8)
      .map((e) => ({
        text: txt(e),
        ...rect(e),
        style: pick(e, [
          'color',
          'background-color',
          'font-size',
          'font-weight',
          'border-radius',
          'border-color',
          'padding-left',
          'padding-right',
          'height',
        ]),
      }));
  });

  // ── DATE / inline icons (edit-pencil ✏️, +create, calendar) ──────────────
  out.iconAffordances = safe('icons', () => {
    const imgs = [...document.querySelectorAll('img, svg, [class*="icon" i]')].filter(visible);
    return imgs.slice(0, 40).map((i) => ({
      tag: i.tagName.toLowerCase(),
      title:
        i.getAttribute('title') || i.getAttribute('alt') || i.getAttribute('aria-label') || null,
      cls: (i.getAttribute('class') || '').slice(0, 60) || null,
      ...rect(i),
    }));
  });

  // ── BOTTOM markers (presence of sections we may be missing) ──────────────
  out.bottom = safe('bottom', () => {
    const has = (re) =>
      [...document.querySelectorAll('*')].some((e) => re.test(ownText(e)) && visible(e));
    return {
      tasksSection: has(/^Задачи/),
      filesSection: has(/^Файлы/),
      externalCode: has(/Внешний код/),
      subtotalLabel: has(/Промежуточный итог/),
      totalLabel: has(/^Итого/),
      vatIncludesToggle: has(/Цена включает НДС/),
      requestPayment: has(/Запросить оплату/),
    };
  });

  // ── FILTER PANEL (list page; open «Фильтр» first) ────────────────────────
  out.filter = safe('filter', () => {
    const panel =
      document.querySelector(
        '[class*="filter" i][class*="panel" i], .filter-popup, [class*="popup" i][class*="filter" i]',
      ) ||
      [...document.querySelectorAll('div')].find((d) =>
        /Сохранённые фильтры|Применить|Сбросить/.test(d.textContent || ''),
      );
    if (!panel || !visible(panel)) return null;
    return {
      box: pick(panel),
      fieldOrder: [...panel.querySelectorAll('label, [class*="label" i], legend')]
        .map((e) => txt(e))
        .filter((t) => t && t.length < 40)
        .slice(0, 40),
    };
  });

  // ── OUTPUT: download a file (large) with clipboard fallback ───────────────
  const json = JSON.stringify(out, null, 2);
  console.log(out);
  const slug =
    (location.hash || location.pathname)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page';
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moysklad-blueprint-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log(
      `%c✔ Downloaded moysklad-blueprint-${slug}.json — send me that file.`,
      'color:green;font-weight:bold;font-size:14px',
    );
  } catch (_e) {
    try {
      copy(json);
      console.log('%c✔ Copied to clipboard — paste it back to me.', 'color:green;font-weight:bold');
    } catch {
      console.log('Select the JSON above and copy it manually.');
    }
  }
  return out;
})();
