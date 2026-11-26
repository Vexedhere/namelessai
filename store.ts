// In-memory key/value store for the AI's personal data (tasks, notes, contacts, alarms, expenses,
// bookmarks, habits). It is deliberately NOT localStorage:
//   • signed in  → mirrored to the user's own Supabase account (user_settings.data), so it follows them
//                  to any device and nothing is left behind on the machine they used;
//   • not signed in → lives only in memory and disappears on refresh/close (nothing is saved).

type Pusher = (data: Record<string, unknown>) => Promise<void>;
type Status = 'syncing' | 'synced' | 'error';

const mem = new Map<string, unknown>();
const hydrateListeners = new Set<() => void>();
let pusher: Pusher | null = null;
let statusCb: ((s: Status) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function storeGet<T>(key: string, fallback: T): T {
  return mem.has(key) ? clone(mem.get(key) as T) : fallback;
}

export function storeSet(key: string, value: unknown) {
  mem.set(key, clone(value));
  if (!pusher) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const send = pusher;
    if (!send) return;
    statusCb?.('syncing');
    try {
      await send(Object.fromEntries(mem));
      statusCb?.('synced');
    } catch {
      statusCb?.('error');
    }
  }, 800);
}

/** Replace everything with the account's data (called after sign-in). */
export function hydrateStore(data: Record<string, unknown>) {
  mem.clear();
  for (const [k, v] of Object.entries(data ?? {})) mem.set(k, v);
  hydrateListeners.forEach((l) => l());
}

/** Forget everything (sign-out / switching user / guest). */
export function resetStore() {
  if (timer) clearTimeout(timer);
  timer = null;
  pusher = null;
  mem.clear();
  hydrateListeners.forEach((l) => l());
}

export function setStorePusher(fn: Pusher | null, onStatus?: (s: Status) => void) {
  pusher = fn;
  statusCb = onStatus ?? null;
}

export function onStoreHydrate(fn: () => void) {
  hydrateListeners.add(fn);
  return () => hydrateListeners.delete(fn);
}
