# CLAUDE.md – Knightcall (Repo: schachzug-live)

Diese Datei ist die Arbeitsanweisung für Claude Code. Lies sie zu Beginn jeder Sitzung.

## Produkt in einem Satz
Produktname: **Knightcall** (früher Arbeitstitel „Schachzug Live“; Repo- und Projektnamen bleiben).
Online-Schach mit Freunden **mit eingebautem Videochat neben dem Brett**, als Abo-App für Web, iOS und Android aus einer Codebasis.

Ausführliches Konzept: `docs/KONZEPT.md`. Reihenfolge der Arbeit: `docs/ROADMAP.md`.
Der funktionierende Prototyp liegt in `prototype/schachzug-live.html` (Brett, Zuglogik, P2P-Video via PeerJS). Er ist Referenz für UI und Verhalten, nicht die Zielarchitektur.

## Sprache
- UI-Texte: Deutsch (Du-Form), später i18n-fähig (alle Texte über `src/i18n/de.ts`).
- Code, Bezeichner, Commits: Englisch.
- Gespräche mit dem Auftraggeber: Deutsch, kurz, ohne Fachjargon. Er ist kein Entwickler.

## Tech-Stack (festgelegt)
| Bereich | Wahl |
|---|---|
| Frontend | Vite + React 18 + TypeScript (strict) |
| Styling | CSS Modules oder plain CSS mit Design-Tokens (Farben/Fonts aus dem Prototyp übernehmen) |
| Schachregeln | `chess.js` (aktuelle 1.x, ESM) |
| Mobile | Capacitor (iOS + Android) – gleiche Web-App im WebView |
| Backend | Supabase, Region EU (Frankfurt): Auth, Postgres mit RLS, Realtime, Edge Functions (Deno) |
| Video | WebRTC direkt (kein PeerJS in Produktion), Signalisierung über Supabase Realtime Broadcast, TURN über Cloudflare Realtime TURN (Credentials kurzlebig per Edge Function) |
| Abos Web | Stripe Checkout + Billing + Customer Portal |
| Abos Apps | RevenueCat (Apple/Google In-App-Abos), Webhook → Supabase |
| Engine | Stockfish als WebAssembly im Web Worker (GPLv3: Quellcode-Hinweis + Lizenz im Repo und in der App) |
| Tests | Vitest (Unit), Playwright (E2E, zwei Browser-Kontexte für Partie + Video mit Fake-Media) |
| Analytics | PostHog EU (erst ab Meilenstein 5) |
| Routing | react-router-dom 6 |

Keine weiteren großen Abhängigkeiten ohne Rückfrage. Schlank bleiben.

## Projektstruktur (Ziel)
```
src/
  app/            Routing, Layout, Provider
  features/
    auth/         Login, Registrierung, Profil
    friends/      Freundesliste, Einladungen
    game/         Brett, Uhren, Partie-Sync
    video/        WebRTC, Geräteauswahl, TURN
    billing/      Abo-Status, Paywall, Checkout
  lib/            supabase client, chess helpers
  i18n/
supabase/
  migrations/     SQL, immer als Migration, nie per Hand im Dashboard
  functions/      Edge Functions
prototype/        Alter Prototyp (nicht ändern)
docs/
```

## Kernregeln
1. **Berechtigungen nur serverseitig.** Ob jemand Plus/Pro hat, entscheidet die Tabelle `entitlements` (geschrieben nur von Edge Functions/Webhooks mit Service-Role). Der Client liest nur.
2. **RLS auf jeder Tabelle.** Keine Tabelle ohne Policies. Nach jeder Migration Supabase-Advisors prüfen.
3. **Züge werden serverseitig validiert.** Ein Zug geht über eine Edge Function (oder Postgres-Funktion), die mit chess.js prüft, ob der Zug legal ist und der Spieler am Zug ist. Realtime verteilt nur das Ergebnis.
4. **Video nur zwischen bestätigten Freunden** oder Spielern derselben Partie. Kein Zufalls-Video mit Fremden. Minderjährigenschutz siehe Konzept.
5. **Video wird nie gespeichert** (bis Pro-Aufzeichnung explizit gebaut und vom Auftraggeber freigegeben wird).
6. **Keine Secrets im Client.** Stripe-Secret, RevenueCat-Secret, Cloudflare-TURN-Key nur in Edge-Function-Secrets. `.env.example` pflegen.
7. **Rechtliches:** Kündigungsbutton (§ 312k BGB) ohne Login erreichbar, Bestellbutton „zahlungspflichtig bestellen“, Testphase-Ende klar anzeigen. Texte nicht selbst erfinden – Platzhalter setzen und den Auftraggeber fragen.
8. **Mobile first.** Jede Ansicht muss bei 375 px Breite funktionieren, Brett immer vollständig sichtbar.

