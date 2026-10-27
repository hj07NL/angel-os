# Angel OS: analyse en fasenplan

Status: fase 0 (alleen lezen, back-up, plan). De app is niet gewijzigd. Repo-commit bij het schrijven: `4908a33`.

## 1. Hoe de app nu in elkaar zit

**Stack.** Statische website zonder build-stap: gewone HTML, CSS en JavaScript (3.600 regels JS, 61 KB CSS), geen framework, geen npm-afhankelijkheden in de app. Eén extern lettertype (Google Fonts, Inter). Node 20 wordt alleen gebruikt door de maandelijkse websitecontrole.

**Waar het draait.** GitHub Pages op `https://hj07nl.github.io/angel-os/`. Er is **geen backend**, geen database, geen account. De enige serverkant is een GitHub Action (`.github/workflows/health-check.yml`) die elke 1e van de maand `tools/health-check.mjs` draait en de resultaten terug in `data/health/` commit.

**Structuur.**

```
index.html                  laadt alle scripts in vaste volgorde, geen modules
manifest.webmanifest        naam, kleuren, één SVG-icoon (geen PNG's)
css/style.css               designsysteem (licht/donker, glas, achtergronden)
data/websites.js            70 originele websites (seed bij eerste start)
data/health/*.json          maandelijks rapport van de websitecontrole
js/i18n.js                  vertalingen: alleen Nederlands ("nl")
js/core.js                  opslag, schema-migratie met back-up, datalaag, meldingen
js/idb.js                   afbeeldingen voor notities (IndexedDB "angel-os-files")
js/parser.js                tekst naar taak/herinnering/afspraak (NL + EN)
js/folders.js               mappen, indelen, opnieuw indelen, ongedaan maken
js/weather.js               Open-Meteo (geen sleutel nodig)
js/tools.js                 Angel: tool-registry + optionele AI
js/shell.js                 router (#/app), dock, appbibliotheek, "Dynamic Island", spotlight
js/apps/*.js                home, agenda, library, angel, notes, personax, system
```

**Waar data staat.** Alles in `localStorage` van de browser onder `angel-os:v2:*` (schema 3), afbeeldingen in IndexedDB. Sleutels: `websites`, `folders`, `notes`, `items` (taken/afspraken), `subjects`, `settings`, `rooster`, `calendars`, `shortcuts`, `widgets`, `launcher`, `px-*` (PersonaX), `folderHistory`, `notifications`, `activity`, `backups` (max. 3 automatische back-ups), `pinHash`. Gegevens staan dus **per browser**: Chromebook en iPhone hebben elk hun eigen kopie.

**Beveiliging van je data bij upgrades.** `core.js` maakt vóór elke schema-upgrade een back-up, migreert, controleert dat alle websites (aantal, id's, URL's) identiek zijn en draait anders alles terug. Dat mechanisme blijft de basis voor alle volgende fasen.

