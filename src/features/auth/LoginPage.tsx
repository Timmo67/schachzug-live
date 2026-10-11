import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { PENDING_INVITE_KEY, errorText, storage, supabase } from '../../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Magic-link sign-in. Closed beta: new accounts need an invite code (from an invite link or typed in),
 * must be 18+ and accept the beta terms – the database checks all of this again when the account is created.
 */
export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => storage().get(PENDING_INVITE_KEY) ?? '');
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (session) return <Navigate to="/" replace />;

  const inviteCode = code.trim().toUpperCase();
  const signingUp = inviteCode.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('sending');
    if (signingUp) storage().set(PENDING_INVITE_KEY, inviteCode);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
        // Without an invite code only existing accounts can sign in.
        shouldCreateUser: signingUp,
        data: signingUp
          ? { display_name: name.trim() || undefined, invite_code: inviteCode, adult_confirmed: adult, terms_accepted: terms }
          : undefined,
      },
    });
    if (err) { setError(errorText(err)); setState('error'); } else setState('sent');
  }

  if (!supabase) {
    return <div className="panel"><h2>Anmeldung nicht verfügbar</h2><p className="note">Diese Version läuft ohne Server-Verbindung. Du kannst trotzdem auf einem Gerät spielen.</p></div>;
  }

  return (
    <div className="grid2">
      <form className="panel" onSubmit={submit}>
        <h1>Anmelden</h1>
        <p className="note">Du bekommst einen Anmelde-Link per E-Mail. Kein Passwort nötig.</p>
        <label className="lbl" htmlFor="email">E-Mail</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" />

        <label className="lbl" htmlFor="code">Einladungscode (nur beim ersten Mal)</label>
        <input id="code" className="mono" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" style={{ letterSpacing: '.12em' }} />

        {signingUp && (
          <>
            <label className="lbl" htmlFor="name">Anzeigename</label>
            <input id="name" maxLength={24} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Thomas" />
            <label className="check">
              <input type="checkbox" required checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              Ich bin mindestens 18 Jahre alt.
            </label>
            <label className="check">
              <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>Ich akzeptiere die <Link to="/nutzungsbedingungen" target="_blank">Nutzungsbedingungen der Beta</Link> und habe die <Link to="/datenschutz" target="_blank">Datenschutzerklärung</Link> gelesen.</span>
            </label>
          </>
        )}

        <button className="primary" type="submit" disabled={state === 'sending' || (signingUp && (!adult || !terms))}>
          {state === 'sending' ? 'Sende…' : 'Anmelde-Link schicken'}
        </button>
        {state === 'sent' && <p className="success" role="status">Link ist unterwegs. Öffne die E-Mail auf diesem Gerät.</p>}
        {state === 'error' && <p className="error" role="alert">{error}</p>}
      </form>
      <div className="panel">
        <h2>Geschlossene Beta</h2>
        <p className="note">Knightcall ist gerade in einer kostenlosen, geschlossenen Testphase. Neu anmelden kannst du dich mit dem Einladungslink oder -code eines Freundes. In der Beta ist alles frei – auch Video und alle Designs.</p>
        <p className="note">Schon ein Konto? Dann einfach E-Mail eingeben, den Code brauchst du nicht.</p>
      </div>
    </div>
  );
}
