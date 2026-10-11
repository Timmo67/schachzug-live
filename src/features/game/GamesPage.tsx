import { useCallback, useEffect, useState } from 'react';
import { notificationsSupported } from '../notify/useGameNotifications';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { GAME_COLS, downloadPgn, gameErrorText, respondGame, resultText, timeControlLabel, type GameRow } from './onlineGame';

/** Challenges, running games and the archive of finished games. */
export function GamesPage() {
  const { session, ready, profile } = useAuth();
  const me = session?.user.id;
  const navigate = useNavigate();
  const [games, setGames] = useState<GameRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));

  const load = useCallback(async () => {
    if (!supabase || !me) return;
    const { data } = await supabase.from('games').select(GAME_COLS).order('created_at', { ascending: false }).limit(100);
    const list = (data ?? []) as GameRow[];
    setGames(list);
    const ids = [...new Set(list.flatMap((g) => [g.white_id, g.black_id]).filter((x): x is string => !!x && x !== me))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      setNames(Object.fromEntries((ps ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name])));
    }
  }, [me]);

  // New challenges and finished games show up without reloading.
  useEffect(() => {
    if (!supabase || !me) return;
    const client = supabase;
    const ch = client.channel('my-games')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => void load())
      .on('system', {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') void load();
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') void load(); });
    return () => { void client.removeChannel(ch); };
  }, [me, load]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;

  const myName = profile?.display_name ?? 'Ich';
  const opp = (g: GameRow) => names[(g.white_id === me ? g.black_id : g.white_id) ?? ''] ?? 'Spieler';
  const color = (g: GameRow) => (g.white_id === me ? 'Weiß' : 'Schwarz');
  const incoming = games.filter((g) => g.status === 'waiting' && g.created_by !== me);
  const outgoing = games.filter((g) => g.status === 'waiting' && g.created_by === me);
  const running = games.filter((g) => g.status === 'active');
  const archive = games.filter((g) => g.status === 'finished');

  async function respond(g: GameRow, action: 'accept' | 'decline' | 'cancel') {
    setMsg(null);
    const err = await respondGame(g.id, action);
    if (err) setMsg(gameErrorText(err));
    else if (action === 'accept') navigate(`/partie/${g.id}`);
    void load();
  }

  return (
    <div className="grid2">
      <div className="panel">
        <h1>Partien</h1>
        {msg && <p className="error" role="status">{msg}</p>}
        {incoming.length > 0 && (
          <>
            <span className="lbl">Herausforderungen an dich</span>
            <div className="list" data-testid="incoming">
              {incoming.map((g) => (
                <div className="item" key={g.id}>
                  <span><b>{opp(g)}</b> · {timeControlLabel(g.time_control)} · du spielst {color(g)}</span>
                  <div className="row">
                    <button type="button" className="primary" onClick={() => respond(g, 'accept')}>Annehmen</button>
                    <button type="button" onClick={() => respond(g, 'decline')}>Ablehnen</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <span className="lbl">Laufende Partien ({running.length})</span>
        <div className="list" data-testid="running">
          {running.length === 0 && <p className="note">Keine laufende Partie. Fordere einen Freund heraus.</p>}
          {running.map((g) => {
            const myTurn = (g.moves_uci.length % 2 === 0) === (g.white_id === me);
            return (
              <Link className="item" key={g.id} to={`/partie/${g.id}`}>
                <span>gegen <b>{opp(g)}</b> · {timeControlLabel(g.time_control)}</span>
                <span className={`pill${myTurn ? ' accent' : ''}`}>{myTurn ? 'Du bist am Zug' : 'Gegner am Zug'}</span>
              </Link>
            );
          })}
        </div>
        {outgoing.length > 0 && (
          <>
            <span className="lbl">Gesendete Herausforderungen</span>
            <div className="list">
              {outgoing.map((g) => (
                <div className="item" key={g.id}>
                  <span>an <b>{opp(g)}</b> · {timeControlLabel(g.time_control)}</span>
                  <button type="button" onClick={() => respond(g, 'cancel')}>Zurückziehen</button>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row"><Link className="btn primary" to="/freunde">Freund herausfordern</Link></div>
        {permission === 'default' && (
          <div className="row">
            <button type="button" onClick={() => void Notification.requestPermission().then(setPermission)}>Benachrichtigungen erlauben</button>
            <span className="note">Dann meldet sich dein Browser auch, wenn Knightcall im Hintergrund offen ist.</span>
          </div>
        )}
      </div>

      <div className="panel">
        <span className="lbl">Archiv ({archive.length})</span>
        <div className="list" data-testid="archive">
          {archive.length === 0 && <p className="note">Hier erscheinen deine beendeten Partien.</p>}
          {archive.map((g) => (
            <div className="item" key={g.id}>
              <Link to={`/partie/${g.id}`}>
                gegen <b>{opp(g)}</b> · {new Date(g.created_at).toLocaleDateString('de-DE')}
                <br /><span className="note">{resultText(g, me)}</span>
              </Link>
              <button type="button" onClick={() => downloadPgn(g, g.white_id === me ? myName : opp(g), g.black_id === me ? myName : opp(g))}>PGN</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
