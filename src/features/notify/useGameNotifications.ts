import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { storage, supabase } from '../../lib/supabase';
import { badgeCount, eventFor, eventText, type GameEvent, type GameLite } from './notifyLogic';

export type Notice = { id: number; gameId: string; title: string; action: string };

const COLS = 'id, status, white_id, black_id, created_by, moves_uci, result';

const SOUND_KEY = 'sz-notify-sound';
/** Sound for notifications is off unless the user switched it on (per device). */
export const soundEnabled = () => storage().get(SOUND_KEY) === '1';
export const setSoundEnabled = (on: boolean) => (on ? storage().set(SOUND_KEY, '1') : storage().del(SOUND_KEY));

/** Short two-tone chime via Web Audio (no audio file needed). Silently does nothing if blocked. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.15 + 0.25);
      o.connect(gain).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch { /* audio not available */ }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Watches the signed-in user's games (Realtime, RLS-scoped) and raises in-app notices for new challenges,
 * accepted/declined challenges, the opponent's move and finished games. When the tab is hidden and the
 * user allowed it, a system notification is shown as well. Also returns the count for the menu badge.
 */
export function useGameNotifications(me: string | undefined) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [badge, setBadge] = useState(0);
  const games = useRef(new Map<string, GameLite>());
  const names = useRef(new Map<string, string>());
  const nextId = useRef(1);
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  const nameOf = useCallback(async (id: string) => {
    if (names.current.has(id)) return names.current.get(id)!;
    const { data } = await supabase!.from('profiles').select('display_name').eq('id', id).maybeSingle();
    const n = (data as { display_name?: string } | null)?.display_name ?? 'Dein Freund';
    names.current.set(id, n);
    return n;
  }, []);

  const raise = useCallback(async (e: GameEvent) => {
    // On the game's own page the board already shows what happened.
    if (path.current === `/partie/${e.gameId}` && e.kind !== 'challenge') return;
    const who = await nameOf('from' in e ? e.from : e.by);
    const { title, action } = eventText(e, who);
    const id = nextId.current++;
    setNotices((n) => [...n.slice(-2), { id, gameId: e.gameId, title, action }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 12_000);
    if (soundEnabled()) chime();
    if (document.visibilityState === 'hidden' && notificationsSupported() && Notification.permission === 'granted') {
      try {
        const n = new Notification('Knightcall', { body: title, tag: e.gameId });
        n.onclick = () => { window.focus(); window.location.assign(`/partie/${e.gameId}`); };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }, [nameOf]);

  const recount = useCallback(() => {
    if (me) setBadge(badgeCount([...games.current.values()], me));
  }, [me]);

  useEffect(() => {
    if (!supabase || !me) { games.current.clear(); setBadge(0); return; }
    const client = supabase;
    let primed = false;

    const load = async () => {
      const { data } = await client.from('games').select(COLS).in('status', ['waiting', 'active']).limit(200);
      const fresh = new Map(((data ?? []) as GameLite[]).map((g) => [g.id, g]));
      // After a reconnect, report what happened in the meantime (but not on the very first load).
      if (primed) for (const g of fresh.values()) { const ev = eventFor(games.current.get(g.id), g, me); if (ev) void raise(ev); }
      games.current = fresh;
      primed = true;
      recount();
    };

    const ch = client.channel(`notify:${me}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (p) => {
        const g = p.new as GameLite;
        if (!g?.id) return;
        const ev = eventFor(games.current.get(g.id), g, me);
        if (g.status === 'waiting' || g.status === 'active') games.current.set(g.id, g);
        else games.current.delete(g.id);
        recount();
        if (ev) void raise(ev);
      })
      .on('system', {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') void load();
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') void load(); });
    // Phones pause the socket in the background or when locked; catch up when the app is visible again,
    // and poll as a safety net for events lost while the socket was quietly reconnecting.
    const wake = () => { if (document.visibilityState === 'visible') void load(); };
    const poll = setInterval(wake, 30_000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      void client.removeChannel(ch);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [me, raise, recount]);

  // Unread count in the tab title, e.g. "(2) Knightcall".
  useEffect(() => {
    document.title = badge > 0 ? `(${badge}) Knightcall` : 'Knightcall';
  }, [badge]);

  return { notices, dismiss, badge };
}
