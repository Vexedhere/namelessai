// Dependency-free PDF writer (A4, built-in Helvetica / Courier fonts). Takes a small Markdown subset:
//   # / ## / ### headings, - or * bullets, 1. numbered lists, > quotes, ``` code ```, --- rules, **bold** / `code` markers stripped.
// Limitation: built-in PDF fonts only cover Latin text (WinAnsi). Other scripts become "?" and are reported back.

const W = 595.28;
const H = 841.89;
const M = 56;

// Helvetica glyph widths (1/1000 em) for ASCII 32..126
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

type Font = 'F1' | 'F2' | 'F3';

// Unicode → WinAnsi byte for characters outside Latin-1 that WinAnsi has
const WIN: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, '‹': 0x8b, 'Œ': 0x8c, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9b, 'œ': 0x9c, 'Š': 0x8a, 'š': 0x9a, 'Ž': 0x8e, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function toBytes(text: string, stats: { replaced: number }): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (ch === '\t') out.push(32, 32, 32, 32);
    else if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 160 && c <= 255) out.push(c);
    else if (WIN[ch]) out.push(WIN[ch]);
    else if (c === 0xa0 || c === 0x2009 || c === 0x202f) out.push(32);
    else if (c < 32 || (c >= 0x200b && c <= 0x200f) || c === 0xfe0f) continue; // control / zero-width / emoji selector
    else {
      out.push(63); // ?
      stats.replaced++;
    }
  }
  return out;
}

function width(bytes: number[], font: Font, size: number): number {
  if (font === 'F3') return bytes.length * 0.6 * size;
  const t = font === 'F2' ? BOLD : HELV;
  let w = 0;
  for (const b of bytes) w += b >= 32 && b <= 126 ? t[b - 32] : b === 0x95 ? 350 : b === 0x96 ? 556 : b === 0x97 ? 1000 : b === 0x91 || b === 0x92 ? 222 : b === 0x93 || b === 0x94 ? 333 : 556;
  return (w / 1000) * size;
}

