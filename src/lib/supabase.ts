import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** null when the app runs without backend config (offline / local play only). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export type Plan = 'free' | 'plus' | 'pro' | 'family' | 'club';

export type Profile = { id: string; display_name: string; invite_code: string; board_theme?: string; piece_set?: string };
export type Entitlement = { plan: Plan; source: string; active_until: string | null };

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const map: Record<string, string> = {
    invite_not_found: 'Dieser Einladungscode existiert nicht.',
    own_invite: 'Das ist dein eigener Code.',
    design_requires_plus: 'Dieses Design gibt es mit Plus.',
    not_authenticated: 'Bitte zuerst anmelden.',
  };
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k];
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.';
  return 'Das hat nicht geklappt. Bitte später erneut versuchen.';
}

export const PENDING_INVITE_KEY = 'sz-pending-invite';
export function storage() {
  return {
    get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
}
