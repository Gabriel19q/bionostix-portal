# Bionostix Germany B2B-Portal – Spezifikation MVP

Quelle: Spezifikations-Doc vom 06.11.2026. Bei Änderungen zuerst das Doc, dann diese Datei, dann den Code anpassen.

## Ziel
Schlankes Kundenportal unter **Bionostix Germany**. Geprüfte Großhändler und Importeure sehen nach Login aktuelle Herstellerbestände (Charge, Verfall, Menge, Preis) und stellen Anfragen. Erster Testkunde: Sanicura (EU-Großhandel), danach MENA-Importeure (Irak, Liberan). Testphase 4 Wochen.

Erfolg: ≥ 3 Anfragen von Sanicura über das Portal, Anfrage → Proforma < 1 Arbeitstag, Sanicura will weiter nutzen.

## Marktplatz-Modell (Entscheidungen 20.–23.11.2026, ersetzt das Händlermodell)
Das Portal wird ein **Marktplatz**: Verkäufer stellen eigene Angebote ein, der Kaufvertrag entsteht direkt zwischen Käufer und Verkäufer. Bionostix ist nicht Vertragspartei, verdient über **Provision der Verkäufer** und **Abo der Käufer**. Keine Zahlungsabwicklung zwischen Käufer und Verkäufer über das Portal. Sanicura und Bionostix bekommen eigene Verkäufer-Konten. Aufschläge und Kundengruppen entfallen: Der Käufer sieht den Preis des Verkäufers. Oberfläche nur **Englisch**.

### Bereiche
Pharmaceuticals, IVD, Food supplements, Health products.

### Registrierung und Freigabe
- Rollen pro Firma: „I want to buy“ und/oder „I want to sell“; Admin schaltet beides getrennt frei. Verkäufer wählen ihre Bereiche, Admin schaltet je Bereich frei (Nahrungsergänzung und Gesundheitsprodukte ohne besonderen Nachweis).
- Mehrere Standorte/Länder je Firma möglich, jeweils mit Nachweis; Admin prüft je Standort.
- Nachweise (Upload, Drag & Drop oder Dateiauswahl):
  - Alle: Handelsregisterauszug oder Gewerbeanmeldung, USt-IdNr.
  - Pharma: Verkäufer Großhandels- oder Herstellungserlaubnis (Pflicht), GDP-Zertifikat (freiwillig); Käufer Großhandelserlaubnis bzw. Importlizenz (Pflicht).
  - IVD: Verkäufer Häkchen „Händlerpflichten nach IVDR erfüllt“ (Pflicht), EUDAMED-SRN falls Hersteller/Importeur, ISO 13485 (freiwillig); Käufer außerhalb der EU Importlizenz für Medizinprodukte, falls vorhanden.
  - Nahrungsergänzung: Registrierung als Lebensmittelunternehmen (freiwillig).
  - Gesundheitsprodukte: keine zusätzlichen Nachweise.
  - (Vom Anwalt bzw. der Behörde zu bestätigen.)
- Verkäufer schreiben eine kurze anonyme Firmenbeschreibung (ohne Namen, Admin prüft).
- Zustimmung per Häkchen: Nutzungsbedingungen, Vertraulichkeit/Nichtumgehung (beide Rollen), Provisionsvereinbarung (nur Verkäufer). Gespeichert wird, wer wann welche Fassung angenommen hat; automatische E-Mail mit den vereinbarten Bedingungen als PDF. Neue Fassung → erneute Zustimmung beim nächsten Login.
- Newsletter: eigenes, freiwilliges, nicht vorausgewähltes Häkchen, Double-Opt-in (eigene Bestätigungs-E-Mail), Nachweis mit Zeitpunkt und Text, Abmeldung im Konto; Admin-Export der bestätigten Empfänger. Absatz in der Datenschutzerklärung.
- Vor der Freigabe nur „Pending approval“. Banner nach der Freigabe nur bei: Lizenz läuft ab/abgelaufen, fehlender Nachweis für einen Bereich. Kein Hinweis zum Ende des kostenlosen Zeitraums (Käufer hat mit Kreditkarte zugestimmt).

### Angebotsarten („Available for“, je Angebot eine oder beide)
1. **Supply** (zuerst umsetzen): Käufer kauft die Ware und verkauft sie weiter. Keine Aussage, ob das Produkt im Zielland registriert ist. Verbindliche Anfrage.
2. Später: **Registration & supply**: Verkäufer stellt die Unterlagen bereit, damit der Käufer das Produkt in seinem Markt registrieren lassen kann, und beliefert ihn danach. Unverbindliche Anfrage mit anonymem Austausch; Provision dafür separat im Provisionsvertrag.

