import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { OPERATOR } from '../legal/LegalPage';

// Support page (App Store and Google Play need a support URL). Plain answers to the questions testers ask.
const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Wie komme ich in die Beta?',
    a: <>Knightcall ist gerade eine kostenlose, geschlossene Beta ab 18 Jahren. Du brauchst den Einladungslink eines Freundes, der schon dabei ist. Damit meldest du dich unter <Link to="/anmelden">Anmelden</Link> mit deiner E-Mail-Adresse an.</>,
  },
  {
    q: 'Wie melde ich mich an?',
    a: <>Gib deine E-Mail-Adresse ein. Du bekommst eine E-Mail mit einem Code, den du in der App eintippst. Ein Passwort gibt es nicht. Kommt keine E-Mail, sieh bitte im Spam-Ordner nach.</>,
  },
  {
    q: 'Wie füge ich Freunde hinzu?',
    a: <>Unter <Link to="/freunde">Freunde</Link> teilst du deinen Einladungslink oder zeigst den QR-Code. Hat dein Freund schon ein Konto, kann er auch deinen Code eingeben. Danach könnt ihr euch zu Partien herausfordern.</>,
  },
  {
    q: 'Der Videochat startet nicht. Was kann ich tun?',
    a: <>Video gibt es nur zwischen Freunden in einer gemeinsamen Partie. Beide tippen auf „Video starten“ und erlauben Kamera und Mikrofon. Hast du das einmal abgelehnt: auf dem iPhone unter Einstellungen → Knightcall, auf Android unter Einstellungen → Apps → Knightcall → Berechtigungen wieder einschalten. Mit Kopfhörern gibt es kein Echo. Video und Ton werden nie gespeichert.</>,
  },
  {
    q: 'Ich bekomme keine Mitteilungen, wenn ich am Zug bin.',
    a: <>In der App: Erlaube Mitteilungen beim ersten Start oder später in den Einstellungen deines Handys unter Mitteilungen → Knightcall. Im Browser gibt es Hinweise, solange Knightcall geöffnet ist.</>,
  },
  {
    q: 'Wie wird meine Spielstärke berechnet?',
    a: <>Jede beendete Online-Partie zählt, sobald beide Seiten gezogen haben – gegen Freunde und Zufallsgegner. Alle starten mit 1200. Gewinnst du gegen Stärkere, steigt die Zahl mehr. Deine Spielstärke steht im <Link to="/profil">Profil</Link>.</>,
  },
  {
    q: 'Jemand verhält sich daneben. Was kann ich tun?',
    a: <>Nach einer Partie gegen einen Zufallsgegner kannst du ihn melden oder blockieren. Blockierte Spieler werden dir nie wieder zugeteilt und können dir keine Anfragen schicken. Die Blockierung hebst du im Profil wieder auf.</>,
  },
  {
    q: 'Wie lösche ich mein Konto?',
    a: <>Im <Link to="/profil">Profil</Link> ganz unten unter „Konto löschen“. Dein Profil, deine Freundschaften, Chat-Nachrichten und dein Profilbild werden sofort endgültig gelöscht.</>,
  },
];

export function HelpPage() {
  return (
    <div className="grid2">
      <section className="panel" data-testid="help">
        <h1>Hilfe</h1>
        {FAQ.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p className="note">{f.a}</p>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Kontakt</h2>
        <p className="note">Deine Frage ist nicht dabei oder etwas funktioniert nicht? Schreib uns an <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> – am besten mit Gerät und kurzer Beschreibung, was passiert ist.</p>
        <p className="note">Angemeldet geht es noch schneller über <Link to="/feedback" state={{ from: '/hilfe' }}>Feedback geben</Link>.</p>
      </section>
    </div>
  );
}
