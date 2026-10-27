# Agenda-proxy (Cloudflare Worker)

Waarom: je browser mag een geheim Google-iCal-adres niet rechtstreeks ophalen (CORS), en het adres hoort niet in de repo of in de publieke code. Deze Worker bewaart het adres **versleuteld** en haalt de agenda voor je op. Gratis Cloudflare-account is genoeg (geen betaalkaart nodig).

## Eenmalig instellen (±10 minuten)
1. Maak een gratis account op cloudflare.com. Installeer Node 18+ en ga naar de map `worker/`.
2. `npx wrangler login`
3. `npx wrangler kv namespace create CAL` → kopieer het `id` naar `wrangler.toml` (bij `[[kv_namespaces]]`).
4. Controleer in `wrangler.toml` dat `ALLOWED_ORIGIN` het adres van je app is (standaard `https://hj07nl.github.io`).
5. Verzin een geheim van minstens 32 willekeurige tekens (bv. `openssl rand -base64 36`) en zet het: `npx wrangler secret put ENCRYPTION_SECRET`
6. `npx wrangler deploy` → je krijgt een adres als `https://angel-os-agenda.<jouw-naam>.workers.dev`.
7. In Angel OS: Instellingen → Agenda's → *Google Agenda via proxy*: vul het Worker-adres in, plak je geheime iCal-adres (Google Agenda → instellingen van de agenda → *Geheim adres in iCal-indeling*) en druk op Opslaan.

## Hoe het beveiligd is
- Het iCal-adres wordt met AES-256-GCM versleuteld. De sleutel wordt afgeleid van `ENCRYPTION_SECRET` (alleen in Cloudflare) **en** van jouw persoonlijke sleutel (alleen in jouw browser). Wie alleen de opslag ziet, ziet niets.
- Alleen `https://calendar.google.com` (instelbaar met `ALLOWED_HOSTS`) wordt opgehaald; redirects naar andere servers worden geblokkeerd.
- Alleen je eigen app (`ALLOWED_ORIGIN`) mag de Worker aanroepen.
- Foutmeldingen bevatten nooit het adres.

## Let op
- Je persoonlijke sleutel staat in je browser, bewust **niet** in de back-up-export (die gaat naar bestanden). Op een nieuw apparaat plak je dezelfde sleutel (Instellingen → Agenda's → *Sleutel kopiëren*) en voer je het Worker-adres in.
- Verlies je de sleutel, dan voer je het geheime adres gewoon opnieuw in.
- Lokaal testen: kopieer `.dev.vars.example` naar `.dev.vars` en run `npx wrangler dev`.
- Er is geen rate-limit ingebouwd; Cloudflare's gratis limiet (100.000 aanvragen per dag) is ruim genoeg.
