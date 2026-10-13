import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/AuthProvider';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Short how-to for adding Knightcall to the home screen, hidden when it already runs from there. */
function HomeScreenHint() {
  if (isStandalone()) return null;
  return (
    <>
      <span className="lbl">Als App auf dem Handy</span>
      <p className="note" data-testid="homescreen-hint">
        {isIos()
          ? 'Tippe in Safari auf „Teilen“ (Quadrat mit Pfeil) und dann auf „Zum Home-Bildschirm“. Knightcall startet dann wie eine App. Zum Anmelden dort den Code aus der E-Mail nutzen.'
          : 'Öffne im Browser das Menü (⋮) und tippe auf „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.'}
      </p>
    </>
  );
}

export function HomePage() {
  const { session, profile, entitlement, signOut } = useAuth();
  const [training, setTraining] = useState<{ plus: boolean; games: number; needed: number } | null>(null);
  const me = session?.user.id;
  useEffect(() => {
    if (!supabase || !me) return;
    void supabase.rpc('training_status').then(({ data }) => setTraining(data as { plus: boolean; games: number; needed: number } | null));
  }, [me]);
  const beta = entitlement?.source === 'beta';
  const trialEnd = entitlement?.source === 'referral_trial' && entitlement.active_until && entitlement.plan !== 'free'
    ? new Date(entitlement.active_until).toLocaleDateString('de-DE') : null;

  return (
    <div className="grid2">
      <section className="panel">
        <h1>{session ? `Hallo ${profile?.display_name ?? ''}` : 'Schach mit Freunden, von Angesicht zu Angesicht'}</h1>
        <p>{session
          ? 'Fordere Freunde zu einer Online-Partie heraus und sieh sie dabei im Video neben dem Brett.'
          : 'Spiele gegen Freunde und sieh sie dabei im Video. Knightcall ist gerade in der kostenlosen, geschlossenen Beta – du brauchst die Einladung eines Freundes.'}</p>
        {beta && <p className="success">Du bist Beta-Tester: Alles ist kostenlos, auch Video und alle Designs. Danke fürs Mitmachen – zum Start bekommst du 6 Monate Plus geschenkt.</p>}
        {trialEnd && <p className="success">Deine Plus-Testphase läuft bis {trialEnd}. Danach geht es automatisch mit Basis weiter, ohne Kosten.</p>}
        {training?.plus && (
          <p className="note" data-testid="training-hint">
            {training.games >= training.needed
              ? <>Dein <Link to="/training">persönliches Training</Link> ist bereit – mit Lektionen zu deinen typischen Fehlern.</>
              : <>Dein <Link to="/training">persönliches Training</Link> startet nach {training.needed} Partien – noch {training.needed - training.games}.</>}
          </p>
        )}
        <div className="row">
          <Link className="btn primary" to="/spielen">Auf einem Gerät spielen</Link>
          {session ? <Link className="btn" to="/partien">Online-Partien</Link> : <Link className="btn" to="/anmelden">Anmelden</Link>}
          {session && <Link className="btn" to="/zufall">Zufallsgegner</Link>}
        </div>
      </section>
      <section className="panel">
        {session ? (
          <>
            <h2>So geht’s</h2>
            <ol className="note steps">
              <li>Unter <Link to="/freunde">Freunde</Link> deinen Einladungslink oder QR-Code teilen.</li>
              <li>Freund herausfordern, Bedenkzeit wählen – er bekommt sofort eine Meldung.</li>
              <li>In der Partie auf „Video starten“ tippen. Tipp: Mit Kopfhörern gibt es kein Echo.</li>
            </ol>
            <HomeScreenHint />
            <p className="note">Etwas klemmt oder du hast eine Idee? <Link to="/feedback" state={{ from: '/' }}>Schreib uns dein Feedback.</Link></p>
            <div className="row"><button type="button" onClick={() => void signOut()}>Abmelden</button></div>
          </>
        ) : (
          <>
            <h2>Was als Nächstes kommt</h2>
            <ul className="note steps">
              <li>Plus und Pro mit Analyse und KI-Coach</li>
              <li>Apps für iPhone und Android</li>
            </ul>
            <HomeScreenHint />
          </>
        )}
      </section>
    </div>
  );
}
