# Bionostix Germany – Partner Portal

B2B-Portal für lizenzierte Großhändler und Importeure. Anforderungen: `SPEC.md`. Arbeitsregeln für Claude Code: `CLAUDE.md`.

## Stand
- Etappe 2 (Zugang): Startseite, Registrierung, Firmendaten mit Lizenz-Upload, Login, Admin-Freigabe
- Etappe 3 (Katalog): Admin-Katalog mit Preisen je Kundengruppe, Batch bearbeiten, Excel/CSV-Import mit Vorschau, Kundenkatalog
- Datenbank für alle Etappen angelegt (`supabase/migrations/`), Tests: `npm test`

## Lokal starten (nur für Entwickler)
1. `.env.example` nach `.env.local` kopieren und Supabase-Werte eintragen
2. `npm install` und `npm run dev`
