# Bionostix Germany B2B-Portal – Spezifikation MVP

Quelle: Spezifikations-Doc vom 06.11.2026. Bei Änderungen zuerst das Doc, dann diese Datei, dann den Code anpassen.

## Ziel
Schlankes Kundenportal unter **Bionostix Germany**. Geprüfte Großhändler und Importeure sehen nach Login aktuelle Herstellerbestände (Charge, Verfall, Menge, Preis) und stellen Anfragen. Erster Testkunde: Sanicura (EU-Großhandel), danach MENA-Importeure (Irak, Liberan). Testphase 4 Wochen.

Erfolg: ≥ 3 Anfragen von Sanicura über das Portal, Anfrage → Proforma < 1 Arbeitstag, Sanicura will weiter nutzen.

## Umfang MVP
- Zugang beantragen (Konto + Firmendaten + Upload Großhandelserlaubnis/Importlizenz), Freigabe durch Admin
- Login nur für freigegebene Kunden; nicht freigegebene sehen „pending approval“
- Katalog (Spalten): Produkt (Stärke, Form, PZN), Wirkstoff, Packungsgröße, Hersteller, Verkäufer, Verfall, Preis/Packung, Verfügbar, MOQ, Incoterm (mit Stand der Bestandsabfrage). Charge nicht im Katalog, nur in Bestellung/Anfrage. COA-Wunsch per Häkchen je Zeile in der Bestellanfrage.
- Bestandspflege per Excel/CSV-Import mit Spaltenzuordnung und Vorschau
- Einkaufspreis + Aufschlag → Verkaufspreis automatisch (nur Admin sieht EK und Marge)
- Kundengruppen mit eigenem Standardaufschlag (z.B. EU Wholesale, Export MENA)
- Bestellanfrage über Warenkorb (verbindlich, siehe Bestellablauf), mit Lieferland (Auswahlliste), Lieferdeadline (Pflicht) und optionalem Mindest-MHD je Zeile ohne angegebenes MHD; Statusverlauf mit Datum und Uhrzeit, Dokumente (Proforma etc.) pro Anfrage
- E-Mails: neue Anfrage → Admins; Statusänderung → Kunde

Nicht im MVP: Proforma-PDF-Erzeugung, Sourcing-Anfragen („Gesuche“, geplant als nächster Schritt), kundenindividuelle Preise/Sichtbarkeit, Zahlungen/Rechnungen, Herstellerzugang, weitere Sprachen, Tender.

UI-Sprache: **Englisch**. Währung: **EUR**.

## Rollen
- **admin** (Gabriel, Jan): alles.
- **customer**: sieht nur Katalog mit Verkaufspreisen seiner Kundengruppe, eigene Firma, eigene Anfragen und Dokumente. Nie Einkaufspreise, Margen, interne Notizen.
- Mehrere Logins pro Firma möglich (Admin ordnet zu).

## Freigabeprozess
1. Interessent registriert sich (E-Mail + Passwort), bestätigt E-Mail.
2. Füllt Firmendaten aus: Firma, Land, Adresse, Ansprechpartner, Telefon (Pflicht, internationales Format mit +Ländervorwahl), Kundentyp (EU wholesaler / importer).
3. Lädt Nachweis hoch (Großhandelserlaubnis bzw. Importlizenz, optional GDP-Zertifikat).
4. Admin prüft (EU: EudraGMDP, MENA manuell), setzt Kundengruppe, Prüfdatum, Ablaufdatum Nachweis → approved.
5. Erinnerung 30 Tage vor Ablauf; abgelaufener Nachweis blockiert neue Anfragen.

## Datenmodell (Kurzform)
companies, profiles, customer_groups, manufacturers, products, offers (= Angebotsposition: Charge, Verfall, Menge, EK, Aufschlag-Override, Incoterm, Stand), requests, request_items, request_item_costs (EK-Snapshot, nur Admin), request_status_history, documents.
Verkäufer (Vertragspartner) je Produkt: `products.seller` = bionostix_germany | sanicura | manufacturer, vorerst überall Sanicura (bis zur eigenen Großhandelserlaubnis). Kunde sieht ihn im Katalog. Eine Bestellung mit Produkten verschiedener Verkäufer wird beim Absenden automatisch in eine Anfrage je Verkäufer aufgeteilt (`requests.seller`), jede mit eigener PI.

