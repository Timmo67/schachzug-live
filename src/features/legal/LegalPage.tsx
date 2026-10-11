import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// DRAFTS ONLY. These pages show the structure the final texts need; the wording itself must come from
// the client (eRecht24 or a lawyer). Never fill in legal text here without the client's approval.

export type LegalSlug = 'impressum' | 'datenschutz' | 'agb' | 'widerruf';

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="placeholder">[{children}]</span>;
}

const PAGES: Record<LegalSlug, { title: string; body: ReactNode }> = {
  impressum: {
    title: 'Impressum',
    body: (
      <>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p><Placeholder>Name des Anbieters bzw. Firma inkl. Rechtsform</Placeholder><br />
          <Placeholder>Straße, Hausnummer</Placeholder><br /><Placeholder>PLZ, Ort</Placeholder></p>
        <p>Vertreten durch: <Placeholder>Geschäftsführer/in</Placeholder></p>
        <h2>Kontakt</h2>
        <p>E-Mail: <Placeholder>Kontakt-E-Mail</Placeholder><br />Telefon: <Placeholder>Telefonnummer</Placeholder></p>
        <h2>Registereintrag</h2>
        <p><Placeholder>Registergericht und Registernummer, falls vorhanden</Placeholder></p>
        <h2>Umsatzsteuer-ID</h2>
        <p><Placeholder>USt-IdNr. gemäß § 27a UStG, falls vorhanden</Placeholder></p>
        <h2>Verantwortlich für den Inhalt</h2>
        <p><Placeholder>Name und Anschrift gemäß § 18 Abs. 2 MStV</Placeholder></p>
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
          <li>Anmelde-E-Mails: Resend (geplant)</li>
          <li>Zahlungen: Stripe (geplant, Meilenstein 4)</li>
          <li>Schriften werden von unserer eigenen Domain geladen, nicht von Google.</li>
          <li>Gespeicherte Daten: E-Mail, Anzeigename, Profilbild (freiwillig), Freundschaften, Partien und Chat-Nachrichten, Video-Nutzungszeit (Gratis-Kontingent), Abo-Status, Design-Auswahl.</li>
          <li>Im Browser gespeichert: Anmeldung (Supabase), Einstellung „Ton bei Benachrichtigungen“, offene Einladung vor dem Login.</li>
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
export function LegalFooter() {
  return (
    <footer className="legalfooter">
      <Link to="/impressum">Impressum</Link>
      <Link to="/datenschutz">Datenschutz</Link>
      <Link to="/agb">AGB</Link>
      <Link to="/widerruf">Widerruf</Link>
    </footer>
  );
}
