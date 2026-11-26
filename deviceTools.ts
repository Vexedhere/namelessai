// Device-control tools. Two layers, both honest about what they can do:
//   1. Browser powers (no install): battery, network, location, fullscreen, keep-screen-on, flashlight, vibration,
//      notifications, clipboard, saving files, deep links into phone/maps/WhatsApp/YouTube/Spotify, and driving this app itself.
//   2. Computer control (optional): the desktop companion (public/nameless_agent.py) that YOU run on your own machine
//      for volume, brightness, media keys, opening apps, screenshots, lock/sleep/shutdown, typing.
// Called from clientTools.runTool's default branch. Returns null when the name is not one of ours.

import { askConfirm, sendAppCommand, type AppCommand } from './appBus';
import { CONFIRM_ACTIONS, companionDo, companionInfo, loadCompanion } from './companion';
import { cleanForSpeech, defaultVoiceLang, speakOnce } from './voice';
import type { ToolOutcome } from './clientTools';

const ok = (result: string): ToolOutcome => ({ status: 'done', result });
const bad = (msg: string): ToolOutcome => ({ status: 'error', result: `Error: ${msg}` });
const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const finite = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);

export const DEVICE_TOOL_NAMES = new Set([
  'device_info', 'get_location', 'screen_control', 'flashlight', 'vibrate', 'show_notification', 'read_clipboard',
  'speak_aloud', 'save_file', 'open_app', 'app_control', 'voice_control', 'computer_control',
]);

// ── keep the screen on (also used by always-listening mode, which stops working when the screen sleeps) ─────
type WakeLockSentinelLike = { release(): Promise<void>; addEventListener(t: 'release', f: () => void): void };
let lock: WakeLockSentinelLike | null = null;
let wantAwake = false;
let wakeBound = false;

async function acquire() {
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } };
  if (!nav.wakeLock || lock) return !!lock;
  try {
    lock = await nav.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
    return true;
  } catch {
    return false; // battery saver, hidden tab, or unsupported
  }
}

export async function keepAwake(on: boolean): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  wantAwake = on;
  if (!wakeBound) {
    wakeBound = true;
    document.addEventListener('visibilitychange', () => {
      if (wantAwake && document.visibilityState === 'visible') void acquire(); // the lock is dropped whenever the tab is hidden
    });
  }
  if (on) return acquire();
  try {
    await lock?.release();
  } catch {
    /* ignore */
  }
  lock = null;
  return true;
}
export const isAwakeLocked = () => !!lock;

