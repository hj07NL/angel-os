# Google Agenda koppelen: wat er nu is en de betere optie

## Nu gebouwd: geheim iCal-adres via de proxy
Werkt zoals Somtoday: Angel OS haalt de agenda op en toont de afspraken. Het adres staat versleuteld in je eigen Cloudflare-opslag (zie `worker/README.md`), niet in de repo.

**Beperking die je moet kennen:** Google ververst iCal-feeds traag. In de praktijk duurt het meestal enkele uren (soms tot ongeveer een dag) voordat een nieuwe of gewijzigde afspraak in de feed staat. Dat is Google's kant en niet te versnellen met vaker verversen in Angel OS. Verder: alleen-lezen, en iedereen met het geheime adres kan je agenda lezen (daarom bewaren we het versleuteld).

## Betere optie (nog niet gebouwd): OAuth + Google Calendar API
Wijzigingen zijn dan vrijwel direct zichtbaar en je hoeft geen geheim adres te delen; je kunt toegang altijd intrekken.

Stappen (door jou te doen, ±20 min):
1. Maak een project in Google Cloud Console (gratis; voor alleen-lezen agenda geen betaalaccount nodig).
2. Zet de *Google Calendar API* aan.
3. Stel het *OAuth-toestemmingsscherm* in (type Extern, status *Testing*, voeg jezelf toe als testgebruiker).
4. Maak een *OAuth-client-ID* (type webapplicatie) met als doorverwijsadres het adres van de Worker.
5. Zet client-ID en client-geheim als Worker-secrets (nooit in de repo).

Gevolgen:
- **Scope:** `https://www.googleapis.com/auth/calendar.readonly` (alleen lezen). Dat is een "gevoelige" scope.
- **Toestemmingsscherm:** zolang de app op *Testing* staat, verloopt de toestemming (refresh-token) na 7 dagen en moet je opnieuw inloggen; en je ziet een waarschuwing "niet geverifieerde app". Publiceren zonder die beperking vraagt een Google-verificatie (privacybeleid, domein), wat voor een persoonlijke app veel gedoe is.
- De Worker moet het refresh-token versleuteld bewaren (zelfde techniek als nu) en de agenda via de API ophalen.

Keuze aan jou: blijven bij iCal (simpel, trage updates) of OAuth laten bouwen (snel, maar wekelijks opnieuw inloggen zolang de app in *Testing* staat). Ik bouw OAuth pas als je kiest.
