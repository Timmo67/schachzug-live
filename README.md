# Schachzug Live

Online-Schach mit Freunden – mit Videochat direkt neben dem Brett. Web, iOS und Android aus einer Codebasis, Abo-Modell mit Freund-Einladung.

- **Für Claude Code:** zuerst `CLAUDE.md` lesen, dann `docs/ROADMAP.md`.
- Konzept: `docs/KONZEPT.md`
- Prototyp (Referenz): `prototype/schachzug-live.html`
- Datenbank-Entwurf: `supabase/migrations/0001_init.sql` (gegen Postgres 16 getestet)

Status: M0 fertig, M1 im Kern fertig (Login, Freunde, Einladung mit 30 Tagen Plus). Datenbank läuft bei Supabase (EU).

## Lokal starten
```
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests
npm run e2e        # Browser-Tests
```

## Damit der Login-Link funktioniert (einmalig im Supabase-Dashboard)
Authentication → URL Configuration: **Site URL** auf die Adresse der App setzen (lokal `http://localhost:5173`, später die echte Domain) und dieselbe Adresse unter **Redirect URLs** eintragen.
