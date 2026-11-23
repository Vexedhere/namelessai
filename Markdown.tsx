'use client';

import { Fragment, memo, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

/**
 * Small, dependency-free, XSS-safe Markdown renderer (no dangerouslySetInnerHTML).
 * Supports: fenced code, headings, lists, blockquotes, tables, hr, bold, italic,
 * inline code and http(s)/mailto links. Tolerates half-finished streaming input.
 */

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-deep/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 py-2 text-[11px] text-zinc-400">
        <span className="font-mono uppercase tracking-wider">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono text-zinc-200">{code}</code>
      </pre>
    </div>
  );
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g;

function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      if (part.length > 4) return <strong key={i} className="font-semibold text-white">{renderInline(part.slice(2, -2))}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{renderInline(part.slice(1, -1))}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      if (href) {
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:decoration-cyan-300">
            {link[1]}
          </a>
        );
      }
      return <Fragment key={i}>{link[1]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderBlocks(src: string, keyPrefix: string): ReactNode[] {
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => `${keyPrefix}-${k++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = [
        'mt-6 mb-2 text-xl font-semibold text-white',
        'mt-5 mb-2 text-lg font-semibold text-white',
        'mt-4 mb-1.5 text-base font-semibold text-white',
        'mt-3 mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-300',
      ][level - 1];
      out.push(<div key={key()} role="heading" aria-level={level} className={cls}>{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push(<hr key={key()} className="my-5 border-white/10" />);
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key()} className="my-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-zinc-300">
              <tr>{head.map((c, ci) => <th key={ci} className="px-4 py-2.5 font-medium">{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-white/[0.07]">
                  {r.map((c, ci) => <td key={ci} className="px-4 py-2.5 align-top text-zinc-300">{renderInline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote key={key()} className="my-4 border-l-2 border-cyan-400/50 pl-4 text-zinc-400">
          {renderBlocks(buf.join('\n'), key())}
        </blockquote>,
      );
      continue;
    }

    // Lists
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m && /\d/.test(m[2]) === ordered) {
          items.push(m[3]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ' ' + lines[i].trim(); // wrapped continuation
          i++;
        } else break;
      }
      const Tag = ordered ? 'ol' : 'ul';
      out.push(
        <Tag key={key()} className={`my-3 space-y-1.5 pl-6 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-cyan-400/70`}>
          {items.map((it, ii) => <li key={ii} className="pl-1">{renderInline(it)}</li>)}
        </Tag>,
      );
      continue;
    }

    // Paragraph (until blank line or another block start)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length === 0) {
      // safety: never loop forever on an unmatched line
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key()} className="my-3 first:mt-0 last:mb-0">
        {buf.map((l, bi) => (
          <Fragment key={bi}>
            {bi > 0 && <br />}
            {renderInline(l)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}

function MarkdownImpl({ text }: { text: string }) {
  // Split on fenced code; an unterminated fence (mid-stream) is treated as an open block.
  const segments: ReactNode[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) segments.push(...renderBlocks(text.slice(last, m.index), `t${n++}`));
    segments.push(<CodeBlock key={`c${n++}`} lang={m[1].trim()} code={m[2].replace(/\n$/, '')} />);
    last = m.index + m[0].length;
    if (m[0].length === 0) fence.lastIndex++;
  }
  if (last < text.length) segments.push(...renderBlocks(text.slice(last), `t${n++}`));
  return <div className="break-words">{segments}</div>;
}

export const Markdown = memo(MarkdownImpl);