**Somtoday.** Er is geen Somtoday-specifieke code. De koppeling is een gewone iCal-link (Instellingen → Agenda's & rooster). De browser haalt die link zelf op met `fetch`, `parseICS` in `agenda.js` leest alleen `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, en de events worden in `localStorage` (`rooster`, `calendars`) bewaard. De link zelf staat dus in je browseropslag, niet in de repo. Nu: 1 agenda "Somtoday", 166 items (30 okt t/m 11 dec), laatst bijgewerkt 25 okt. Dat werkt kennelijk omdat de Somtoday-server ophalen vanuit een browser toestaat (dat is niet in onze handen). Wijzigt dat, dan valt de app terug op het importeren van een `.ics`-bestand. Dit blijft in alle fasen werken (zie testaanpak).

**Angel.** Eén centrale tool-registry in `tools.js`. Standaard een regelgebaseerde router (gratis, zonder internet). Optioneel een eigen API-sleutel (Anthropic of OpenAI) in Instellingen: de sleutel staat alleen in de browser, gaat rechtstreeks naar de aanbieder en wordt nooit geëxporteerd. Bij een fout valt Angel terug op de regels. Angel vraagt bevestiging bij bulk- en verwijderacties.

**Wat er nog niet is.** Geen service worker (dus niet offline-first, niet echt "installeerbaar" op alle platformen), geen PNG-iconen (iOS wil een PNG voor het beginschermicoon), geen Engelse vertaling (`dict = { nl }`), geen push, geen sync.

## 2. Bevindingen die invloed hebben op het plan

1. **"Subjects & grades" bestaat niet in deze repo.** Zoeken in alle 15 commits en in de browseropslag levert geen cijfers, alleen de vakkenlijst (10 vakken, aangepast ten opzichte van de 15 standaardvakken) en de weergave "Per vak". Er zijn ook 0 taken opgeslagen. Het onderdeel dat je wilt laten verdwijnen komt uit een eerdere versie of ander apparaat; die data is niet gevonden en dus niet geëxporteerd. Zie vraag 1.
2. **Gedeelde oorsprong op GitHub Pages.** Alles onder `hj07nl.github.io` deelt dezelfde `localStorage`-ruimte. Op die oorsprong draait ook een andere site (`/priv-/`, met een eigen service worker). Elk script op die oorsprong kan in theorie Angel OS-data lezen, inclusief je Somtoday-link. Voor fase 1 en 6 betekent dat: liefst een eigen oorsprong (eigen domein of aparte Pages-organisatie), of in elk geval geen scripts van derden op die oorsprong.
3. **De repo is openbaar.** Alles in `/backups` en `/docs` is dus voor iedereen leesbaar. In de back-up staan o.a. je naam, woonplaats (weerlocatie), notitie en lesrooster. Zie vraag 2.
4. **Geheimen.** In de repo staan nu geen sleutels of agenda-links. Wel staat in de git-geschiedenis een e-mailadres als commit-auteur. Dat kan ik niet veilig herschrijven zonder jouw akkoord (zie "Wat niet kan"), en het is niet door mij toegevoegd.
5. **Notificaties.** `Notification` wordt alleen aangeroepen terwijl de pagina geladen is (`shell.js` draait de meldingscontroles met `setInterval`). Gesloten app of afgesloten tabblad = geen melding.
6. **Het "eiland" is een stuk HTML/CSS in de pagina**, geen systeemfunctie.

## 3. Wat niet kan zoals je het wilt (en het alternatief)

**Echte Dynamic Island.** Alleen native iOS-apps kunnen Live Activities en het eiland gebruiken (ActivityKit, Xcode, App Store of TestFlight). Een website of PWA heeft daar geen toegang toe. *Alternatief:* de bestaande in-app pil verbeteren (animatie, meldingen, timer, taken) die zichtbaar is zolang Angel OS open staat, plus de Badging API (`navigator.setAppBadge`) op het beginscherm-icoon waar het platform dat ondersteunt. Op Chromebook bestaat geen equivalent, daar blijft het de in-app pil.

**Google in een iframe.** Google stuurt headers (`X-Frame-Options`/`frame-ancestors`) waardoor inbedden geblokkeerd wordt. Dat kan ik niet omzeilen en dat doe ik niet. *Alternatief:* zoeken opent Google in een nieuw tabblad (nu al zo); zoeksuggesties blijven werken; eventueel een eigen resultatenpagina via een zoek-API met sleutel (dan hoort die sleutel achter een kleine proxy en niet in de browser; limieten en voorwaarden moeten op dat moment gecontroleerd worden). Websites die inbedden wel toestaan blijven in de in-app viewer.

**Push op iOS zonder installeren.** Op iPhone werkt Web Push alleen voor een web-app die op het beginscherm is gezet (iOS 16.4 of nieuwer), nooit in een gewoon Safari-tabblad. Daarnaast heeft push **altijd een server** nodig die het bericht verstuurt; zonder backend kan niets een melding sturen als de app dicht is. *Alternatief:* PWA installeren (korte uitleg in-app), meldingen terwijl de app open is (nu), en pas met een lichte backend echte push bij gesloten app (fase 6, jouw keuze). Op Chromebook/Android-Chrome werkt push in de browser, maar ook daar is een server nodig.

**Sync zonder backend.** Twee apparaten kunnen niet automatisch dezelfde data delen als er niets tussen staat. *Alternatieven:* (a) handmatig exporteren/importeren (nu), (b) een gratis dienst als opslag (bijvoorbeeld Supabase, Firebase of een Cloudflare Worker met KV/D1), (c) een privé GitHub-repo als opslag via een token die je zelf in de app plakt (kan, maar traag, met conflictrisico, en het token staat in de browser). Aanbeveling: (b), met de huidige export als vangnet. De keuze volgt in fase 6.

**Git-geschiedenis opschonen.** Een commit-auteur herschrijven vereist `force push` en wijzigt alle commit-ID's. Dat doe ik niet zonder dat je het expliciet vraagt.

## 4. Fasenplan

Algemene werkwijze voor elke fase: eigen branch, commit per onderdeel, vóór elke datawijziging eerst `makeBackup` en een export in `/backups`, migratie schrijven die bestaande sleutels behoudt, **testen op een kopie van je echte back-up** in een schone browser (zoals bij fase 0), controleren dat Somtoday (166 items) en alle websites onveranderd zijn, daarna oplevering.

### Fase 1: fundament (i18n, PWA, design, instellingen)

- **Scope:** alle vaste teksten naar `i18n.js` (nu staat een groot deel van de teksten hardcoded in de apps) met NL en EN en een taalkeuze; webmanifest compleet; PNG-iconen (192/512/180, maskable); service worker met offline-schil; ontwerp opschonen (tokens, typografie, safe-areas, touch-doelen); instellingenpagina herordenen.
- **Risico's:** een service worker kan oude bestanden blijven serveren (versiebeheer van de cache nodig); iOS-gedrag van PWA's verschilt van Chrome; delen van de oorsprong met `/priv-/` (scope van de worker beperken tot `/angel-os/`); veel tekst aanraken kan Angel-parser/NL-regels breken.
- **Testaanpak:** Playwright op desktop-, tablet- en telefoonformaat; offline-test; schermlezer-/toetsenbordcheck; vergelijking van `localStorage` vóór/na (moet identiek zijn voor bestaande sleutels).
- **Nodig van jou:** welke talen naast NL en EN; geen eigen domein nodig, maar zeg of je er een wilt (zie bevinding 2); een iPhone en Chromebook om echt op te testen.

### Fase 2: agenda en taken

- **Scope:** Apple-achtige dag/week/maand, taken met herhaling, subtaken en prioriteit, snelle invoer, Somtoday-lessen naast eigen items; vakkenlijst gebruiken i.p.v. "Subjects & grades"; het onderdeel verdwijnt pas na jouw akkoord en na export.
- **Risico's:** Somtoday-import mag niet breken (bron buiten onze controle); tijdzone/zomertijd; items-schema wijzigt (migratie met behoud van `history`, `order`).
- **Testaanpak:** unit-tests voor `parseICS`, herhaling en tijdzones met jouw echte 166 rooster-items; dezelfde import vóór/na vergelijken; migratietest op de back-up.
- **Nodig van jou:** antwoord op vraag 1 (waar staan de cijfers); welke Somtoday-weergave je wilt (alleen lessen, ook toetsen/huiswerk als de feed dat levert).

### Fase 3: websitebibliotheek

- **Scope:** snelle zoek/filter, tags, mappen slepen, dubbele detectie, import/export, controleer-status zichtbaar.
- **Risico's:** 71 websites en 34 mappen mogen nooit verloren gaan (bestaande controle op aantal/id/URL blijft verplicht); favicon-diensten van derden lekken welke sites je gebruikt.
- **Testaanpak:** migratietest met controle op id's/URL's; prestatietest met 1.000 testwebsites; undo-test.
- **Nodig van jou:** of je favicons zonder Google-dienst wilt (dan lokale letter/icoon).

### Fase 4: homebrowser, zoeken, widgets, weer

- **Scope:** zoekbalk (zoeken in nieuw tabblad, suggesties, eigen bibliotheek eerst), widgets herordenen, weer met locatie op verzoek.
- **Risico's:** Google in iframe kan niet (zie sectie 3); suggestie-endpoint van Google is niet officieel gedocumenteerd en kan verdwijnen; locatie-toestemming op iOS.
- **Testaanpak:** offline/online; weer met nep-antwoorden en met echte Open-Meteo; widget-opslag voor/na.
- **Nodig van jou:** wil je een eigen zoekresultatenpagina (vereist sleutel/proxy) of is een nieuw tabblad goed genoeg.

### Fase 5: notities en Angel

- **Scope:** notities met mappen/tags en zoeken, afbeeldingen robuuster opslaan; Angel krijgt betere intentieherkenning, duidelijkere bevestigingen en geheugen binnen een gesprek.
- **Risico's:** AI-sleutel in de browser is zichtbaar voor elk script op de oorsprong; AI kan fouten maken, dus Angel doet niets destructiefs zonder bevestiging en zonder undo; prompts mogen geen persoonsgegevens meesturen die niet nodig zijn.
- **Testaanpak:** vaste testzinnen (NL en EN) tegen de regelrouter; AI-modus met nep-API; notitie-migratie op jouw echte notitie.
- **Nodig van jou:** of je een AI-sleutel wilt gebruiken (zelf aanmaken, ik zet hem nooit in de repo); kleine limiet instellen bij de aanbieder.

### Fase 6: sync en meldingen

- **Scope:** keuze backend (aanbeveling: gratis dienst met inloggen, versleuteling op het apparaat waar mogelijk), conflictoplossing, push-meldingen voor geïnstalleerde PWA's.
- **Risico's:** grootste fase en grootste risico op dataverlies of dubbele data; accounts en wachtwoorden horen bij jou, niet bij mij; iOS-push werkt alleen na installatie; kosten/limieten van de gekozen dienst.
- **Testaanpak:** twee browserprofielen tegelijk; offline wijzigen en samenvoegen; veel testruns met kunstmatige conflicten; geen wijziging zonder werkende "ongedaan maken" en export.
- **Nodig van jou:** akkoord op de backendkeuze; zelf een account aanmaken bij die dienst en de sleutels als omgevingsvariabelen/instelling invoeren (ik lever `.env.example` en uitleg, nooit de sleutels zelf); een iPhone voor de pushtest.

### Fase 7: Dynamic Island, easter eggs, extra features, polish

- **Scope:** de in-app pil verfijnen, Badging API, kleine verrassingen, toegankelijkheid, prestaties, documentatie.
- **Risico's:** het blijft een webpil, geen systeemfunctie (zie sectie 3); animatie-overbelasting op oudere Chromebooks.
- **Testaanpak:** prestaties op de zwakste apparaat dat je hebt; "minder beweging" respecteren; volledige regressietest van fasen 1 t/m 6.
- **Nodig van jou:** welke extra features echt belangrijk zijn; welke easter eggs je leuk vindt.

## 5. Vragen en keuzes

1. **Cijfers:** waar staat de data van "Subjects & grades" (ander apparaat, andere site, oudere versie)? Zonder die plek kan ik niets exporteren, alleen de vakkenlijst.
2. **Back-up in een openbare repo:** de geredigeerde back-up bevat je naam, woonplaats, notitie en lesrooster. Wil je die in deze (openbare) repo, of liever in een aparte privé-repo of alleen als bestand dat ik je geef? Standaard push ik niets totdat je kiest.
3. **Schrijftoegang:** deze sessie heeft de repo gelezen maar mag er niet naar schrijven. Geef toegang voor het pushen van een branch, of zet de meegeleverde bestanden zelf in de repo.
