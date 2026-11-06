# Bionostix Germany – Partner Portal

B2B-Portal für lizenzierte Großhändler und Importeure. Anforderungen: `SPEC.md`. Arbeitsregeln für Claude Code: `CLAUDE.md`.

## Stand
- Etappe 2 (Zugang): Startseite, Registrierung, Firmendaten mit Lizenz-Upload, Login, Admin-Freigabe
- Datenbank für alle Etappen angelegt (`supabase/migrations/`), Sicherheitstests: `bash scripts/test-db.sh`

## Lokal starten (nur für Entwickler)
1. `.env.example` nach `.env.local` kopieren und Supabase-Werte eintragen
2. `npm install` und `npm run dev`
