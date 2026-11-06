# CLAUDE.md – Bionostix Germany B2B-Portal

## Wer arbeitet hier
Die Inhaber (Gabriel, Jan) programmieren nicht. Claude Code schreibt den gesamten Code.
- Mit den Inhabern auf **Deutsch** und in einfachen Worten sprechen, ohne Fachjargon. Sagen, was sie im Browser testen sollen.
- Die Oberfläche des Portals ist **Englisch**.
- Anforderungen stehen in `SPEC.md`. Weicht eine Bitte davon ab: kurz nachfragen, dann SPEC.md mit anpassen.

## Stack
Next.js 15 (App Router, `src/`), TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Postgres-Migrationen in `supabase/migrations/`.

## Regeln
- **Sicherheit zuerst:** Basistabellen sind nur für Admins lesbar (RLS). Kunden lesen ausschließlich über die Views `customer_catalog`, `my_company`, `my_requests`, `my_request_items`, `my_documents`, `my_request_history` und schreiben über RPC-Funktionen (`apply_for_access`, `submit_request`, `customer_respond`, `add_company_document`). Einkaufspreise, Margen und interne Notizen dürfen nie in einer Kunden-View oder Kunden-Seite auftauchen.
- Schemaänderungen nur als neue Migrationsdatei, nie bestehende Migrationen ändern, sobald sie live sind.
- Geheimnisse (Keys, Passwörter) nur in Umgebungsvariablen (`.env.local` lokal, Vercel-Einstellungen live). Nie committen, nie in den Chat.
- Der Service-Role-Key wird nur serverseitig benutzt (`src/lib/supabase/admin.ts`), nie im Browser.
- Vor jedem Commit: `npm run build` und `npm run lint` müssen grün sein.
- Kleine, nachvollziehbare Commits mit deutscher oder englischer Beschreibung.

## Wichtige Befehle
- `npm run dev` – lokal starten
- `npm run build` – Produktionsbuild prüfen
- `npm run lint` – Codeprüfung
- `bash scripts/test-db.sh` – Migrationen gegen lokales Postgres mit Supabase-Stubs testen
