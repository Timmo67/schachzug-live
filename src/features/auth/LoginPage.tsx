import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { errorText, supabase } from '../../lib/supabase';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('sending');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, data: name.trim() ? { display_name: name.trim() } : undefined },
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
        <label className="lbl" htmlFor="name">Anzeigename (bei neuer Anmeldung)</label>
        <input id="name" maxLength={24} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Thomas" />
        <button className="primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sende…' : 'Anmelde-Link schicken'}</button>
        {state === 'sent' && <p className="success" role="status">Link ist unterwegs. Öffne die E-Mail auf diesem Gerät.</p>}
        {state === 'error' && <p className="error" role="alert">{error}</p>}
      </form>
      <div className="panel">
        <h2>Warum ein Konto?</h2>
        <p className="note">Mit Konto kannst du Freunde einladen, online gegen sie spielen und den Videochat nutzen. Wer über einen Freund eingeladen wird, bekommt 30 Tage Plus gratis, ohne Zahlungsdaten.</p>
      </div>
    </div>
  );
}
