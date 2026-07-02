import { describe, expect, it } from 'vitest';
import {
  buildMsFormatter,
  isMoyskladSyntax,
  javaToJs,
  renderMsBody,
  renderMsTemplate,
} from './ms-template.js';
import type { RawDocInput } from './print-render.util.js';

const DOC: RawDocInput = {
  title: 'Заказ покупателя',
  number: 'ЗП-00042',
  date: '2026-06-20T00:00:00.000Z',
  sumMinor: 150_000n, // 1 500.00
  currency: 'UZS',
  description: 'срочно',
  counterpartyName: 'ООО Ромашка',
  organizationName: 'MCHJ Demo',
  organizationPhone: '+998901234567',
  positions: [
    { name: 'Механизм', unit: 'шт', qty: '5', priceMinor: 50_000n, sumMinor: 250_000n },
    { name: 'Батарея', unit: 'шт', qty: '3', priceMinor: 70_000n, sumMinor: 210_000n },
  ],
};

describe('moysklad ${…} template engine (Step 1 — scalar fields)', () => {
  it('detects moysklad syntax vs our {tag} syntax', () => {
    expect(isMoyskladSyntax('Счёт № ${o.name}')).toBe(true);
    expect(isMoyskladSyntax('Итого $[ROUND(A1,2)]')).toBe(true);
    expect(isMoyskladSyntax('Счёт № {number}')).toBe(false);
    expect(isMoyskladSyntax('plain text')).toBe(false);
  });

  it('resolves ${o.name} and ${o.description}', () => {
    expect(renderMsTemplate('№ ${o.name} — ${o.description}', DOC)).toBe('№ ЗП-00042 — срочно');
  });

  it('resolves nested paths ${o.agent.name} / ${o.organization.name}', () => {
    expect(renderMsTemplate('${o.organization.name} / ${o.agent.name}', DOC)).toBe(
      'MCHJ Demo / ООО Ромашка',
    );
  });

  it('formatter.getExcelDate(o.moment) → DD.MM.YYYY', () => {
    expect(renderMsTemplate('${formatter.getExcelDate(o.moment)}', DOC)).toBe('20.06.2026');
  });

  it('formatter.printAmount(o.sum.sum) → grouped so‘m', () => {
    expect(renderMsTemplate('${formatter.printAmount(o.sum.sum)}', DOC)).toBe('1 500');
  });

  it('formatter.printNumber(o.sum.sum) → amount in words (Uzbek)', () => {
    expect(renderMsTemplate('${formatter.printNumber(o.sum.sum)}', DOC)).toContain("so'm");
  });

  it('ternary + method calls: getShared()/printIfElse', () => {
    expect(renderMsTemplate('${formatter.printIfElse(o.getShared(), "Да", "Нет")}', DOC)).toBe(
      'Нет',
    );
    expect(renderMsTemplate('${o.applicable ? "Проведён" : "Черновик"}', DOC)).toBe('Проведён');
  });

  it('calcTotalQuantity(o) sums the position quantities', () => {
    expect(renderMsTemplate('Всего: ${formatter.calcTotalQuantity(o)}', DOC)).toBe('Всего: 8');
  });

  it('o.getPositions().size() = position count', () => {
    expect(renderMsTemplate('${o.getPositions().size()}', DOC)).toBe('2');
  });

  it('unknown/erroring/nullish expressions render as empty string (lenient)', () => {
    expect(renderMsTemplate('[${o.nope.deep}]', DOC)).toBe('[]');
    expect(renderMsTemplate('[${o.externalCode}]', DOC)).toBe('[]');
  });

  it('leaves $[ … ] Excel formulas untouched (Step 3)', () => {
    expect(renderMsTemplate('${o.name} $[ROUND(A1,2)]', DOC)).toBe('ЗП-00042 $[ROUND(A1,2)]');
  });
});

describe('moysklad <jx:forEach> table iteration (Step 2 — positions)', () => {
  it('detects the jx:forEach directive as moysklad syntax', () => {
    expect(
      isMoyskladSyntax('<jx:forEach items="${o.positions}" var="position">x</jx:forEach>'),
    ).toBe(true);
  });

  it('repeats the inner body once per position with the loop var in scope', () => {
    const body =
      '<jx:forEach items="${o.positions}" var="position" varStatus="status">' +
      '${status.count}. ${position.printName} — ${position.quantity} × ' +
      '${formatter.printAmount(position.price.sumInCurrency)} = ' +
      '${formatter.printAmount(position.sum.sumInCurrency)}\n' +
      '</jx:forEach>';
    expect(renderMsTemplate(body, DOC)).toBe(
      '1. Механизм — 5 × 500 = 2 500\n2. Батарея — 3 × 700 = 2 100\n',
    );
  });

  it('uom + JEXL division (sumInCurrency / 100) work per row', () => {
    const body =
      '<jx:forEach items="${o.positions}" var="position">' +
      '${position.good.uom.name}:${position.price.sumInCurrency / 100} ' +
      '</jx:forEach>';
    expect(renderMsTemplate(body, DOC)).toBe('шт:500 шт:700 ');
  });

  it('JEXL ternary on a per-row field', () => {
    const body =
      '<jx:forEach items="${o.positions}" var="position">' +
      '${position.quantity > 4 ? "много" : "мало"} </jx:forEach>';
    expect(renderMsTemplate(body, DOC)).toBe('много мало ');
  });

  it('empty positions → forEach renders nothing', () => {
    expect(
      renderMsTemplate('[<jx:forEach items="${o.positions}" var="p">${p.name}</jx:forEach>]', {
        ...DOC,
        positions: [],
      }),
    ).toBe('[]');
  });
});