## Preislogik
Verkaufspreis = round(EK × (1 + Aufschlag/100), 2). Aufschlag = Override der Angebotsposition, sonst Standardaufschlag der Kundengruppe. Preis wird beim Absenden der Anfrage gespeichert (Snapshot); endgültiger Preis wird im Angebot bestätigt.

## Anfrage-Status
new → in_review → proforma_sent (= Bestellbestätigung/Vertrag) → deposit_paid → ordered → shipped → completed.
Mit Änderungen: in_review → changes_proposed → (Kunde nimmt an) changes_accepted → proforma_sent. „Proforma sent“ direkt aus in_review nur, wenn Mengen und Preise exakt der Anfrage entsprechen. Für „Proforma sent“ müssen das PI-Dokument hochgeladen und die Zahlungsfrist eingetragen sein.
Abbrüche: declined (wir, nicht lieferbar), cancelled (Kunde; aus new/in_review/changes_proposed/changes_accepted, also nur vor der PI).
Kunde handelt bei: new (anlegen), Annahme der Änderungen (→ changes_accepted), cancelled. Alles andere Admin. Jede Änderung wird mit Zeitstempel (Sekunden) protokolliert.

## Bestellablauf (Feedback 11.11.2026)
1. Angezeigte Produkte sind ein freibleibendes Angebot.
2. Die Bestellanfrage des Kunden ist ein verbindliches Kaufangebot zu den angezeigten Bedingungen; Stornierung bis zum Erhalt der Bestellbestätigung möglich. Kunde bestätigt die AGB per Häkchen.
3. Wir klären Bestand und Preis beim Hersteller; der Hersteller reserviert die Ware unverbindlich (i. d. R. 3 Tage).
4. Bei Änderungen (Menge/Preis) muss der Kunde zuerst annehmen.
5. Die Proforma (PI) mit Anzahlung ist die Bestellbestätigung = Vertrag (nach unseren AGB). Zahlungsfrist auf der PI = Ende der Reservierung („Reserved until“, nur im Admin so benannt; Kunde sieht nur die Zahlungsfrist). Ohne Zahlung bis zur Frist wird die PI storniert: Das Portal markiert „Payment overdue“, Admins stornieren von Hand.
6. Nach Eingang der Anzahlung Bestellung beim Hersteller innerhalb der Reservierungsfrist.
AGB-Seite /terms ist ein Platzhalter, bis der Anwalt die AGB liefert.

## Compliance
- Produkte/Preise nur nach Login (Fachkreise, HWG). Öffentliche Seite: wer wir sind + „Request access“.
- Vertrag entsteht erst mit unserer Proforma (Bestellbestätigung), siehe Bestellablauf.
- BtM-Produkte: nur nach Einzelprüfung lieferbar (Hinweis unter dem Katalog; Admin sieht „BtM: check permits“). Entscheidung 12.11.2026: Kennzeichnungen Rx, Kühlware und BtM werden im Kundenkatalog nicht angezeigt; die Angaben bleiben intern am Produkt gespeichert.
- Daten in der EU (Supabase Frankfurt, Vercel fra1). Keine Patientendaten.
- Rechtstexte (Impressum, Datenschutz, B2B-Nutzungsbedingungen) liefert der Anwalt.

## Technik
Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage; Frankfurt) · Vercel (fra1) · Resend (E-Mail) · Domain portal.bionostix-germany.de (DNS bei IONOS, CNAME portal → Vercel).

## Etappen
1. Konten (GitHub, Supabase, Vercel, Resend)
2. Grundgerüst + Zugang: Startseite, Registrierung, Firmendaten + Upload, Login, Admin-Freigabe
3. Katalog + Preise: Hersteller, Produkte, Angebotspositionen, Kundengruppen, Import, Katalogansicht
4. Anfragen + Dokumente: Warenkorb, Statusverlauf, Uploads, E-Mails
5. Livegang: Rechtstexte, Domain, Testdaten löschen, Sanicura einladen
