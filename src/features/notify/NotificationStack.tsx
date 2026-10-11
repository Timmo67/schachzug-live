import { useNavigate } from 'react-router-dom';
import type { Notice } from './useGameNotifications';
import './notify.css';

/** In-app notices at the top of the screen; tapping the action opens the game. */
export function NotificationStack({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  const navigate = useNavigate();
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div className="notice" key={n.id} data-testid="notice">
          <span>{n.title}</span>
          <div className="row">
            <button type="button" className="primary" onClick={() => { dismiss(n.id); navigate(`/partie/${n.gameId}`); }}>{n.action}</button>
            <button type="button" aria-label="Schließen" onClick={() => dismiss(n.id)}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
