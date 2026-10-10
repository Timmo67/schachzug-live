import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { errorText, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { TIME_CONTROLS, createGame, gameErrorText } from '../game/onlineGame';

type Row = { requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'blocked' };
type Person = { id: string; display_name: string };

export function inviteUrl(code: string) {
  return `${window.location.origin}/i/${code}`;
}

export function FriendsPage() {
  const { session, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const me = session?.user.id;
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [tc, setTc] = useState<string>('10+0');
  const [color, setColor] = useState<'w' | 'b' | 'random'>('random');

  const load = useCallback(async () => {
    if (!supabase || !me) return;
    const { data } = await supabase.from('friendships').select('requester_id, addressee_id, status');
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id)))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      setNames(Object.fromEntries(((ps ?? []) as Person[]).map((p) => [p.id, p.display_name])));
    }
  }, [me]);

  useEffect(() => { void load(); }, [load]);

  if (!session) return <Navigate to="/anmelden" replace />;

  const other = (r: Row) => (r.requester_id === me ? r.addressee_id : r.requester_id);
  const friends = rows.filter((r) => r.status === 'accepted');
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee_id === me);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requester_id === me);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.rpc('request_friend', { p_code: code.trim() });
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: 'Anfrage gesendet.' });
    if (!error) { setCode(''); void load(); }
  }

  async function respond(id: string, action: 'accept' | 'decline' | 'remove' | 'block') {
    if (!supabase) return;
    const { error } = await supabase.rpc('respond_friend', { p_other: id, p_action: action });
    if (error) setMsg({ ok: false, text: errorText(error) });
    void load();
  }

  async function sendChallenge(opponent: string) {
    const r = await createGame(opponent, tc, color);
    if ('id' in r) navigate(`/partie/${r.id}`);
    else setMsg({ ok: false, text: gameErrorText(r.error) });
  }

  async function share() {
    if (!profile) return;
    const url = inviteUrl(profile.invite_code);
    const text = 'Lass uns Schach spielen – mit Video! Über meinen Link bekommst du 30 Tage Plus gratis.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Schachzug Live', text, url }); return; }
      await navigator.clipboard.writeText(url);
      setMsg({ ok: true, text: 'Link kopiert.' });
    } catch { /* user cancelled */ }
  }

  return (
    <div className="grid2">
      <div className="panel">
        <h1>Freunde</h1>
        <span className="lbl">Dein Einladungslink</span>
        <p className="mono" style={{ overflowWrap: 'anywhere' }} data-testid="invite-url">{profile ? inviteUrl(profile.invite_code) : '…'}</p>
        <p className="note">Wer sich über deinen Link anmeldet, ist sofort mit dir befreundet und bekommt 30 Tage Plus gratis.</p>
        <div className="row"><button className="primary" type="button" onClick={share}>Link teilen</button></div>
        <span className="lbl">Freund per Code hinzufügen</span>
        <form className="row" onSubmit={add}>
          <input aria-label="Einladungscode" className="mono" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" style={{ width: '9em', letterSpacing: '.12em' }} />
          <button type="submit" disabled={code.trim().length < 6}>Anfrage senden</button>
        </form>
        {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
      </div>

      <div className="panel">
        {incoming.length > 0 && (
          <>
            <span className="lbl">Anfragen an dich</span>
            <div className="list">
              {incoming.map((r) => (
                <div className="item" key={other(r)}>
                  <b>{names[other(r)] ?? 'Spieler'}</b>
                  <div className="row">
                    <button type="button" className="primary" onClick={() => respond(other(r), 'accept')}>Annehmen</button>
                    <button type="button" onClick={() => respond(other(r), 'decline')}>Ablehnen</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <span className="lbl">Deine Freunde ({friends.length})</span>
        <div className="list" data-testid="friends">
          {friends.length === 0 && <p className="note">Noch niemand. Teile deinen Link, um den ersten Freund einzuladen.</p>}
          {friends.map((r) => (
            <div className="item" key={other(r)}>
              <b>{names[other(r)] ?? 'Spieler'}</b>
              <div className="row">
                <button type="button" className={challenge === other(r) ? '' : 'primary'}
                  onClick={() => setChallenge(challenge === other(r) ? null : other(r))}>Herausfordern</button>
                <button type="button" onClick={() => respond(other(r), 'remove')}>Entfernen</button>
              </div>
              {challenge === other(r) && (
                <div className="challenge" data-testid="challenge">
                  <span className="lbl">Bedenkzeit</span>
                  <div className="row">
                    {TIME_CONTROLS.map((t) => (
                      <button key={t.id} type="button" className={`chip${tc === t.id ? ' on' : ''}`} aria-pressed={tc === t.id} onClick={() => setTc(t.id)}>{t.label}</button>
                    ))}
                  </div>
                  <span className="lbl">Deine Farbe</span>
                  <div className="row">
                    {([['w', 'Weiß'], ['b', 'Schwarz'], ['random', 'Zufall']] as const).map(([c, l]) => (
                      <button key={c} type="button" className={`chip${color === c ? ' on' : ''}`} aria-pressed={color === c} onClick={() => setColor(c)}>{l}</button>
                    ))}
                  </div>
                  <div className="row"><button type="button" className="primary" onClick={() => sendChallenge(other(r))}>Herausforderung senden</button></div>
                </div>
              )}
            </div>
          ))}
        </div>
        {outgoing.length > 0 && (
          <>
            <span className="lbl">Gesendete Anfragen</span>
            <div className="list">
              {outgoing.map((r) => (
                <div className="item" key={other(r)}>
                  <span>{names[other(r)] ?? 'Spieler'}</span>
                  <button type="button" onClick={() => respond(other(r), 'remove')}>Zurückziehen</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
