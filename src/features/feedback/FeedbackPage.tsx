import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

/** Beta testers send feedback; it lands in the `feedback` table, which only the team reads. */
export function FeedbackPage() {
  const { session, ready } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? null;
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (ready && !session) return <Navigate to="/anmelden" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !session) return;
    setState('sending');
    const { error: err } = await supabase.from('feedback').insert({
      user_id: session.user.id,
      body: body.trim(),
      page: from?.slice(0, 200) ?? null,
      user_agent: navigator.userAgent.slice(0, 400),
    });
    if (err) {
      setError(err.message.includes('feedback_rate_limit')
        ? 'Du hast gerade schon viel geschrieben – danke! Bitte versuch es später noch einmal.'
        : 'Das hat nicht geklappt. Bitte später erneut versuchen.');
      setState('error');
    } else { setBody(''); setState('sent'); }
  }

  return (
    <div className="grid2">
      <form className="panel" onSubmit={submit}>
        <h1>Feedback</h1>
        <p className="note">Was klappt gut, was nervt, was fehlt dir? Jede Rückmeldung hilft, Knightcall besser zu machen.</p>
        <label className="lbl" htmlFor="feedback">Deine Nachricht</label>
        <textarea id="feedback" rows={6} required minLength={3} maxLength={2000} value={body}
          onChange={(e) => { setBody(e.target.value); if (state !== 'sending') setState('idle'); }}
          placeholder="z. B. Beim Video auf dem iPhone ist mir aufgefallen …" />
        <button className="primary" type="submit" disabled={state === 'sending' || body.trim().length < 3}>
          {state === 'sending' ? 'Sende…' : 'Feedback senden'}
        </button>
        {state === 'sent' && <p className="success" role="status">Danke! Dein Feedback ist angekommen.</p>}
        {state === 'error' && <p className="error" role="alert">{error}</p>}
      </form>
      <div className="panel">
        <h2>Gut zu wissen</h2>
        <p className="note">Mitgeschickt werden nur dein Konto, die Seite, von der du kommst, und welchen Browser du nutzt – damit wir Fehler nachstellen können.</p>
        <p className="note">Bei einem Fehler hilft: Was hast du gemacht, was ist passiert, und auf welchem Gerät?</p>
      </div>
    </div>
  );
}
