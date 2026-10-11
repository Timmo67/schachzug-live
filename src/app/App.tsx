import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { FriendsPage } from '../features/friends/FriendsPage';
import { InvitePage, redeemPendingInvite } from '../features/friends/InvitePage';
import { GamesPage } from '../features/game/GamesPage';
import { LocalGamePage } from '../features/game/LocalGamePage';
import { OnlineGamePage } from '../features/game/OnlineGamePage';
import { NotificationStack } from '../features/notify/NotificationStack';
import { useGameNotifications } from '../features/notify/useGameNotifications';
import { DesignPage } from '../features/appearance/DesignPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { LegalFooter, LegalPage } from '../features/legal/LegalPage';
import { HomePage } from './HomePage';

const PLAN_LABEL: Record<string, string> = { free: 'Basis', plus: 'Plus', pro: 'Pro', family: 'Familie', club: 'Verein' };
const planLabel = (plan: string | undefined, source: string | undefined) => (source === 'beta' ? 'Beta' : PLAN_LABEL[plan ?? 'free']);

export function App() {
  const { session, entitlement, refresh } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const { notices, dismiss, badge } = useGameNotifications(session?.user.id);

  // After signing in via magic link, redeem an invite that was opened before login.
  useEffect(() => {
    if (!session) return;
    void redeemPendingInvite().then(async (r) => {
      if (!r) return;
      setToast(r.text);
      await refresh();
      if (r.ok) navigate('/freunde');
    });
  }, [session, refresh, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="wrap">
      <header className="topbar">
        <Link to="/" className="brand">Knight<span>call</span></Link>
        <nav className="nav">
          <NavLink to="/spielen">Spielen</NavLink>
          {session && <NavLink to="/partien">Partien{badge > 0 && <span className="badge" data-testid="badge">{badge}</span>}</NavLink>}
          {session && <NavLink to="/freunde">Freunde</NavLink>}
          {session ? <NavLink to="/profil">Profil</NavLink> : <NavLink to="/design">Design</NavLink>}
          {session ? (
            <span className={`pill ${entitlement?.plan && entitlement.plan !== 'free' ? 'accent' : ''}`} data-testid="plan">
              {planLabel(entitlement?.plan, entitlement?.source)}
            </span>
          ) : (
            <NavLink to="/anmelden">Anmelden</NavLink>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/spielen" element={<LocalGamePage />} />
          <Route path="/anmelden" element={<LoginPage />} />
          <Route path="/freunde" element={<FriendsPage />} />
          <Route path="/partien" element={<GamesPage />} />
          <Route path="/design" element={<DesignPage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="/impressum" element={<LegalPage slug="impressum" />} />
          <Route path="/datenschutz" element={<LegalPage slug="datenschutz" />} />
          <Route path="/agb" element={<LegalPage slug="agb" />} />
          <Route path="/widerruf" element={<LegalPage slug="widerruf" />} />
          <Route path="/nutzungsbedingungen" element={<LegalPage slug="nutzungsbedingungen" />} />
          <Route path="/partie/:id" element={<OnlineGamePage />} />
          <Route path="/i/:code" element={<InvitePage />} />
          <Route path="*" element={<div className="panel"><h2>Seite nicht gefunden</h2><Link to="/">Zur Startseite</Link></div>} />
        </Routes>
      </main>
      <LegalFooter />
      {toast && <div className="toast" role="status">{toast}</div>}
      <NotificationStack notices={notices} dismiss={dismiss} />
    </div>
  );
}
