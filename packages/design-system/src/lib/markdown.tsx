import * as React from 'react';
import { cn } from './cn.ts';

/**
 * Tiny inline-only markdown renderer for help articles, hint banners,
 * and notification bodies. Handles the markdown subset we actually
 * publish: headings (#–######), paragraphs, **bold**, *italic*, `code`,
 * [text](url) links, and unordered/ordered lists.
 *
 * Why not bring in `react-markdown`? Adds ~80 KB gzipped + 3 transitive
 * deps for a feature where authors are admins typing in a controlled
 * textarea. We escape HTML so a malicious bodyMd cannot inject script.
 *
 * If we ever need tables / images / footnotes / GFM, swap for
 * react-markdown — the API surface here (one component, one prop) is
 * intentionally identical.
 */

export interface MarkdownProps {
  source: string;
  className?: string;
}

export function Markdown({ source, className }: MarkdownProps) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  return (
    <div
      className={cn(
        'space-y-3 text-sm leading-relaxed text-[var(--ms-text-primary)]',
        '[&_a]:text-[var(--ms-text-link)] [&_a]:underline-offset-2 [&_a:hover]:underline',
        '[&_code]:rounded [&_code]:bg-[var(--ms-bg-muted)] [&_code]:px-1 [&_code]:py-0.5',
        '[&_code]:font-mono [&_code]:text-xs',
        '[&_h1]:font-semibold [&_h1]:text-base',
        '[&_h2]:font-semibold [&_h2]:text-sm',
        '[&_h3]:font-semibold [&_h3]:text-xs [&_h3]:uppercase [&_h3]:tracking-wide',
        '[&_h3]:text-[var(--ms-text-muted)]',
        '[&_strong]:font-semibold',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:space-y-1 [&_ol]:space-y-1',
        className,
      )}
    >
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

// --- parser -------------------------------------------------------------

export interface MarkdownBlock {
  type: 'h' | 'p' | 'ul' | 'ol' | 'code-block' | 'hr';
  level?: number;
  text?: string;
  items?: string[];
}

export function parseMarkdown(src: string): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Skip blank lines.
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^---+$/.test(line.trim())) {
      out.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Heading (# …).
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push({ type: 'h', level: heading[1]!.length, text: heading[2]!.trim() });
      i += 1;
      continue;
    }

    // Fenced code block (```).
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // closing fence
      out.push({ type: 'code-block', text: buf.join('\n') });
      continue;
    }

    // Unordered list (`- …` or `* …`).
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^[-*]\s+/, ''));
        i += 1;
      }
      out.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (`1. …`).
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      out.push({ type: 'ol', items });
      continue;
    }

    // Paragraph — gather contiguous non-blank lines.
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,6}\s|[-*]\s|\d+\.\s|```|---+$)/.test(lines[i] ?? '')
    ) {
      buf.push(lines[i] ?? '');
      i += 1;
    }
    out.push({ type: 'p', text: buf.join(' ') });
  }

  return out;
}

// --- renderer -----------------------------------------------------------

function renderBlock(block: MarkdownBlock, key: number): React.ReactElement {
  switch (block.type) {
    case 'hr':
      return <hr key={key} className="border-[var(--ms-border-default)]" />;
    case 'h': {
      const level = block.level ?? 1;
      const Tag = `h${Math.min(level, 6)}` as keyof React.JSX.IntrinsicElements;
      return React.createElement(Tag, { key }, renderInline(block.text ?? ''));
    }
    case 'p':
      return <p key={key}>{renderInline(block.text ?? '')}</p>;
    case 'ul':
      return (
        <ul key={key}>
          {(block.items ?? []).map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key}>
          {(block.items ?? []).map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case 'code-block':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3 font-mono text-xs"
        >
          {block.text}
        </pre>
      );
  }
}

/**
 * Inline markdown — `**bold**`, `*italic*`, `` `code` ``, `[txt](url)`.
 * Other characters are passed through with HTML escaped (Markdown does
 * not allow raw HTML in our inputs).
 */
function renderInline(src: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = '';
  let key = 0;

  const flush = () => {
    if (buf.length > 0) {
      out.push(buf);
      buf = '';
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // Inline code: `…`
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out.push(<code key={key++}>{src.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }

    // Bold: **…**
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end !== -1) {
        flush();
        out.push(<strong key={key++}>{renderInline(src.slice(i + 2, end))}</strong>);
        i = end + 2;
        continue;
      }
    }

    // Italic: *…*
    if (ch === '*') {
      const end = src.indexOf('*', i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        out.push(<em key={key++}>{renderInline(src.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (ch === '[') {
      const close = src.indexOf(']', i + 1);
      if (close !== -1 && src[close + 1] === '(') {
        const urlEnd = src.indexOf(')', close + 2);
        if (urlEnd !== -1) {
          flush();
          const text = src.slice(i + 1, close);
          const url = src.slice(close + 2, urlEnd);
          out.push(
            <a
              key={key++}
              href={url}
              target={url.startsWith('http') ? '_blank' : undefined}
              rel={url.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {text}
            </a>,
          );
          i = urlEnd + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out.length === 1 ? out[0] : out;
}
