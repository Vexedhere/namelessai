// v5.1 browser-side tools: PDFs, the connected desktop folder, system info and app control.
// Called from clientTools.runTool's default branch. Returns null when the name is not one of ours.
import { makePdf } from './pdf';
import { deliverPdf, listFolder, readTextFile, safeFileName, saveFile, systemInfo, folderName, downloadBytes } from './system';
import { runAppControl } from './appControl';
import type { ToolOutcome } from './clientTools';

const ok = (result: string): ToolOutcome => ({ status: 'done', result });
const bad = (msg: string): ToolOutcome => ({ status: 'error', result: `Error: ${msg}` });
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function runDesktopTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome | null> {
  switch (name) {
    case 'generate_pdf': {
      const title = s(args.title, 200).trim();
      const content = s(args.content, 200_000);
      if (!title || !content.trim()) return bad('Both "title" and "content" are required.');
      const { bytes, pages, replaced } = makePdf({ title, markdown: content });
      const file = safeFileName(s(args.filename, 80) || title, '.pdf');
      const where = await deliverPdf(file, bytes);
      return ok(
        `PDF created: ${file}, ${pages} page${pages === 1 ? '' : 's'}. ${where}` +
          (replaced ? ` Note: ${replaced} character(s) in non-Latin scripts or emoji could not be drawn (PDF built-in fonts) and appear as "?". Tell the user.` : ''),
      );
    }
    case 'list_files':
      return ok(`Folder “${folderName()}” /${s(args.path, 300)}:\n${await listFolder(s(args.path, 300))}`);
    case 'read_file':
      return ok(await readTextFile(s(args.path, 300)));
    case 'save_file': {
      const path = s(args.path, 300).trim();
      const content = s(args.content, 1_000_000);
      if (!path || !content) return bad('Both "path" and "content" are required.');
      if (!folderName()) {
        downloadBytes(path.split('/').pop() || 'file.txt', content, 'text/plain;charset=utf-8');
        return ok('No desktop folder is connected, so the file was downloaded to the browser’s downloads folder instead.');
      }
      return ok(`Saved as ${await saveFile(path, content)} in “${folderName()}”.`);
    }
    case 'system_info':
      return ok(await systemInfo());
    case 'app_control': {
      const out = await runAppControl(s(args.action, 40), s(args.value, 80));
      return out.startsWith('Error') ? { status: 'error', result: out } : ok(out);
    }
    default:
      return null;
  }
}
