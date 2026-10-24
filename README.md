# Angel OS

Een persoonlijke internet-desktop die drie Lovable-apps samenvoegt tot één site:

| Oorspronkelijke app | Waar het nu zit |
| --- | --- |
| **Angel OS** (`angel-web-launch.lovable.app/os`) | De basis: Home, Web Library, Ask Angel, Notities, Projecten, Instellingen, Quality Control, Task Manager, dock, app-bibliotheek en zoekbalk |
| **Focus** (`todo-list67.lovable.app`) | Samengevoegd met de agenda in **Agenda & taken**: Vandaag, Week, Maand, Vakken, Afgerond, Rooster, ANGEL-herkenning, swipen, pincode |
| **PersonaX AI** (`deep-profile.lovable.app`) | Eigen app **PersonaX AI** in het dock: onderzoek, geschiedenis, vergelijken, naast elkaar, updatecentrum |

Alle **70 websites** uit de oorspronkelijke Angel OS-bibliotheek zitten erin (`data/websites.js`), met categorie, tags, beschrijving en "wanneer gebruik je het".

## Gebruiken

Geen installatie of build nodig — het is gewone HTML, CSS en JavaScript.

- **Lokaal:** open `index.html` in je browser (dubbelklikken werkt).
- **Online via GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root. Let op: GitHub Pages voor een **privé**-repository vereist GitHub Pro; anders de repo eerst openbaar maken.

Sneltoets: **Ctrl/⌘ + K** opent de zoekbalk (apps, websites, notities, taken, PersonaX).

## Apps

- **Home** — begroeting, tellers, binnenkort, recent, favorieten en meest gebruikte websites.
- **Agenda & taken** — snel noteren in gewone taal (*"vrijdag toets wiskunde"*, *"morgen om 16:00 economie leren"*, `!` = hoge prioriteit). ANGEL herkent vak, type, datum, tijd en deadline. Week- en maandweergave met slepen naar een andere dag, overzicht per vak, afgeronde taken, rooster uit een Somtoday/Google iCal-link of `.ics`-bestand, onafgemaakte taken doorschuiven, focustimer van 25 minuten.
- **Web Library** — alle websites met categorieën, favorieten, recent, meest gebruikt, zoeken, raster/lijst, details, bewerken en toevoegen (met automatische categorie- en tag-suggestie).
- **Angel** — zoekt in je eigen websites, notities, projecten en taken en legt uit waarom iets past (lokaal, zonder externe AI).
- **Notities** — markdown-notities met automatisch opslaan, vastzetten, voorbeeld en downloaden.
- **Projecten** — je Lovable/GitHub-projecten met status.
- **PersonaX AI** — openbaar profielonderzoek op basis van Wikidata, Wikipedia, Wikimedia Commons en paginaweergaven: kernfeiten met betrouwbaarheidsscore, tijdlijn, carrière, opleiding, onderscheidingen, social media, fotogalerij, verbindingen, locaties, statistieken en bronnen. Onbekende velden blijven *Onbekend*; mensen zonder openbaar profiel worden niet onderzocht.
- **Instellingen** — thema (licht/donker/systeem), accentkleur, minder beweging, naam, agenda's, vakken, meldingen, pincode, swipe-gevoel, back-up exporteren/importeren.
- **Quality Control** en **Task Manager** — controles en overzicht van opslag, sessie en snelle acties.

## Gegevens en privacy

Alles wordt opgeslagen in de `localStorage` van je eigen browser (sleutels beginnen met `angel-os:v2:`). Er is geen account of server. Gebruik **Instellingen → Back-up exporteren** om je gegevens naar een ander apparaat mee te nemen.

## Verschillen met de originelen

De Lovable-versies draaiden op een eigen backend (Supabase-account, AI-functies). Deze versie draait volledig in de browser:

- Synchronisatie tussen apparaten gaat via back-up exporteren/importeren in plaats van een account.
- *Ask Angel*, het analyseren van nieuwe websites en ANGEL-herkenning werken met lokale regels in plaats van een AI-model.
- PersonaX gebruikt alleen openbare, gestructureerde bronnen (Wikimedia) en toont voor nieuws en video's zoeklinks in plaats van automatisch samengevatte artikelen.

## Structuur

```
index.html
css/style.css
data/websites.js        # de 70 websites
js/core.js              # opslag, hulpfuncties, iconen
js/parser.js            # ANGEL: herkenning van taken in gewone taal
js/shell.js             # dock, app-bibliotheek, zoekbalk, router, focustimer
js/apps/home.js
js/apps/agenda.js       # Agenda & taken (Focus)
js/apps/library.js
js/apps/angel.js
js/apps/notes.js        # Notities + Projecten
js/apps/personax.js     # PersonaX AI
js/apps/system.js       # Instellingen, Quality Control, Task Manager
```
