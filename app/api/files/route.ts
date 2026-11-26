import { NextRequest } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_ENTRY_CHARS = 30_000;
const SKIP_ZIP_PATH = /(^|\/)(node_modules|\.git|dist|build|vendor|\.next)(\/|$)/i;
const TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','html','css','js','jsx','ts','tsx','py','java','c','cpp','go','rs','sql','yaml','yml','toml','log','sh','env','ini','conf','graphql','gql','vue','svelte']);
const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','webp','bmp','tif','tiff']);
const ALLOWED = new Set([...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, 'pdf','docx','xlsx','xls','pptx','zip']);

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: 'Could not read uploaded files.' }, { status: 400 }); }
  const files = form.getAll('files').filter((v): v is File => v instanceof File);
  if (!files.length) return Response.json({ error: 'Choose at least one file.' }, { status: 400 });
  if (files.length > 5) return Response.json({ error: 'Upload up to 5 files at a time.' }, { status: 400 });

  const documents: { name: string; type: string; text: string; size: number }[] = [];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 4 * 1024 * 1024) return Response.json({ error: 'The combined upload limit is 4 MB per message on this deployment. Try fewer or smaller files.' }, { status: 413 });
  for (const file of files) {
    const ext = extension(file.name);
    if (!ALLOWED.has(ext)) return Response.json({ error: `Unsupported file type: ${file.name}` }, { status: 415 });
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: `${file.name} exceeds the 4 MB per-file limit.` }, { status: 413 });
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      let text = '';
      if (IMAGE_EXTENSIONS.has(ext)) {
        const worker = await createWorker('eng');
        try {
          const result = await worker.recognize(bytes);
          text = result.data.text;
        } finally {
          await worker.terminate();
        }
      } else if (ext === 'pdf') {
        const parsed = await pdfParse(bytes);
        text = parsed.text;
      } else if (ext === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer: bytes });
        text = parsed.value;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true });
        text = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return `## Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
        }).join('\n\n');
      } else if (ext === 'pptx') {
        const archive = await JSZip.loadAsync(bytes);
        const slidePaths = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));
        const slides: string[] = [];
        for (const path of slidePaths.slice(0, 100)) {
          const xml = await archive.files[path].async('string');
          const words = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
          slides.push(`## ${path.split('/').pop()?.replace('.xml', '')}\n${words.join(' ')}`);
        }
        text = slides.join('\n\n');
      } else if (ext === 'zip') {
        const archive = await JSZip.loadAsync(bytes);
        const entries = Object.values(archive.files).filter((entry) => !entry.dir && !SKIP_ZIP_PATH.test(entry.name) && TEXT_EXTENSIONS.has(extension(entry.name))).slice(0, MAX_ZIP_ENTRIES);
        const parts: string[] = [];
        let total = 0;
        for (const entry of entries) {
          const child = await entry.async('string');
          const content = child.slice(0, Math.min(MAX_ZIP_ENTRY_CHARS, MAX_TEXT_CHARS - total));
          if (!content.trim()) continue;
          parts.push(`--- ${entry.name.slice(0, 240)} ---\n${content}`);
          total += content.length;
          if (total >= MAX_TEXT_CHARS) break;
        }
        text = parts.join('\n\n');
      } else {
        text = bytes.toString('utf8');
      }
      text = text.replace(/\u0000/g, '').trim();
      if (!text) return Response.json({ error: ext === 'pdf' ? `${file.name} has no selectable text. Scanned-PDF OCR is not supported yet; upload page images or an OCR-processed PDF.` : IMAGE_EXTENSIONS.has(ext) ? `No readable text was detected in ${file.name}. Try a clearer image.` : `${file.name} contains no readable text.` }, { status: 422 });
      documents.push({ name: file.name.slice(0, 180), type: ext, text: text.slice(0, MAX_TEXT_CHARS), size: file.size });
    } catch (error) {
      console.error('File extraction failed:', file.name, error);
      return Response.json({ error: `Could not extract text from ${file.name}. Check that the file is valid and not password-protected.` }, { status: 422 });
    }
  }
  return Response.json({ documents, summary: { files: documents.length, extractedCharacters: documents.reduce((n, file) => n + file.text.length, 0) } });
}
