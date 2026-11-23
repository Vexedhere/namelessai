import { NextRequest } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TEXT = 120_000;
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function extract(file: File) {
  if (file.size > MAX_FILE) throw new Error(`${file.name}: exceeds 10 MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) { if (file.size > 2_500_000) throw new Error(`${file.name}: images must be 2.5 MB or smaller for chat vision.`); return { kind: 'image', name: file.name, dataUrl: `data:${mime || 'image/png'};base64,${buffer.toString('base64')}`, text: '' }; }
  if (ext === 'pdf' || mime === 'application/pdf') {
    const result = await pdfParse(buffer);
    return { kind: 'text', name: file.name, text: result.text.slice(0, MAX_TEXT), pages: result.numpages };
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer });
    return { kind: 'text', name: file.name, text: result.value.slice(0, MAX_TEXT) };
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const book = XLSX.read(buffer, { type: 'buffer' });
    const text = book.SheetNames.map((name) => `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`).join('\n\n');
    return { kind: 'text', name: file.name, text: text.slice(0, MAX_TEXT) };
  }
  if (ext === 'doc' || ext === 'ppt' || ext === 'pptx') throw new Error(`${file.name}: legacy DOC or PowerPoint extraction is not supported yet. Save as DOCX or PDF and upload again.`);
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|xml|html|css|js|ts|tsx|jsx|py|sql|log|yaml|yml|toml|sh|java|c|cpp|h|go|rs|php|rb)$/i.test(file.name)) {
    return { kind: 'text', name: file.name, text: buffer.toString('utf8').slice(0, MAX_TEXT) };
  }
  throw new Error(`${file.name}: unsupported file format.`);
}
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((v): v is File => v instanceof File);
    if (!files.length) return response({ error: 'Choose at least one file.' }, 400);
    if (files.length > 8) return response({ error: 'Upload up to 8 files at a time.' }, 400);
    const results = await Promise.all(files.map(async (f) => {
      try { return await extract(f); } catch (e) { return { kind: 'error', name: f.name, text: e instanceof Error ? e.message : 'Could not read file.' }; }
    }));
    return response({ files: results });
  } catch (e) { return response({ error: e instanceof Error ? e.message : 'File processing failed.' }, 500); }
}
