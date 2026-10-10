import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Entitlement, type Profile } from '../../lib/supabase';

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  entitlement: Entitlement | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) { setProfile(null); setEntitlement(null); return; }
    const uid = s.user.id;
    const [p, e] = await Promise.all([
      supabase.from('profiles').select('id, display_name, invite_code').eq('id', uid).maybeSingle(),
      supabase.from('entitlements').select('plan, source, active_until').eq('user_id', uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    const ent = e.data as Entitlement | null;
    // An expired entitlement counts as free (server applies the same rule in effective_plan()).
    if (ent && ent.active_until && new Date(ent.active_until) < new Date()) setEntitlement({ ...ent, plan: 'free' });
    else setEntitlement(ent);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => load(session), [load, session]);
  const value: AuthState = {
    ready, session, profile, entitlement, refresh,
    signOut: async () => { await supabase?.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
