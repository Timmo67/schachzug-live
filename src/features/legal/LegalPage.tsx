import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// DRAFTS ONLY. These pages show the structure the final texts need; the wording itself must come from
// the client (eRecht24 or a lawyer). Never fill in legal text here without the client's approval.

export type LegalSlug = 'impressum' | 'datenschutz' | 'agb' | 'widerruf' | 'nutzungsbedingungen';

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="placeholder">[{children}]</span>;
}

/** Operator of Knightcall until the Cypriot Ltd exists (data from the client, 16.10.2026). */
const OPERATOR = {
  name: 'Timmo Gräber – Softwarelösungen',
  person: 'Timmo Gräber',
  street: 'c/o Frameworks, Löffelstr. 22–24',
  city: '70597 Stuttgart',
  email: 'info@knightcall.app',
};

const PAGES: Record<LegalSlug, { title: string; body: ReactNode }> = {
  impressum: {
    title: 'Impressum',
    body: (
      <>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>{OPERATOR.name}<br />{OPERATOR.street}<br />{OPERATOR.city}</p>
        <h2>Kontakt</h2>
        <p>E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a><br />Telefon: <Placeholder>Telefonnummer oder zweiter schneller Kontaktweg</Placeholder></p>
        <h2>Umsatzsteuer-ID</h2>
        <p><Placeholder>USt-IdNr. gemäß § 27a UStG, falls vorhanden</Placeholder></p>
        <h2>Verantwortlich für den Inhalt</h2>
        <p>{OPERATOR.person}<br />{OPERATOR.street}<br />{OPERATOR.city}</p>
        <h2>Verbraucherstreitbeilegung</h2>
        <p><Placeholder>Hinweis zur Teilnahme an Streitbeilegungsverfahren (Text von eRecht24)</Placeholder></p>
      </>
    ),
  },
  datenschutz: {
    title: 'Datenschutzerklärung',
    body: (
      <>
        <p><Placeholder>Vollständiger Text aus dem eRecht24-Generator</Placeholder></p>
        <h2>Für den Generator: eingesetzte Dienste</h2>
        <p className="note">Diese Liste beschreibt, was die App technisch nutzt. Sie ersetzt keine Datenschutzerklärung.</p>
        <ul>
          <li>Hosting der Web-App: Cloudflare Pages (Cloudflare, Inc.)</li>
          <li>Datenbank, Anmeldung, Echtzeit-Daten, Profilbilder: Supabase (Region EU, Frankfurt)</li>
          <li>Videochat: direkte Verbindung zwischen den Geräten (WebRTC); bei Bedarf Weiterleitung über Cloudflare Realtime TURN. Video und Ton werden nicht gespeichert.</li>
          <li>Anmelde-E-Mails: Resend (Plus Five Five, Inc.; Versand aus der EU, Region Irland)</li>
          <li>Push-Nachrichten in den Apps: Firebase Cloud Messaging (Google, Android) und Apple Push Notification Service (iOS); gespeichert wird ein Geräte-Token pro angemeldetem Gerät.</li>
          <li>Kontakt-E-Mail info@knightcall.app: Weiterleitung über Cloudflare Email Routing</li>
          <li>Bei der Anmeldung gespeichert: Bestätigung „mindestens 18 Jahre“ und Zustimmung zu den Nutzungsbedingungen (jeweils mit Zeitpunkt), Einladungscode.</li>
          <li>Zahlungen: Stripe (geplant, Meilenstein 4)</li>
          <li>Schriften werden von unserer eigenen Domain geladen, nicht von Google.</li>
          <li>Gespeicherte Daten: E-Mail, Anzeigename, Profilbild (freiwillig), Freundschaften, Partien und Chat-Nachrichten, Video-Nutzungszeit (Gratis-Kontingent), Abo-Status, Design-Auswahl.</li>
          <li>Im Browser gespeichert: Anmeldung (Supabase), Einstellung „Ton bei Benachrichtigungen“, offene Einladung vor dem Login.</li>
        </ul>
      </>
    ),
  },
  nutzungsbedingungen: {
    title: 'Nutzungsbedingungen der Beta',
    body: (
      <>
        <p><Placeholder>Nutzungsbedingungen für die kostenlose Beta – Text von eRecht24 bzw. Anwalt</Placeholder></p>
        <h2>Für den Text: Eckpunkte der Beta</h2>
        <ul className="note">
          <li>Kostenlose Testphase, ohne Anspruch auf Verfügbarkeit; kann jederzeit geändert oder beendet werden.</li>
          <li>Teilnahme nur mit Einladung und ab 18 Jahren.</li>
          <li>Videochat nur zwischen den zwei Spielern einer Partie, die befreundet sind; Video wird nicht gespeichert.</li>
          <li>Verhaltensregeln (kein Missbrauch, keine Belästigung), Sperrung bei Verstößen.</li>
          <li>Beta-Tester erhalten zum Start der Bezahlversion 6 Monate Plus kostenlos (Bedingungen folgen).</li>
        </ul>
      </>
    ),
  },
  agb: {
    title: 'Allgemeine Geschäftsbedingungen',
    body: <p><Placeholder>AGB für Abonnements (Plus/Pro), Laufzeit, Kündigung, Testphase – Text von eRecht24 bzw. Anwalt</Placeholder></p>,
  },
  widerruf: {
    title: 'Widerrufsbelehrung',
    body: <p><Placeholder>Widerrufsbelehrung für digitale Dienstleistungen inkl. Muster-Widerrufsformular – Text von eRecht24 bzw. Anwalt</Placeholder></p>,
  },
};

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const page = PAGES[slug];
  return (
    <article className="panel legal" data-testid={`legal-${slug}`}>
      <p className="draft">Entwurf – der endgültige Text folgt.</p>
      <h1>{page.title}</h1>
      {page.body}
      <p className="note"><Link to="/">Zur Startseite</Link></p>
    </article>
  );
}

/** Footer with the legal links; the Impressum must be reachable from every page. */
export function LegalFooter({ extra }: { extra?: ReactNode }) {
  return (
    <footer className="legalfooter">
      {extra}
      <Link to="/impressum">Impressum</Link>
      <Link to="/datenschutz">Datenschutz</Link>
      <Link to="/agb">AGB</Link>
      <Link to="/widerruf">Widerruf</Link>
      <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link>
      <Link to="/lizenzen">Lizenzen</Link>
    </footer>
  );
}