const lit = (bytes: number[]) =>
  '(' + bytes.map((b) => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('') + ')';

function wrap(bytes: number[], font: Font, size: number, maxW: number): number[][] {
  const lines: number[][] = [];
  let cur: number[] = [];
  const words: number[][] = [];
  let w: number[] = [];
  for (const b of bytes) {
    if (b === 32) { if (w.length) words.push(w); w = []; } else w.push(b);
  }
  if (w.length) words.push(w);
  for (const word of words) {
    const test = cur.length ? [...cur, 32, ...word] : word;
    if (width(test, font, size) <= maxW) { cur = test; continue; }
    if (cur.length) lines.push(cur);
    cur = [];
    let rest = word;
    while (width(rest, font, size) > maxW && rest.length > 1) { // break very long words
      let n = rest.length;
      while (n > 1 && width(rest.slice(0, n), font, size) > maxW) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    cur = rest;
  }
  if (cur.length || !lines.length) lines.push(cur);
  return lines;
}

const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)');

export function makePdf(opts: { title: string; markdown: string; author?: string }): { bytes: Uint8Array; pages: number; replaced: number } {
  const stats = { replaced: 0 };
  const pages: string[][] = [[]];
  let y = H - M;
  const page = () => pages[pages.length - 1];
  const need = (h: number) => {
    if (y - h < M + 14) { pages.push([]); y = H - M; }
  };
  const text = (bytes: number[], font: Font, size: number, x: number, color = '0.12 0.12 0.14') =>
    page().push(`BT /${font} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${lit(bytes)} Tj ET`);
  const rect = (x: number, yy: number, w: number, h: number, color: string) => page().push(`${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

  const block = (raw: string, font: Font, size: number, opts2: { x?: number; lead?: number; color?: string; before?: number; after?: number; bullet?: string } = {}) => {
    const x = opts2.x ?? M;
    const lead = opts2.lead ?? size * 1.4;
    const lines = wrap(toBytes(raw, stats), font, size, W - M - x);
    y -= opts2.before ?? 0;
    lines.forEach((ln, i) => {
      need(lead);
      y -= lead;
      if (i === 0 && opts2.bullet) {
        const save = y;
        text(toBytes(opts2.bullet, stats), font, size, x - 16, opts2.color);
        y = save;
      }
      text(ln, font, size, x, opts2.color);
    });
    y -= opts2.after ?? 0;
  };

  // title block
  const title = (opts.title || 'Document').trim().slice(0, 200);
  block(title, 'F2', 24, { lead: 30, after: 4 });
  need(20);
  page().push(`0.75 0.75 0.78 RG 1 w ${M} ${(y - 4).toFixed(2)} m ${W - M} ${(y - 4).toFixed(2)} l S`);
  y -= 8;
  block(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 'F1', 9.5, { color: '0.45 0.45 0.5', after: 10 });

  const lines = opts.markdown.replace(/\r\n?/g, '\n').split('\n');
  let inCode = false;
  let first = true;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inCode = !inCode; y -= 4; continue; }
    if (inCode) {
      const bytes = toBytes(line, stats);
      for (const part of wrap(bytes.length ? bytes : [32], 'F3', 9, W - 2 * M - 12)) {
        need(13);
        rect(M, y - 13 + 3, W - 2 * M, 13, '0.95 0.95 0.96');
        y -= 12;
        text(part, 'F3', 9, M + 6, '0.15 0.15 0.2');
        y -= 1;
      }
      continue;
    }
    const t = line.trimEnd();
    if (!t.trim()) { y -= 6; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(t))) {
      const lvl = m[1].length;
      if (lvl === 1 && first && strip(m[2]).trim().toLowerCase() === title.toLowerCase()) { first = false; continue; } // don't repeat the title
      const size = lvl === 1 ? 18 : lvl === 2 ? 14.5 : 12;
      need(size * 2.2);
      block(strip(m[2]), 'F2', size, { before: lvl <= 2 ? 10 : 6, after: 3, lead: size * 1.3 });
    } else if (/^\s*([-*+•])\s+/.test(t)) {
      const indent = Math.min(3, Math.floor((t.length - t.trimStart().length) / 2));
      block(strip(t.replace(/^\s*([-*+•])\s+/, '')), 'F1', 11, { x: M + 18 + indent * 16, bullet: '•', after: 1 });
    } else if ((m = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(t))) {
      block(strip(m[2]), 'F1', 11, { x: M + 22, bullet: `${m[1]}.`, after: 1 });
    } else if (/^\s*>\s?/.test(t)) {
      const before = y;
      block(strip(t.replace(/^\s*>\s?/, '')), 'F1', 11, { x: M + 14, color: '0.35 0.35 0.4', after: 2 });
      rect(M + 3, y + 2, 2.5, Math.max(6, before - y - 2), '0.7 0.7 0.78');
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) {
      need(14);
      y -= 6;
      page().push(`0.8 0.8 0.83 RG 0.7 w ${M} ${y.toFixed(2)} m ${W - M} ${y.toFixed(2)} l S`);
      y -= 6;
    } else if (/^\s*\|.*\|\s*$/.test(t)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(t)) continue; // table separator row
      block(strip(t.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('   |   ')), 'F1', 10, { after: 1 });
    } else {
      block(strip(t.trim()), 'F1', 11, { after: 3 });
    }
    first = false;
  }

  // footers
  const total = pages.length;
  pages.forEach((p, i) => {
    const label = toBytes(`${title.length > 60 ? title.slice(0, 57) + '...' : title}   |   Page ${i + 1} of ${total}`, stats);
    const w = width(label, 'F1', 8.5);
    p.push(`BT /F1 8.5 Tf 0.55 0.55 0.6 rg ${((W - w) / 2).toFixed(2)} ${(M - 22).toFixed(2)} Td ${lit(label)} Tj ET`);
  });

  // assemble objects
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const p of pages) {
    const stream = p.join('\n');
    const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pg = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${c} 0 R >>`);
    kids.push(pg);
  }
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  const info = add(`<< /Title ${lit(toBytes(title, stats))} /Creator (Nameless Labs AI) /Producer (Nameless Labs AI) ${opts.author ? `/Author ${lit(toBytes(opts.author, stats))}` : ''} >>`);

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return { bytes, pages: total, replaced: stats.replaced };
}
