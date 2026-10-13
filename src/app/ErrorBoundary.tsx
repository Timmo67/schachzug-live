import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Shows a friendly message instead of a blank screen when a page crashes. Remounted per route (key). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel" role="alert">
        <h2>Hier ist etwas schiefgegangen</h2>
        <p className="note">Lade die Seite neu. Wenn es wieder passiert, schreib uns kurz über „Feedback geben“ unten, was du gerade gemacht hast.</p>
        <div className="row">
          <button type="button" className="primary" onClick={() => window.location.reload()}>Neu laden</button>
          <a className="btn" href="/">Zur Startseite</a>
        </div>
      </div>
    );
  }
}
