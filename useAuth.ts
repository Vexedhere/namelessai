'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export type Profile = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
};

export function toProfile(user: User): Profile {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const email = user.email ?? '';
  const name =
    str(m.full_name) || str(m.name) || str(m.user_name) || str(m.preferred_username) || email.split('@')[0] || 'User';
  const avatar = str(m.avatar_url) || str(m.picture) || null;
  return { id: user.id, name, email, avatar };
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const configured = !!getSupabase();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setReady(true);
      return;
    }
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => (prev?.id === session?.user?.id && prev ? prev : session?.user ?? null));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { user, profile: user ? toProfile(user) : null, ready, configured };
}
