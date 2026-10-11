import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PENDING_INVITE_KEY, errorText, storage, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

/** Redeems a stored invite once the user is signed in. Returns a user-facing message. */
export async function redeemPendingInvite(): Promise<{ ok: boolean; text: string } | null> {
  const code = storage().get(PENDING_INVITE_KEY);
  if (!code || !supabase) return null;
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code });
  storage().del(PENDING_INVITE_KEY);
  if (error) return { ok: false, text: errorText(error) };
  const trial = (data as { trial_granted?: boolean } | null)?.trial_granted;
  return { ok: true, text: trial ? 'Ihr seid jetzt befreundet. Du hast 30 Tage Plus gratis.' : 'Ihr seid jetzt befreundet.' };
}

export function InvitePage() {
  const { code = '' } = useParams();
  const { session, ready, refresh } = useAuth();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (clean) storage().set(PENDING_INVITE_KEY, clean);
  }, [code]);

  useEffect(() => {
    if (!ready || !session) return;
    void redeemPendingInvite().then(async (r) => { if (r) { setMsg(r); await refresh(); } });
  }, [ready, session, refresh]);

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h1>Du wurdest eingeladen</h1>
      <p>Ein Freund möchte mit dir Schach spielen, mit Videochat direkt neben dem Brett.</p>
      {!session && (
        <>
          <p className="note">Knightcall ist in einer kostenlosen, geschlossenen Beta. Mit dieser Einladung kannst du dich anmelden – danach seid ihr automatisch befreundet. In der Beta ist alles frei, auch der Videochat.</p>
          <div className="row"><Link className="btn primary" to="/anmelden">Jetzt anmelden</Link></div>
        </>
      )}
      {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
      {session && msg?.ok && <div className="row"><Link className="btn primary" to="/freunde">Zu deinen Freunden</Link></div>}
    </div>
  );
}
