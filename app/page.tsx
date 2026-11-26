'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmRinger, AlarmsButton } from '@/components/AlarmRinger';
import { AuthModal } from '@/components/AuthModal';
import { Composer } from '@/components/Composer';
import { EmailConfirm, type PendingEmail } from '@/components/EmailConfirm';
import { ActionConfirm, type PendingConfirm } from '@/components/ActionConfirm';
import { DevicesPanel } from '@/components/DevicesPanel';
import { DownloadIcon, LaptopIcon, MenuIcon, PlusIcon, SparkIcon, WrenchIcon } from '@/components/Icons';
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
  const [godmode, setGodmode] = useState(false);
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
          if (st.voiceLang) setVoiceLang(st.voiceLang);
          if (typeof st.agent === 'boolean') setAgent(st.agent);
        }
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
            voiceLang,
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
        if ((required === 'PLUS' && tier === 'FREE') || (required === 'PRO' && tier !== 'PRO')) return `${m.name} needs the ${required} plan, so I can’t switch to it.`;
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

  const firstName = profile?.name.split(/\s+/)[0];
  const current = getModel(model);
  const lastIndex = messages.length - 1;

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
        voiceTranscript={longVoiceTranscript ? messages : []}
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
      <DevicesPanel open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <AuthModal open={authOpen && !user} onClose={() => setAuthOpen(false)} />
      <NameAiModal
        open={nameOpen && authReady && !authOpen && !voice.active}
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
          <span
            title={`Nameless Labs AI ${APP_VERSION_LABEL} ${APP_CODENAME}`}
            className="hidden select-none rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-zinc-500 lg:inline"
          >
            {APP_VERSION_LABEL}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setGodmode((value) => { const next = !value; if (next) setAgent(true); return next; }); }}
              disabled={!current.tools}
              aria-pressed={godmode}
              title={current.tools ? 'Godmode: plan and execute complex tasks with available tools' : 'Choose a tool-capable model to use Godmode'}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${godmode ? 'border-violet-300/50 bg-violet-400/15 text-violet-200 shadow-[0_0_18px_-7px_rgba(167,139,250,0.8)]' : 'border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white'}`}
            >
              <SparkIcon width={14} height={14} />
              <span className="hidden sm:inline">Godmode</span>
            </button>
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
            <button
              onClick={() => setDevicesOpen(true)}
              aria-label="Devices"
              title="Devices: let the AI control this device and your computer"
              className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <LaptopIcon width={16} height={16} />
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

        {godmode && (
          <div className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-2 rounded-xl border border-violet-300/25 bg-violet-400/[0.07] px-3 py-2 text-xs text-violet-100">
            <SparkIcon width={14} height={14} />
            <span className="flex-1">Godmode is on · task planning, available tools and verification enabled</span>
            <button onClick={() => setGodmode(false)} className="text-violet-200/70 transition hover:text-white">Turn off</button>
          </div>
        )}
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
                You are chatting with <span className="font-medium text-zinc-200">{aiName ?? current.name}</span>
                {aiName && aiName !== current.name ? <span className="text-zinc-500"> (on {current.name})</span> : null}. {current.tagline}{' '}
                <button onClick={() => setNameOpen(true)} className="text-cyan-300 underline-offset-2 transition hover:underline">
                  Rename
                </button>
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
              {longVoiceTranscript ? <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-zinc-400">This voice conversation is lengthy. Its full transcript is available in the sidebar.</p> : messages.map((m, i) => (
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
          placeholder={`Message ${aiName ?? current.name}…`}
          onSend={send}
          onStop={stop}
          onVoice={voice.supported ? () => (voice.active ? voice.stop() : startVoice()) : undefined}
          voiceActive={voice.active}
          onHandsFree={voice.supported ? toggleHandsFree : undefined}
          handsFree={voice.handsFree}
        />
      </section>
    </div>
  );
}
