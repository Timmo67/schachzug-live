import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { FriendsPage } from '../features/friends/FriendsPage';
import { InvitePage, redeemPendingInvite } from '../features/friends/InvitePage';
import { GamesPage } from '../features/game/GamesPage';
import { LocalGamePage } from '../features/game/LocalGamePage';
import { OnlineGamePage } from '../features/game/OnlineGamePage';
import { NotificationStack } from '../features/notify/NotificationStack';
import { useGameNotifications } from '../features/notify/useGameNotifications';
import { usePushNotifications } from '../features/notify/push';
import { DesignPage } from '../features/appearance/DesignPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { FeedbackPage } from '../features/feedback/FeedbackPage';
import { PuzzlePage } from '../features/puzzles/PuzzlePage';
import { TrainingPage } from '../features/training/TrainingPage';
import { RandomPage } from '../features/random/RandomPage';
import { ModerationPage } from '../features/moderation/ModerationPage';
import { LegalFooter, LegalPage } from '../features/legal/LegalPage';
import { ErrorBoundary } from './ErrorBoundary';
import { HomePage } from './HomePage';
import { LicensesPage } from './LicensesPage';

const PLAN_LABEL: Record<string, string> = { free: 'Basis', plus: 'Plus', pro: 'Pro', family: 'Familie', club: 'Verein' };
const planLabel = (plan: string | undefined, source: string | undefined) => (source === 'beta' ? 'Beta' : PLAN_LABEL[plan ?? 'free']);

export function App() {
  const { session, entitlement, refresh } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { notices, dismiss, badge } = useGameNotifications(session?.user.id);
  usePushNotifications(session?.user.id, navigate);

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
          {session && <NavLink to="/training" className={({ isActive }) => (isActive || location.pathname === '/raetsel' ? 'active' : '')}>Training</NavLink>}
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
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/spielen" element={<LocalGamePage />} />
            <Route path="/anmelden" element={<LoginPage />} />
            <Route path="/freunde" element={<FriendsPage />} />
            <Route path="/partien" element={<GamesPage />} />
            <Route path="/design" element={<DesignPage />} />
            <Route path="/profil" element={<ProfilePage />} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/raetsel" element={<PuzzlePage />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/zufall" element={<RandomPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
            <Route path="/lizenzen" element={<LicensesPage />} />
            <Route path="/impressum" element={<LegalPage slug="impressum" />} />
            <Route path="/datenschutz" element={<LegalPage slug="datenschutz" />} />
            <Route path="/agb" element={<LegalPage slug="agb" />} />
            <Route path="/widerruf" element={<LegalPage slug="widerruf" />} />
            <Route path="/nutzungsbedingungen" element={<LegalPage slug="nutzungsbedingungen" />} />
            <Route path="/partie/:id" element={<OnlineGamePage />} />
            <Route path="/i/:code" element={<InvitePage />} />
            <Route path="*" element={<div className="panel"><h2>Seite nicht gefunden</h2><Link to="/">Zur Startseite</Link></div>} />
          </Routes>
        </ErrorBoundary>
      </main>
      <LegalFooter extra={session && <Link to="/feedback" state={{ from: location.pathname }} className="feedbacklink">Feedback geben</Link>} />
      {toast && <div className="toast" role="status">{toast}</div>}
      <NotificationStack notices={notices} dismiss={dismiss} />
    </div>
  );
}
