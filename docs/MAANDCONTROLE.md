# Maandelijkse websitecontrole

GitHub Action `.github/workflows/health-check.yml` draait op de 1e van de maand (en handmatig via Actions → *Run workflow*). Het script `tools/health-check.mjs` controleert per site: online en HTTP-status, HTTPS en certificaat (en de verloopdatum), doorverwijzingsketen (HTTPS→HTTP of vreemd adres = verdacht), verlopen of geparkeerd domein (RDAP), beveiligingsheaders (HSTS, CSP, nosniff, frame-bescherming, Referrer-Policy) en optioneel Google Safe Browsing.

Het rapport staat in `data/health/latest.json`; Angel OS toont een statusbadge, een uitklapbaar rapport per site en een melding bij problemen. Er wordt **nooit iets verwijderd**; sites worden alleen gemarkeerd.

## Eigen websites meecontroleren
De Action ziet alleen wat in de repo staat (de startlijst). Websites die je zelf toevoegt staan in je browser. Download in Angel OS → Instellingen → Websitebibliotheek → *Lijst downloaden* het bestand `check-list.json` en zet het in `data/` in de repo. (Let op: dat maakt die adressen openbaar als de repo openbaar is.)

## Safe Browsing (optioneel)
1. Maak in Google Cloud Console een gratis API-sleutel voor de *Safe Browsing API*.
2. Repo → Settings → Secrets and variables → Actions → New secret: `SAFE_BROWSING_API_KEY`.
Zonder sleutel staat in het rapport dat er geen reputatiecheck is gedaan. Een schone uitslag is geen garantie.
