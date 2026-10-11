import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

export function HomePage() {
  const { session, profile, entitlement, signOut } = useAuth();
  const trialEnd = entitlement?.source === 'referral_trial' && entitlement.active_until && entitlement.plan !== 'free'
    ? new Date(entitlement.active_until).toLocaleDateString('de-DE') : null;

  return (
    <div className="grid2">
      <section className="panel">
        <h1>{session ? `Hallo ${profile?.display_name ?? ''}` : 'Schach mit Freunden, von Angesicht zu Angesicht'}</h1>
        <p>{session
          ? 'Fordere Freunde zu einer Online-Partie heraus und sieh sie dabei im Video neben dem Brett.'
          : 'Spiele gegen Freunde und sieh sie dabei im Video. Spielen ist gratis, dazu 10 Minuten Video pro Woche – unbegrenzt mit Plus.'}</p>
        {trialEnd && <p className="success">Deine Plus-Testphase läuft bis {trialEnd}. Danach geht es automatisch mit Basis weiter, ohne Kosten.</p>}
        <div className="row">
          <Link className="btn primary" to="/spielen">Auf einem Gerät spielen</Link>
          {session ? <Link className="btn" to="/partien">Online-Partien</Link> : <Link className="btn" to="/anmelden">Anmelden</Link>}
        </div>
      </section>
      <section className="panel">
        <h2>Was als Nächstes kommt</h2>
        <ul className="note" style={{ margin: 0, paddingLeft: '1.1em' }}>
          <li>Plus und Pro mit Analyse und KI-Coach</li>
          <li>Apps für iPhone und Android</li>
        </ul>
        {session && <div className="row"><button type="button" onClick={() => void signOut()}>Abmelden</button></div>}
      </section>
    </div>
  );
}
