import { NextRequest } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 80_000;
const ALLOWED = new Set(['pdf','docx','txt','md','csv','json','xml','html','css','js','jsx','ts','tsx','py','java','c','cpp','go','rs','sql','yaml','yml','toml','log']);

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
  for (const file of files) {
    const ext = extension(file.name);
    if (!ALLOWED.has(ext)) return Response.json({ error: `Unsupported file type: ${file.name}` }, { status: 415 });
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: `${file.name} exceeds the 8 MB limit.` }, { status: 413 });
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      let text = '';
      if (ext === 'pdf') {
        const parsed = await pdfParse(bytes);
        text = parsed.text;
      } else if (ext === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer: bytes });
        text = parsed.value;
      } else {
        text = bytes.toString('utf8');
      }
      text = text.replace(/\u0000/g, '').trim();
      if (!text) return Response.json({ error: `${file.name} contains no readable text.` }, { status: 422 });
      documents.push({ name: file.name.slice(0, 180), type: ext, text: text.slice(0, MAX_TEXT_CHARS), size: file.size });
    } catch (error) {
      console.error('File extraction failed:', file.name, error);
      return Response.json({ error: `Could not extract text from ${file.name}. Check that the file is valid and not password-protected.` }, { status: 422 });
    }
  }
  return Response.json({ documents });
}
