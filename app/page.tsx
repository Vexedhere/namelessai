'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmRinger, AlarmsButton } from '@/components/AlarmRinger';
import { AuthModal } from '@/components/AuthModal';
import { Composer } from '@/components/Composer';
import { EmailConfirm, type PendingEmail } from '@/components/EmailConfirm';
import { DownloadIcon, MenuIcon, PlusIcon, SparkIcon, WrenchIcon } from '@/components/Icons';
import { MessageView } from '@/components/MessageView';
import { ModelOrb, ModelPicker } from '@/components/ModelPicker';
import { Sidebar } from '@/components/Sidebar';
import { ThemeButton } from '@/components/ThemeButton';
import { PersonaButton } from '@/components/PersonaButton';
import { PERSONA_IDS, PERSONA_KEY } from '@/lib/personas';
import { VoiceBar } from '@/components/VoiceBar';
import { DEFAULT_MODEL_ID, MODELS, getModel } from '@/lib/models';
import { deleteCloudChat, fetchCloudChats, pushCloudChats } from '@/lib/cloud';
import { getSupabase } from '@/lib/supabase';
import { streamChat, toApiMessages } from '@/lib/agentStream';
import { mailtoUrl, runTool, sendEmailViaServer, type EmailDraft, type EmailOutcome, type ToolContext } from '@/lib/clientTools';
import type { Chat, Message, ToolCall } from '@/lib/types';
import { useAuth } from '@/lib/useAuth';
import { useVoiceMode } from '@/lib/useVoiceMode';
import { defaultVoiceLang, parseYesNo } from '@/lib/voice';