// ── device_info ─────────────────────────────────────────────────────────────
async function deviceInfo(kind: string): Promise<ToolOutcome> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean; chargingTime: number; dischargingTime: number }>;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; type?: string };
    deviceMemory?: number;
    userAgentData?: { platform?: string; mobile?: boolean };
  };
  const lines: string[] = [];
  const want = (k: string) => kind === 'all' || kind === k;

  if (want('battery')) {
    if (nav.getBattery) {
      try {
        const b = await nav.getBattery();
        const mins = (s: number) => (Number.isFinite(s) && s > 0 ? ` (~${Math.round(s / 60)} min ${b.charging ? 'to full' : 'left'})` : '');
        lines.push(`Battery: ${Math.round(b.level * 100)}% ${b.charging ? 'charging' : 'on battery'}${mins(b.charging ? b.chargingTime : b.dischargingTime)}`);
      } catch {
        lines.push('Battery: unavailable');
      }
    } else lines.push('Battery: this browser does not expose battery status (Chrome/Edge on Android or desktop do).');
  }
  if (want('network')) {
    const c = nav.connection;
    lines.push(`Network: ${nav.onLine ? 'online' : 'offline'}${c ? `, ${c.type ? `${c.type} ` : ''}${c.effectiveType ?? ''}${c.downlink ? `, ~${c.downlink} Mbps` : ''}${c.rtt ? `, ${c.rtt} ms latency` : ''}${c.saveData ? ', data saver on' : ''}` : ''}`);
  }
  if (want('screen')) {
    lines.push(
      `Screen: ${screen.width}×${screen.height} px (window ${innerWidth}×${innerHeight}), pixel ratio ${devicePixelRatio}, ${screen.orientation?.type ?? 'unknown orientation'}, ` +
        `${document.fullscreenElement ? 'fullscreen' : 'not fullscreen'}, ${isAwakeLocked() ? 'screen kept awake' : 'screen may sleep'}, ` +
        `${matchMedia('(prefers-color-scheme: dark)').matches ? 'system dark mode' : 'system light mode'}`,
    );
  }
  if (want('system')) {
    lines.push(
      `System: ${nav.userAgentData?.platform || nav.platform || 'unknown platform'}${nav.userAgentData?.mobile ? ' (mobile)' : ''}, ` +
        `${nav.hardwareConcurrency ?? '?'} CPU threads${nav.deviceMemory ? `, ~${nav.deviceMemory} GB memory` : ''}, language ${nav.language}, ` +
        `time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    );
  }
  if (want('permissions')) {
    const names = ['geolocation', 'notifications', 'microphone', 'camera', 'clipboard-read'];
    const out: string[] = [];
    for (const n of names) {
      try {
        const s = await navigator.permissions.query({ name: n as PermissionName });
        out.push(`${n}: ${s.state}`);
      } catch {
        out.push(`${n}: unknown`);
      }
    }
    lines.push(`Permissions: ${out.join(', ')}`);
  }
  if (want('storage')) {
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota) lines.push(`Browser storage: ${((e.usage ?? 0) / 1e6).toFixed(1)} MB used of ${(e.quota / 1e9).toFixed(1)} GB available to this site`);
    } catch {
      /* ignore */
    }
  }
  const comp = loadCompanion();
  if (kind === 'all') lines.push(`Desktop companion: ${comp ? 'paired (use computer_control "status" to check it is running)' : 'not paired'}`);
  return lines.length ? ok(lines.join('\n')) : bad('kind must be all, battery, network, screen, system, permissions or storage.');
}

// ── get_location ────────────────────────────────────────────────────────────
async function getLocation(): Promise<ToolOutcome> {
  if (!('geolocation' in navigator)) return bad('This browser has no location support.');
  const pos = await new Promise<GeolocationPosition | string>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, (e) => resolve(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'), {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 120_000,
    });
  });
  if (typeof pos === 'string') {
    return bad(
      pos === 'denied'
        ? 'The user blocked location access. Tell them to allow location for this site in the browser’s site settings, then ask again.'
        : `Could not get a location (${pos}).`,
    );
  }
  const { latitude: la, longitude: lo, accuracy } = pos.coords;
  let place = '';
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=en`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = (await r.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
      place = [j.city || j.locality, j.principalSubdivision, j.countryName].filter(Boolean).join(', ');
    }
  } catch {
    /* coordinates alone are fine */
  }
  return ok(`Location: ${place || 'place name unavailable'} (lat ${la.toFixed(4)}, lon ${lo.toFixed(4)}, accurate to ~${Math.round(accuracy)} m).`);
}

// ── screen_control ──────────────────────────────────────────────────────────
async function screenControl(action: string): Promise<ToolOutcome> {
  switch (action) {
    case 'fullscreen':
      try {
        await document.documentElement.requestFullscreen();
        return ok('Entered fullscreen.');
      } catch {
        return bad('The browser only allows fullscreen right after the user taps or clicks. Ask them to tap the page once and repeat, or press F11.');
      }
    case 'exit_fullscreen':
      if (!document.fullscreenElement) return ok('Was not in fullscreen.');
      await document.exitFullscreen();
      return ok('Left fullscreen.');
    case 'keep_awake':
      return (await keepAwake(true)) ? ok('The screen will stay on while this page is visible.') : bad('This browser could not keep the screen awake (unsupported or battery saver is on).');
    case 'allow_sleep':
      await keepAwake(false);
      return ok('The screen may sleep normally again.');
    case 'scroll_top':
    case 'scroll_bottom': {
      const el = document.querySelector<HTMLElement>('.scroll-thin');
      el?.scrollTo({ top: action === 'scroll_top' ? 0 : el.scrollHeight, behavior: 'smooth' });
      return ok(action === 'scroll_top' ? 'Scrolled to the top of the chat.' : 'Scrolled to the latest message.');
    }
    case 'print':
      setTimeout(() => window.print(), 50);
      return ok('Opened the print dialog.');
    default:
      return bad('action must be fullscreen, exit_fullscreen, keep_awake, allow_sleep, scroll_top, scroll_bottom or print.');
  }
}

