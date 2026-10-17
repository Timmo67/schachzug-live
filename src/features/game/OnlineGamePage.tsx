import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import '../random/random.css';
import { ReportForm } from '../random/ReportForm';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../profile/Avatar';
import { VideoPanel } from '../video/VideoPanel';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { betterMove, useAnalysis } from '../analysis/useAnalysis';
import { Board, Captures } from './Board';
import { fromUci, movePairs, tryMove } from './chessRules';
import { clocksAt } from '../../../supabase/functions/_shared/gameLogic';
import {
  createGame, downloadPgn, fetchGame, formatClock, gameAction, gameErrorText, respondGame, resultText, sendMove,
  timeControlLabel, type GameRow,
} from './onlineGame';

type Message = { id: number; sender_id: string; body: string; created_at: string };

/** The only chat messages between strangers (the server checks the same list). */
const CHAT_PHRASES = ['Hallo!', 'Viel Glück!', 'Guter Zug!', 'Ups!', 'Gutes Spiel!', 'Danke!', 'Revanche?'];

export function OnlineGamePage() {
  const { id = '' } = useParams();
  const { session, ready } = useAuth();
  const navigate = useNavigate();
  const me = session?.user.id;
  const [game, setGame] = useState<GameRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});
  // Friendship with the opponent: decides about video, free chat and profile pictures in random games.
  const [friendship, setFriendship] = useState<'accepted' | 'pending' | 'blocked' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const aborted = useRef<number>(-1);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [chat, setChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const claimed = useRef<number>(-1);
  // Ply shown on the board while reviewing a finished game (null = current position).
  const [viewPly, setViewPly] = useState<number | null>(null);
  const analysis = useAnalysis(id, game?.moves_uci ?? [], game?.status === 'finished');

  // Only accept rows that are at least as new as what we have (Realtime and responses can race).
  const accept = useCallback((g: GameRow | null) => {
    if (!g) return;
    setGame((cur) => (cur && cur.id === g.id && cur.version > g.version ? cur : g));
  }, []);

  const reload = useCallback(async () => {
    const g = await fetchGame(id);
    if (!g) { setMissing(true); return; }
    accept(g);
  }, [id, accept]);

  const loadChat = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('game_messages').select('id, sender_id, body, created_at')
      .eq('game_id', id).order('id').limit(200);
    setChat((data ?? []) as Message[]);
  }, [id]);

  // Live updates; on every (re)subscribe fetch the full state, so a reload or lost connection catches up.
  useEffect(() => {
    if (!supabase || !me) return;
    const client = supabase;
    const ch = client.channel(`game:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        (p) => accept(p.new as GameRow))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${id}` },
        (p) => setChat((c) => (c.some((m) => m.id === (p.new as Message).id) ? c : [...c, p.new as Message])))
      // Change feeds become active shortly after SUBSCRIBED; fetch again then so nothing in between is lost.
      .on('system', {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') { void reload(); void loadChat(); }
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') { void reload(); void loadChat(); } });
    // Safety net for events lost while the socket was quietly reconnecting.
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 20_000);
    const wake = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      void client.removeChannel(ch);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [id, me, accept, reload, loadChat]);

  const whiteId = game?.white_id;
  const blackId = game?.black_id;
  useEffect(() => {
    if (!supabase || !whiteId || !blackId) return;
    void supabase.from('profiles').select('id, display_name, avatar_url, random_rating, invite_code').in('id', [whiteId, blackId]).then(({ data }) => {
      const rows = (data ?? []) as Array<{ id: string; display_name: string; avatar_url: string | null; random_rating: number; invite_code: string }>;
      setNames(Object.fromEntries(rows.map((p) => [p.id, p.display_name])));
      setAvatars(Object.fromEntries(rows.map((p) => [p.id, p.avatar_url])));
      setRatings(Object.fromEntries(rows.map((p) => [p.id, p.random_rating])));
      setInviteCodes(Object.fromEntries(rows.map((p) => [p.id, p.invite_code])));
    });
  }, [whiteId, blackId]);

  const loadFriendship = useCallback(async () => {
    if (!supabase || !whiteId || !blackId) return;
    const { data } = await supabase.from('friendships').select('status')
      .or(`and(requester_id.eq.${whiteId},addressee_id.eq.${blackId}),and(requester_id.eq.${blackId},addressee_id.eq.${whiteId})`);
    const rows = (data ?? []) as Array<{ status: 'accepted' | 'pending' | 'blocked' }>;
    setFriendship(rows.find((r) => r.status === 'blocked')?.status ?? rows[0]?.status ?? null);
  }, [whiteId, blackId]);
  useEffect(() => { void loadFriendship(); }, [loadFriendship]);

  const ticking = game?.status === 'active' && game.base_ms !== null;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [ticking]);

  const clocks = game ? clocksAt(game, now) : { w: null, b: null };
  const turn: Color = (game?.moves_uci.length ?? 0) % 2 === 0 ? 'w' : 'b';
  const flagFell = ticking && (turn === 'w' ? clocks.w : clocks.b) === 0;

  // Random games: a side that does not make its first move within 30 seconds gets the game called off.
  const firstMoveDeadline = game && game.kind === 'random' && game.status === 'active' && game.moves_uci.length < 2
    ? new Date(game.last_move_at ?? game.created_at).getTime() + 30_000 : null;
  const firstMoveLeft = firstMoveDeadline ? Math.max(0, Math.ceil((firstMoveDeadline - now) / 1000)) : null;
  useEffect(() => {
    if (!game || firstMoveLeft !== 0 || aborted.current === game.version || !supabase) return;
    aborted.current = game.version;
    void supabase.rpc('abort_random_game', { p_game: game.id }).then(() => reload());
  }, [firstMoveLeft, game, reload]);

  // When the side to move runs out of time, either player's client asks the server to end the game.
  useEffect(() => {
    if (!game || !flagFell || claimed.current === game.version) return;
    claimed.current = game.version;
    void gameAction(game.id, 'claim_timeout').then(() => reload());
  }, [flagFell, game, reload]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;
  if (missing) return <div className="panel"><h2>Partie nicht gefunden</h2><Link to="/partien">Zu deinen Partien</Link></div>;
  if (!game || !me) return <div className="panel"><p className="muted">Partie wird geladen …</p></div>;

  const myColor: Color | null = me === game.white_id ? 'w' : me === game.black_id ? 'b' : null;
  const reviewing = game.status === 'finished' && viewPly !== null && viewPly < game.moves_uci.length;
  const moves = pending ? [...game.moves_uci, pending] : game.moves_uci;
  const chess = fromUci(moves) ?? fromUci(game.moves_uci)!;
  const shownMoves = reviewing ? game.moves_uci.slice(0, viewPly!) : moves;
  const shown = reviewing ? fromUci(shownMoves)! : chess;
  const bottom: Color = (myColor ?? 'w') === 'w' ? (flipped ? 'b' : 'w') : (flipped ? 'w' : 'b');
  const top: Color = bottom === 'w' ? 'b' : 'w';
  const active = game.status === 'active';
  const myTurn = active && myColor === turn && !pending && !flagFell;
  const opponentId = myColor === 'w' ? game.black_id : game.white_id;
  // Strangers (random game, not friends): no video, fixed chat phrases, no profile pictures.
  const stranger = game.kind === 'random' && friendship !== 'accepted';
  const avatarOf = (c: Color) => (stranger ? null : avatars[(c === 'w' ? game.white_id : game.black_id) ?? '']);
  // Finished rated games show the rating before the game and the change; otherwise the current rating.
  const ratingOf = (c: Color) => {
    const before = c === 'w' ? game.white_rating : game.black_rating;
    const diff = c === 'w' ? game.white_rating_diff : game.black_rating_diff;
    const value = before ?? ratings[(c === 'w' ? game.white_id : game.black_id) ?? ''];
    if (value === undefined) return null;
    return (
      <span className="rating" data-testid={`rating-${c}`}>
        {value}{diff != null && <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? `+${diff}` : `−${-diff}`}</b>}
      </span>
    );
  };
  const name = (c: Color) => names[(c === 'w' ? game.white_id : game.black_id) ?? ''] ?? (c === 'w' ? 'Weiß' : 'Schwarz');
  // Finished own games show the analysis panel, which has its own clickable move list.
  const withAnalysis = game.status === 'finished' && !!myColor && game.moves_uci.length > 0;
  const drawOfferedByOpponent = active && !!game.draw_offer_by && game.draw_offer_by !== me;
  const drawOfferedByMe = active && game.draw_offer_by === me;

  async function onMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!game) return;
    const uci = tryMove(fromUci(game.moves_uci)!, from, to, promotion);
    if (!uci) return;
    setPending(uci);
    setMsg(null);
    const r = await sendMove(game.id, uci);
    setPending(null);
    if (r.game) accept(r.game);
    else { setMsg(gameErrorText(r.error ?? '')); void reload(); }
  }

  async function act(fn: () => Promise<string | null>) {
    setMsg(null);
    const err = await fn();
    if (err) setMsg(gameErrorText(err));
    void reload();
  }

  // Rematch: a new challenge with the same time control and swapped colours.
  async function rematch() {
    if (!game || !opponentId || !myColor || !supabase) return;
    setMsg(null);
    if (game.kind === 'random') {
      const { data, error } = await supabase.rpc('rematch_random', { p_game: game.id });
      if (error) setMsg(gameErrorText(error.message));
      else navigate(`/partie/${data as string}`);
      return;
    }
    const r = await createGame(opponentId, game.time_control, myColor === 'w' ? 'b' : 'w');
    if (r.id) navigate(`/partie/${r.id}`);
    else setMsg(gameErrorText(r.error ?? ''));
  }

  async function befriend() {
    if (!supabase || !opponentId) return;
    const { error } = await supabase.rpc('request_friend', { p_code: inviteCodes[opponentId] ?? '' });
    if (error) setMsg(gameErrorText(error.message));
    else { setInfo('Freundschaftsanfrage gesendet.'); void loadFriendship(); }
  }

  async function block() {
    if (!supabase || !opponentId) return;
    setConfirmBlock(false);
    const { error } = await supabase.rpc('respond_friend', { p_other: opponentId, p_action: 'block' });
    if (error) setMsg(gameErrorText(error.message));
    else { setInfo('Blockiert. Ihr werdet nicht mehr zusammen gelost. Aufheben kannst du das im Profil.'); void loadFriendship(); }
  }

  async function sendPhrase(text: string) {
    if (!supabase || !me) return;
    const { error } = await supabase.from('game_messages').insert({ game_id: id, sender_id: me, body: text });
    if (error) setMsg(gameErrorText(error.message));
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!supabase || !body || !me) return;
    setDraft('');
    const { error } = await supabase.from('game_messages').insert({ game_id: id, sender_id: me, body: body.slice(0, 300) });
    if (error) setMsg('Nachricht konnte nicht gesendet werden.');
  }

  const status = game.status === 'waiting'
    ? (game.created_by === me ? `Warte, bis ${names[opponentId ?? ''] ?? 'dein Freund'} annimmt …` : 'Du wurdest herausgefordert.')
    : game.status === 'active'
      ? `${myTurn || pending ? 'Du bist' : `${name(turn)} ist`} am Zug${chess.inCheck() ? ' – Schach!' : ''}`
      : resultText(game, me);

  const clockOf = (c: Color) => (
    <span className={`clock${active && turn === c && game.moves_uci.length >= 2 ? ' run' : ''}${(c === 'w' ? clocks.w : clocks.b) !== null && (c === 'w' ? clocks.w! : clocks.b!) < 20_000 ? ' low' : ''}`}
      data-testid={`clock-${c}`}>
      {formatClock(c === 'w' ? clocks.w : clocks.b)}
    </span>
  );

  return (
    <div className="game">
      <div className="boardcol">
        <div className="pbar">
          <div className="pname"><i className={`swatch ${top}`} /><Avatar url={avatarOf(top)} name={name(top)} size={24} />{name(top)}{ratingOf(top)}</div>
          <Captures game={shown} color={top} />
          {clockOf(top)}
        </div>
        <Board game={shown} orientation={bottom} interactive={myTurn && !reviewing} lastMove={shownMoves.at(-1)} onMove={onMove}
          arrow={game.status === 'finished' ? betterMove(analysis.state, game.moves_uci, shownMoves.length) : null}
          onBlocked={() => active && setMsg(myColor ? 'Warte auf den Zug deines Gegners.' : null)} />
        <div className="pbar">
          <div className="pname"><i className={`swatch ${bottom}`} /><Avatar url={avatarOf(bottom)} name={name(bottom)} size={24} />{name(bottom)}{ratingOf(bottom)}</div>
          <Captures game={shown} color={bottom} />
          {clockOf(bottom)}
        </div>
        <div className={`status${game.status === 'finished' || game.status === 'aborted' ? ' end' : ''}`} aria-live="polite" data-testid="status">{status}</div>
        {msg && <p className="error" role="status">{msg}</p>}
        {info && <p className="success" role="status" data-testid="game-info">{info}</p>}
        {firstMoveLeft !== null && firstMoveLeft > 0 && (
          <p className="note" data-testid="first-move">{turn === myColor ? 'Mach deinen ersten Zug' : `${name(turn)} muss den ersten Zug machen`} – noch {firstMoveLeft} s, sonst wird die Partie abgebrochen.</p>
        )}

        {game.status === 'waiting' && (
          <div className="row">
            {game.created_by === me
              ? <button type="button" onClick={() => act(() => respondGame(game.id, 'cancel'))}>Herausforderung zurückziehen</button>
              : <>
                  <button type="button" className="primary" onClick={() => act(() => respondGame(game.id, 'accept'))}>Annehmen</button>
                  <button type="button" onClick={() => act(() => respondGame(game.id, 'decline'))}>Ablehnen</button>
                </>}
          </div>
        )}

        {drawOfferedByOpponent && (
          <div className="row">
            <span>{name(myColor === 'w' ? 'b' : 'w')} bietet Remis an.</span>
            <button type="button" className="primary" onClick={() => act(() => gameAction(game.id, 'accept_draw'))}>Remis annehmen</button>
            <button type="button" onClick={() => act(() => gameAction(game.id, 'decline_draw'))}>Ablehnen</button>
          </div>
        )}

        <div className="row">
          <button type="button" onClick={() => setFlipped(!flipped)}>Drehen</button>
          {active && myColor && (
            <>
              <button type="button" disabled={!!game.draw_offer_by} onClick={() => act(() => gameAction(game.id, 'offer_draw'))}>
                {drawOfferedByMe ? 'Remis angeboten' : 'Remis anbieten'}
              </button>
              <button type="button" onClick={() => setConfirmResign(true)}>Aufgeben</button>
            </>
          )}
          {game.status === 'finished' && myColor && opponentId && (
            <button type="button" className="primary" onClick={() => void rematch()}>Revanche</button>
          )}
          {(game.status === 'finished' || game.moves_uci.length > 0) && (
            <button type="button" onClick={() => downloadPgn(game, name('w'), name('b'))}>PGN herunterladen</button>
          )}
        </div>
        {game.kind === 'random' && myColor && opponentId && (game.status === 'finished' || game.status === 'aborted') && (
          <div className="row" data-testid="stranger-actions">
            {friendship === null && <button type="button" onClick={() => void befriend()}>Als Freund anfragen</button>}
            {friendship === 'pending' && <span className="note">Freundschaftsanfrage offen</span>}
            <button type="button" onClick={() => setReporting(true)}>Melden</button>
            {friendship !== 'blocked' && <button type="button" className="danger" onClick={() => setConfirmBlock(true)}>Blockieren</button>}
          </div>
        )}
        {confirmBlock && (
          <div className="row">
            <span>{name(myColor === 'w' ? 'b' : 'w')} blockieren? Ihr werdet nicht mehr zusammen gelost und könnt euch nichts mehr schicken.</span>
            <button type="button" className="danger" onClick={() => void block()}>Ja, blockieren</button>
            <button type="button" onClick={() => setConfirmBlock(false)}>Abbrechen</button>
          </div>
        )}
        {reporting && opponentId && (
          <ReportForm gameId={game.id} userId={opponentId} name={name(myColor === 'w' ? 'b' : 'w')}
            onDone={(text) => { setReporting(false); if (text) setInfo(text); }} />
        )}
        {confirmResign && active && (
          <div className="row">
            <span>Wirklich aufgeben?</span>
            <button type="button" className="primary" onClick={() => { setConfirmResign(false); void act(() => gameAction(game.id, 'resign')); }}>Ja, aufgeben</button>
            <button type="button" onClick={() => setConfirmResign(false)}>Abbrechen</button>
          </div>
        )}
      </div>

      <aside className="panel">
        {withAnalysis && (
          <AnalysisPanel moves={game.moves_uci} state={analysis.state} remaining={analysis.remaining} onStart={() => void analysis.start()}
            ply={viewPly ?? game.moves_uci.length} onSelect={setViewPly} names={{ w: name('w'), b: name('b') }} />
        )}
        {myColor && game.status !== 'aborted' && !stranger && (
          <VideoPanel gameId={game.id} polite={myColor === 'b'} opponentName={name(myColor === 'w' ? 'b' : 'w')} />
        )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Züge</h2>
          <span className="pill">{timeControlLabel(game.time_control)}</span>
        </div>
        {!withAnalysis && <div className="moves" data-testid="moves">
          {moves.length === 0 && <><span className="n">–</span><span className="muted">noch keine</span><span /></>}
          {movePairs(chess).map(([n, a, b]) => (
            <span key={n} style={{ display: 'contents' }}><span className="n">{n}.</span><span>{a}</span><span>{b}</span></span>
          ))}
        </div>}

        <span className="lbl">Chat</span>
        <div className="chat" data-testid="chat">
          {chat.length === 0 && <p className="note">Noch keine Nachrichten.</p>}
          {chat.map((m) => (
            <p key={m.id} className={m.sender_id === me ? 'mine' : ''}>
              <b>{m.sender_id === me ? 'Du' : names[m.sender_id] ?? 'Gegner'}:</b> {m.body}
            </p>
          ))}
        </div>
        {stranger ? (
          <div className="phrases" data-testid="phrases">
            {CHAT_PHRASES.map((t) => <button key={t} type="button" className="chip" onClick={() => void sendPhrase(t)}>{t}</button>)}
          </div>
        ) : (
          <form className="row" onSubmit={sendChat}>
            <input aria-label="Nachricht" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} placeholder="Nachricht …" style={{ flex: 1 }} />
            <button type="submit" disabled={!draft.trim()}>Senden</button>
          </form>
        )}
        <Link to="/partien" className="note">← Alle Partien</Link>
      </aside>
    </div>
  );
}
