# CLAUDE.md – Bionostix Germany B2B-Portal

## Wer arbeitet hier
Die Inhaber (Gabriel, Jan) programmieren nicht. Claude Code schreibt den gesamten Code.
- Mit den Inhabern auf **Deutsch** und in einfachen Worten sprechen, ohne Fachjargon. Sagen, was sie im Browser testen sollen.
- Die Oberfläche des Portals ist **Englisch**.
- Anforderungen stehen in `SPEC.md`. Weicht eine Bitte davon ab: kurz nachfragen, dann SPEC.md mit anpassen.

## Stack
Next.js 15 (App Router, `src/`), TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Postgres-Migrationen in `supabase/migrations/`.

## Regeln
- **Sicherheit zuerst:** Basistabellen sind nur für Admins lesbar (RLS). Kunden lesen und schreiben ausschließlich über Funktionen (per `supabase.rpc(...)`). Marktplatz (seit 23.11.2026): lesen über `get_my_account`, `get_my_listings`, `get_newsletter_token`, `get_market_catalog`, `get_my_product_requests`, `get_my_request_matches`, `get_my_orders`, `get_my_order`; schreiben über `apply_for_access_v2`, `add_company_document_v2`, `claim_pending_application`, `confirm_newsletter`, `save_listings`, `end_listings`, `save_product_requests`, `close_product_requests`, `submit_order`, `withdraw_order`, `answer_counter_offer`, `respond_to_order`, `set_order_progress`, `add_order_document`. Die Funktionen des alten Händlermodells (`get_catalog`, `submit_request`, `customer_respond` usw.) sind noch in der Datenbank, werden aber nicht mehr benutzt. Provisionssätze sehen nur Verkäufer (eigener Satz), nie Käufer; Verkäufer-Angebote sind für Käufer anonym (Verkäufernummer statt Name) bis zur Rechnung; Käufer sind für Verkäufer anonym bis zur Annahme. Marktbeschränkungen je Angebot (Buyers based in, Ship to) prüft die Datenbank in `get_market_catalog` und `submit_order`; die Länderlisten nie an Kunden geben. Interne Notizen dürfen nie in einer Kundenfunktion oder Kunden-Seite auftauchen.
- Der Supabase-Linter meldet „Signed-In Users Can Execute SECURITY DEFINER Function“ für genau diese Funktionen: gewollt, jede prüft selbst, wer aufruft. Neue Funktionen nur mit derselben Sorgfalt (Aufrufer prüfen, `set search_path = public`, `revoke ... from anon`).
- Neue Sicherheitsregeln immer in `supabase/tests/security_test.sql` mit testen.
- Schemaänderungen nur als neue Migrationsdatei, nie bestehende Migrationen ändern, sobald sie live sind.
- Geheimnisse (Keys, Passwörter) nur in Umgebungsvariablen (`.env.local` lokal, live in Netlify unter Project configuration → Environment variables). Nie committen, nie in den Chat.
- Der Service-Role-Key (`SUPABASE_SERVICE_ROLE_KEY`) wird nur serverseitig benutzt (`src/lib/supabase/admin.ts`), nie im Browser; bisher nur, um E-Mail-Adressen der Gegenseite einer Bestellung nachzuschlagen. Ohne Key laufen diese E-Mails nicht, das Portal schon.
- Vor jedem Commit: `npm run build` und `npm run lint` müssen grün sein.
- Kleine, nachvollziehbare Commits mit deutscher oder englischer Beschreibung.
- Commit-Autor ist immer die Person, für die Claude gerade arbeitet (Gabriel: `Gabriel19q <353532907+Gabriel19q@users.noreply.github.com>`, Jan: sein eigenes GitHub-Konto). Nie unter dem Namen des anderen committen. Das Repository ist öffentlich, Netlify baut deshalb Änderungen von beiden automatisch.
- Das Repository ist öffentlich: keine Geheimnisse, keine echten Kundendaten, Preislisten oder Verträge ins Repository legen.
- Hosting (seit 18.11.2026): **Netlify**, Projekt `bionostix-portal`, baut automatisch bei jedem Push auf `main`; Pull Requests bekommen eine Vorschau (`deploy-preview-<nr>--bionostix-portal.netlify.app`). Vercel läuft vorübergehend als Reserve mit. Funktionen laufen in US East (kostenloser Tarif), deshalb pro Seite möglichst wenige Datenbankabfragen nacheinander (`getSession` ist pro Anfrage gecacht).
- Datenbankänderungen, die Funktionen ersetzen (`drop function`), fragt der Supabase-Connector beim Inhaber ab: vorher ankündigen, dass er bestätigen muss. Erst die Migration einspielen, dann den Code pushen.

## Zu zweit arbeiten (Gabriel und Jan, seit 19.11.2026)
- Vor dem Start immer `git pull`, damit die Änderungen des anderen da sind.
- Kurz absprechen, wer woran arbeitet; nicht beide gleichzeitig an derselben Seite.
- Datenbankänderungen (neue Migration) nur nacheinander: vor dem Einspielen prüfen, ob die letzte Migration in `supabase/migrations/` auch live ist (Supabase-Connector `list_migrations`). Neue Migrationsdateien mit Datum und fortlaufender Nummer benennen.
- **Netlify-Credits sparen:** Der kostenlose Tarif hat 300 Credits pro Monat, jede erfolgreiche Live-Veröffentlichung (Push auf `main`) kostet 15. Sind sie aufgebraucht, ist das Portal bis Monatsende offline. Deshalb Änderungen auf einem Branch sammeln und als Pull Request mit Vorschau bauen; erst gebündelt auf `main` übernehmen, wenn der Inhaber es freigibt. Kleine Korrekturen nicht einzeln pushen. Commits, die nur Dokumentation ändern (CLAUDE.md, SPEC.md, README.md), mit `[skip netlify]` in der Commit-Nachricht pushen, dann baut Netlify nicht neu. Bei Zweifel den Inhaber bitten, unter Netlify „Usage & billing“ den Stand zu prüfen.
- Nach jedem Push auf `main`: Inhaber bitten, in Netlify unter „Versions“ zu prüfen, dass die neue Version „Live“ ist.
- Größere oder riskante Änderungen (Login, Preise, Sicherheitsfunktionen) als Pull Request anlegen; der andere Inhaber schaut die Vorschau an, dann übernehmen.

## Wichtige Befehle
- `npm run dev` – lokal starten
- `npm run build` – Produktionsbuild prüfen
- `npm run lint` – Codeprüfung
- `npm test` – alle Tests: Datenbank-Sicherheit (lokales Postgres), Excel-Parser, Upload-Maske
- Die Arbeitsumgebung von Claude kann Supabase/Netlify/Vercel nicht direkt per HTTP erreichen: Datenbank über den Supabase-Connector. Für Netlify gibt es keinen Connector: den Inhaber bitten, unter „Versions“ zu prüfen, ob die neue Version „Live“ ist (Vercel-Reserve über den Vercel-Connector).