## Abo-Logik (Kurzfassung)
- Stufen: `free`, `plus`, `pro`, `family` (+ später `club`).
- Videochat ist in einer Partie freigeschaltet, wenn **mindestens einer** der beiden Spieler `plus` oder höher hat.
- Free: 10 Minuten Video pro Woche (serverseitig gezählt), 1 Analyse/Tag.
- Einladung: Eingeladener bekommt 30 Tage `plus` als Testphase **ohne Zahlungsdaten** (`entitlements.source = 'referral_trial'`). Schließt er ein bezahltes Abo ab, bekommt der Einladende 30 Tage gutgeschrieben (max. 12 pro Jahr).
- Preise stehen nicht im Code, sondern in Stripe/RevenueCat; der Client zeigt, was die APIs liefern.

## Arbeitsweise
- Arbeite meilensteinweise nach `docs/ROADMAP.md`. Pro Meilenstein: kurzer Plan → Umsetzung → Tests → kurze Zusammenfassung auf Deutsch für den Auftraggeber (was geht jetzt, was muss er tun).
- Kleine, beschreibende Commits. Ein Feature-Branch pro Meilenstein, PR mit Checkliste.
- Vor jedem Commit: `npm run lint && npm run typecheck && npm test`.
- Wenn ein Schritt ein Konto, Geld oder eine Entscheidung braucht (Supabase-Projekt, Stripe, Apple/Google, Domain, Rechtstexte): anhalten und den Auftraggeber in einfachen Worten fragen, mit genauer Anleitung was er tun muss.
- Lieber nachfragen als Annahmen über Preise, Namen, Rechtstexte treffen.

## Aktueller Stand (10.10.2026)
- **M0 erledigt:** Vite/React/TS-Gerüst, Design-Tokens, Brett (`src/features/game/Board.tsx`), Regeln (`chessRules.ts`, Vitest), lokale Partie `/spielen`, Playwright-E2E (desktop + mobil), ESLint, CI-Workflow.
- **M1 weitgehend erledigt:** Magic-Link-Login `/anmelden`, Profil + Gratis-Status per DB-Trigger, Freundesliste `/freunde` (Anfrage per Code, annehmen/ablehnen/entfernen), Einladungslink `/i/:code` mit 30 Tage Plus (RPC `redeem_invite`).
  Offen in M1: Apple-/Google-Login, Avatar, Geburtsjahr + Elternfreigabe, QR-Code, E2E-Test mit echtem Login (Supabase lokal per CLI).
- **Supabase-Projekt:** `schachzug-live`, Ref `jpdlxzpzeswkgsmderwh`, Region eu-central-1 (Free-Plan). Migrationen 0001–0009 sind eingespielt.
  Freundschaften ändern Clients nur über die RPCs `request_friend`, `respond_friend`, `redeem_invite` (Policies stehen auf `false`).
- **M2 Teil 1 erledigt:** Migration 0004 (`create_game`, `respond_game`, `game_action`; Spalten `base_ms`, `increment_ms`, `version`), Edge Function `make-move` (Logik in `supabase/functions/_shared/gameLogic.ts`, von Client und Funktion gemeinsam genutzt, Vitest), Realtime über `postgres_changes` auf `games`/`game_messages`. Seiten `/partien` (Herausforderungen, laufend, Archiv, PGN) und `/partie/:id` (Uhren, Aufgeben, Remis, Chat). Herausfordern aus `/freunde`.
  Clients schreiben `games` nie direkt (Insert-Policy `false`). Uhren laufen erst nach dem ersten Zug beider Seiten; Zeitüberschreitung meldet der Client per `game_action('claim_timeout')`, der Server prüft.
  Deploy der Funktion: Dateien `index.ts`, `deno.json`, `../_shared/gameLogic.ts`, `import_map_path` = `deno.json`.
- **M2 erledigt (Teil 2):** Drag & Drop im Brett (Tippen geht weiter), E2E `e2e/online.spec.ts`: komplette Partie zwischen zwei Browsern inkl. Reload, Chat und Server-Ablehnung falscher Züge, gegen lokales Supabase (`supabase/config.toml`, `.env.e2e`, CI-Job `e2e-online`).
  Lokal: `npx supabase start -x imgproxy,postgres-meta,supavisor,vector,logflare,mailpit,studio`, dann `E2E_ONLINE=1 npx playwright test --project=online`.
  Realtime: nach dem `system`-Event „postgres_changes ok“ wird neu geladen (sonst gehen Änderungen direkt nach dem Verbinden verloren), zusätzlich alle 20 s.