// ── flashlight (camera torch; Chrome on Android) ────────────────────────────
let torchStream: MediaStream | null = null;
async function flashlight(on: boolean): Promise<ToolOutcome> {
  if (!on) {
    torchStream?.getTracks().forEach((t) => t.stop());
    torchStream = null;
    return ok('Flashlight off.');
  }
  if (!navigator.mediaDevices?.getUserMedia) return bad('No camera access in this browser.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const track = stream.getVideoTracks()[0];
    const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
    if (!caps.torch) {
      stream.getTracks().forEach((t) => t.stop());
      return bad('This device/browser has no controllable flashlight (works in Chrome on most Android phones).');
    }
    await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
    torchStream?.getTracks().forEach((t) => t.stop());
    torchStream = stream;
    return ok('Flashlight on. The camera indicator may show while it is lit.');
  } catch {
    return bad('Camera permission was denied or the flashlight is unavailable.');
  }
}

// ── notification / vibrate / clipboard / speech / files ─────────────────────
async function showNotification(title: string, body: string): Promise<ToolOutcome> {
  if (typeof Notification === 'undefined') return bad('Notifications are not supported here.');
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return bad('Notification permission was not granted. Ask the user to allow notifications for this site.');
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification(title, { body });
    else new Notification(title, { body });
    return ok(`Notification shown: ${title}`);
  } catch {
    try {
      new Notification(title, { body });
      return ok(`Notification shown: ${title}`);
    } catch {
      return bad('The browser refused to show the notification.');
    }
  }
}

function vibrate(args: Record<string, unknown>): ToolOutcome {
  if (!('vibrate' in navigator)) return bad('This device/browser cannot vibrate (Chrome on Android can).');
  const pat = Array.isArray(args.pattern) ? args.pattern.map(finite).filter((n) => Number.isFinite(n) && n >= 0 && n <= 2000).slice(0, 20) : [];
  const ok1 = navigator.vibrate(pat.length ? pat : [300]);
  return ok1 ? ok('Vibrated.') : bad('The browser blocked vibration (it needs a recent tap on the page).');
}

async function readClipboard(): Promise<ToolOutcome> {
  try {
    const t = await navigator.clipboard.readText();
    return t ? ok(`Clipboard contains (${t.length} chars):\n${t.slice(0, 4000)}${t.length > 4000 ? '\n…[truncated]' : ''}`) : ok('The clipboard is empty (or holds something that is not text).');
  } catch {
    return bad('The browser blocked reading the clipboard. The user can allow it for this site, or paste the text into the chat.');
  }
}

