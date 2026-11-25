// "Desktop access" for a web app, done the only safe way a browser allows:
//  • the user picks ONE folder (File System Access API, Chrome/Edge/Opera); the AI can list, read and save files inside it only;
//  • the handle is kept in memory only: after a refresh the user must reconnect (nothing about it is stored on the device);
//  • system info comes from standard read-only browser APIs.
/* eslint-disable @typescript-eslint/no-explicit-any */

let dir: any = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const folderName = (): string | null => (dir ? String(dir.name) : null);
export function subscribeFolder(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Must be called from a click handler (browsers require a user gesture for the picker). */
export async function connectFolder(): Promise<string> {
  if (!folderSupported()) throw new Error('Your browser can’t give websites folder access. Use Chrome, Edge or Opera on desktop.');
  dir = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'nameless-ai', startIn: 'desktop' });
  notify();
  return String(dir.name);
}
export function disconnectFolder() {
  dir = null;
  notify();
}

const NOT_CONNECTED = 'No folder is connected. Ask the user to click the Desktop button (🖥) in the header and choose “Connect folder”; browsers only allow that from a click.';

function parts(path: string): string[] {
  const p = path.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
  if (p.some((s) => s === '..' || /[:*?"<>|\u0000-\u001f]/.test(s))) throw new Error('That path is not allowed. Use plain names inside the connected folder.');
  return p;
}
async function dirAt(segments: string[], create = false) {
  let d = dir;
  for (const s of segments) d = await d.getDirectoryHandle(s, { create });
  return d;
}

export async function listFolder(path = ''): Promise<string> {
  if (!dir) throw new Error(NOT_CONNECTED);
  const d = await dirAt(parts(path));
  const rows: string[] = [];
  for await (const [name, h] of d.entries()) {
    if (rows.length >= 200) break;
    if (h.kind === 'directory') rows.push(`📁 ${name}/`);
    else {
      const f = await h.getFile();
      rows.push(`📄 ${name}  (${f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`})`);
    }
  }
  rows.sort();
  return rows.length ? rows.join('\n') : '(empty folder)';
}

export async function readTextFile(path: string, maxChars = 20_000): Promise<string> {
  if (!dir) throw new Error(NOT_CONNECTED);
  const p = parts(path);
  const name = p.pop();
  if (!name) throw new Error('Missing file name.');
  const fh = await (await dirAt(p)).getFileHandle(name);
  const file: File = await fh.getFile();
  if (file.size > 5_000_000) throw new Error('That file is too large to read (5 MB limit).');
  if (/\.(pdf|png|jpe?g|gif|webp|zip|exe|dll|docx?|xlsx?|pptx?|mp[34]|mov|avi)$/i.test(name)) throw new Error('That looks like a binary file; only text-based files can be read.');
  const text = await file.text();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…[truncated, ${text.length} characters total]` : text;
}

/** Saves inside the connected folder. Never overwrites: if the name exists it saves as "name (1).ext". Returns the saved path. */
export async function saveFile(path: string, data: string | Uint8Array): Promise<string> {
  if (!dir) throw new Error(NOT_CONNECTED);
  const p = parts(path);
  let name = p.pop();
  if (!name) throw new Error('Missing file name.');
  const d = await dirAt(p, true);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    try {
      await d.getFileHandle(name); // exists → try next name
      name = `${stem} (${n})${ext}`;
      if (n > 99) throw new Error('Too many files with that name.');
    } catch (e) {
      if ((e as Error)?.name === 'NotFoundError') break;
      throw e;
    }
  }
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data as any);
  await w.close();
  return [...p, name].join('/');
}

export function downloadBytes(name: string, bytes: Uint8Array | string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as any], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFileName = (s: string, ext: string) =>
  `${s.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\p{L}\p{N}\- _.]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document'}${ext}`;

/** Saves a PDF into the connected folder when there is one, otherwise downloads it. */
export async function deliverPdf(name: string, bytes: Uint8Array): Promise<string> {
  if (dir) {
    const saved = await saveFile(name, bytes);
    return `Saved to the connected folder “${folderName()}” as ${saved}.`;
  }
  downloadBytes(name, bytes, 'application/pdf');
  return `Downloaded ${name} to the browser’s downloads folder (no desktop folder is connected).`;
}

export async function systemInfo(): Promise<string> {
  const n = navigator as any;
  const rows: string[] = [];
  const platform = n.userAgentData?.platform || n.platform || 'unknown';
  rows.push(`Platform: ${platform}`);
  const brands = (n.userAgentData?.brands ?? []).filter((b: any) => !/not.?a.?brand/i.test(b.brand)).map((b: any) => `${b.brand} ${b.version}`).join(', ');
  rows.push(`Browser: ${brands || n.userAgent}`);
  if (n.hardwareConcurrency) rows.push(`CPU threads: ${n.hardwareConcurrency}`);
  if (n.deviceMemory) rows.push(`Memory: about ${n.deviceMemory} GB (browsers round this)`);
  rows.push(`Screen: ${screen.width}×${screen.height} @${window.devicePixelRatio}x, window ${innerWidth}×${innerHeight}`);
  rows.push(`Language: ${n.language}; time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  rows.push(`Online: ${n.onLine ? 'yes' : 'no'}${n.connection ? ` (${n.connection.effectiveType ?? ''}${n.connection.downlink ? `, ~${n.connection.downlink} Mbps` : ''})` : ''}`);
  try {
    if (n.getBattery) {
      const b = await n.getBattery();
      rows.push(`Battery: ${Math.round(b.level * 100)}%${b.charging ? ' (charging)' : ''}`);
    }
  } catch {
    /* not available */
  }
  try {
    const est = await n.storage?.estimate?.();
    if (est?.quota) rows.push(`Browser storage quota: ${(est.quota / 1073741824).toFixed(1)} GB`);
  } catch {
    /* ignore */
  }
  rows.push(`Connected folder: ${folderName() ?? 'none'}`);
  return rows.join('\n');
}
