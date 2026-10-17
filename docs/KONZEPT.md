# Konzept – Schachzug Live (Stand 09.10.2026)

Vollständiges Konzept mit Quellen, Kosten und Architekturbild (Claude Doc):
https://claude.ai/code/artifact/124b646a-a6a6-4b6b-a018-3b140256c65c

## Idee
Online-Schach mit Freunden, von Angesicht zu Angesicht: Videochat direkt neben dem Brett. Spielen ist gratis, Video ist das Abo-Merkmal. Wachstum über Einladungen von Freunden.

## Abo-Stufen (Preise inkl. MwSt., vom Auftraggeber noch zu bestätigen)
| Stufe | Preis | Inhalt |
|---|---|---|
| Basis (`free`) | 0 € | Unbegrenzt spielen, Freunde, Text-Chat, Archiv, 1 Analyse/Tag, 10 Min. Video/Woche |
| Plus (`plus`) | 4,99 €/Monat · 39,99 €/Jahr | Video unbegrenzt 1:1 (auch für Gegner ohne Abo), 5 Analysen/Tag, Puzzles, Designs |
| Pro (`pro`) | 8,99 €/Monat · 69,99 €/Jahr | + unbegrenzte Analyse, KI-Coach, Aufzeichnung, Gruppen-Video bis 4, private Turniere, Statistiken |
| Familie (`family`) | 12,99 €/Monat | Pro für bis zu 6 Konten |
| Verein (`club`) | auf Anfrage (Verein zahlt, Mitglieder bekommen Plus) | Mitgliederverwaltung, Vereinsturniere, Verein gegen Verein, Trainer-Modus – siehe „Vereine“ |

## Freund einladen
1. Persönlicher Link/QR-Code.
2. Eingeladener: 30 Tage Plus gratis, **ohne Zahlungsdaten**, danach automatisch zurück auf Basis.
3. Schließt er ein bezahltes Abo ab: Einladender bekommt 30 Tage gutgeschrieben (max. 12/Jahr).
4. Ohne Einladung: Store-Testphase 7–14 Tage über Einführungsangebot.
5. Erinnerung 3 Tage vor Ende der Testphase.

## Recht (DE/EU) – umzusetzen, Texte vom Auftraggeber/Anwalt
- Kündigungsbutton § 312k BGB, ohne Login direkt erreichbar (BGH I ZR 161/24, 22.05.2025).
- Bestellbutton „zahlungspflichtig bestellen“, Testphase-Ende und Folgepreis klar anzeigen.
- DSGVO: EU-Hosting, AV-Verträge, Video wird nicht gespeichert.
- Minderjährige: Video nur mit bestätigten Freunden; unter 16 Elterneinwilligung; Melden/Blockieren.
- In-App-Abos über Apple/Google (15 %); Web-Abos gelten auch in der App.

## Vereine (Idee des Auftraggebers, 17.10.2026)
Erweiterung von Knightcall, **keine eigene App**: Konten, Partien mit Uhr, Server-Prüfung der Züge, Spielstärke, Video, Push und Melden gibt es schon.
- **Verein:** Admin legt ihn an, lädt Mitglieder per Link/QR ein. Rollen: Admin, Turnierleiter, Mitglied. Vereinsseite mit Mitgliederliste und Spielstärken.
- **Vereinsturniere:** Regeln legt der Verein fest – Bedenkzeit, Rundenzahl, Startzeit, Anmeldeschluss, Modus (jeder gegen jeden oder Schweizer System), gewertet ja/nein, **Kamera Pflicht** ja/nein. Mitglieder melden sich an; Paarungen, Partiestart, Tabelle und Push („Runde 3 beginnt …“) macht der Server.
- **Verein gegen Verein:** Mannschaftskampf an 4–8 Brettern, jeder Verein stellt die Aufstellung, Brettpunkte werden addiert; später Online-Liga.
- **Alleinstellungsmerkmal:** Turniere mit Kamera neben dem Brett erschweren Betrug mit Engines – das bieten die großen Plattformen Vereinen so nicht.
- **Jugend:** Vereine haben viele Minderjährige, Knightcall ist derzeit ab 18. Dafür nötig: Elternfreigabe, Video nur innerhalb des eigenen Vereins, Verein trägt Verantwortung für seine Mitglieder. Rechtlich prüfen lassen (Anwalt), bevor es gebaut wird.
- **Wertung:** zunächst nur die eigene Spielstärke; offizielle DWZ/Elo nur nach Regeln des Schachbunds (später klären).
- **Preis:** Vereins-Abo, alle Mitglieder erhalten Plus; Preis legt der Auftraggeber fest. Guter Weg, viele Nutzer auf einmal zu gewinnen.
- Gruppen-Video (Zuschauer, Trainer mit mehreren Schülern) braucht später einen eigenen Video-Dienst (z. B. LiveKit); für Turniere reicht das 1:1-Video.

## Kosten (Schätzung)
- MVP ca. 630 h (≈ 47–76 T€ mit Freelancern); mit Claude Code deutlich weniger, Auftraggeber trägt Konten- und Fremdkosten.
- Betrieb Technik: ca. 60–110 €/Monat bei 1.000 Zahlern, ca. 630–780 € bei 10.000.
- Video P2P + Cloudflare TURN (0,05 $/GB, 1.000 GB/Monat frei) ist ~8× günstiger als LiveKit Cloud bei gleicher Nutzung.

## Zusatzfunktionen (Backlog, nach MVP)
Emotes im Video · Designs · Partie-Aufzeichnung als Clip · KI-Coach · Stockfish-Analyse · Gruppen-Video/Bughouse · private Turniere und Vereinsturniere (siehe „Vereine“) · Zuschauer-Modus · Statistiken · Trainer-Modus · Trainerstunden-Marktplatz · Fernschach mit Sprachnachrichten · Familienmodus · Brett-Erkennung per Kamera (später).
