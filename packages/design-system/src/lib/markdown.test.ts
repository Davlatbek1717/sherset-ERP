import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown.tsx';

/**
 * Pure-parser tests — exercise the markdown block parser directly so we
 * don't need a DOM. The renderer is a thin React mapping over these
 * blocks; if the parser is correct, the renderer is too.
 */

describe('parseMarkdown', () => {
  it('parses a single heading', () => {
    const blocks = parseMarkdown('# Title');
    expect(blocks).toEqual([{ type: 'h', level: 1, text: 'Title' }]);
  });

  it('parses heading levels 1-6', () => {
    const src = '# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6';
    const blocks = parseMarkdown(src);
    expect(blocks.map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('joins wrapped paragraph lines into a single paragraph', () => {
    const blocks = parseMarkdown('First line\nstill same paragraph\n\nNew paragraph');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'p' });
    expect(blocks[0]?.text).toContain('First line');
    expect(blocks[0]?.text).toContain('still same paragraph');
    expect(blocks[1]?.text).toBe('New paragraph');
  });

  it('parses an unordered list with multiple items', () => {
    const blocks = parseMarkdown('- one\n- two\n- three');
    expect(blocks).toEqual([{ type: 'ul', items: ['one', 'two', 'three'] }]);
  });

  it('parses ordered lists', () => {
    const blocks = parseMarkdown('1. a\n2. b\n3. c');
    expect(blocks).toEqual([{ type: 'ol', items: ['a', 'b', 'c'] }]);
  });

  it('parses fenced code blocks and preserves inner whitespace', () => {
    const src = '```\nlet x = 1;\n  indented\n```';
    const blocks = parseMarkdown(src);
    expect(blocks).toEqual([{ type: 'code-block', text: 'let x = 1;\n  indented' }]);
  });

  it('parses horizontal rules', () => {
    const blocks = parseMarkdown('Above\n\n---\n\nBelow');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'hr', 'p']);
  });

  it('handles mixed sections in document order', () => {
    const src = '# Title\n\nIntro paragraph.\n\n- bullet\n\n## Section\n\n```\ncode\n```';
    const blocks = parseMarkdown(src);
    expect(blocks.map((b) => b.type)).toEqual(['h', 'p', 'ul', 'h', 'code-block']);
  });

  it('returns an empty array on empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n\n')).toEqual([]);
  });

  it('does not confuse `*` inside a paragraph for a list item', () => {
    const blocks = parseMarkdown('Plain *italic* and **bold** text');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('p');
  });

  it('treats *-prefixed lines as list items (alternative bullet syntax)', () => {
    const blocks = parseMarkdown('* one\n* two');
    expect(blocks).toEqual([{ type: 'ul', items: ['one', 'two'] }]);
  });

  it('keeps blank lines from breaking ordered lists', () => {
    const blocks = parseMarkdown('1. a\n2. b\n\nNot a list anymore');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe('ol');
    expect(blocks[1]?.type).toBe('p');
  });
});
