// Client for the optional desktop companion (public/nameless_agent.py).
// A web page cannot change your computer's volume, open apps or lock the screen. The companion is a tiny
// program YOU run on your own machine; it listens on 127.0.0.1 only, needs a secret token, and only
// performs a fixed list of actions. Nothing here talks to any server of ours.
//
// The pairing (address + token) is a device secret, so it is the one thing kept in this browser's
// localStorage and never synced to the account.

const KEY = 'nameless-labs-ai:companion';
export const DEFAULT_COMPANION_URL = 'http://127.0.0.1:8765';

export type CompanionConfig = { url: string; token: string };
export type CompanionInfo = {
  ok: true;
  os: string;
  host: string;
  version: string;
  actions: string[];
  allowPower: boolean;
  allowInput: boolean;
};

/** Actions that change state in ways the user should explicitly approve every time. */
export const CONFIRM_ACTIONS = new Set(['shutdown', 'restart', 'sleep', 'type_text', 'press_key']);

export function loadCompanion(): CompanionConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<CompanionConfig>;
    if (typeof c.token === 'string' && c.token && typeof c.url === 'string') return { url: c.url, token: c.token };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveCompanion(c: CompanionConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('nameless-companion'));
}

/** Only ever talk to this machine. */
export function safeCompanionUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim() || DEFAULT_COMPANION_URL);
    if (u.protocol !== 'http:') return null;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function request<T>(cfg: CompanionConfig, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const base = safeCompanionUrl(cfg.url);
  if (!base) throw new Error('The companion address must be http://127.0.0.1:<port>.');
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error(
      'Could not reach the companion. Is nameless_agent.py running on this computer? (Safari blocks this; use Chrome, Edge or Firefox. Chrome may also ask to allow “local network access” for this site.)',
    );
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `The companion refused the request (${res.status}).`);
  if ((data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data;
}

export const companionInfo = (cfg: CompanionConfig) => request<CompanionInfo>(cfg, '/status');

export async function companionDo(cfg: CompanionConfig, action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const r = await request<{ ok: true; result: string }>(cfg, '/do', { action, params }, signal);
  return r.result;
}
