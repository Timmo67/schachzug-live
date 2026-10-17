# App Store – Entwurf für den Eintrag

Stand: 17.10.2026. Alles hier ist ein **Entwurf** und wird vom Auftraggeber geprüft, bevor es in App Store Connect eingetragen wird.
Bildschirmfotos: `store/screenshots/iphone` (6,9", 1320 × 2868) und `store/screenshots/ipad` (13", 2064 × 2752).
Neu erzeugen: lokales Supabase starten, dann `STORE_SHOTS=1 npx playwright test --project=store`.

## Grunddaten

| Feld | Wert |
|---|---|
| Name (max. 30) | Knightcall |
| Untertitel (max. 30) | Schach mit Freunden per Video |
| Bundle-ID | app.knightcall |
| Hauptkategorie | Spiele → Brettspiele |
| Zweitkategorie | Spiele → Strategie |
| Sprache | Deutsch |
| Support-URL | https://knightcall.app/hilfe |
| Marketing-URL | https://knightcall.app |
| Datenschutz-URL | https://knightcall.app/datenschutz (endgültiger Text nötig, bevor die App zur Prüfung geht) |
| Copyright | 2026 Timmo Gräber – Softwarelösungen (später: Name der Limited) |

## Werbetext (max. 170)

Spiel Schach mit deinen Freunden und sieh sie dabei im Video neben dem Brett – als wärt ihr am selben Tisch. Mit Analyse, Rätseln und persönlichem Training.

## Beschreibung

Knightcall bringt das Schachbrett und deine Freunde zusammen: Ihr spielt online gegeneinander und seht euch dabei im Videochat direkt neben dem Brett. Kein zweites Gerät, kein Extra-Anruf – einfach Partie starten, „Video starten“ tippen und losspielen.

SCHACH MIT FREUNDEN
• Freunde per Link oder QR-Code einladen
• Herausfordern mit Bedenkzeit von 3 Minuten bis ohne Uhr
• Chat in der Partie, Remis-Angebot, Revanche mit einem Tipp
• Mitteilungen, wenn du am Zug bist oder herausgefordert wirst

VIDEOCHAT NEBEN DEM BRETT
• Video und Ton laufen direkt zwischen euren Geräten
• Video wird nie gespeichert
• Video gibt es nur zwischen Freunden – nie mit Fremden

BESSER WERDEN
• Partieanalyse mit der Schach-Engine Stockfish: Genauigkeit, Bewertungskurve und jeder Zug mit Bewertung und Begründung auf Deutsch
• Über 2.500 Taktik-Rätsel passend zu deiner Stärke
• Persönliches Training mit Lektionen zu deinen typischen Fehlern
• Deine Spielstärke steigt mit jeder gewonnenen Partie

AUCH OHNE FREUNDE ONLINE
• Zufallsgegner mit ähnlicher Spielstärke – ohne Video, mit festen Chat-Sätzen
• Melden und Blockieren mit einem Tipp
• Auf einem Gerät zu zweit spielen

Brett und Figuren in verschiedenen Designs, heller und dunkler Modus, für iPhone und iPad.

## Stichwörter (max. 100 Zeichen, ohne Leerzeichen)

schach,chess,videochat,freunde,schachspiel,online,rätsel,taktik,analyse,brettspiel,elo,schachuhr

(96 Zeichen. „Knightcall“ und Wörter aus Name/Untertitel müssen nicht wiederholt werden.)

## Bildschirmfotos (Reihenfolge)

1. `1-partie` – laufende Partie mit Uhr, Spielstärke und Videochat
2. `2-analyse` – Analyse nach der Partie: Patzer erklärt, grüner Pfeil zeigt den besseren Zug
3. `3-raetsel` – Taktik-Rätsel
4. `4-freunde` – Freunde einladen und herausfordern

Offen: Ein echtes Foto mit laufendem Video (zwei Personen) wäre das stärkste erste Bild. Das geht nur mit echten Personen und deren Einverständnis – am besten macht der Auftraggeber zwei Bildschirmfotos auf seinem iPhone während einer Partie mit Video.

## App-Datenschutz („Nutzung von Daten“ in App Store Connect)

Tracking: **Nein** (keine Werbung, keine Analyse-Dienste, keine Weitergabe an Datenhändler).
Alle Daten sind **mit der Identität verknüpft** und dienen nur der **App-Funktionalität**.