- **M3 Videochat (Kern) erledigt:** Migration 0005/0006 (`video_status`, `video_heartbeat`: 10 Gratis-Min./Woche pro Nutzer, unbegrenzt wenn ein Spieler Plus+; privater Broadcast-Kanal `video:<game id>` nur für die zwei Spieler per RLS auf `realtime.messages`), Edge Function `turn-credentials` (ICE-Server nur mit Video-Erlaubnis; Cloudflare TURN sobald Secrets `CLOUDFLARE_TURN_KEY_ID`/`CLOUDFLARE_TURN_API_TOKEN` gesetzt, sonst STUN). Client `src/features/video/` (Perfect Negotiation, Kamera/Mikro, Geräte, Qualität, Bild-im-Bild auf Mobil). E2E mit Fake-Kamera in `e2e/online.spec.ts`.
  Offen in M3: Cloudflare-TURN-Secrets (Auftraggeber legt Konto an).
  Hinweis: Das Kontingent ist serverseitig gezählt; da Media P2P läuft, kann ein manipulierter Client nach Ablauf weiter senden – TURN-Zugang ist aber gesperrt.
- **Hosting:** Cloudflare Pages (`schachzug-live.pages.dev`), baut automatisch aus `main`; Vorschau pro PR. Supabase Auth: Site URL + Redirect `https://schachzug-live.pages.dev/**`. Cloudflare-TURN-Secrets sind gesetzt.
- **Benachrichtigungen:** `src/features/notify/` – In-App-Hinweise mit Ton, Zähler an „Partien“ und im Tab-Titel, Browser-Notification bei Hintergrund-Tab (Erlaubnis auf `/partien`). Echte Push-Nachrichten folgen mit den Apps (M5).
- **Designs:** `/design`, Spalten `profiles.board_theme`/`piece_set` (Migration 0007, Trigger erzwingt Plus für Plus-Designs). Katalog in `src/features/appearance/designs.ts` (Test prüft Gleichstand mit SQL). Figuren-SVGs in `public/pieces/` nur mit kommerziell nutzbarer Lizenz (siehe `public/pieces/CREDITS.md`); GPL-/NC-Sätze von lichess NICHT verwenden.
- **Profil:** `/profil` (Name, Profilbild in Storage-Bucket `avatars` – Migration 0008, nur eigener Ordner `<uid>/`; Ton an/aus, Standard aus). QR-Code des Einladungslinks auf `/freunde` (Bibliothek `uqr`).
- **Rechtliches:** Entwürfe `/impressum`, `/datenschutz`, `/agb`, `/widerruf` mit Platzhaltern (`src/features/legal/LegalPage.tsx`), Footer auf jeder Seite. Endgültige Texte liefert der Auftraggeber (eRecht24). Schriften selbst gehostet (`public/fonts`, kein Google-Fonts-Aufruf).
- **E-Mail:** Supabase-Standard-SMTP sendet nur an Team-Mitglieder → Resend als eigenes SMTP nötig, bevor Fremde sich anmelden.
- **Geschlossene Beta (Migration 0009):** kostenlos, ab 18, Anmeldung nur mit Einladungscode (Trigger `handle_new_user` prüft Code, `adult_confirmed`, `terms_accepted` aus `user_metadata`). Jedes Beta-Konto: `entitlements` plan `plus`, source `beta`, `profiles.beta_tester = true` (Dankeschön zum Start: 6 Monate Plus). Admin-/Testkonten ohne Einladung über Einmal-Token in `beta_admin_tokens` (nur Service-Role). Geschützte Profilfelder per Trigger `protect_profile_flags`. Menü zeigt „Beta“. Seite `/nutzungsbedingungen` (Platzhalter).
  Beta beenden = neue Migration: Trigger wieder auf `free`, `source='beta'` → Einführungsangebot umstellen.
- Nächster Schritt: Domain + Resend (Auftraggeber), dann M4 Abos im Stripe-Testmodus (unsichtbar bis zur Freischaltung). Firma (UG) später.

## Befehle
```
npm run dev          # Web-App lokal
npm run test         # Vitest
npm run e2e          # Playwright (in Sandboxen: PW_CHROMIUM_PATH=<pfad zu chrome> setzen)
npm run typecheck
npm run lint
npx supabase start   # lokaler Supabase-Stack (Docker)
npx supabase db reset
npx cap sync         # Capacitor
```
