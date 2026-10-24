# Angel OS

Persoonlijke startpagina en productiviteits-"OS" voor school (Chromebook en iPhone). Gebouwd als statische website: gewone HTML, CSS en JavaScript, zonder build-stap. Online via GitHub Pages: **https://hj07nl.github.io/angel-os/**

## Wat zit erin

| App | Wat het doet |
| --- | --- |
| **Startpagina** | Google-zoekbalk (ook URL's openen, suggesties waar mogelijk), Angel-commandobalk, bewerkbare snelkoppelingen (slepen, eigen icoon) en widgets (klok, weer, agenda, vandaag te doen, snel noteren, recent, favorieten, recent toegevoegd, website-waarschuwingen, suggesties, snelle notitie, productiviteit) — toevoegen, verwijderen, ordenen, grootte, indelingen. |
| **Agenda & taken** | Vandaag (automatische dagelijst: te laat, afspraken, voorbereiden, taken, herinneringen, deadlines), Dag/Week met tijdraster, Maand, Per vak, Afgerond, Rooster (iCal). Slepen om te verplaatsen, herordenen, swipen, doorschuiven zonder dubbele taken. |
| **Websitebibliotheek** | Geneste mappen (maken, hernoemen, verplaatsen, samenvoegen, verwijderen zonder websites kwijt te raken), tags, beoordeling, favorieten, status uit de websitecontrole, bulk verplaatsen, **Websites opnieuw indelen** met voorbeeld, goedkeuren, samenvatting en ongedaan maken. |
| **Angel** | App-brede assistent met één centrale tool-registry: taken, herinneringen, notities, websites zoeken/aanraden, mappen maken, opnieuw indelen, websitecontrole tonen, taken doorschuiven, snelkoppelingen, apps openen, weer. Vraagt bevestiging bij bulk-/verwijderacties en stelt een vraag bij twijfel. |
| **Notities** | Opmaak, afbeeldingen plakken (Ctrl+V), uploaden, foto maken op iPhone, slepen; grootte S/M/L, verwijderen; afbeeldingen in IndexedDB. |
| **PersonaX AI** | Openbaar profielonderzoek via Wikidata/Wikipedia/Wikimedia, met bronnen en betrouwbaarheid. |
| **Websitecontrole** | Resultaten van de maandelijkse controle + eerlijke uitleg wat wel en niet gecontroleerd is. |
| **Instellingen** | Uiterlijk, startpagina, meldingen (per soort, stille uren), privacy, weer & locatie, bibliotheek, taken, agenda's, Angel AI, pincode, gegevens & back-ups. |
| **Appbibliotheek** | Launchpad-stijl: verbergen, groepen, hernoemen, ordenen, eigen icoon, websites als app (in Angel OS of nieuw tabblad), kiezen wat in het dock staat. |
| **Dynamic Island** | Compact: tijd, volgende taak, focustimer, weer, meldingen. Uitgeklapt: timer starten/pauzeren/resetten, taken afvinken, snel noteren, Angel, meldingen, naar zoekbalk. Ctrl/⌘+. |

## Je gegevens

- Alles staat in de opslag van je eigen browser (`localStorage`, sleutels `angel-os:v2:*`; afbeeldingen in IndexedDB `angel-os-files`). Er is geen account of server.
- **Upgrade-bescherming:** bij het openen van een nieuwe versie maakt Angel OS eerst automatisch een back-up, migreert dan, en controleert dat alle websites (aantal, ID's en URL's) exact gelijk zijn gebleven. Lukt dat niet, dan wordt alles teruggezet en krijg je een melding. Back-ups vind je onder Instellingen → Gegevens.
- Synchroniseren tussen Chromebook en iPhone gaat via **Back-up exporteren/importeren** (een eigen account/database bestaat in deze versie niet).
- De oorspronkelijke 70 websites staan in `data/websites.js`.

## Maandelijkse websitecontrole (GitHub Actions)

`.github/workflows/health-check.yml` draait `tools/health-check.mjs` elke 1e van de maand (en handmatig via **Actions → Maandelijkse websitecontrole → Run workflow**). Het script:

- controleert DNS, serverantwoord, doorverwijzingen (elke stap opnieuw gevalideerd), HTTPS/certificaat-vervaldatum, verlopen domein (RDAP waar mogelijk), geparkeerde domeinen, verdachte doorverwijzingen en grote paginawijzigingen;
- weigert localhost, privé-netwerken, link-local/metadata-adressen en afwijkende poorten (SSRF-bescherming) en zet de verbinding vast op het gecontroleerde IP;
- werkt in kleine batches met time-outs, een herhaalpoging en pauzes;
- schrijft `data/health/latest.json`, `data/health/history/JJJJ-MM.json` en `data/health/index.json`, die de site automatisch inleest.

Eerlijk: HTTPS bewijst niet dat een site betrouwbaar is. Er wordt **geen** malwarescan of reputatiecheck gedaan; het rapport zegt dat ook. Zelf toegevoegde websites worden meegenomen als je `data/check-list.json` in de repo zet (te downloaden via Instellingen → Gegevens).

## Angel AI (optioneel)

Standaard gebruikt Angel ingebouwde regels (gratis). Bij Instellingen → Angel AI kun je een eigen API-sleutel van Anthropic of OpenAI invullen. De sleutel staat alleen in je browser, gaat rechtstreeks naar de aanbieder en zit niet in back-ups. Faalt de AI, dan valt Angel terug op de regels en meldt dat.

## Structuur

```
index.html, manifest.webmanifest, icon.svg
css/style.css               designsysteem (licht/donker, glas, weerachtergronden)
data/websites.js            de 70 oorspronkelijke websites
js/i18n.js                  vertalingen (Nederlands)
js/core.js                  opslag, migratie + back-up, datalaag, meldingen, activiteit
js/idb.js                   afbeeldingen (IndexedDB)
js/parser.js                taal → taak/herinnering/afspraak (NL + EN)
js/folders.js               mappen, indelen, opnieuw indelen, ongedaan maken
js/weather.js               Open-Meteo
js/tools.js                 Angel tool-registry + optionele AI
js/shell.js                 router, dock, appbibliotheek, eiland, spotlight, achtergrondtaken
js/apps/*.js                de apps
tools/health-check.mjs      maandelijkse controle (Node 20)
.github/workflows/health-check.yml
```
