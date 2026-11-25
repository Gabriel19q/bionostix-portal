# Bionostix Germany – Partner Portal

B2B-Portal für lizenzierte Großhändler und Importeure. Anforderungen: `SPEC.md`. Arbeitsregeln für Claude Code: `CLAUDE.md`.

## Stand
- Etappe 2 (Zugang): Startseite, Registrierung, Firmendaten mit Lizenz-Upload, Login, Admin-Freigabe
- Etappe 4 (Anfragen): Warenkorb, Anfrage absenden, Statusverlauf, Angebot annehmen/stornieren, Dokumente je Anfrage, Admin-Bearbeitung mit Marge, E-Mails über Resend
- Etappe 3 (Katalog): Admin-Katalog mit Preisen je Kundengruppe, Batch bearbeiten, Excel/CSV-Import mit Vorschau, Kundenkatalog
- Ausrichtung 18.11.2026: Märkte je Angebot, „Offer valid until“, Kurzläufer-Filter, Sourcing-Anfragen
- Hosting: Netlify (portal.bionostix-germany.de), Datenbank: Supabase Frankfurt
- Datenbank für alle Etappen angelegt (`supabase/migrations/`), Tests: `npm test`

## Lokal starten (nur für Entwickler)
1. `.env.example` nach `.env.local` kopieren und Supabase-Werte eintragen
2. `npm install` und `npm run dev`

## Umgebungsvariablen (Netlify)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Datenbank
- `NEXT_PUBLIC_SITE_URL` – Basisadresse für Links in E-Mails (https://portal.bionostix-germany.de)
- `NEXT_PUBLIC_CONTACT_EMAIL` – Kontaktadresse, die Kunden im Portal sehen
- `ADMIN_NOTIFY_EMAILS` – wer bei neuen Anfragen/Anträgen eine E-Mail bekommt (Komma-getrennt)
- `EMAIL_FROM` – Absender (Standard: `Bionostix Germany Partner Portal <portal@bionostix-germany.de>`), Domain muss bei Resend verifiziert sein
- `EMAIL_REPLY_TO` – Antwortadresse (Standard: `info@bionostix-germany.de`)
- `SUPABASE_SERVICE_ROLE_KEY` – geheim, nur in Netlify eintragen (Supabase → Project Settings → API Keys → service_role). Nur für E-Mails an die jeweils andere Seite einer Bestellung; ohne Key werden diese E-Mails übersprungen.
- `RESEND_API_KEY` – geheim, nur in Netlify eintragen (als „Contains secret values“). Ohne Key werden keine E-Mails verschickt, das Portal läuft trotzdem.
