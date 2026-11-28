'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmRinger, AlarmsButton } from '@/components/AlarmRinger';
import { AuthModal } from '@/components/AuthModal';
import { Composer } from '@/components/Composer';
import { CommandDashboard } from '@/components/CommandDashboard';
import { AgentLaunchpad } from '@/components/AgentLaunchpad';
import { ToolsHub } from '@/components/ToolsHub';
import { EmailConfirm, type PendingEmail } from '@/components/EmailConfirm';
import { ActionConfirm, type PendingConfirm } from '@/components/ActionConfirm';
import { DevicesPanel } from '@/components/DevicesPanel';
import { DownloadIcon, LaptopIcon, MenuIcon, PlusIcon, WrenchIcon } from '@/components/Icons';
import { MessageView } from '@/components/MessageView';
import { ModelOrb, ModelPicker } from '@/components/ModelPicker';
import { Sidebar } from '@/components/Sidebar';
import { ThemeButton } from '@/components/ThemeButton';
import { PersonaButton } from '@/components/PersonaButton';
import { PERSONAS, PERSONA_IDS } from '@/lib/personas';
import { setAppCommandHandler, setConfirmHandler, type AppCommand, type ConfirmRequest } from '@/lib/appBus';
import { wakeWordsFor } from '@/lib/wake';
import { NameAiModal } from '@/components/NameAiModal';
import { cleanAiName, fetchAccount, pushData, pushSettings } from '@/lib/account';
import { hydrateStore, resetStore, setStorePusher } from '@/lib/store';
import { DEFAULT_THEME, applyTheme, getCurrentTheme } from '@/lib/theme';
import { VoiceBar } from '@/components/VoiceBar';
import { VoiceHUD } from '@/components/VoiceHUD';
import { greetingFor, namedLine, parseSpokenName } from '@/lib/hud';
import { APP_CODENAME, APP_VERSION_LABEL } from '@/lib/version';
import { DEFAULT_MODEL_ID, MODELS, getModel } from '@/lib/models';
import { deleteCloudChat, fetchCloudChats, pushCloudChats } from '@/lib/cloud';
import { getSupabase } from '@/lib/supabase';
import { streamChat, toApiMessages } from '@/lib/agentStream';
import { mailtoUrl, runTool, sendEmailViaServer, type EmailDraft, type EmailOutcome, type ToolContext } from '@/lib/clientTools';
import type { Chat, Message, ToolCall } from '@/lib/types';
import { useAuth } from '@/lib/useAuth';
import { useVoiceMode } from '@/lib/useVoiceMode';
import { defaultVoiceLang, findVoiceLang, parseYesNo } from '@/lib/voice';

const AI_NAME_KEY = 'nameless-labs-ai:ai-name'; // sessionStorage only (guests): gone when the tab closes
const MAX_CHATS = 50;
const MAX_STEPS = 10; // Godmode gets a larger, bounded tool-execution budget

