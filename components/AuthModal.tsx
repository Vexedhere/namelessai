'use client';

import { useEffect, useState } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { AlertIcon, CloseIcon } from './Icons';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

const GitHubMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
);

type Mode = 'signin' | 'signup' | 'magic';

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setInfo('');
    setBusy(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const oauth = async (provider: Provider) => {
    if (!sb) return;
    setError('');
    setBusy(true);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    } // on success the browser navigates away to the provider
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb || busy) return;
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) onClose();
        else setInfo('Almost there. Check your inbox and click the confirmation link to finish creating your account.');
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo('Magic link sent. Open it from your email to sign in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        className="animate-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e14]/95 p-7 shadow-2xl shadow-black/70 backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/20 blur-[70px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-violet-600/20 blur-[70px]" />

        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
          <CloseIcon />
        </button>

        <div className="relative">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-bold text-black shadow-[0_0_30px_rgba(34,211,238,0.4)]">
            N
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">Sign in to sync your chats across every device.</p>

          {!sb ? (
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-200">
              <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
              <span>
                Sign-in isn’t configured yet. Add <code className="font-mono text-amber-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
                to your environment variables and redeploy.
              </span>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => oauth('google')}
                  disabled={busy}
                  className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.09] disabled:opacity-50"
                >
                  <GoogleMark /> Google
                </button>
                <button
                  onClick={() => oauth('github')}
                  disabled={busy}
                  className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.09] disabled:opacity-50"
                >
                  <GitHubMark /> GitHub
                </button>
              </div>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                <span className="h-px flex-1 bg-white/10" /> or with email <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email"
                  className={input}
                />
                {mode !== 'magic' && (
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min. 6 characters)"
                    aria-label="Password"
                    className={input}
                  />
                )}

                {error && (
                  <p className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3.5 py-2.5 text-sm text-red-200">
                    <AlertIcon className="mt-0.5 shrink-0" width={15} height={15} /> {error}
                  </p>
                )}
                {info && (
                  <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3.5 py-2.5 text-sm text-emerald-200">{info}</p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(34,211,238,0.3)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send magic link'}
                </button>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
                {mode === 'signin' ? (
                  <button onClick={() => { setMode('signup'); setError(''); setInfo(''); }} className="hover:text-white">
                    New here? <span className="text-cyan-300">Create an account</span>
                  </button>
                ) : (
                  <button onClick={() => { setMode('signin'); setError(''); setInfo(''); }} className="hover:text-white">
                    Have an account? <span className="text-cyan-300">Sign in</span>
                  </button>
                )}
                <button
                  onClick={() => { setMode(mode === 'magic' ? 'signin' : 'magic'); setError(''); setInfo(''); }}
                  className="hover:text-white"
                >
                  {mode === 'magic' ? 'Use password' : 'Email me a magic link'}
                </button>
              </div>
            </>
          )}

          <button onClick={onClose} className="mt-6 w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
            Continue as guest
          </button>
        </div>
      </div>
    </div>
  );
}