| Datentyp (Apple) | Was bei uns | Zweck |
|---|---|---|
| Kontaktinformationen → E-Mail-Adresse | Anmeldung per E-Mail-Code | App-Funktionalität |
| Kontaktinformationen → Name | Anzeigename | App-Funktionalität |
| Nutzerinhalte → Fotos oder Videos | Profilbild (freiwillig) | App-Funktionalität |
| Nutzerinhalte → Spielinhalte | Partien, Rätsel-Ergebnisse, Analysen | App-Funktionalität |
| Nutzerinhalte → Andere Nutzerinhalte | Chat-Nachrichten, Feedback, Meldungen | App-Funktionalität |
| Nutzerinhalte → Kundensupport | Feedback-Formular | App-Funktionalität |
| Kennungen → Nutzer-ID | Konto-ID | App-Funktionalität |

Nicht erhoben: Standort, Kontakte, Zahlungsdaten (während der Beta), Browserverlauf, Diagnose-/Absturzdaten, Werbedaten.
Video und Ton gelten nicht als erhoben: Sie gehen direkt von Gerät zu Gerät (bei Bedarf über einen Weiterleitungsserver) und werden nicht gespeichert.
Muss zur Datenschutzerklärung und zu `ios/App/App/PrivacyInfo.xcprivacy` passen.

## Altersfreigabe

Antworten im Fragebogen: Nachrichten und Chat **ja**, nutzergenerierte Inhalte **ja**, Glücksspiel/Gewalt/Werbung **nein**.
Da die Beta nur ab 18 ist, schlage ich **18+** vor. Entscheidung beim Auftraggeber (13+ wäre wegen des Chats mit Fremden nur mit Zusatzschutz für Minderjährige möglich, siehe Konzept).

## Abgleich mit Apples Prüfregeln

| Regel | Stand |
|---|---|
| Konto in der App löschen (5.1.1) | ✅ Profil → Konto löschen |
| Nutzerinhalte: melden, blockieren, Kontakt (1.2) | ✅ Melden/Blockieren nach Zufallspartien, Fremde nur feste Chat-Sätze, Kontakt auf /hilfe |
| Nutzungsbedingungen bei der Anmeldung (1.2) | ⚠️ Häkchen vorhanden, **Text fehlt noch** (Platzhalter) |
| Datenschutzerklärung (5.1.1) | ⚠️ **Endgültiger Text fehlt** (eRecht24) |
| Begründung für Kamera/Mikrofon | ✅ in `Info.plist`, auf Deutsch |
| Datenschutz-Manifest | ✅ `PrivacyInfo.xcprivacy` |
| Verschlüsselung (Export) | ✅ `ITSAppUsesNonExemptEncryption = false` (nur HTTPS) |
| „Mit Apple anmelden“ (4.8) | ✅ nicht nötig, weil es keine Anmeldung über Google/Facebook gibt |
| Käufe in der App (3.1.1) | ✅ während der Beta kostenlos. Später muss Plus in der iPhone-App über Apple-Käufe laufen (RevenueCat), kein Link zu Stripe |
| Keine Beta-Versionen im App Store (2.2) | ⚠️ Vor der Veröffentlichung im App Store das Wort „Beta“ aus Menü und Texten nehmen. Für TestFlight ist es in Ordnung |
| Zugang für Apple-Prüfer (2.1) | ⚠️ **Offen, siehe unten** |
| iPad | ✅ läuft, Bildschirmfotos vorhanden |

### Zugang für Apple-Prüfer

Apple will für die Prüfung ein Testkonto. Bei uns gibt es nur Anmeldung per E-Mail-Code und nur mit Einladung – der Prüfer kann den Code nicht empfangen.
Vorschlag: ein festes Prüfer-Konto, das sich mit E-Mail **und Passwort** anmeldet (versteckter Weg auf der Anmeldeseite, nur für dieses eine Konto freigeschaltet). Wird gebaut, sobald es Richtung TestFlight für externe Tester oder App Store geht. Für interne Tester (Auftraggeber, bis zu 100 Personen im eigenen Team) ist keine Prüfung nötig.

### Hinweise für die Prüfung (Text für App Store Connect, Entwurf)

Knightcall ist eine Schach-App mit Videochat zwischen befreundeten Spielern. Für den Videochat braucht man zwei Konten, die befreundet sind; das Prüfer-Konto ist bereits mit einem zweiten Testkonto befreundet und hat eine laufende Partie. Video und Ton gehen direkt zwischen den Geräten (WebRTC) und werden nicht gespeichert. Gegen Zufallsgegner gibt es kein Video und nur vorgegebene Chat-Sätze; Spieler können gemeldet und blockiert werden.