const SUGGESTIONS = [
  'Build a responsive pricing section in Next.js + Tailwind',
  'Explain React Server Components like I am new to React',
  'Write a Supabase row-level-security policy for a notes app',
  'Review my API design and suggest improvements',
];
const ACTION_SUGGESTIONS = [
  'Who are the founders and leaders of Nameless Labs?',
  'Wake me up at 6:30 tomorrow and start a 10 minute timer',
  'Draft an email to my team moving Friday’s standup to 11am',
  'Convert 2,500 USD to INR and 5 km to miles',
  'Add “send invoice” to my tasks, then show my to-do list',
  'What time is it in Tokyo and New York right now?',
  'Switch the theme to Ember',
  'Generate a strong 20-character password and copy it',
  'How much battery do I have, and am I online?',
  'Turn the volume down to 30 and open Spotify',
  'Take a screenshot and save it',
  'Show me walking directions to the nearest coffee shop',
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState({
    density: 'comfortable' as 'comfortable' | 'compact',
    textSize: 'normal' as 'small' | 'normal' | 'large',
    contentWidth: 'wide' as 'standard' | 'wide' | 'full',
    codeWrap: false,
    animations: true,
    enterToSend: true,
    showTips: true,
    developerMode: true,
  });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [sync, setSync] = useState<'off' | 'syncing' | 'synced' | 'error'>('off');
  const [tier, setTier] = useState<'FREE' | 'BASE' | 'PLUS' | 'PRO'>('FREE');
  const [modelPool, setModelPool] = useState<{ remaining: number; limit: number; used: number; reset_at?: string | null } | null>(null);
  const syncedRef = useRef<Map<string, number>>(new Map());
  const { user, profile, ready: authReady } = useAuth();
  const userId = user?.id ?? null;
  const [accessBlocked, setAccessBlocked] = useState<string | null>(null);

  // ---- agent actions + voice -------------------------------------------
  const [persona, setPersona] = useState('default');
  const personaRef = useRef('default');
  personaRef.current = persona;
  const changePersona = (id: string) => setPersona(id); // saved to the account by the settings effect below
  const [agent, setAgent] = useState(false);
  const [godmode, setGodmode] = useState(false);
  const godmodeRef = useRef(false);
  godmodeRef.current = godmode;
  const [voiceLang, setVoiceLang] = useState('en-IN');
  const [pendingEmail, setPendingEmail] = useState<PendingEmail | null>(null);
  const agentRef = useRef(true);
  agentRef.current = agent;
  const pendingRef = useRef<PendingEmail | null>(null);
  pendingRef.current = pendingEmail;
  const emailResolveRef = useRef<((o: EmailOutcome) => void) | null>(null);
  const sendingRef = useRef(false);
  const utteranceRef = useRef<(text: string) => void>(() => {});
  type VoiceApi = ReturnType<typeof useVoiceMode>;
  const voiceRef = useRef<VoiceApi>(null as unknown as VoiceApi);

  const [devicesOpen, setDevicesOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const confirmRef = useRef<{ resolve: (ok: boolean) => void } | null>(null);
  const wakeWordsRef = useRef<string[]>(['nameless']);
  const noticeRef = useRef<(msg: string) => void>(() => {});

  const voice = useVoiceMode({
    lang: voiceLang,
    onUtterance: (t) => utteranceRef.current(t),
    get wakeWords() {
      return wakeWordsRef.current;
    },
    onNotice: (m) => noticeRef.current(m),
  });
  voiceRef.current = voice;

  useEffect(() => setVoiceLang(defaultVoiceLang()), []);
  const toggleAgent = () => setAgent((a) => !a);
  const changeVoiceLang = (l: string) => setVoiceLang(l);

  /** Resolves the tool call that is waiting on the email confirmation card. */
  const finishEmail = useCallback((outcome: EmailOutcome) => {
    const resolve = emailResolveRef.current;
    emailResolveRef.current = null;
    pendingRef.current = null;
    sendingRef.current = false;
    setPendingEmail(null);
    voiceRef.current.setAwaitingConfirm(false);
    resolve?.(outcome);
  }, []);

  const confirmEmail = useCallback(
    (draft: EmailDraft, callId: string, signal: AbortSignal) =>
      new Promise<EmailOutcome>((resolve) => {
        emailResolveRef.current = resolve;
        setPendingEmail({ callId, draft, busy: false, error: null });
        signal.addEventListener('abort', () => emailResolveRef.current === resolve && finishEmail({ action: 'cancelled' }), { once: true });
        const v = voiceRef.current;
        if (v.isActive()) {
          v.setAwaitingConfirm(true);
          const preview = draft.body.length > 300 ? `${draft.body.slice(0, 300)}…` : draft.body;
          v.speaker().say(`I drafted an email to ${draft.to}. Subject: ${draft.subject}. ${preview}. Should I send it?`);
        }
      }),
    [finishEmail],
  );

  const sendPendingEmail = useCallback(async () => {
    const p = pendingRef.current;
    if (!p || sendingRef.current) return;
    sendingRef.current = true;
    setPendingEmail({ ...p, busy: true, error: null });
    try {
      const session = await getSupabase()?.auth.getSession();
      await sendEmailViaServer(p.draft, session?.data.session?.access_token);
      finishEmail({ action: 'sent', to: p.draft.to });
    } catch (err) {
      sendingRef.current = false;
      const msg = err instanceof Error ? err.message : 'Sending failed.';
      setPendingEmail((cur) => (cur ? { ...cur, busy: false, error: msg } : cur));
      if (voiceRef.current.isActive()) voiceRef.current.speaker().say(`I couldn't send it. ${msg} You can say cancel, or tap Open in mail app.`);
    }
  }, [finishEmail]);

  const mailtoPendingEmail = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    const a = document.createElement('a');
    a.href = mailtoUrl(p.draft);
    a.click();
    finishEmail({ action: 'opened' });
  }, [finishEmail]);

  const cancelPendingEmail = useCallback(() => finishEmail({ action: 'cancelled' }), [finishEmail]);

  /** Approval gate for risky device actions (shutdown, typing…). Resolves true only on an explicit Allow / spoken “yes”. */
  const resolveConfirm = useCallback((ok: boolean) => {
    const c = confirmRef.current;
    confirmRef.current = null;
    setPendingConfirm(null);
    voiceRef.current.setAwaitingConfirm(false);
    c?.resolve(ok);
  }, []);

  useEffect(() => {
    setConfirmHandler(
      (req: ConfirmRequest, signal?: AbortSignal) =>
        new Promise<boolean>((resolve) => {
          confirmRef.current?.resolve(false); // only one question at a time
          confirmRef.current = { resolve };
          setPendingConfirm({ title: req.title, detail: req.detail, danger: req.danger });
          signal?.addEventListener('abort', () => confirmRef.current?.resolve === resolve && resolveConfirm(false), { once: true });
          const v = voiceRef.current;
          if (v.isActive()) {
            v.setAwaitingConfirm(true);
            v.speaker().say(`${req.title} ${req.detail.split('\n')[0]} Say yes or no.`);
          }
        }),
    );
    return () => setConfirmHandler(null);
  }, [resolveConfirm]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) { setTier('FREE'); return; }
    let alive = true;
    const refresh = async () => {
      const { data } = await sb.from('profiles').select('tier').eq('id', userId).maybeSingle();
      if (!alive) return;
      const value = String(data?.tier || 'FREE').toUpperCase();
      setTier(value === 'PRO' || value === 'PLUS' || value === 'BASE' ? value : 'FREE');
    };
    void refresh();
    const channel = sb.channel('tier-' + userId).on('postgres_changes', {event:'UPDATE',schema:'public',table:'profiles',filter:'id=eq.'+userId}, (event) => {
      const value = String((event.new as {tier?:string}).tier || 'FREE').toUpperCase();
      setTier(value === 'PRO' || value === 'PLUS' || value === 'BASE' ? value : 'FREE');
    }).subscribe();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; window.removeEventListener('focus', onFocus); void sb.removeChannel(channel); };
  }, [userId]);

  type Announcement = {id:string;title:string;body:string;category:string;created_at:string};
  const [updatesOpen,setUpdatesOpen] = useState(false);
  const [announcements,setAnnouncements] = useState<Announcement[]>([]);
  const [updatesUnread,setUpdatesUnread] = useState(0);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const {data,error} = await sb.from('announcements').select('id,title,body,category,created_at').eq('published',true).order('created_at',{ascending:false}).limit(30);
      if (!alive || error) return;
      const items = (data || []) as Announcement[];
      setAnnouncements(items);
      let seen = ''; try { seen = localStorage.getItem('nl_updates_seen') || ''; } catch {}
      setUpdatesUnread(items.filter(x => x.created_at > seen).length);
    };
    void load();
    const channel = sb.channel('announcements-feed').on('postgres_changes',{event:'*',schema:'public',table:'announcements'},() => void load()).subscribe();
    return () => { alive = false; void sb.removeChannel(channel); };
  }, []);
  const openUpdates = () => {
    setUpdatesOpen(true);
    try { localStorage.setItem('nl_updates_seen', announcements[0]?.created_at || new Date().toISOString()); } catch {}
    setUpdatesUnread(0);
  };

  const abortRef = useRef<AbortController | null>(null);
  const visitorSessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Register the current browser session for moderation visibility. IP capture is
  // performed directly against Supabase Edge so its trusted edge can see the client IP.
  useEffect(() => {
    setAccessBlocked(null);
    const sb = getSupabase();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!sb || !anonKey) return;
    let sessionId = '';
    try {
      sessionId = sessionStorage.getItem('nl_visitor_session') || '';
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('nl_visitor_session', sessionId);
      }
    } catch {
      sessionId = crypto.randomUUID();
    }
    visitorSessionRef.current = sessionId;
    let alive = true;
    const check = async () => {
      try {
        const { data, error } = await sb.rpc('nl_visitor_heartbeat', {
          p_session_id: sessionId,
          p_name: profile?.name || 'Guest',
          p_user_agent: navigator.userAgent,
          p_path: window.location.pathname,
          p_activity: loading ? (godmode ? 'Agent executing' : 'Generating response') : (activeId ? 'Chat workspace' : 'Browsing'),
        });
        if (!alive) return;
        if (error || data?.allowed === false) {
          setAccessBlocked(data?.reason === 'session_kicked'
            ? 'This browser session was kicked by a Nameless Labs administrator.'
            : data?.reason === 'auth_session_revoked'
              ? 'Your signed-in session was revoked by a Nameless Labs administrator.'
              : 'Your session could not pass the moderation check.');
          abortRef.current?.abort();
          return;
        }
        const response = await fetch(
          (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nzaelikbjumaidaombmp.supabase.co') + '/functions/v1/ip-guard',
          {
            method: 'POST',
            headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
          },
        );
        if (!alive) return;
        if (response.status === 403) {
          setAccessBlocked('This network address is restricted by Nameless Labs moderation.');
          abortRef.current?.abort();
        } else if (!response.ok) {
          setAccessBlocked('The moderation service is unavailable. Please try again shortly.');
          abortRef.current?.abort();
        }
      } catch {
        if (alive) {
          setAccessBlocked('Could not verify this session with the moderation service.');
          abortRef.current?.abort();
        }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [userId, profile?.name, loading, godmode, activeId]);

  useEffect(() => {
    let alive = true;
    const loadPool = async () => {
      let sessionId = '';
      try { sessionId = sessionStorage.getItem('nl_visitor_session') || ''; } catch {}
      if (!sessionId) return;
      try {
        const session = await getSupabase()?.auth.getSession();
        const token = session?.data.session?.access_token;
        const response = await fetch('/api/model-usage?session_id=' + encodeURIComponent(sessionId), {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          cache: 'no-store',
        });
        if (!alive || !response.ok) return;
        const data = await response.json();
        setModelPool({ remaining: Number(data.remaining) || 0, limit: Number(data.limit) || 5, used: Number(data.used) || 0, reset_at: data.reset_at || null });
      } catch { /* keep the last known pool status */ }
    };
    void loadPool();
    const interval = window.setInterval(loadPool, 30_000);
    window.addEventListener('focus', loadPool);
    return () => { alive = false; window.clearInterval(interval); window.removeEventListener('focus', loadPool); };
  }, [userId, tier, loading]);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const messages = active?.messages ?? [];
  const longVoiceTranscript = voice.active && messages.length > 12;

  useEffect(() => {
    if (longVoiceTranscript) setSidebarOpen(true);
  }, [longVoiceTranscript, messages.length]);

  // ---- auth + persistence ----------------------------------------------
  // Guests: NOTHING is saved. Chats, tool data and settings live in memory and vanish on refresh/close.
  // Signed in: chats, settings (AI name, theme, persona, model, voice) and the AI's tasks/notes/etc. are
  // stored in the user's own Supabase account (RLS-protected), never on the device.
  const nameRef = useRef<string | undefined>(undefined);
  nameRef.current = profile?.name;
  const [aiName, setAiName] = useState<string | null>(null);
  const [aiAvatar, setAiAvatar] = useState('sparkles');
  const aiNameRef = useRef<string | null>(null);
  aiNameRef.current = aiName;
  const [nameOpen, setNameOpen] = useState(false);
  const [guestNote, setGuestNote] = useState(true);
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  const [accountReady, setAccountReady] = useState(false);
  const ownerRef = useRef<string | null>(null);
  const lastSettingsRef = useRef('');

  useEffect(() => {
    setThemeId(getCurrentTheme());
    const on = (e: Event) => setThemeId((e as CustomEvent<string>).detail);
    window.addEventListener('nameless-theme', on);
    return () => window.removeEventListener('nameless-theme', on);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    abortRef.current?.abort();

    // A different person (or sign-out): wipe whatever the previous owner had in memory.
    if (ownerRef.current !== userId && ownerRef.current !== null) {
      setChats([]);
      setActiveId(null);
      setAiName(null);
      setAiAvatar('sparkles');
      resetStore();
      applyTheme(DEFAULT_THEME);
    }
    ownerRef.current = userId;

    syncedRef.current = new Map();
    lastSettingsRef.current = '';
    setCloudReady(false);
    setAccountReady(false);
    setStorePusher(null);

    const sb = getSupabase();
    if (!userId || !sb) {
      // guest
      setSync('off');
      let n: string | null = null;
      try {
        n = cleanAiName(sessionStorage.getItem(AI_NAME_KEY)) || null;\n        const savedPrefs = sessionStorage.getItem('nameless-labs-ai:preferences');\n        if (savedPrefs) setPreferences((cur) => ({ ...cur, ...JSON.parse(savedPrefs) }));
        setAiAvatar(sessionStorage.getItem('nameless-labs-ai:ai-avatar') || 'sparkles');
      } catch {
        /* ignore */
      }
      setAiName(n);
      setNameOpen(!n);
      setHydrated(true);
      return;
    }

    setSync('syncing');
    Promise.all([fetchAccount(sb, userId), fetchCloudChats(sb)])
      .then(([acct, remote]) => {
        if (cancelled) return;
        const st = acct.settings;
        hydrateStore(acct.data);
        if (st) {
          if (st.theme) applyTheme(st.theme);
          if (st.persona && PERSONA_IDS.has(st.persona)) setPersona(st.persona);
          if (st.model && MODELS.some((m) => m.id === st.model)) setModel(st.model);
          if (st.voiceLang) setVoiceLang(st.voiceLang);\n          if (st.preferences) setPreferences((cur) => ({ ...cur, ...st.preferences }));
        }
        if (st?.aiAvatar) setAiAvatar(st.aiAvatar);
        const name = st?.aiName || aiNameRef.current; // a name picked as a guest in this tab carries over
        setAiName(name);
        setNameOpen(!name);

        // chats: account copy wins; chats made in this tab before signing in are kept and then saved too
        remote.forEach((c) => syncedRef.current.set(c.id, c.updatedAt));
        setChats((cur) => {
          const byId = new Map(cur.map((c) => [c.id, c]));
          for (const r of remote) {
            const l = byId.get(r.id);
            if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r);
          }
          return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
        });

        setStorePusher((data) => pushData(sb, userId, data), (s) => setSync(s));
        setHydrated(true);
        setCloudReady(true);
        setAccountReady(true);
        setSync('synced');
      })
      .catch(() => {
        if (cancelled) return;
        setSync('error'); // most likely the user_settings table hasn't been created yet (run supabase/schema.sql)
        setHydrated(true);
        if (!aiNameRef.current) setNameOpen(true);
      });
    return () => {
      cancelled = true;
      setStorePusher(null);
    };
  }, [authReady, userId]);

  useEffect(() => { document.title = (aiName || 'Nameless AI') + ' · Nameless Labs'; }, [aiName]);

  // save settings to the account whenever they change
  useEffect(() => {
    const sb = getSupabase();
    if (!accountReady || !userId || !sb) return;
    const settings = { aiName, aiAvatar, theme: themeId, persona, model, voiceLang, agent, preferences };
    const json = JSON.stringify(settings);
    if (json === lastSettingsRef.current) return;
    const t = setTimeout(async () => {
      try {
        await pushSettings(sb, userId, settings);
        lastSettingsRef.current = json;
      } catch {
        setSync('error');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [accountReady, userId, aiName, aiAvatar, themeId, persona, model, voiceLang, agent, preferences]);

  const saveAiName = useCallback((raw: string, avatar = 'sparkles') => {
    const n = cleanAiName(raw);
    if (!n) return;
    setAiName(n);
    setAiAvatar(avatar);
    setNameOpen(false);
    if (!ownerRef.current) {
      try {
        sessionStorage.setItem(AI_NAME_KEY, n);
        sessionStorage.setItem('nameless-labs-ai:ai-avatar', avatar);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (userId || !hydrated) return;
    try { sessionStorage.setItem('nameless-labs-ai:preferences', JSON.stringify(preferences)); } catch { /* ignore */ }
  }, [preferences, userId, hydrated]);

  // push new/changed chats to the account (never while a reply is streaming)
  useEffect(() => {
    const sb = getSupabase();
    if (!hydrated || !cloudReady || !userId || !sb || loading) return;
    const dirty = chats.filter((c) => c.messages.length && (syncedRef.current.get(c.id) ?? -1) < c.updatedAt);
    if (!dirty.length) return;
    const t = setTimeout(async () => {
      setSync('syncing');
      try {
        await pushCloudChats(sb, userId, dirty);
        dirty.forEach((c) => syncedRef.current.set(c.id, c.updatedAt));
        setSync('synced');
      } catch {
        setSync('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [chats, hydrated, cloudReady, userId, loading]);

  // ---- scrolling --------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ---- chat helpers -----------------------------------------------------
  const patchMessage = useCallback((chatId: string, msgId: string, patch: Partial<Message>) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }
          : c,
      ),
    );
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (voiceRef.current.isActive()) voiceRef.current.speaker().cancel();
  }, []);

  const patchToolCalls = useCallback(
    (chatId: string, msgId: string, calls: ToolCall[]) => patchMessage(chatId, msgId, { toolCalls: calls }),
    [patchMessage],
  );

  /**
   * One user turn = a loop: stream the model's reply → if it asked for tools, run them (in the
   * browser or via /api/tools) → feed the results back → repeat until it answers in plain text.
   */
  const run = useCallback(
    async (chatId: string, history: Message[], modelId: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      stickRef.current = true;
      setLoading(true);

      const v = voiceRef.current;
      v.setBusy(true);
      const speaker = v.isActive() ? v.speaker() : null;
      const useTools = agentRef.current && getModel(modelId).tools;

      let convo = history;
      let cur: Message | null = null;
      let curText = '';
      let liveCalls: ToolCall[] = [];
      let first = true;
      let finished = false;

      try {
        const session = await getSupabase()?.auth.getSession();
        const token = session?.data.session?.access_token;

        const stepBudget = godmodeRef.current ? 20 : MAX_STEPS;
        for (let step = 0; step < stepBudget; step++) {
          const assistant: Message = { id: uid(), role: 'assistant', content: '', model: modelId };
          cur = assistant;
          curText = '';
          liveCalls = [];
          if (first) {
            setChats((prev) =>
              prev.map((c) => (c.id === chatId ? { ...c, model: modelId, updatedAt: Date.now(), messages: [...history, assistant] } : c)),
            );
            first = false;
          } else {
            setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, updatedAt: Date.now(), messages: [...c.messages, assistant] } : c)));
          }

          speaker?.begin();
          const res = await streamChat({
            messages: toApiMessages(convo),
            model: modelId,
            userName: nameRef.current,
            aiName: aiNameRef.current ?? undefined,
            persona: personaRef.current,
            tools: useTools,
            godmode: godmodeRef.current,
            voice: !!speaker,
            voiceLang,
            token,
            visitorSessionId: visitorSessionRef.current ?? undefined,
            signal: ctrl.signal,
            onText: (acc) => {
              curText = acc;
              patchMessage(chatId, assistant.id, { content: acc });
              speaker?.feed(acc);
            },
          });
          curText = res.text;
          speaker?.feed(res.text, true);

          if (res.error) {
            patchMessage(chatId, assistant.id, { content: res.text, error: res.error });
            if (speaker && !res.text) speaker.say('Sorry, something went wrong.');
            finished = true;
            break;
          }
          if (!res.calls.length) {
            if (!res.text.trim()) throw new Error('The model returned an empty response. Try again or pick another model.');
            patchMessage(chatId, assistant.id, { content: res.text });
            finished = true;
            break;
          }

          // ---- the model asked for tools: run them one by one ----
          liveCalls = res.calls.map((c) => ({ id: c.id, name: c.name, args: c.arguments, status: 'running' as const }));
          patchMessage(chatId, assistant.id, { content: res.text, toolCalls: liveCalls });

          for (const call of liveCalls.map((c) => c.id)) {
            const t = liveCalls.find((c) => c.id === call)!;
            const ctx: ToolContext = {
              signal: ctrl.signal,
              confirmEmail: (draft) => {
                liveCalls = liveCalls.map((c) => (c.id === t.id ? { ...c, status: 'awaiting' as const } : c));
                patchToolCalls(chatId, assistant.id, liveCalls);
                return confirmEmail(draft, t.id, ctrl.signal);
              },
            };
            const out = await runTool(t.name, t.args, ctx);
            liveCalls = liveCalls.map((c) => (c.id === t.id ? { ...c, status: out.status, result: out.result } : c));
            patchToolCalls(chatId, assistant.id, liveCalls);
            if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          }
          convo = [...convo, { ...assistant, content: res.text, toolCalls: liveCalls }];
        }
        if (!finished && cur) patchMessage(chatId, cur.id, { error: 'Stopped after too many steps in a row. Try a simpler request.' });
      } catch (err) {
        if (cur) {
          if (ctrl.signal.aborted) {
            const calls = liveCalls.map((c) =>
              c.status === 'running' || c.status === 'awaiting' ? { ...c, status: 'cancelled' as const, result: 'Cancelled.' } : c,
            );
            patchMessage(chatId, cur.id, {
              content: curText,
              ...(calls.length ? { toolCalls: calls } : {}),
              ...(!curText.trim() && !calls.length ? { error: 'Generation stopped.' } : {}),
            });
            speaker?.cancel();
          } else {
            const message = err instanceof Error ? err.message : 'Something went wrong.';
            patchMessage(chatId, cur.id, { content: curText, error: message });
            speaker?.say('Sorry, something went wrong.');
          }
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
        voiceRef.current.setBusy(false);
      }
    },
    [patchMessage, patchToolCalls, confirmEmail],
  );

  const send = useCallback(
    async (text: string, files: File[] = []) => {
      if (loading || uploading) return;
      const requestText = godmode
        ? `GODMODE — EXECUTE THIS PROJECT TASK\n\nAct as a coordinated senior team: researcher, architect, builder, analyst and QA reviewer. Turn the request into a concrete plan, then execute every step you can with the available tools. Use tools rather than merely describing actions. Verify tool results before claiming completion. If an action needs permission or an unavailable integration, clearly identify the blocker and provide the exact next step. Do not fabricate deployments, tests, files, research or outcomes. Prefer useful deliverables and concise progress updates.\n\nUSER TASK:\n${text}`
        : text;
      let context = '';
      if (files.length) {
        setUploading(true);
        try {
          const form = new FormData();
          files.slice(0, 5).forEach((file) => form.append('files', file));
          const response = await fetch('/api/files', { method: 'POST', body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'File upload failed.');
          let remaining = Math.max(0, 48_000 - text.length);
          context = (data.documents ?? []).map((doc: { name: string; type: string; text: string }) => {
            const textPart = String(doc.text ?? '').slice(0, remaining);
            remaining -= textPart.length;
            return `--- FILE: ${String(doc.name).slice(0, 180)} (${doc.type}) ---\n${textPart}`;
          }).filter(Boolean).join('\n\n');
          if (!context) throw new Error('No readable text was found in the uploaded files.');
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Could not read the uploaded files.');
          setUploading(false);
          return;
        }
        setUploading(false);
      }
      const userMsg: Message = { id: uid(), role: 'user', content: requestText, ...(context ? { context } : {}) };
      let chatId = activeId;

      if (!chatId || !chats.some((c) => c.id === chatId)) {
        chatId = uid();
        const fresh: Chat = {
          id: chatId,
          title: text.replace(/\s+/g, ' ').slice(0, 48) || 'New chat',
          model,
          messages: [],
          updatedAt: Date.now(),
        };
        setChats((prev) => [fresh, ...prev].slice(0, MAX_CHATS));
        setActiveId(chatId);
        void run(chatId, [userMsg], model);
      } else {
        void run(chatId, [...(active?.messages ?? []), userMsg], model);
      }
    },
    [active, activeId, chats, loading, uploading, model, run, godmode],
  );

  // spoken input: a yes/no while an email awaits confirmation, otherwise a normal message
  utteranceRef.current = (text: string) => {
    // the AI has no name yet: the next thing you say is its name
    if (!aiNameRef.current && voiceRef.current.isActive()) {
      const r = parseSpokenName(text);
      if (r.kind === 'name') nameFromHud(r.name);
      else if (r.kind === 'default') nameFromHud('NamelessAI');
      else voiceRef.current.speaker().say('Just say the name itself, like Nova. Or say skip to keep the default.');
      return;
    }
    if (confirmRef.current) {
      const answer = parseYesNo(text);
      if (answer === 'yes') resolveConfirm(true);
      else if (answer === 'no') resolveConfirm(false);
      else voiceRef.current.speaker().say('Sorry, should I go ahead? Say yes or no.');
      return;
    }
    if (pendingRef.current) {
      const answer = parseYesNo(text);
      if (answer === 'yes') void sendPendingEmail();
      else if (answer === 'no') cancelPendingEmail();
      else voiceRef.current.speaker().say('Sorry, should I send it? Say send, or cancel.');
      return;
    }
    if (loading) return; // run()'s cleanup restarts listening when it finishes
    send(text);
  };

  const regenerate = useCallback(() => {
    if (loading || !active) return;
    const msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
    if (!msgs.length) return;
    void run(active.id, msgs, model);
  }, [active, loading, model, run]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    stickRef.current = true;
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        newChat();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [newChat]);

  const selectChat = useCallback(
    (id: string) => {
      if (id === activeId) return;
      abortRef.current?.abort();
      const c = chats.find((x) => x.id === id);
      setActiveId(id);
      if (c) setModel(c.model);
    },
    [activeId, chats],
  );

  const deleteChat = useCallback(
    (id: string) => {
      if (id === activeId) abortRef.current?.abort();
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) setActiveId(null);
      const sb = getSupabase();
      if (userId && sb) {
        syncedRef.current.delete(id);
        deleteCloudChat(sb, id).catch(() => setSync('error'));
      }
    },
    [activeId, userId],
  );

  const signOut = useCallback(async () => {
    abortRef.current?.abort();
    await getSupabase()?.auth.signOut();
    setSidebarOpen(false); // chats/data are wiped from memory by the auth effect when the user changes
  }, []);

  const exportChat = useCallback(() => {
    if (!active) return;
    const md =
      `# ${active.title}\n\n` +
      active.messages
        .filter((m) => m.content)
        .map((m) => `## ${m.role === 'user' ? 'You' : getModel(m.model ?? '').name}\n\n${m.content}`)
        .join('\n\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'chat'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [active]);

  // ---- tools that drive this app (see lib/appBus.ts) ----------------------------------
  noticeRef.current = (msg) => {
    if (voiceRef.current.isActive()) voiceRef.current.speaker().say(msg);
  };
  wakeWordsRef.current = wakeWordsFor(aiName);
  const wakeLabel = (aiName ?? 'Nameless').split(' ')[0];
  const ownerFirst = profile?.name?.split(/\s+/)[0];

  /** Speak without the microphone hearing it: pause listening, talk, and it reopens when the voice stops. */
  const sayExclusive = (msg: string) => {
    const v = voiceRef.current;
    if (!v.isActive()) return;
    v.setBusy(true);
    v.speaker().say(msg);
    v.setBusy(false);
  };

  /** Naming from the voice screen (typed or spoken). */
  const nameFromHud = (n: string) => {
    saveAiName(n);
    sayExclusive(namedLine(n, ownerFirst));
  };

  const startVoice = () => voice.start(greetingFor(aiNameRef.current, ownerFirst));

  const toggleHandsFree = () => {
    if (voice.handsFree) voice.stop();
    else if (voice.active) voice.setMode('wake');
    else voice.startHandsFree('wake', greetingFor(aiNameRef.current, ownerFirst));
  };

  const appCommandRef = useRef<(cmd: AppCommand) => Promise<string>>(async () => '');
  appCommandRef.current = async (cmd) => {
    switch (cmd.type) {
      case 'new_chat':
        newChat();
        return 'Started a new chat.';
      case 'sidebar':
        setSidebarOpen(cmd.open);
        return cmd.open ? 'Opened the sidebar.' : 'Closed the sidebar.';
      case 'export_chat':
        if (!active) return 'There is no chat to export yet.';
        exportChat();
        return 'Exported this chat as a Markdown file.';
      case 'open_devices':
        setDevicesOpen(true);
        return 'Opened the Devices panel.';
      case 'actions':
        setAgent(cmd.on);
        return cmd.on ? 'Actions are on.' : 'Actions are off. (Tools stay unavailable until turned back on.)';
      case 'set_model': {
        const q = cmd.query.toLowerCase();
        const m = MODELS.find((x) => x.id.toLowerCase() === q) ?? MODELS.find((x) => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
        if (!m) return `No model matches "${cmd.query}". Available: ${MODELS.map((x) => x.name).join(', ')}.`;
        const required = m.id === 'aether-pro' ? 'PLUS' : m.id === 'quasar-apex' ? 'PRO' : 'FREE';
        if ((required === 'PLUS' && (tier === 'FREE' || tier === 'BASE')) || (required === 'PRO' && tier !== 'PRO')) return `${m.name} needs the ${required} plan, so I can’t switch to it.`;
        setModel(m.id);
        return `Switched to ${m.name} for the next message.${m.tools ? '' : ' (This model cannot use tools.)'}`;
      }
      case 'set_persona': {
        const q = cmd.query.toLowerCase();
        const p = PERSONAS.find((x) => x.id === q || x.name.toLowerCase() === q) ?? PERSONAS.find((x) => x.name.toLowerCase().includes(q) || x.id.includes(q));
        if (!p) return `No mode matches "${cmd.query}". Available: ${PERSONAS.map((x) => x.name).join(', ')}.`;
        setPersona(p.id);
        return `Mode set to ${p.name}.`;
      }
      case 'voice': {
        const v = cmd.cmd;
        switch (v.kind) {
          case 'stop':
            voice.stop();
            return 'Stopped listening. The user can tap the mic or headset button to start again.';
          case 'sleep':
            if (!voice.active) return 'Voice mode was not on.';
            voice.sleep();
            return `Going to standby; it will wake on “Hey ${wakeLabel}”.`;
          case 'start':
            if (voice.handsFree) return 'Always-listening is already on.';
            voice.startHandsFree(v.mode ?? 'wake');
            return v.mode === 'open' ? 'Always listening and answering everything I hear.' : `Always listening. Say “Hey ${wakeLabel}” to wake me.`;
          case 'mode':
            if (!voice.active) voice.startHandsFree(v.mode);
            else voice.setMode(v.mode);
            return v.mode === 'open' ? 'Now answering everything I hear.' : `Now waiting for “Hey ${wakeLabel}”.`;
          case 'language': {
            const code = findVoiceLang(v.code);
            if (!code) return `Unsupported language "${v.code}". Supported: English (India/US/UK), Hindi, Spanish, French, German.`;
            setVoiceLang(code);
            return `Voice language set to ${code}.`;
          }
          case 'rate':
            voice.speaker().rate = v.value;
            return `Speaking speed set to ${v.value}×.`;
          case 'volume':
            voice.speaker().volume = v.value;
            return `Speaking volume set to ${Math.round(v.value * 100)}%.`;
        }
      }
    }
  };
  useEffect(() => {
    setAppCommandHandler((c) => appCommandRef.current(c));
    return () => setAppCommandHandler(null);
  }, []);

  const current = getModel(model);
  const lastIndex = messages.length - 1;

  if (accessBlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-zinc-100">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-8 text-center shadow-2xl">
          <div className="mb-4 text-3xl">⛔</div>
          <h1 className="text-xl font-semibold">Nameless Labs access restricted</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{accessBlocked}</p>
          <button className="mt-6 rounded-xl bg-white/10 px-5 py-2 text-sm hover:bg-white/15" onClick={() => location.reload()}>Try again</button>
        </section>
      </main>
    );
  }

  return (
    <div data-density={preferences.density} data-text-size={preferences.textSize} data-content-width={preferences.contentWidth} data-code-wrap={preferences.codeWrap ? "on" : "off"} data-motion={preferences.animations ? "on" : "off"} className="nl-app-shell relative flex h-[100dvh] overflow-hidden bg-canvas text-zinc-100 transition-colors duration-500">
      <AlarmRinger />
      {/* Quiet, high-contrast workspace atmosphere */}
      <div aria-hidden className="workspace-atmosphere pointer-events-none absolute inset-0">
        <div className="workspace-glow workspace-glow-a" />
        <div className="workspace-glow workspace-glow-b" />
        <div className="workspace-grid" />
        <div className="workspace-grain" />
      </div>

      <Sidebar
        chats={chats}
        voiceTranscript={longVoiceTranscript ? messages : []}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        agentMode={godmode}
        onOpenTools={() => setToolsOpen(true)}
        onAgentMode={() => {
          const selected = getModel(model);
          if (!selected.tools) setModel(DEFAULT_MODEL_ID);
          setAgent(true);
          setGodmode(true);
        }}
        onSelect={selectChat}
        onDelete={deleteChat}
        profile={profile}
        authReady={authReady}
        sync={sync}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={signOut}
      />
      {updatesOpen && <div className="fixed inset-0 z-[90] flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={(e) => {if(e.target===e.currentTarget)setUpdatesOpen(false);}}>
        <section role="dialog" aria-modal="true" aria-label="Nameless Labs updates" className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#101310] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold tracking-[.2em] text-orange-300">NAMELESS LABS / BULLETIN</p><h2 className="mt-2 text-2xl font-semibold text-stone-100">The latest.</h2><p className="mt-1 text-xs text-stone-500">Product news, features and service notices.</p></div><button onClick={()=>setUpdatesOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-stone-400">✕</button></div>
          <div className="mt-7 space-y-3">{announcements.length ? announcements.map(item=><article key={item.id} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><div className="flex justify-between gap-3"><span className="text-[9px] font-bold tracking-[.16em] text-orange-300">{item.category}</span><time className="text-[10px] text-stone-500">{new Date(item.created_at).toLocaleDateString()}</time></div><h3 className="mt-3 text-base font-semibold text-stone-100">{item.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-400">{item.body}</p></article>) : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-stone-500">No announcements yet. Check back soon.</div>}</div>
          <p className="mt-8 border-t border-white/10 pt-4 text-[10px] tracking-widest text-stone-600">MADE WITH INTENTION · NAMELESS LABS</p>
        </section>
      </div>}
      <DevicesPanel open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      {toolsOpen && <ToolsHub onClose={() => setToolsOpen(false)} onRun={(prompt) => { setToolsOpen(false); send(prompt); }} />}
      <AuthModal open={authOpen && !user} onClose={() => setAuthOpen(false)} />
      {settingsOpen && <div className="nl-settings-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
        <section className="nl-settings-window" role="dialog" aria-modal="true" aria-labelledby="nl-settings-title">
          <header className="nl-settings-head"><div><span className="nl-settings-kicker">WORKSPACE CONTROL CENTER</span><h2 id="nl-settings-title">Make it yours.</h2><p>Fine-tune how NamelessAI looks, feels and works.</p></div><button className="nl-icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header>
          <div className="nl-settings-scroll">
            <section className="nl-settings-section"><div className="nl-settings-section-title"><span>◉</span><div><b>Identity &amp; intelligence</b><small>Your assistant and thinking style</small></div></div>
              <div className="nl-settings-row"><div><b>Assistant identity</b><small>Change its name and avatar</small></div><button className="nl-settings-action" onClick={() => { setSettingsOpen(false); setNameOpen(true); }}>Customize <span>↗</span></button></div>
              <div className="nl-settings-row"><div><b>Default model</b><small>Engine used for new chats</small></div><div className="nl-settings-control"><ModelPicker value={model} onChange={setModel} disabled={loading} tier={tier} /></div></div>
              <div className="nl-settings-row"><div><b>Personality</b><small>How your assistant responds</small></div><div className="nl-settings-control"><PersonaButton value={persona} onChange={changePersona} disabled={loading} /></div></div>
              <div className="nl-settings-row"><div><b>Voice language</b><small>Speech recognition and voice output</small></div><select className="nl-settings-select" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)}>{['en-IN','en-US','en-GB','te-IN','hi-IN','ta-IN','kn-IN','ml-IN'].map(x => <option key={x} value={x}>{({ 'en-IN':'English (India)','en-US':'English (US)','en-GB':'English (UK)','te-IN':'Telugu','hi-IN':'Hindi','ta-IN':'Tamil','kn-IN':'Kannada','ml-IN':'Malayalam' } as Record<string,string>)[x]}</option>)}</select></div>
            </section>
            <section className="nl-settings-section"><div className="nl-settings-section-title"><span>◐</span><div><b>Appearance &amp; layout</b><small>Shape your workspace</small></div></div>
              <div className="nl-settings-row"><div><b>Theme &amp; mood</b><small>Switch instantly, no reload</small></div><ThemeButton /></div>
              <div className="nl-settings-row"><div><b>Interface density</b><small>Choose your working rhythm</small></div><div className="nl-segment">{(['comfortable','compact'] as const).map(x=><button key={x} onClick={()=>setPreferences(v=>({...v,density:x}))} className={preferences.density===x?'selected':''}>{x==='comfortable'?'Comfort':'Compact'}</button>)}</div></div>
              <div className="nl-settings-row"><div><b>Text size</b><small>Adjust reading comfort</small></div><div className="nl-segment">{(['small','normal','large'] as const).map(x=><button key={x} onClick={()=>setPreferences(v=>({...v,textSize:x}))} className={preferences.textSize===x?'selected':''}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div></div>
              <div className="nl-settings-row"><div><b>Chat width</b><small>More room for code and long answers</small></div><div className="nl-segment">{(['standard','wide','full'] as const).map(x=><button key={x} onClick={()=>setPreferences(v=>({...v,contentWidth:x}))} className={preferences.contentWidth===x?'selected':''}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div></div>
              <div className="nl-settings-row"><div><b>Motion effects</b><small>Subtle transitions and ambient movement</small></div><button className={preferences.animations?'nl-toggle on':'nl-toggle'} role="switch" aria-checked={preferences.animations} onClick={()=>setPreferences(v=>({...v,animations:!v.animations}))}><i /></button></div>
            </section>
            <section className="nl-settings-section"><div className="nl-settings-section-title"><span>⌘</span><div><b>Developer experience</b><small>Controls for building and debugging</small></div></div>
              <div className="nl-settings-row"><div><b>Developer workspace</b><small>Prioritize code tools and build actions</small></div><button className={preferences.developerMode?'nl-toggle on':'nl-toggle'} role="switch" aria-checked={preferences.developerMode} onClick={()=>setPreferences(v=>({...v,developerMode:!v.developerMode}))}><i /></button></div>
              <div className="nl-settings-row"><div><b>Wrap long code lines</b><small>Keep code inside the message width</small></div><button className={preferences.codeWrap?'nl-toggle on':'nl-toggle'} role="switch" aria-checked={preferences.codeWrap} onClick={()=>setPreferences(v=>({...v,codeWrap:!v.codeWrap}))}><i /></button></div>
              <div className="nl-settings-row"><div><b>Send with Enter</b><small>Use Shift + Enter for a new line</small></div><button className={preferences.enterToSend?'nl-toggle on':'nl-toggle'} role="switch" aria-checked={preferences.enterToSend} onClick={()=>setPreferences(v=>({...v,enterToSend:!v.enterToSend}))}><i /></button></div>
              <div className="nl-settings-row"><div><b>Show helpful tips</b><small>Display shortcuts and workflow hints</small></div><button className={preferences.showTips?'nl-toggle on':'nl-toggle'} role="switch" aria-checked={preferences.showTips} onClick={()=>setPreferences(v=>({...v,showTips:!v.showTips}))}><i /></button></div>
            </section>
          </div>
          <footer className="nl-settings-foot"><span>{user ? '✓ Preferences sync to your account' : 'Preferences saved for this tab'}</span><button onClick={() => setSettingsOpen(false)}>Done <span>↗</span></button></footer>
        </section>
      </div>}
      <NameAiModal
        open={nameOpen && authReady && !authOpen && !voice.active}
        initial={aiName}
        initialAvatar={aiAvatar}
        signedIn={!!user}
        onSave={saveAiName}
        onClose={aiName ? () => setNameOpen(false) : undefined}
      />

      <section className="workspace-main relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="nl-commandbar">
          <div className="nl-commandbar-left">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" className="nl-icon-btn md:hidden"><MenuIcon /></button>
            <button onClick={newChat} className="nl-brand" aria-label="New NamelessAI chat"><span className="nl-brand-mark">N</span><span className="hidden sm:block">NAMELESS<span>LABS</span></span></button>
            <span className="nl-bar-divider hidden sm:block" />
            <button type="button" onClick={() => setNameOpen(true)} className="nl-assistant-chip" title="Customize your assistant">
              <span className="nl-assistant-glyph">{({sparkles:'✦',bot:'◈',brain:'✺',rocket:'↗',cat:'◡',orbit:'◎',sun:'☼',moon:'☾',leaf:'❋',zap:'ϟ',flame:'♨',heart:'♡'} as Record<string,string>)[aiAvatar] || '✦'}</span>
              <span className="nl-assistant-copy"><b>{aiName || 'Nameless AI'}</b><small>PERSONAL WORKSPACE</small></span><span className="nl-chip-edit">⌄</span>
            </button>
          </div>
          <nav className="nl-mode-dock" aria-label="Workspace mode">
            <button type="button" onClick={() => { setGodmode(false); setAgent(false); setControlsOpen(false); }} aria-pressed={!godmode} className={!godmode ? 'nl-mode-btn active' : 'nl-mode-btn'}><span>✳</span> Chat</button>
            <button type="button" onClick={() => { if (!getModel(model).tools) setModel(DEFAULT_MODEL_ID); setAgent(true); setGodmode(true); setControlsOpen(false); }} aria-pressed={godmode} className={godmode ? 'nl-mode-btn active agent' : 'nl-mode-btn'}><span>⌘</span> Agent</button>
            <button type="button" onClick={() => setToolsOpen(true)} className="nl-mode-btn nl-build-btn"><span>⌘</span> Build</button>
          </nav>
          <div className="nl-commandbar-right">
            <div className={loading ? 'nl-status busy' : 'nl-status'}><i /> <span>{loading ? (godmode ? 'RUNNING' : 'THINKING') : 'READY'}</span></div>
            <button onClick={openUpdates} aria-label="Updates" title="Product updates" className="nl-icon-btn relative">◈{updatesUnread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">{updatesUnread > 9 ? '9+' : updatesUnread}</span>}</button>
            <button onClick={() => setDevicesOpen(true)} aria-label="Devices" title="Developer devices" className="nl-icon-btn hidden sm:grid"><LaptopIcon width={16} height={16} /></button>
            <button onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Workspace settings" className="nl-settings-btn"><span>⚙</span><b className="hidden sm:block">Settings</b></button>
            {messages.length > 0 && <button onClick={exportChat} aria-label="Export chat as Markdown" title="Export conversation" className="nl-icon-btn hidden sm:grid"><DownloadIcon /></button>}
            <button onClick={newChat} aria-label="New chat" title="New conversation" className="nl-new-btn"><PlusIcon /><span className="hidden sm:block">New</span></button>
          </div>
        </header>

        {godmode && (
          <div className="agent-run-strip">
            <span className="agent-run-pulse" /><b>AGENT WORKSPACE</b><span>Tools enabled</span><span>Up to 20 execution steps</span>
            <button onClick={() => { setGodmode(false); setAgent(false); }}>Return to AI</button>
          </div>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            godmode ? (
              <AgentLaunchpad onLaunch={send} onVoice={voice.supported ? startVoice : undefined} />
            ) : (
              <CommandDashboard
                chats={chats}
                userName={profile?.name || undefined}
                modelName={aiName ?? current.name}
                signedIn={!!user}
                onLaunch={send}
                onAgent={() => {
                  if (!getModel(model).tools) setModel(DEFAULT_MODEL_ID);
                  setAgent(true);
                  setGodmode(true);
                }}
                onTools={() => setToolsOpen(true)}
                onDevices={() => setDevicesOpen(true)}
                onVoice={voice.supported ? startVoice : undefined}
                onSelectChat={selectChat}
              />
            )
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-9 px-4 py-9 sm:px-6">
              {longVoiceTranscript ? <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-zinc-400">This voice conversation is lengthy. Its full transcript is available in the sidebar.</p> : messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  message={m}
                  assistantName={aiName}
                  streaming={loading && i === lastIndex && m.role === 'assistant'}
                  canRegenerate={!loading && i === lastIndex && m.role === 'assistant'}
                  onRegenerate={regenerate}
                  continuation={i > 0 && messages[i - 1].role === 'assistant'}
                />
              ))}
            </div>
          )}
        </div>

        {pendingEmail && (
          <EmailConfirm
            pending={pendingEmail}
            signedIn={!!user}
            voice={voice.active}
            onChange={(draft) => setPendingEmail((p) => (p ? { ...p, draft } : p))}
            onSend={sendPendingEmail}
            onMailto={mailtoPendingEmail}
            onCancel={cancelPendingEmail}
          />
        )}
        {pendingConfirm && <ActionConfirm pending={pendingConfirm} voice={voice.active} onAllow={() => resolveConfirm(true)} onDeny={() => resolveConfirm(false)} />}
        <VoiceHUD
          open={voice.active}
          state={voice.state}
          mode={voice.mode}
          interim={voice.interim}
          aiName={aiName}
          userName={profile?.name}
          lang={voiceLang}
          modelName={current.name}
          actionsOn={agent && current.tools}
          loading={loading}
          userText={[...messages].reverse().find((m) => m.role === 'user')?.content ?? ''}
          replyText={[...messages].reverse().find((m) => m.role === 'assistant')?.content ?? ''}
          turns={messages.filter((m) => m.role === 'user').length}
          hint={pendingEmail ? 'Say “send” to send it, or “cancel”' : pendingConfirm ? 'Say “yes” to allow it, or “no”' : undefined}
          canSpeak={voice.canSpeak}
          onSaveName={nameFromHud}
          onMode={(m) => voice.setMode(m)}
          onLang={changeVoiceLang}
          onStop={() => voice.stop()}
          onInterrupt={voice.interrupt}
          onSend={(t) => utteranceRef.current(t)}
          getSpeaker={voice.speaker}
        />
        <VoiceBar
          mode={voice.mode}
          wakeName={wakeLabel}
          onMode={(m) => voice.setMode(m)}
          state={voice.state}
          interim={voice.interim}
          error={voice.error}
          lang={voiceLang}
          onLang={changeVoiceLang}
          onStop={() => voice.stop()}
          onInterrupt={voice.interrupt}
          hint={pendingEmail ? 'Say “send” to send it, or “cancel”' : pendingConfirm ? 'Say “yes” to allow it, or “no”' : undefined}
        />
        {authReady && !user && guestNote && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div role="status" className="flex items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3.5 py-2 text-xs text-amber-100">
              <span className="flex-1 leading-snug">
                <b>You’re not signed in, so your chats aren’t saved.</b> They’ll disappear when you refresh or close this page.
              </span>
              <button onClick={() => setAuthOpen(true)} className="shrink-0 rounded-lg bg-amber-300/90 px-2.5 py-1 font-semibold text-black transition hover:bg-amber-200">
                Sign in to save
              </button>
              <button onClick={() => setGuestNote(false)} aria-label="Dismiss" className="shrink-0 text-amber-200/70 transition hover:text-white">✕</button>
            </div>
          </div>
        )}
        <Composer
          loading={loading || uploading}
          placeholder={godmode ? 'Describe the outcome. Agent will plan and execute…' : `Message ${aiName ?? current.name}…`}
          onSend={send}
          onStop={stop}
          onVoice={voice.supported ? () => (voice.active ? voice.stop() : startVoice()) : undefined}
          voiceActive={voice.active}
          onHandsFree={voice.supported ? toggleHandsFree : undefined}
          handsFree={voice.handsFree}
          model={model}
          onModelChange={setModel}
          tier={tier}
          poolRemaining={modelPool?.remaining}
          poolLimit={modelPool?.limit}
          enterToSend={preferences.enterToSend}
        />
      </section>
    </div>
  );
}
