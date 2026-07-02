import { describe, expect, it } from 'vitest';
import { renderSafeTemplate } from './safe-template.js';

describe('renderSafeTemplate — interpolation', () => {
  it('substitutes dotted paths and HTML-escapes values', () => {
    const out = renderSafeTemplate('No {{= doc.number }} — {{= doc.party }}', {
      doc: { number: 'CO-1', party: '<b>A&B</b>' },
    });
    expect(out).toBe('No CO-1 — &lt;b&gt;A&amp;B&lt;/b&gt;');
  });

  it('treats bare {{ path }} as interpolation (not code)', () => {
    expect(renderSafeTemplate('{{ doc.number }}', { doc: { number: 'X' } })).toBe('X');
  });

  it('renders empty string for missing paths', () => {
    expect(renderSafeTemplate('[{{= doc.nope.deep }}]', { doc: {} })).toBe('[]');
  });
});

describe('renderSafeTemplate — blocks', () => {
  it('iterates {{#each}} with item scope + parent fallback', () => {
    const out = renderSafeTemplate(
      '{{#each positions}}{{= idx }}:{{= name }}={{= sum }} {{= doc.currency }};{{/each}}',
      {
        doc: { currency: 'UZS' },
        positions: [
          { idx: 1, name: 'A', sum: '100' },
          { idx: 2, name: 'B', sum: '200' },
        ],
      },
    );
    expect(out).toBe('1:A=100 UZS;2:B=200 UZS;');
  });

  it('renders {{#if}}/{{else}} on truthiness', () => {
    const tpl = '{{#if hasPositions}}T{{else}}S{{/if}}';
    expect(renderSafeTemplate(tpl, { hasPositions: true })).toBe('T');
    expect(renderSafeTemplate(tpl, { hasPositions: false })).toBe('S');
    expect(renderSafeTemplate(tpl, {})).toBe('S');
  });

  it('treats empty array as falsy for {{#if}}', () => {
    expect(renderSafeTemplate('{{#if positions}}X{{/if}}', { positions: [] })).toBe('');
  });

  it('skips {{#each}} over a non-array gracefully', () => {
    expect(renderSafeTemplate('a{{#each positions}}X{{/each}}b', { positions: null })).toBe('ab');
  });
});

describe('renderSafeTemplate — SECURITY: no code execution', () => {
  it('does NOT execute a process.exit attempt (renders empty, process survives)', () => {
    // If this ran as code the test process would die. It must render as data.
    const out = renderSafeTemplate('before {{ process.exit(1) }} after', {});
    expect(out).toBe('before  after');
  });

  it('cannot reach globals like process.env', () => {
    expect(renderSafeTemplate('{{= process.env.SECRET }}', {})).toBe('');
  });

  it('blocks the Function-constructor escape via constructor/__proto__', () => {
    const ctx = { doc: { number: 'X' } };
    expect(renderSafeTemplate('{{= doc.constructor }}', ctx)).toBe('');
    expect(renderSafeTemplate('{{= doc.constructor.constructor }}', ctx)).toBe('');
    expect(renderSafeTemplate('{{= doc.__proto__ }}', ctx)).toBe('');
    expect(renderSafeTemplate('{{= constructor.constructor }}', ctx)).toBe('');
  });

  it('does not invoke functions present on the context', () => {
    let called = false;
    const ctx: { doc: { boom: () => string } } = {
      doc: {
        boom: () => {
          called = true;
          return 'PWNED';
        },
      },
    };
    // Resolving doc.boom returns the function reference; String(fn) is its
    // source, but it is NEVER called. We assert no invocation happened.
    renderSafeTemplate('{{= doc.boom }}', ctx);
    expect(called).toBe(false);
  });

  it('does not allow template injection through interpolated data', () => {
    // A value that looks like a tag is escaped, not re-parsed.
    const out = renderSafeTemplate('{{= doc.evil }}', {
      doc: { evil: '{{ process.exit(1) }}' },
    });
    expect(out).toBe('{{ process.exit(1) }}');
  });
});

describe('renderSafeTemplate — robustness', () => {
  it('does not loop forever or allocate unboundedly (finite array iteration only)', () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ idx: i }));
    const out = renderSafeTemplate('{{#each rows}}.{{/each}}', { rows: big });
    expect(out.length).toBe(1000);
  });

  it('renders best-effort on an unclosed block without throwing', () => {
    expect(() => renderSafeTemplate('a {{#each rows}} b', { rows: [{}] })).not.toThrow();
  });
});
