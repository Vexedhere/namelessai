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
import { DesktopButton } from '@/components/DesktopButton';
import { JarvisHud } from '@/components/JarvisHud';
import { registerAppActions } from '@/lib/appControl';
import { makePdf } from '@/lib/pdf';
import { deliverPdf, safeFileName } from '@/lib/system';
import { TOOL_LABELS } from '@/lib/toolDefs';
import { PersonaButton } from '@/components/PersonaButton';
import { PERSONA_IDS } from '@/lib/personas';
import { NameAiModal } from '@/components/NameAiModal';
import { cleanAiName, fetchAccount, pushData, pushSettings } from '@/lib/account';
import { hydrateStore, resetStore, setStorePusher } from '@/lib/store';
import { DEFAULT_THEME, applyTheme, getCurrentTheme } from '@/lib/theme';
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

const AI_NAME_KEY = 'nameless-labs-ai:ai-name'; // sessionStorage only (guests): gone when the tab closes
const MAX_CHATS = 50;
const MAX_STEPS = 6; // model ↔ tool round trips per user message

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
  const changePersona = (id: string) => setPersona(id); // saved to the account by the settings effect below
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

  // JARVIS-style full-screen voice interface (can be minimised to the compact bar while voice keeps running)
  const [hudOpen, setHudOpen] = useState(false);
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !voice.active) setHudOpen(false);
    wasActive.current = voice.active;
  }, [voice.active]);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const pendingNewChat = useRef(false);

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
  // Guests: NOTHING is saved. Chats, tool data and settings live in memory and vanish on refresh/close.
  // Signed in: chats, settings (AI name, theme, persona, model, voice) and the AI's tasks/notes/etc. are
  // stored in the user's own Supabase account (RLS-protected), never on the device.
  const nameRef = useRef<string | undefined>(undefined);
  nameRef.current = profile?.name;
  const [aiName, setAiName] = useState<string | null>(null);
  const aiNameRef = useRef<string | null>(null);
  aiNameRef.current = aiName;
  const [nameOpen, setNameOpen] = useState(false);
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
        n = cleanAiName(sessionStorage.getItem(AI_NAME_KEY)) || null;
      } catch {
        /* ignore */
      }
      setAiName(n);
      setNameOpen(false);
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
          if (st.voiceLang) setVoiceLang(st.voiceLang);
          if (typeof st.agent === 'boolean') setAgent(st.agent);
        }
        const name = st?.aiName || aiNameRef.current; // a name picked as a guest in this tab carries over
        setAiName(name);
        setNameOpen(!name);

        // chats: account copy wins; chats made in this tab before signing in are kept and then saved too
        remote.forEach((c) => syncedRef.current.set(c.id, c.updatedAt));
        setChats((cur: Chat[]) => {
          const byId = new Map<string, Chat>(cur.map((c): [string, Chat] => [c.id, c]));
          for (const r of remote) {
            const l = byId.get(r.id);
            if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r);
          }
          return [...byId.values()].sort((a: Chat, b: Chat) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
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
      });
    return () => {
      cancelled = true;
      setStorePusher(null);
    };
  }, [authReady, userId]);

  // save settings to the account whenever they change
  useEffect(() => {
    const sb = getSupabase();
    if (!accountReady || !userId || !sb) return;
    const settings = { aiName, theme: themeId, persona, model, voiceLang, agent };
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
  }, [accountReady, userId, aiName, themeId, persona, model, voiceLang, agent]);

  const saveAiName = useCallback((raw: string) => {
    const n = cleanAiName(raw);
    if (!n) return;
    setAiName(n);
    setNameOpen(false);
    if (!ownerRef.current) {
      try {
        sessionStorage.setItem(AI_NAME_KEY, n);
      } catch {
        /* ignore */
      }
    }
  }, []);

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
            aiName: aiNameRef.current ?? undefined,
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
        if (pendingNewChat.current) {
          pendingNewChat.current = false;
          setActiveId(null);
        }
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

  const exportPdf = useCallback(async (): Promise<string> => {
    if (!active || !active.messages.some((m) => m.content)) return 'Error: there is no conversation to export yet.';
    const who = aiNameRef.current ?? 'AI';
    const md = active.messages
      .filter((m) => m.content)
      .map((m) => `## ${m.role === 'user' ? 'You' : who}\n\n${m.content}`)
      .join('\n\n');
    const { bytes, replaced } = makePdf({ title: active.title, markdown: md, author: nameRef.current });
    const where = await deliverPdf(safeFileName(active.title, '.pdf'), bytes);
    return `${where}${replaced ? ` (${replaced} non-Latin characters could not be drawn and show as “?”.)` : ''}`;
  }, [active]);

  const exportPdfClick = useCallback(() => {
    exportPdf().then(setToast, (e) => setToast(`Couldn’t create the PDF: ${e instanceof Error ? e.message : 'unknown error'}`));
  }, [exportPdf]);

  // lets the AI operate the app ("new chat", "switch to Lyric", "export this as PDF"…)
  registerAppActions({
    newChat: () => {
      if (abortRef.current) pendingNewChat.current = true; // don't kill the reply that is calling this tool
      else newChat();
    },
    sidebar: setSidebarOpen,
    setModel,
    setPersona,
    setActions: setAgent,
    renameAi: () => setNameOpen(true),
    signIn: () => setAuthOpen(true),
    exportPdf,
    clearScreen: () => {},
  });

  const lastReply = useMemo(() => {
    const m = [...messages].reverse().find((x) => x.role === 'assistant' && x.content.trim());
    return m ? m.content.replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 260) : '';
  }, [messages]);
  const runningTool = [...messages].reverse().find((m) => m.toolCalls?.some((t) => t.status === 'running' || t.status === 'awaiting'))?.toolCalls?.find((t) => t.status === 'running' || t.status === 'awaiting');
  const hudActive = hudOpen && (voice.active || !!voice.error);

  const firstName = profile?.name.split(/\s+/)[0];
  const current = getModel(model);
  const lastIndex = messages.length - 1;

  const emailCard = pendingEmail ? (
          <EmailConfirm
      pending={pendingEmail}
      signedIn={!!user}
      voice={voice.active}
      onChange={(draft) => setPendingEmail((p) => (p ? { ...p, draft } : p))}
      onSend={sendPendingEmail}
      onMailto={mailtoPendingEmail}
      onCancel={cancelPendingEmail}
    />
  ) : null;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-canvas text-zinc-100 transition-colors duration-500">
      <AlarmRinger />
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.13] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-accent/[0.14] blur-[130px]" />
        <div className="absolute bottom-[-12rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-accent/[0.07] blur-[120px]" />
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
      {hudActive && (
        <JarvisHud
          state={voice.state}
          interim={voice.interim}
          error={voice.error}
          name={aiName ?? current.name}
          caption={lastReply}
          activity={runningTool ? TOOL_LABELS[runningTool.name] ?? 'Working' : undefined}
          lang={voiceLang}
          onLang={changeVoiceLang}
          onEnd={() => voice.stop()}
          onMinimize={() => setHudOpen(false)}
          onInterrupt={voice.interrupt}
          hint={pendingEmail ? 'Say “send” to send it, or “cancel”' : undefined}
        >
          {pendingEmail && <div className="w-full">{emailCard}</div>}
        </JarvisHud>
      )}
      {toast && (
        <div role="status" className="animate-pop fixed bottom-24 left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 px-4 py-2.5 text-sm text-zinc-100 shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      )}
      <NameAiModal
        open={nameOpen && authReady && !authOpen}
        initial={aiName}
        signedIn={!!user}
        onSave={saveAiName}
        onClose={aiName ? () => setNameOpen(false) : undefined}
      />

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
            <DesktopButton />
            <ThemeButton />
            <span className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
              {loading ? 'Generating…' : 'Ready'}
            </span>
            {messages.length > 0 && (
              <button
                onClick={exportPdfClick}
                aria-label="Export chat as PDF"
                title="Export chat as PDF"
                className="rounded-xl border border-white/10 px-2 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
              >
                PDF
              </button>
            )}
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
              <div className="welcome-orbit relative">
                <div className="welcome-orbit-ring" />
                <div className="welcome-orbit-core"><ModelOrb model={current} size={54} /></div>
                <span className="welcome-orbit-spark">✦</span>
              </div>
              <div className="welcome-eyebrow mt-7"><span className="welcome-live-dot" /> YOUR AI WORKSPACE <span className="welcome-eyebrow-line" /></div>
              <h2 className="welcome-heading mt-5">
                {firstName ? `Welcome back, ${firstName}.` : <>Make room for <span>big ideas.</span></>}
              </h2>
              <p className="welcome-description mt-3">
                A clear space to think, create, build and get things done.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <span className="welcome-model-pill"><span className="welcome-pill-dot" /> {aiName ?? current.name}</span>
                <button onClick={() => setNameOpen(true)} className="welcome-rename">Customize name <span aria-hidden>↗</span></button>
              </div>
              <div className="welcome-section-label mt-12 w-full"><span>START WITH A PROMPT</span><span>OR WRITE YOUR OWN BELOW</span></div>
              <div className="mt-3 grid w-full gap-3 sm:grid-cols-2">
                {(agent && current.tools ? [...SUGGESTIONS.slice(0, 2), ACTION_SUGGESTIONS[1], ACTION_SUGGESTIONS[3]] : SUGGESTIONS).map((s, i) => (
                  <button key={s} onClick={() => send(s)} className="prompt-card group">
                    <span className="prompt-card-icon"><SparkIcon width={17} height={17} /></span>
                    <span className="min-w-0 flex-1 text-left">{s}</span>
                    <span className="prompt-card-arrow" aria-hidden>↗</span>
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

        {pendingEmail && !hudActive && emailCard}
        {!hudActive && (
        <VoiceBar
          onExpand={() => setHudOpen(true)}
          state={voice.state}
          interim={voice.interim}
          error={voice.error}
          lang={voiceLang}
          onLang={changeVoiceLang}
          onStop={() => voice.stop()}
          onInterrupt={voice.interrupt}
          hint={pendingEmail ? 'Say “send” to send it, or “cancel”' : undefined}
        />
        )}
        <Composer
          loading={loading}
          placeholder={`Message ${aiName ?? current.name}…`}
          onSend={send}
          onStop={stop}
          onVoice={
            voice.supported
              ? () => {
                  if (voice.active) voice.stop();
                  else {
                    voice.start();
                    setHudOpen(true);
                  }
                }
              : undefined
          }
          voiceActive={voice.active}
        />
      </section>
    </div>
  );
}
