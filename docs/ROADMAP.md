# Roadmap – Schachzug Live

Jeder Meilenstein endet mit einer lauffähigen Version und einer kurzen deutschen Zusammenfassung für den Auftraggeber. Stunden = grobe Schätzung aus dem Konzept.

## M0 – Grundgerüst (ca. 15 h) – erledigt 10.10.2026
- Vite + React + TS, ESLint, Prettier, Vitest, Playwright
- Design-Tokens aus `prototype/schachzug-live.html` übernehmen (hell/dunkel)
- Supabase-CLI, lokaler Stack, `supabase/migrations/0001_init.sql` prüfen und anwenden
- GitHub Actions: lint, typecheck, test bei jedem PR
- **Fertig wenn:** `npm run dev` zeigt leere App-Shell, CI grün.
- **Auftraggeber muss:** Supabase-Projekt in Region Frankfurt anlegen (oder Claude legt es an, wenn Zugriff da ist) und URL + anon key geben.

## M1 – Konten & Freunde (ca. 60 h) – Kern erledigt (E-Mail-Login, Freunde, Einladung); offen: Apple/Google-Login, Avatar, Elternfreigabe, QR
- Registrierung/Login: E-Mail (Magic Link), Apple, Google
- Profil: Anzeigename, Avatar, Geburtsjahr (für Minderjährigen-Regeln)
- Freundesliste, Freundschaftsanfrage, persönlicher Einladungslink `/i/<code>` + QR-Code
- **Fertig wenn:** Zwei Testnutzer können sich anmelden und befreunden (E2E-Test).

## M2 – Online-Partie (ca. 120 h) – erledigt 10.10.2026
- Brett-Komponente (aus Prototyp portieren), Drag & Drop + Tippen, Umwandlung, Brett drehen
- Partie erstellen/annehmen, Bedenkzeit (3+2, 5+0, 10+0, 15+10, ohne Uhr)
- Zugvalidierung serverseitig (Edge Function `make-move`), Sync per Realtime
- Wiederverbinden nach Verbindungsabbruch, Aufgeben, Remis anbieten/annehmen
- Partiearchiv, PGN-Export, Text-Chat
- **Fertig wenn:** Komplette Partie mit Uhr zwischen zwei Browsern, inkl. Reload mitten in der Partie (E2E).

## M3 – Videochat (ca. 100 h)
- WebRTC 1:1 im Partie-Screen, Signalisierung über Realtime Broadcast (Kanal pro Partie)
- TURN-Credentials über Edge Function `turn-credentials` (Cloudflare)
- Kamera/Mikro an/aus, Gerätewahl, Bild-im-Bild auf Mobil, Verbindungsqualität-Anzeige
- Freischaltlogik: Video, wenn mind. ein Spieler Plus+; Free-Kontingent 10 Min./Woche
- **Fertig wenn:** E2E mit Fake-Kamera zeigt Video in beiden Kontexten; Kontingent greift.

## M4 – Abos & Einladungsbonus (ca. 90 h)
- Stripe: Produkte Plus/Pro (Monat/Jahr), Checkout, Customer Portal, Webhook → `entitlements`
- RevenueCat: Webhook → `entitlements`; App-Käufe und Web-Käufe ergeben einen Status
- 30-Tage-Testphase per Einladung (ohne Zahlungsdaten), Gutschrift für Einladenden
- Paywall-Screen, Erinnerung 3 Tage vor Testphase-Ende (E-Mail + Push)
- Öffentliche Seite `/kuendigen` (Kündigungsbutton ohne Login, § 312k BGB)
- **Fertig wenn:** Testkauf im Stripe-Testmodus schaltet Plus frei, Kündigung nimmt es zum Laufzeitende weg.
- **Auftraggeber muss:** Stripe-Konto, RevenueCat-Konto, Preise bestätigen, Rechtstexte liefern.

## M5 – Apps & Launch-Vorbereitung (ca. 70 h + Rest QA)
- Capacitor iOS/Android, Push-Benachrichtigungen (Zug, Einladung, Testphase)
- Kamera-/Mikro-Berechtigungen in Info.plist / AndroidManifest
- Store-Einträge, Screenshots, Datenschutz-Angaben (App Privacy / Data Safety)
- Melden/Blockieren, Elternfreigabe < 16
- PostHog EU, Fehlerüberwachung (Sentry)
- **Fertig wenn:** TestFlight- und Play-Internal-Test-Build laufen; geschlossene Beta mit 20–50 Personen.
- **Auftraggeber muss:** Apple Developer Program (99 €/Jahr) und Google Play Console (25 $) beantragen.

## Später (Ausbaustufe 2, ca. 400 h)
Analyse + Puzzles (Stockfish WASM) · KI-Coach · private Turniere · Gruppen-Video und Zuschauer (LiveKit) · Partie-Aufzeichnung mit Video · Vereins-/Trainermodus · Familienabo.