### Angebote hochladen (Verkäufer)
- Eine Excel-Vorlage für alle Bereiche (Datei „Bionostix-Offer-Upload-Template.xlsx“, Stand 23.11.2026): Bereich in Spalte A, nicht benötigte Felder werden grau, fehlende Pflichtfelder gelb. Auswahllisten mit „Other“ plus Freifeld.
- Felder: Category, Your item no., Product name, Brand, Active ingredients with strength (mehrere mit „;“), Dosage form (Tablet, Effervescent tablet, Capsule, Powder, Effervescent powder, Solution for injection, Gummies, Lozenge, Drops, Spray, Cream, Other), IVD: Test/parameter, Method, CE marking, IVDR class, Sample type; Health products: Product type, Size/variant, Material; Units per pack + Unit; National code, MA holder, EAN; Packaging language; Quantity available; MOQ; Price per pack (EUR); Expiry (Datum, Monat/Jahr oder „min X months“); Incoterm + Ort; Lead time; Offer valid until; Buyers based in; Ship to (destination); neu: Registered in, Documents available on request (CoA, CPP, FSC, GMP certificate, Registration dossier, Stability data, Declaration of conformity/CE, ISO 13485, Certificate of origin, Other). Keine Charge, keine Kennzeichen Kühlware/Rx/BtM.
- Länderpreise: Blatt „Country prices“ (Artikelnummer, Land, Preis); Käufer sieht nur den Preis für sein Land, sonst den Standardpreis.
- Ablauf: Vorlage oder eigene Liste → automatische Spaltenzuordnung → Prüfansicht mit markierten Fehlern und Begründung → direkt korrigieren → bestätigen → im Katalog. Erste Uploads neuer Verkäufer prüft der Admin vor der Freischaltung.

### Länder
Je Angebot (Standard je Verkäufer): „Buyers based in“ (Sitz/Standort des Käufers) und „Ship to“ (Liefer- und Endmarkt), jeweils alle / nur / alle außer. Die Datenbank prüft beides; in der Anfrage gibt der Käufer verbindlich das Endbestimmungsland an (vorausgefüllt mit dem Lieferland). Länderlisten bleiben für Käufer unsichtbar; Käufer sehen nur Angebote, die sie kaufen dürfen. Firmen mit mehreren Standorten wählen im Katalog „Prices for: …“ aus ihren geprüften Standorten.

