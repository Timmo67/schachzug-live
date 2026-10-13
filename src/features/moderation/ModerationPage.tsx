import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

type Report = {
  id: number; reason: string; details: string | null; status: 'open' | 'dismissed' | 'actioned'; created_at: string; game_id: string | null;
  reported_id: string; reported_name: string | null; random_banned: boolean; reporter_name: string | null; open_reporters: number;
};
type Feedback = { id: number; body: string; page: string | null; user_agent: string | null; created_at: string; display_name: string | null };

const REASON: Record<string, string> = { name: 'Name', cheating: 'Betrug', behaviour: 'Verhalten', other: 'Sonstiges' };
const STATUS: Record<string, string> = { open: 'offen', dismissed: 'erledigt (unbegründet)', actioned: 'erledigt (gesperrt)' };
const when = (s: string) => new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/** For admins only: reports (exclude or release players) and beta feedback. The server checks is_admin. */
export function ModerationPage() {
  const { session, ready, profile } = useAuth();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [r, f] = await Promise.all([supabase.rpc('admin_reports'), supabase.rpc('admin_feedback')]);
    if (r.error || f.error) { setError('Kein Zugriff.'); return; }
    setReports(r.data as Report[]);
    setFeedback(f.data as Feedback[]);
  }, []);
  useEffect(() => { if (profile?.is_admin) void load(); }, [profile?.is_admin, load]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;
  if (profile && !profile.is_admin) return <div className="panel"><h1>Moderation</h1><p className="note">Diese Seite ist nur für das Knightcall-Team.</p></div>;

  async function resolve(userId: string, action: 'dismiss' | 'ban' | 'unban') {
    if (!supabase) return;
    const { error: err } = await supabase.rpc('admin_resolve', { p_user: userId, p_action: action });
    if (err) setError('Das hat nicht geklappt.');
    void load();
  }

  // One card per reported player, newest report first.
  const byPlayer = new Map<string, Report[]>();
  for (const r of reports ?? []) byPlayer.set(r.reported_id, [...(byPlayer.get(r.reported_id) ?? []), r]);

  return (
    <div className="grid2">
      <section className="panel" data-testid="moderation">
        <h1>Meldungen</h1>
        {error && <p className="error">{error}</p>}
        {reports && byPlayer.size === 0 && <p className="note">Keine Meldungen in den letzten 30 Tagen.</p>}
        {[...byPlayer.entries()].map(([userId, list]) => {
          const first = list[0];
          const open = list.some((r) => r.status === 'open');
          return (
            <article key={userId} className="lesson" data-testid="report-card">
              <h3>{first.reported_name ?? 'Gelöschtes Konto'} {first.random_banned && <span className="pill">von Zufallspartien ausgeschlossen</span>}</h3>
              <p className="note">{first.open_reporters} offene Meldung{first.open_reporters === 1 ? '' : 'en'} von verschiedenen Spielern</p>
              <ul className="note steps">
                {list.map((r) => (
                  <li key={r.id}>
                    {when(r.created_at)} · <b>{REASON[r.reason] ?? r.reason}</b> von {r.reporter_name ?? '–'}{r.details ? `: „${r.details}“` : ''} · {STATUS[r.status]}
                    {r.game_id && <> · <Link to={`/partie/${r.game_id}`}>Partie</Link></>}
                  </li>
                ))}
              </ul>
              <div className="row">
                {open && <button type="button" onClick={() => void resolve(userId, 'dismiss')}>Unbegründet – freigeben</button>}
                {!first.random_banned || open ? <button type="button" className="danger" onClick={() => void resolve(userId, 'ban')}>Von Zufallspartien ausschließen</button> : null}
                {first.random_banned && !open && <button type="button" onClick={() => void resolve(userId, 'unban')}>Wieder zulassen</button>}
              </div>
            </article>
          );
        })}
      </section>
      <section className="panel">
        <h2>Feedback</h2>
        {feedback && feedback.length === 0 && <p className="note">Noch kein Feedback.</p>}
        <div className="list" data-testid="feedback-list">
          {(feedback ?? []).map((f) => (
            <div className="item" key={f.id} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span className="note">{when(f.created_at)} · {f.display_name ?? '–'}{f.page ? ` · ${f.page}` : ''}</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{f.body}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