describe('javaToJs — moysklad Java idioms → JS', () => {
  it('rewrites .size()/.length() to the .length property', () => {
    expect(javaToJs('filters.size() > 0')).toBe('filters.length > 0');
    expect(javaToJs('s.length()')).toBe('s.length');
  });

  it('rewrites x.isEmpty() to __isEmpty(x), capturing method-chain receivers', () => {
    expect(javaToJs('filtersText.isEmpty()')).toBe('__isEmpty(filtersText)');
    expect(javaToJs('!filter.getDisplayName().isEmpty()')).toBe(
      '!__isEmpty(filter.getDisplayName())',
    );
  });

  it('renders Java idioms end-to-end (.size()/.length()/.isEmpty())', () => {
    expect(renderMsBody('${xs.size()}', { xs: [1, 2, 3] })).toBe('3');
    expect(renderMsBody('${s.length()}', { s: 'abc' })).toBe('3');
    expect(renderMsBody('${xs.isEmpty()}', { xs: [] })).toBe('true');
    expect(renderMsBody('${xs.isEmpty()}', { xs: [1] })).toBe('false');
  });
});

describe('<jx:if> conditionals + nesting', () => {
  it('detects jx:if as moysklad syntax', () => {
    expect(isMoyskladSyntax('<jx:if test="${x}">y</jx:if>')).toBe(true);
  });

  it('keeps the body when the test is truthy, drops it when falsy', () => {
    expect(renderMsBody('a<jx:if test="${n>0}">YES</jx:if>b', { n: 1 })).toBe('aYESb');
    expect(renderMsBody('a<jx:if test="${n>0}">YES</jx:if>b', { n: 0 })).toBe('ab');
  });

  it('a falsy/erroring test renders nothing (lenient)', () => {
    expect(renderMsBody('[<jx:if test="${missing.deep}">X</jx:if>]', {})).toBe('[]');
  });

  it('handles jx:if nested inside jx:forEach', () => {
    expect(
      renderMsBody(
        '<jx:forEach items="${xs}" var="x"><jx:if test="${x>1}">${x}</jx:if></jx:forEach>',
        {
          xs: [1, 2, 3],
        },
      ),
    ).toBe('23');
  });

  it('handles jx:forEach nested inside jx:if (both true)', () => {
    expect(
      renderMsBody(
        '<jx:if test="${xs.size()>0}">[<jx:forEach items="${xs}" var="x">${x}</jx:forEach>]</jx:if>',
        { xs: [7, 8] },
      ),
    ).toBe('[78]');
  });
});

describe('formatter — Java date format + currentUser/currentMoment', () => {
  const NOW = new Date(Date.UTC(2026, 5, 20, 15, 30, 45));
  const fmt = buildMsFormatter({
    currentUser: { firstName: 'Иван', secondName: 'Петров', uid: '77' },
    currentMoment: NOW,
  });

  it('getExcelDate prints dd.MM.yyyy on its own', () => {
    expect(
      renderMsBody('${formatter.getExcelDate(formatter.currentMoment)}', { formatter: fmt }),
    ).toBe('20.06.2026');
  });

  it('format() applies Java %1$t time conversions', () => {
    expect(
      renderMsBody(
        '${formatter.format("%1$td.%1$tm.%1$tY %1$tH:%1$tM:%1$tS", formatter.getExcelDate(formatter.currentMoment))}',
        { formatter: fmt },
      ),
    ).toBe('20.06.2026 15:30:45');
    expect(
      renderMsBody(
        '${formatter.format("%1$td.%1$tm.%1$tY %1$tH:%1$tM", formatter.getExcelDate(formatter.currentMoment))}',
        { formatter: fmt },
      ),
    ).toBe('20.06.2026 15:30');
  });

  it('exposes currentUser fields', () => {
    expect(
      renderMsBody('${formatter.currentUser.secondName} ${formatter.currentUser.uid}', {
        formatter: fmt,
      }),
    ).toBe('Петров 77');
  });
});

