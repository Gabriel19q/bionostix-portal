# Bionostix Germany B2B-Portal – Spezifikation MVP

Quelle: Spezifikations-Doc vom 06.11.2026. Bei Änderungen zuerst das Doc, dann diese Datei, dann den Code anpassen.

## Ziel
Schlankes Kundenportal unter **Bionostix Germany**. Geprüfte Großhändler und Importeure sehen nach Login aktuelle Herstellerbestände (Charge, Verfall, Menge, Preis) und stellen Anfragen. Erster Testkunde: Sanicura (EU-Großhandel), danach MENA-Importeure (Irak, Liberan). Testphase 4 Wochen.

Erfolg: ≥ 3 Anfragen von Sanicura über das Portal, Anfrage → Proforma < 1 Arbeitstag, Sanicura will weiter nutzen.

## Umfang MVP
- Zugang beantragen (Konto + Firmendaten + Upload Großhandelserlaubnis/Importlizenz), Freigabe durch Admin
- Login nur für freigegebene Kunden; nicht freigegebene sehen „pending approval“
- Katalog: Produkt, Hersteller, Charge, Verfall, verfügbare Menge, Mindestmenge, Verkaufspreis, Incoterm, Stand der Bestandsabfrage
- Bestandspflege per Excel/CSV-Import mit Spaltenzuordnung und Vorschau
- Einkaufspreis + Aufschlag → Verkaufspreis automatisch (nur Admin sieht EK und Marge)
- Kundengruppen mit eigenem Standardaufschlag (z.B. EU Wholesale, Export MENA)
- Anfrage über Warenkorb, Statusverlauf, Dokumente (Proforma etc.) pro Anfrage
- E-Mails: neue Anfrage → Admins; Statusänderung → Kunde

Nicht im MVP: verbindliche Bestellung, Proforma-PDF-Erzeugung, Sourcing-Anfragen, kundenindividuelle Preise/Sichtbarkeit, Zahlungen/Rechnungen, Herstellerzugang, weitere Sprachen, Tender.

UI-Sprache: **Englisch**. Währung: **EUR**.

## Rollen
- **admin** (Gabriel, Jan): alles.
- **customer**: sieht nur Katalog mit Verkaufspreisen seiner Kundengruppe, eigene Firma, eigene Anfragen und Dokumente. Nie Einkaufspreise, Margen, interne Notizen.
- Mehrere Logins pro Firma möglich (Admin ordnet zu).

## Freigabeprozess
1. Interessent registriert sich (E-Mail + Passwort), bestätigt E-Mail.
2. Füllt Firmendaten aus: Firma, Land, Adresse, Ansprechpartner, Telefon, Kundentyp (EU wholesaler / importer).
3. Lädt Nachweis hoch (Großhandelserlaubnis bzw. Importlizenz, optional GDP-Zertifikat).
4. Admin prüft (EU: EudraGMDP, MENA manuell), setzt Kundengruppe, Prüfdatum, Ablaufdatum Nachweis → approved.
5. Erinnerung 30 Tage vor Ablauf; abgelaufener Nachweis blockiert neue Anfragen.

## Datenmodell (Kurzform)
companies, profiles, customer_groups, manufacturers, products, offers (= Angebotsposition: Charge, Verfall, Menge, EK, Aufschlag-Override, Incoterm, Stand), requests, request_items, request_item_costs (EK-Snapshot, nur Admin), request_status_history, documents.
Feld `requests.seller`: bionostix_germany | sanicura | manufacturer (Rechtsmodell offen).

## Preislogik
Verkaufspreis = round(EK × (1 + Aufschlag/100), 2). Aufschlag = Override der Angebotsposition, sonst Standardaufschlag der Kundengruppe. Preis wird beim Absenden der Anfrage gespeichert (Snapshot); endgültiger Preis wird im Angebot bestätigt.

## Anfrage-Status
new → in_review → offer_sent → accepted → proforma_sent → paid → shipped → completed.
Abbrüche: declined (wir, nicht lieferbar; aus new/in_review), cancelled (Kunde; aus new/in_review/offer_sent).
Kunde handelt bei: new (anlegen), accepted/cancelled. Alles andere Admin. Jede Änderung wird protokolliert.

## Compliance
- Produkte/Preise nur nach Login (Fachkreise, HWG). Öffentliche Seite: wer wir sind + „Request access“.
- Portal schließt keinen Kaufvertrag; Vertrag erst mit Angebot/Proforma.
- BtM-Produkte: sichtbar, gekennzeichnet, nur nach Einzelprüfung lieferbar. Kühlware gekennzeichnet.
- Daten in der EU (Supabase Frankfurt, Vercel fra1). Keine Patientendaten.
- Rechtstexte (Impressum, Datenschutz, B2B-Nutzungsbedingungen) liefert der Anwalt.

## Technik
Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage; Frankfurt) · Vercel (fra1) · Resend (E-Mail) · Domain portal.bionostix.de.

## Etappen
1. Konten (GitHub, Supabase, Vercel, Resend)
2. Grundgerüst + Zugang: Startseite, Registrierung, Firmendaten + Upload, Login, Admin-Freigabe
3. Katalog + Preise: Hersteller, Produkte, Angebotspositionen, Kundengruppen, Import, Katalogansicht
4. Anfragen + Dokumente: Warenkorb, Statusverlauf, Uploads, E-Mails
5. Livegang: Rechtstexte, Domain, Testdaten löschen, Sanicura einladen