function saveFile(filename: string, content: string): ToolOutcome {
  const name = filename.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'nameless-file.txt';
  if (/\.(exe|bat|cmd|com|scr|msi|ps1|vbs|js|jar|app|sh|dll|lnk|apk)$/i.test(name)) return bad('For safety, executable file types cannot be saved. Use a text, Markdown, CSV, JSON or HTML file name.');
  const url = URL.createObjectURL(new Blob([content.slice(0, 500_000)], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return ok(`Saved "${name}" to the Downloads folder (${content.length} characters).`);
}

// ── open_app: deep links into apps (they only open; nothing is sent or called automatically) ───────────
function openApp(a: Record<string, unknown>): ToolOutcome {
  const q = text(a.query, 300);
  const digits = (s: string) => s.replace(/[^\d+]/g, '').slice(0, 20);
  const enc = encodeURIComponent;
  let url = '';
  let what = '';
  switch (a.target) {
    case 'phone': {
      const n = digits(text(a.number, 30));
      if (n.replace('+', '').length < 3) return bad('Need a phone number.');
      url = `tel:${n}`;
      what = `the dialer with ${n} ready (the user still has to press call)`;
      break;
    }
    case 'sms': {
      const n = digits(text(a.number, 30));
      if (!n) return bad('Need a phone number.');
      url = `sms:${n}${text(a.text, 1000) ? `?body=${enc(text(a.text, 1000))}` : ''}`;
      what = `a text message to ${n} (the user still has to press send)`;
      break;
    }
    case 'whatsapp': {
      const n = digits(text(a.number, 30)).replace('+', '');
      url = n ? `https://wa.me/${n}${text(a.text, 1000) ? `?text=${enc(text(a.text, 1000))}` : ''}` : `https://api.whatsapp.com/send?text=${enc(text(a.text, 1000))}`;
      what = 'WhatsApp with the message ready (the user still has to press send)';
      break;
    }
    case 'maps_search':
      if (!q) return bad('Need a place to search for.');
      url = `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
      what = `Maps search for "${q}"`;
      break;
    case 'maps_directions': {
      const dest = text(a.destination, 200);
      if (!dest) return bad('Need a destination.');
      const mode = ['driving', 'walking', 'bicycling', 'transit'].includes(String(a.mode)) ? String(a.mode) : 'driving';
      url = `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}${text(a.origin, 200) ? `&origin=${enc(text(a.origin, 200))}` : ''}&travelmode=${mode}`;
      what = `${mode} directions to ${dest}`;
      break;
    }
    case 'youtube':
      if (!q) return bad('Need something to search for.');
      url = `https://www.youtube.com/results?search_query=${enc(q)}`;
      what = `YouTube results for "${q}"`;
      break;
    case 'spotify':
      if (!q) return bad('Need something to search for.');
      url = `https://open.spotify.com/search/${enc(q)}`;
      what = `Spotify search for "${q}"`;
      break;
    case 'google':
      if (!q) return bad('Need something to search for.');
      url = `https://www.google.com/search?q=${enc(q)}`;
      what = `a Google search for "${q}"`;
      break;
    default:
      return bad('target must be phone, sms, whatsapp, maps_search, maps_directions, youtube, spotify or google.');
  }
  if (url.startsWith('https:')) {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    return ok(w ? `Opened ${what}.` : `Tried to open ${what}, but the pop-up was blocked. Ask the user to allow pop-ups for this site.`);
  }
  const a1 = document.createElement('a');
  a1.href = url;
  a1.click();
  return ok(`Opened ${what}.`);
}

// ── app_control / voice_control (drive this app through appBus) ─────────────
async function appControl(a: Record<string, unknown>): Promise<ToolOutcome> {
  const value = text(a.value, 80);
  const map: Record<string, AppCommand | undefined> = {
    new_chat: { type: 'new_chat' },
    open_sidebar: { type: 'sidebar', open: true },
    close_sidebar: { type: 'sidebar', open: false },
    actions_on: { type: 'actions', on: true },
    actions_off: { type: 'actions', on: false },
    export_chat: { type: 'export_chat' },
    open_devices: { type: 'open_devices' },
    set_model: value ? { type: 'set_model', query: value } : undefined,
    set_persona: value ? { type: 'set_persona', query: value } : undefined,
  };
  const action = text(a.action, 30);
  const cmd = map[action];
  if (!cmd) return bad(action === 'set_model' || action === 'set_persona' ? '"value" is required.' : 'action must be new_chat, open_sidebar, close_sidebar, set_model, set_persona, actions_on, actions_off, export_chat or open_devices.');
  return ok(await sendAppCommand(cmd));
}

async function voiceControl(a: Record<string, unknown>): Promise<ToolOutcome> {
  const action = text(a.action, 30);
  const value = text(a.value, 40);
  const n = finite(a.number);
  const send = async (cmd: Extract<AppCommand, { type: 'voice' }>['cmd']) => ok(await sendAppCommand({ type: 'voice', cmd }));
  switch (action) {
    case 'start_hands_free':
      return send({ kind: 'start', mode: value === 'open' ? 'open' : 'wake' });
    case 'stop_listening':
      return send({ kind: 'stop' });
    case 'sleep':
      return send({ kind: 'sleep' });
    case 'set_mode':
      return value === 'open' || value === 'wake' ? send({ kind: 'mode', mode: value }) : bad('value must be "wake" (wait for my name) or "open" (respond to everything).');
    case 'set_language':
      return value ? send({ kind: 'language', code: value }) : bad('value must be a language, e.g. "hi-IN", "Hindi" or "French".');
    case 'set_speed':
      return n >= 0.5 && n <= 2 ? send({ kind: 'rate', value: n }) : bad('number must be between 0.5 and 2 (1 is normal).');
    case 'set_volume':
      return n >= 0 && n <= 1 ? send({ kind: 'volume', value: n }) : bad('number must be between 0 and 1.');
    default:
      return bad('action must be start_hands_free, stop_listening, sleep, set_mode, set_language, set_speed or set_volume.');
  }
}

// ── computer_control (needs the companion) ──────────────────────────────────
const COMPUTER_ACTIONS = [
  'status', 'volume_set', 'volume_up', 'volume_down', 'mute', 'unmute', 'brightness_set', 'brightness_up', 'brightness_down',
  'media_play_pause', 'media_next', 'media_prev', 'open_app', 'open_url', 'screenshot', 'notify', 'battery',
  'lock', 'sleep', 'shutdown', 'restart', 'type_text', 'press_key',
];

function describeRisk(action: string, a: Record<string, unknown>) {
  switch (action) {
    case 'shutdown': return { title: 'Shut down this computer?', detail: 'It will power off. Unsaved work in other apps may be lost.' };
    case 'restart': return { title: 'Restart this computer?', detail: 'It will reboot. Unsaved work in other apps may be lost.' };
    case 'sleep': return { title: 'Put this computer to sleep?', detail: 'The screen will turn off and the companion will pause until it wakes.' };
    case 'type_text': return { title: 'Type text on your computer?', detail: `It will be typed into whichever window is focused:\n“${text(a.text, 200)}”` };
    default: return { title: `Press “${text(a.key, 40)}” on your computer?`, detail: 'The key press goes to whichever window is focused.' };
  }
}

async function computerControl(a: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutcome> {
  const action = text(a.action, 30);
  if (!COMPUTER_ACTIONS.includes(action)) return bad(`action must be one of: ${COMPUTER_ACTIONS.join(', ')}.`);
  const cfg = loadCompanion();
  if (!cfg) {
    return bad(
      'The desktop companion is not set up, so I cannot control the computer itself (a web page is not allowed to). Tell the user to say "open devices" or click the Devices button, download the companion, run it, and paste the pairing code. Browser-level things (flashlight, fullscreen, notifications, opening apps via links) still work without it.',
    );
  }
  const params: Record<string, unknown> = {};
  for (const k of ['value', 'app', 'url', 'text', 'key', 'title']) if (a[k] !== undefined) params[k] = a[k];

  try {
    if (action === 'status') {
      const i = await companionInfo(cfg);
      return ok(`Companion online: ${i.os} (${i.host}), v${i.version}. Allowed: ${i.actions.join(', ')}. Power actions ${i.allowPower ? 'enabled' : 'DISABLED (start the companion with --allow-power)'}; typing/keys ${i.allowInput ? 'enabled' : 'DISABLED (start with --allow-input)'}.`);
    }
    if (CONFIRM_ACTIONS.has(action)) {
      const yes = await askConfirm({ ...describeRisk(action, a), danger: true }, signal);
      if (!yes) return { status: 'cancelled', result: 'The user did not approve it, so nothing was done.' };
    }
    return ok(await companionDo(cfg, action, params, signal));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return bad(err instanceof Error ? err.message : 'The companion failed.');
  }
}

// ── dispatcher ──────────────────────────────────────────────────────────────
export async function runDeviceTool(name: string, a: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutcome | null> {
  switch (name) {
    case 'device_info':
      return deviceInfo(text(a.kind, 20) || 'all');
    case 'get_location':
      return getLocation();
    case 'screen_control':
      return screenControl(text(a.action, 30));
    case 'flashlight':
      return flashlight(a.on !== false);
    case 'vibrate':
      return vibrate(a);
    case 'show_notification': {
      const title = text(a.title, 100);
      return title ? showNotification(title, text(a.body, 300)) : bad('Missing "title".');
    }
    case 'read_clipboard':
      return readClipboard();
    case 'speak_aloud': {
      const t = text(a.text, 1000);
      if (!t) return bad('Missing "text".');
      speakOnce(cleanForSpeech(t), text(a.lang, 12) || defaultVoiceLang());
      return ok('Said it out loud.');
    }
    case 'save_file': {
      const content = typeof a.content === 'string' ? a.content : '';
      return content ? saveFile(text(a.filename, 120), content) : bad('Missing "content".');
    }
    case 'open_app':
      return openApp(a);
    case 'app_control':
      return appControl(a);
    case 'voice_control':
      return voiceControl(a);
    case 'computer_control':
      return computerControl(a, signal);
    default:
      return null;
  }
}
