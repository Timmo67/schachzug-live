import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { gameErrorText } from '../game/onlineGame';

const REASONS = [
  { id: 'name', label: 'Beleidigender oder unpassender Name' },
  { id: 'cheating', label: 'Betrug, z. B. Hilfe durch ein Schachprogramm' },
  { id: 'behaviour', label: 'Unfaires Verhalten, z. B. absichtlich Zeit schinden' },
  { id: 'other', label: 'Sonstiges' },
] as const;

/** Report the opponent of a game. `onDone(text)` closes the form; text is a confirmation, null = cancelled. */
export function ReportForm({ gameId, userId, name, onDone }: { gameId: string; userId: string; name: string; onDone: (text: string | null) => void }) {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !reason) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('report_user', { p_user: userId, p_game: gameId, p_reason: reason, p_details: details });
    setBusy(false);
    if (err) setError(gameErrorText(err.message));
    else onDone('Danke, deine Meldung ist angekommen. Wir schauen sie uns an.');
  }

  return (
    <form className="panel reportform" onSubmit={submit} data-testid="report-form">
      <h3>{name} melden</h3>
      <div role="radiogroup" aria-label="Grund">
        {REASONS.map((r) => (
          <label key={r.id} className="check">
            <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
            {r.label}
          </label>
        ))}
      </div>
      <label className="lbl" htmlFor="report-details">Was ist passiert? (freiwillig)</label>
      <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={!reason || busy}>Meldung senden</button>
        <button type="button" onClick={() => onDone(null)}>Abbrechen</button>
      </div>
    </form>
  );
}