### Katalog
- Karten nach Vorbild Pipelinepharma: Überschrift Wirkstoffe, darunter Form, Stärke, Packungsgröße; Angaben zu Brand, Sprache, Haltbarkeit, Menge, MOQ, Preis für meinen Markt, Lieferbedingung, gültig bis, verfügbare Dokumente, Registered in; anonymer Verkäufer („Seller #123 · Verified by Bionostix“, Land und Firmenart, Kurzbeschreibung, typische Antwortzeit ab 3 Anfragen); Knopf „Send request“.
- Filter links (lange Listen mit Suchfeld): Bereich, Suche Produkt/Wirkstoff, Darreichungsform, Sprache der Packung, Restlaufzeit mindestens X Monate, Menge mindestens, Lieferbedingung. Nur Angebote, die in mein Land dürfen.
- Leere Suche: Suchtipps und Knopf zum Gesuch.

### Anfrage und Vertrag (Supply)
1. Käufer sendet zu einem Supply-Angebot eine **verbindliche** Anfrage (Menge, Lieferland, Endbestimmungsland, Lieferdeadline, Kommentar) und kreuzt nur die Dokumente an, die er wirklich braucht (Hinweis „Please select only documents you strictly need“); weitere Wünsche als Freitext. Bis zur Annahme kann er zurückziehen.
2. Verkäufer sieht nur einen Steckbrief: „Licence verified by Bionostix, valid until …“, Land, Firmenart, Lieferland, abgeschlossene Geschäfte, sowie den Hinweis, welche Daten er nach der Annahme erhält (Firmenname, Adresse, Lizenzdokumente).
3. Verkäufer: annehmen, ablehnen oder Gegenvorschlag (Menge/Preis; Käufer muss zustimmen). Bei Änderung von Menge oder Preis fragt ein Fenster, ob das Angebot im Katalog mit angepasst werden soll.
4. **Annahme = Vertrag**; Provision wird fällig. Verkäufer erhält die Käuferdaten und -lizenzen mit der Bitte, die Rechnung bzw. Auftragsbestätigung auf diese Adresse auszustellen.
5. Verkäufer lädt Rechnung/Auftragsbestätigung hoch → Käufer erhält sie über das Portal und erfährt damit den Verkäufer.
6. Käufer zahlt direkt an den Verkäufer; Verkäufer meldet „Payment received“.
7. Versand: Verkäufer lädt die angefragten Dokumente, Rechnung, Lieferschein, Sendungsnummer hoch → „Shipped“ → „Completed“.
Niemand kann eigene Angebote anfragen. Kommunikation über das Portal.

### Provision
Standardsatz in der Provisionsvereinbarung; abweichender Satz je Verkäufer (eigener Vertrag), optional je Bereich; der gültige Satz wird bei Annahme in der Bestellung gespeichert. Fällig **bei Annahme** (Zahlungsmoral des Käufers ist nicht Sache von Bionostix). Verkäufer sieht seinen Satz; Admin-Übersicht fälliger Provisionen je Verkäufer und Monat. Käufer sehen nirgends eine Provision.

### Abo für Käufer
9,99 € netto pro Monat (Entscheidung 23.11.2026; Preis bei Stripe änderbar), die ersten 3 Monate kostenlos, Kreditkarte bei der Anmeldung, automatische Verlängerung, monatlich kündbar zum Monatsende (auch im kostenlosen Zeitraum); nach dem kostenlosen Zeitraum wird ohne Kündigung automatisch abgebucht, ohne gesonderten Hinweis. Abwicklung über Stripe (Rechnungen, Reverse Charge für EU-Firmen mit USt-IdNr.). Verkäufer zahlen kein Abo; Firmen, die auch kaufen, brauchen es. Keine Zahlung per Überweisung (Entscheidung 23.11.2026).

### Menü
„For buyers“: Catalog, My requests (Suche, Statusfilter, Archived), Sourcing requests. „For sellers“: My offers (+ Add offers), Incoming requests, Commissions. Wer nur kauft, sieht nur „For buyers“.

### Allgemein
Alle Uploads per Drag & Drop oder Dateiauswahl.

### Etappen Marktplatz
1. Registrierung mit Rollen, Bereichen, Standorten und Nachweisen; Verkäufer-Freigabe; Upload mit Prüfansicht.
2. Katalog neu, Anfrage → Annahme mit Anonymisierung, Offenlegung nach Annahme, Provisionsübersicht.
3. Dokumente je Schritt, Zahlung/Versand melden, Erinnerungen; Abo (Stripe); Newsletter-Double-Opt-in.
Jede Etappe zuerst als Vorschau (Pull Request), Freigabe durch die Inhaber.

### Vom Anwalt zu klären
Nutzungsbedingungen (Vertragsschluss, Bindung der Anfrage, Nichtumgehung mit angemessener Vertragsstrafe, Haftung für Endbestimmungsland, anwendbares Recht/Gerichtsstand), Provisionsvereinbarung (Vorlage folgt von Jan), Abo-Bedingungen, Datenschutz (Weitergabe der Käuferdaten nach Annahme, Newsletter), Nachweisliste je Bereich. § 52c-AMG-Registrierung ist beantragt.

---
**Bisheriges Händlermodell (gilt bis zur Umstellung, wird durch den Marktplatz abgelöst):**

## Umfang MVP
- Zugang beantragen (Konto + Firmendaten + Upload Großhandelserlaubnis/Importlizenz), Freigabe durch Admin
- Login nur für freigegebene Kunden; nicht freigegebene sehen „pending approval“
- Startseite nach dem Login (Overview, /portal): To-dos (Änderungen annehmen, Anzahlung fällig/überfällig, Lizenz läuft ab), offene Bestellungen, Empfehlungen (früher bestellte Produkte, die wieder verfügbar sind; sonst neueste Angebote). Katalog unter /portal/catalog, „My orders“ unter /portal/requests.
- Katalog (Spalten): Produkt (Stärke, Form, PZN), Wirkstoff, Packungsgröße, Hersteller, Verkäufer, Verfall, Preis/Packung, Verfügbar, MOQ, Incoterm (mit Stand der Bestandsabfrage). Charge nicht im Katalog, nur in Bestellung/Anfrage. COA-Wunsch schreibt der Kunde in den Kommentar der Bestellanfrage.
- Bestandspflege per Excel/CSV-Import mit Spaltenzuordnung und Vorschau
- Einkaufspreis + Aufschlag → Verkaufspreis automatisch (nur Admin sieht EK und Marge)
- Kundengruppen mit eigenem Standardaufschlag (z.B. EU Wholesale, Export MENA)
- Bestellanfrage über Warenkorb (verbindlich, siehe Bestellablauf), mit Lieferland (Auswahlliste), Lieferdeadline (Pflicht) und optionalem Mindest-MHD je Zeile ohne angegebenes MHD; Statusverlauf mit Datum und Uhrzeit, Dokumente (Proforma etc.) pro Anfrage
- E-Mails: neue Anfrage → Admins; Statusänderung → Kunde

## Ausrichtung (18.11.2026)
Bisherige Deals scheiterten an Preis, fehlender Bereitschaft der Hersteller und bestehenden Distributionsverträgen in den Zielmärkten. Schwerpunkt deshalb: EU-Überbestände und Kurzläufer, Ware für Märkte ohne Distributor, Beschaffung auf Anfrage. Dafür:
- **Märkte je Angebot** (`offers.market_mode` = all | only | except, `offers.market_countries`): Käufer aus ausgeschlossenen Ländern (Firmenland) sehen das Angebot nicht; Bestellungen mit ausgeschlossenem Lieferland lehnt die Datenbank ab. Schützt die Distributoren der Hersteller. Die Länderliste bleibt intern.
- **Angebot gültig bis** (`offers.valid_until`): danach unsichtbar und nicht bestellbar. Kunde sieht „Offer until …“, auch im Excel-Export.
- Katalogfilter „Short-dated only“ (Verfall < 12 Monate).
- **Sourcing-Anfragen („Gesuche“)** unter /portal/sourcing: Produkt, Details oder ganze Liste/Ausschreibung, Menge, Zielpreis, Termin, Lieferland. Status: Received → Searching → Offer available → Closed. Admin (/admin/sourcing) antwortet mit Nachricht an den Kunden, interne Notiz nur für Admins, E-Mail an den Kunden optional. Nicht verbindlich. Link aus dem Katalog („Can't find a product?“).

Nicht im MVP: Proforma-PDF-Erzeugung, kundenindividuelle Preise/Sichtbarkeit, Zahlungen/Rechnungen, Herstellerzugang, weitere Sprachen, Tender.

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
- Daten in der EU (Supabase Frankfurt). Hosting Pilot: Netlify (Seiten werden in den USA berechnet, gespeichert wird nichts dort). Keine Patientendaten.
- Rechtstexte (Impressum, Datenschutz, B2B-Nutzungsbedingungen) liefert der Anwalt.

## Offene Punkte (Stand 13.11.2026)
- **Bestätigter Preis vs. Katalogpreis (mit Gabriel klären):** „Update catalog“ setzt den neuen Einkaufspreis im Katalog; der Katalogpreis je Kundengruppe ergibt sich daraus mit Aufschlag. Wird in einer Bestellung ein anderer „Confirmed price“ von Hand eingetragen (z. B. 14 € statt 12,10 €), gilt er nur für diese Bestellung – der Kunde sieht im Katalog evtl. einen anderen (niedrigeren) Preis. Optionen: A) Warnung bei Abweichung vom Katalogpreis, B) Häkchen „Also use this price in the catalog“ (Aufschlag der Charge anpassen, gilt für alle Gruppen), C) beides. Hinweis: „Update catalog“ überschreibt von Hand eingetragene Preise dieser Bestellung.
- **Bestand bei Bestellung:** wird vorerst nicht automatisch reduziert (Entscheidung 13.11.2026); Pflege über „Update catalog“ oder Excel-Import.
- **Gesuche:** umgesetzt am 18.11.2026 (siehe Ausrichtung). Später evtl. Datei-Upload für Ausschreibungslisten.
- **Märkte je Angebot beim Excel-Import:** importierte Angebote gelten vorerst für alle Länder; Einschränkung im Angebot einzeln setzen.
- **Sicherheits- und Compliance-Prüfung** des Tech-Stacks (Supabase, Vercel, Claude): Gabriel.
- **AGB:** /terms ist Platzhalter, Anwalt liefert AGB und prüft den Text zur verbindlichen Bestellung.
- **Hosting:** Pilot läuft auf Netlify (kostenlos, Funktionen in US East, deshalb etwas langsamer). Bei Ausbau: Vercel Pro (fra1) oder Netlify Pro (Frankfurt).

## Technik
Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage; Frankfurt) · Netlify (Pilot; vorher Vercel fra1) · Resend (E-Mail) · Domain portal.bionostix-germany.de (DNS bei IONOS, CNAME portal → bionostix-portal.netlify.app).

## Etappen
1. Konten (GitHub, Supabase, Vercel, Resend)
2. Grundgerüst + Zugang: Startseite, Registrierung, Firmendaten + Upload, Login, Admin-Freigabe
3. Katalog + Preise: Hersteller, Produkte, Angebotspositionen, Kundengruppen, Import, Katalogansicht
4. Anfragen + Dokumente: Warenkorb, Statusverlauf, Uploads, E-Mails
5. Livegang: Rechtstexte, Domain, Testdaten löschen, Sanicura einladen