const STORAGE_KEY = 'nameless-labs-ai:v2';
const MAX_CHATS = 50;
const MAX_STEPS = 6; // model ↔ tool round trips per user message
const AGENT_KEY = 'nameless-labs-ai:agent';
const VOICE_LANG_KEY = 'nameless-labs-ai:voice-lang';

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
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function loadChats(key: string): { chats: Chat[]; activeId: string | null; model: string } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { chats: [], activeId: null, model: DEFAULT_MODEL_ID };
    const parsed = JSON.parse(raw);
    const chats: Chat[] = (Array.isArray(parsed.chats) ? parsed.chats : [])
      .filter((c: Chat) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      // drop assistant bubbles that were interrupted before any text arrived
      .map((c: Chat) => ({
        ...c,
        messages: c.messages
          .filter((m) => m.role === 'user' || m.content || m.error || m.toolCalls?.length)
          // a tool that was still running when the page closed will never finish
          .map((m) =>
            m.toolCalls?.some((t) => t.status === 'running' || t.status === 'awaiting')
              ? {
                  ...m,
                  toolCalls: m.toolCalls.map((t) =>
                    t.status === 'running' || t.status === 'awaiting' ? { ...t, status: 'cancelled' as const, result: 'Cancelled.' } : t,
                  ),
                }
              : m,
          ),
      }));
    return {
      chats,
      activeId: chats.some((c) => c.id === parsed.activeId) ? parsed.activeId : null,
      model: MODELS.some((m) => m.id === parsed.model) ? parsed.model : DEFAULT_MODEL_ID,
    };
  } catch {
    return { chats: [], activeId: null, model: DEFAULT_MODEL_ID };
  }
}

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [sync, setSync] = useState<'off' | 'syncing' | 'synced' | 'error'>('off');
  const [tier, setTier] = useState<'FREE' | 'PLUS' | 'PRO'>('FREE');
  const syncedRef = useRef<Map<string, number>>(new Map());
  const { user, profile, ready: authReady } = useAuth();
  const userId = user?.id ?? null;

  // ---- agent actions + voice -------------------------------------------
  const [persona, setPersona] = useState('default');
  const personaRef = useRef('default');
  personaRef.current = persona;
  useEffect(() => {
    try {
      const v = localStorage.getItem(PERSONA_KEY);
      if (v && PERSONA_IDS.has(v)) setPersona(v);
    } catch {
      /* ignore */
    }
  }, []);
  const changePersona = (id: string) => {
    setPersona(id);
    try {
      localStorage.setItem(PERSONA_KEY, id);
    } catch {
      /* ignore */
    }
  };
  const [agent, setAgent] = useState(true);
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

  const voice = useVoiceMode({ lang: voiceLang, onUtterance: (t) => utteranceRef.current(t) });
  voiceRef.current = voice;

  useEffect(() => {
    try {
      if (localStorage.getItem(AGENT_KEY) === '0') setAgent(false);
      setVoiceLang(localStorage.getItem(VOICE_LANG_KEY) || defaultVoiceLang());
    } catch {
      setVoiceLang(defaultVoiceLang());
    }
  }, []);
  const toggleAgent = () =>
    setAgent((a) => {
      try {
        localStorage.setItem(AGENT_KEY, a ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !a;
    });
  const changeVoiceLang = (l: string) => {
    setVoiceLang(l);
    try {
      localStorage.setItem(VOICE_LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

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

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) { setTier('FREE'); return; }
    sb.from('profiles').select('tier').eq('id', userId).maybeSingle().then(({ data }) => {
      const value = data?.tier;
      setTier(value === 'PRO' || value === 'PLUS' ? value : 'FREE');
    });
  }, [userId]);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const messages = active?.messages ?? [];

  // ---- auth + persistence ----------------------------------------------
  // Guests and every signed-in user get their own local storage bucket; signed-in
  // users are additionally synced to Supabase (table `chats`, protected by RLS).
  const storageKey = `${STORAGE_KEY}:${userId ?? 'guest'}`;
  const nameRef = useRef<string | undefined>(undefined);
  nameRef.current = profile?.name;

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    abortRef.current?.abort();

    const local = loadChats(storageKey);
    let initial = local.chats;
    let activeInit = local.activeId;

    // First sign-in on this device: carry over chats made as a guest.
    if (userId) {
      const guest = loadChats(`${STORAGE_KEY}:guest`);
      if (guest.chats.length) {
        const ids = new Set(initial.map((c) => c.id));
        initial = [...initial, ...guest.chats.filter((c) => !ids.has(c.id))];
        try {
          localStorage.removeItem(`${STORAGE_KEY}:guest`);
        } catch {
          /* ignore */
        }
      }
    }

    syncedRef.current = new Map();
    setCloudReady(false);
    setChats(initial.slice(0, MAX_CHATS));
    setActiveId(activeInit);
    setModel(local.model);
    setHydrated(true);

    const sb = getSupabase();
    if (userId && sb) {
      setSync('syncing');
      fetchCloudChats(sb)
        .then((remote) => {
          if (cancelled) return;
          remote.forEach((c) => syncedRef.current.set(c.id, c.updatedAt));
          setChats((cur) => {
            const byId = new Map(cur.map((c) => [c.id, c]));
            for (const r of remote) {
              const l = byId.get(r.id);
              if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r);
            }
            return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
          });
          setCloudReady(true);
          setSync('synced');
        })
        .catch(() => {
          if (!cancelled) setSync('error');
        });
    } else {
      setSync('off');
    }
    return () => {
      cancelled = true;
    };
  }, [authReady, storageKey, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ chats: chats.slice(0, MAX_CHATS), activeId, model }));
      } catch {
        /* storage full / unavailable */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [chats, activeId, model, hydrated, storageKey]);

  // push new/changed chats to the cloud (never while a reply is streaming)
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

        for (let step = 0; step < MAX_STEPS; step++) {
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
            persona: personaRef.current,
            tools: useTools,
            voice: !!speaker,
            token,
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
    (text: string) => {
      if (loading) return;
      const userMsg: Message = { id: uid(), role: 'user', content: text };
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
    [active, activeId, chats, loading, model, run],
  );

  // spoken input: a yes/no while an email awaits confirmation, otherwise a normal message
  utteranceRef.current = (text: string) => {
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
    setSidebarOpen(false);
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

  const firstName = profile?.name.split(/\s+/)[0];
  const current = getModel(model);
  const lastIndex = messages.length - 1;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-canvas text-zinc-100 transition-colors duration-500">
      <AlarmRinger />
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.13] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-violet-600/[0.14] blur-[130px]" />
        <div className="absolute bottom-[-12rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/[0.07] blur-[120px]" />
        <div className="bg-grid absolute inset-0" />
      </div>

      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
        profile={profile}
        authReady={authReady}
        sync={sync}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={signOut}
      />
      <AuthModal open={authOpen && !user} onClose={() => setAuthOpen(false)} />

      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/20 px-4 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="rounded-xl p-2 text-zinc-300 transition hover:bg-white/10 md:hidden"
          >
            <MenuIcon />
          </button>
          <ModelPicker value={model} onChange={setModel} disabled={loading} tier={tier} />
          <PersonaButton value={persona} onChange={changePersona} disabled={loading} />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleAgent}
              disabled={!current.tools}
              aria-pressed={agent && current.tools}
              title={
                current.tools
                  ? agent
                    ? 'Actions on: alarms, email, tasks, web, currency, weather… (click to turn off)'
                    : 'Actions off (click to turn on)'
                  : `${current.name} can’t use tools. Pick Lyric, Vega, Aether or NamelessAI for actions.`
              }
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                agent && current.tools
                  ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15'
                  : 'border-white/10 text-zinc-400 hover:bg-white/10'
              }`}
            >
              <WrenchIcon width={14} height={14} />
              <span className="hidden sm:inline">Actions</span>
            </button>
            <AlarmsButton />
            <ThemeButton />
            <span className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
              {loading ? 'Generating…' : 'Ready'}
            </span>
            {messages.length > 0 && (
              <button
                onClick={exportChat}
                aria-label="Export chat as Markdown"
                title="Export chat as Markdown"
                className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                <DownloadIcon />
              </button>
            )}
            <button
              onClick={newChat}
              aria-label="New chat"
              className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white md:hidden"
            >
              <PlusIcon />
            </button>
          </div>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
              <div className="animate-float">
                <ModelOrb model={current} size={72} />
              </div>
              <h2 className="mt-8 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                {firstName ? `Hey ${firstName}, what are we building?` : 'What are we building today?'}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                You are chatting with <span className="font-medium text-zinc-200">{current.name}</span>. {current.tagline}
              </p>

              <div className="mt-9 grid w-full gap-2.5 sm:grid-cols-2">
                {(agent && current.tools ? [...SUGGESTIONS.slice(0, 2), ...ACTION_SUGGESTIONS.slice(0, 6)] : SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-zinc-300 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.06] hover:text-white"
                  >
                    <SparkIcon width={16} height={16} className="mt-0.5 shrink-0 text-cyan-300/70 transition group-hover:text-cyan-300" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
              {messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  message={m}
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
        <VoiceBar
          state={voice.state}
          interim={voice.interim}
          error={voice.error}
          lang={voiceLang}
          onLang={changeVoiceLang}
          onStop={() => voice.stop()}
          onInterrupt={voice.interrupt}
          hint={pendingEmail ? 'Say “send” to send it, or “cancel”' : undefined}
        />
        <Composer
          loading={loading}
          placeholder={`Message ${current.name}…`}
          onSend={send}
          onStop={stop}
          onVoice={voice.supported ? () => (voice.active ? voice.stop() : voice.start()) : undefined}
          voiceActive={voice.active}
        />
      </section>
    </div>
  );
}