// Ground truth: the actual «Заказы поставщикам» list-report template downloaded
// from moysklad (docs/moysklad-reference/print-templates/report-PurchaseOrder.md).
// Proves the engine renders moysklad's real markup against a list-report scope.
describe('real moysklad PurchaseOrder list-report template', () => {
  const REPORT = [
    'Заказы поставщикам',
    '${"Cоздал: " + formatter.currentUser.secondName + " " + formatter.currentUser.firstName + " (" + formatter.currentUser.uid + ") " + formatter.format("%1$td.%1$tm.%1$tY %1$tH:%1$tM:%1$tS", formatter.getExcelDate(formatter.currentMoment))}',
    '<jx:if test="${filtersText!=null && filtersText.length()>0}">',
    '${filtersText}',
    '</jx:if>',
    '<jx:if test="${filters != null && filters.size() > 0}">',
    '<jx:forEach items="${filters}" var="filter">',
    '<jx:if test="${filter.getDisplayName() != null && !filter.getDisplayName().isEmpty()}">',
    '${filter.getDisplayName()}: ${filter.getPrintValue()}',
    '</jx:if>',
    '</jx:forEach>',
    '</jx:if>',
    '<jx:forEach items="${rows}" var="row">',
    '${row.name} | ${formatter.printIf(row.applicable, "Да")} | ${formatter.format("%1$td.%1$tm.%1$tY %1$tH:%1$tM", formatter.getExcelDate(row.moment))} | ${row.sourceAgentRef.name} | ${row.targetAgentRef.name} | ${row.sumTO.sum / 100} | ${row.currencyRef.name} | ${row.invoicedSum / 100} | ${row.payedSum / 100} | ${row.shippedSum / 100} | ${row.stateRef.name} | ${row.description} | ${row.targetPlaceRef.name}',
    '</jx:forEach>',
    'Итого: | ${total.sumTO.sum/100} | ${total.invoicedSum/100} | ${total.payedSum/100} | ${total.shippedSum/100}',
  ].join('\n');

  const scope = {
    formatter: buildMsFormatter({
      currentUser: { firstName: 'Иван', secondName: 'Петров', uid: '77' },
      currentMoment: new Date(Date.UTC(2026, 5, 20, 15, 30, 45)),
    }),
    filtersText: 'Период: 01.06.2026 — 30.06.2026',
    filters: [
      { getDisplayName: () => 'Организация', getPrintValue: () => 'MCHJ Demo' },
      // empty display name → hidden by the inner jx:if
      { getDisplayName: () => '', getPrintValue: () => 'SHOULD-BE-HIDDEN' },
    ],
    rows: [
      {
        name: '00021',
        applicable: true,
        moment: '2026-06-18T09:05:00Z',
        sourceAgentRef: { name: 'ООО Поставщик' },
        targetAgentRef: { name: 'MCHJ Demo' },
        sumTO: { sum: 150_000_000 },
        currencyRef: { name: 'UZS' },
        invoicedSum: 150_000_000,
        payedSum: 50_000_000,
        shippedSum: 0,
        stateRef: { name: 'Подтверждён' },
        description: 'срочно',
        targetPlaceRef: { name: 'Главный склад' },
      },
      {
        name: '00022',
        applicable: false,
        moment: '2026-06-19T14:00:00Z',
        sourceAgentRef: { name: 'ЧП Иванов' },
        targetAgentRef: { name: 'MCHJ Demo' },
        sumTO: { sum: 9_700_000 },
        currencyRef: { name: 'USD' },
        invoicedSum: 0,
        payedSum: 0,
        shippedSum: 9_700_000,
        stateRef: { name: '' },
        description: '',
        targetPlaceRef: { name: 'Склад 2' },
      },
    ],
    total: {
      sumTO: { sum: 159_700_000 },
      invoicedSum: 150_000_000,
      payedSum: 50_000_000,
      shippedSum: 9_700_000,
    },
  };

  const out = renderMsBody(REPORT, scope);

  it('renders the «Создал …» line with current user + formatted moment', () => {
    expect(out).toContain('Cоздал: Петров Иван (77) 20.06.2026 15:30:45');
  });

  it('shows filtersText and non-empty filters, hides the empty-name filter', () => {
    expect(out).toContain('Период: 01.06.2026 — 30.06.2026');
    expect(out).toContain('Организация: MCHJ Demo');
    expect(out).not.toContain('SHOULD-BE-HIDDEN');
  });

  it('renders each order row (money ÷ 100, posted→Да, dd.MM.yyyy HH:mm)', () => {
    expect(out).toContain(
      '00021 | Да | 18.06.2026 09:05 | ООО Поставщик | MCHJ Demo | 1500000 | UZS | 1500000 | 500000 | 0 | Подтверждён | срочно | Главный склад',
    );
    // applicable=false → printIf renders empty; empty state/description → blank cells
    expect(out).toContain(
      '00022 |  | 19.06.2026 14:00 | ЧП Иванов | MCHJ Demo | 97000 | USD | 0 | 0 | 97000 |  |  | Склад 2',
    );
  });

  it('renders the totals row (all ÷ 100)', () => {
    expect(out).toContain('Итого: | 1597000 | 1500000 | 500000 | 97000');
  });

  it('leaves no unrendered jx: directives or ${…} in the output', () => {
    expect(out).not.toMatch(/<jx:/);
    expect(out).not.toMatch(/\$\{/);
  });
});
