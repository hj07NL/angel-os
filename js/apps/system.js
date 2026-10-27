/* Instellingen, Websitecontrole, Kwaliteitscontrole, Taakbeheer + pincode-vergrendeling. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, store, t } = A;
  const ACCENTS = ['#f97316', '#0a84ff', '#30d158', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a'];
  const WALLS = { aurora: 'linear-gradient(135deg,#3b1f6b,#0f3a5c,#6b2c1f)', graphite: 'linear-gradient(135deg,#2a2d35,#1b1d22)', ocean: 'linear-gradient(135deg,#0b4f6c,#20bf55)', sunset: 'linear-gradient(135deg,#ff7e5f,#6a3093)' };
  async function sha256(text) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }

  // ---------- Pincode ----------
  function lockScreen() {
    const hash = store.get('pinHash', null); let unlocked = false; try { unlocked = sessionStorage.getItem('aos-unlocked') === '1'; } catch (e) {}
    if (!hash || unlocked || !(window.crypto && crypto.subtle)) return;
    const ov = A.html('<div class="overlay" style="z-index:100;align-items:center;background:rgba(5,6,10,.85)"><form class="modal" style="width:320px;text-align:center"><div class="angel-logo">' + icon('lock') + '</div><h2>Angel OS is vergrendeld</h2><input class="input" type="password" inputmode="numeric" autocomplete="off" placeholder="Pincode" style="text-align:center;font-size:22px;letter-spacing:.3em" aria-label="Pincode"><p class="muted" data-err style="min-height:20px;font-size:13px"></p><button class="btn btn-primary" style="width:100%">Ontgrendelen</button></form></div>');
    document.body.appendChild(ov); const inp = ov.querySelector('input'); setTimeout(() => inp.focus(), 50);
    ov.querySelector('form').onsubmit = async (e) => { e.preventDefault(); if ((await sha256(inp.value)) === hash) { try { sessionStorage.setItem('aos-unlocked', '1'); } catch (er) {} ov.remove(); } else { ov.querySelector('[data-err]').textContent = 'Onjuiste pincode'; inp.value = ''; } };
  }
  document.addEventListener('DOMContentLoaded', lockScreen);

  // ---------- Back-up ----------
  function exportAll() {
    const out = { app: 'angel-os', schema: A.SCHEMA, exported_at: new Date().toISOString(), data: A.snapshot() };
    if (out.data.settings && out.data.settings.ai) out.data.settings = Object.assign({}, out.data.settings, { ai: Object.assign({}, out.data.settings.ai, { apiKey: '' }) }); // sleutel nooit exporteren
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })); a.download = 'angel-os-backup-' + A.today() + '.json'; a.click();
    store.set('lastBackup', new Date().toISOString());
  }
  A.exportAll = exportAll;
  function exportCheckList() {
    const list = data.websites().map((s) => ({ name: s.name, url: s.url }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })); a.download = 'check-list.json'; a.click();
  }
  function importAll(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const j = JSON.parse(r.result); const d = j.data || j;
        if (Array.isArray(d)) {
          if (!(await A.confirmDialog(d.length + ' websites toevoegen aan je bibliotheek?', 'Importeren', 'Bestaande websites blijven staan; dubbele URL\'s worden overgeslagen.'))) return;
          const list = data.websites(); const urls = new Set(list.map((s) => A.normUrl(s.url))); const unc = A.folders.uncategorized(data.folders()); let n = 0;
          d.forEach((s) => { if (s && s.url && !urls.has(A.normUrl(s.url))) { list.push(Object.assign({ id: A.uid(), tags: [], use_count: 0, created_at: new Date().toISOString(), folder_id: unc.id }, s, { id: A.uid() })); urls.add(A.normUrl(s.url)); n++; } });
          data.saveWebsites(list); A.toast(n + ' websites geïmporteerd'); A.rerender(); return;
        }
        if (!(await A.confirmDialog('Back-up terugzetten?', 'Terugzetten', 'Er wordt eerst automatisch een back-up van je huidige gegevens gemaakt.'))) return;
        A.makeBackup('Voor terugzetten van back-up');
        Object.keys(d).forEach((k) => { if (A.BACKUP_KEYS.includes(k)) store.set(k, d[k]); });
        store.set('schema', j.schema || 2); location.reload();
      } catch (e) { A.toast('Kon bestand niet lezen: ' + e.message, null, 'err'); }
    };
    r.readAsText(file);
  }

  // ---------- Instellingen ----------
  const SECTIONS = [['uiterlijk', 'Uiterlijk', 'sun'], ['startpagina', 'Startpagina', 'home'], ['meldingen', 'Meldingen', 'bell'], ['privacy', 'Privacy', 'shield'], ['weer', 'Weer & locatie', 'cloud'], ['bibliotheek', 'Websitebibliotheek', 'library'], ['taken', 'Taken', 'check'], ['agendas', 'Agenda\'s & rooster', 'calendar'], ['ai', 'Angel AI', 'bot'], ['beveiliging', 'Pincode', 'lock'], ['gegevens', 'Gegevens', 'archive']];
  const row = (title, sub, ctrl) => '<div class="set-row"><div><b>' + title + '</b>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' + ctrl + '</div>';
  const tog = (key, on) => '<button class="toggle ' + (on ? 'on' : '') + '" data-tog="' + key + '" role="switch" aria-checked="' + !!on + '"></button>';
  const sel = (key, opts, cur) => '<select class="input" data-sel="' + key + '">' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
  function setPath(path, value) { const patch = {}; let o = patch; const ks = path.split('.'); ks.slice(0, -1).forEach((k) => { o = o[k] = {}; }); o[ks[ks.length - 1]] = value; return data.patchSettings(patch); }
  function getPath(s, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), s); }

  A.registerApp({
    id: 'settings', name: t('app.settings'), icon: 'settings', color: 'linear-gradient(160deg,#a1a1aa,#52525b)', keywords: 'settings instellingen thema meldingen privacy ai pincode',
    render(el, route) {
      const s = data.settings(); const cals = store.get('calendars', []); const hasPin = !!store.get('pinHash', null);
      const notifPerm = !('Notification' in window) ? 'niet ondersteund' : ({ granted: 'toegestaan', denied: 'geblokkeerd', default: 'nog niet gevraagd' })[Notification.permission];
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent); const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const wloc = A.weather.location();
      const swipe = Object.assign({}, A.DEFAULT_SWIPE, store.get('swipe', {}));
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="settings"><nav class="settings-nav">' + SECTIONS.map(([k, l, ic]) => '<button class="nav-item" data-jump="' + k + '">' + icon(ic) + '<span>' + l + '</span></button>').join('') + '</nav><div class="settings-main"><div class="narrow">' +

        '<section class="set-section" id="uiterlijk"><h3>Uiterlijk</h3><p>Thema, kleuren, achtergrond en animaties.</p><div class="set-group"><div class="theme-opts">' + [['light', 'Licht', 'sun'], ['dark', 'Donker', 'moon'], ['system', 'Systeem', 'monitor']].map(([k, l, ic]) => '<button class="theme-opt ' + (s.theme === k ? 'on' : '') + '" data-theme="' + k + '">' + icon(ic) + l + '</button>').join('') + '</div>' +
        row('Accentkleur', '', '<div class="swatches">' + ACCENTS.map((c) => '<button class="swatch ' + (s.accent === c ? 'on' : '') + '" data-accent="' + c + '" style="background:' + c + '" aria-label="Accentkleur ' + c + '"></button>').join('') + '</div>') +
        row('Achtergrond', 'Wordt vervangen door het weer als weerachtergrond aan staat', '<div class="wall-opts">' + Object.entries(WALLS).map(([k, g]) => '<button class="wall-opt ' + (s.wallpaper === k ? 'on' : '') + '" data-wall="' + k + '" style="background:' + g + '" aria-label="Achtergrond ' + k + '"></button>').join('') + '</div>') +
        row('Weerachtergrond', 'Past de achtergrond aan het actuele weer aan (alleen met echte weerdata)', tog('weatherBg', s.weatherBg)) +
        row('Glaseffect', '', sel('glass', [['low', 'Subtiel'], ['normal', 'Normaal'], ['high', 'Sterk']], s.glass)) +
        row('Animaties', 'Systeem volgt de instelling ‘Minder beweging’ van je apparaat', sel('motion', [['system', 'Systeem'], ['full', 'Alle animaties'], ['reduced', 'Minder beweging']], s.motion)) +
        row('Jouw naam', 'Voor de begroeting', '<input class="input" data-name value="' + esc(s.name) + '" placeholder="Naam">') +
        row('Tijdzone', 'Voor klok, agenda en meldingen', sel('timezone', [['Europe/Amsterdam', 'Europe/Amsterdam'], ['Europe/London', 'Europe/London'], ['Europe/Berlin', 'Europe/Berlin'], ['America/New_York', 'America/New_York'], ['Asia/Tokyo', 'Asia/Tokyo'], ['UTC', 'UTC']].concat(['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'UTC'].includes(s.timezone) ? [] : [[s.timezone, s.timezone]]), s.timezone)) + '</div></section>' +

        '<section class="set-section" id="startpagina"><h3>Startpagina</h3><p>Widgets en snelkoppelingen pas je direct op de startpagina aan (sleep om te ordenen).</p><div class="set-group">' +
        row('Standaardindeling', 'Vervangt de huidige widgets', sel('homeLayout', [['balanced', 'Gebalanceerd'], ['focus', 'Focus'], ['minimal', 'Minimaal']], s.homeLayout)) +
        row('Widgets en snelkoppelingen', A.homeWidgets.list().length + ' widgets · ' + data.shortcuts().length + ' snelkoppelingen', '<button class="btn btn-sm" data-go-home>Aanpassen</button>') +
        row('Appbibliotheek en dock', 'Verbergen, groeperen, hernoemen en eigen websites toevoegen', '<button class="btn btn-sm" data-launcher>Bewerken</button>') + '</div></section>' +

        '<section class="set-section" id="meldingen"><h3>Meldingen</h3><p>Meldingen verschijnen altijd in het meldingencentrum (🔔 in het eiland). Browsermeldingen zijn optioneel.</p><div class="set-group">' +
        ['task_reminders', 'overdue', 'daily_summary', 'site_availability', 'site_security', 'recommendations', 'weather', 'weekly', 'monthly'].map((k) => row(t('notif.' + k), '', tog('notifications.' + k, s.notifications[k]))).join('') + '</div><div class="set-group">' +
        row('Stille uren', 'Geen browsermeldingen of herinneringen in deze periode', tog('quietEnabled', s.quietEnabled)) +
        row('Van – tot', '', '<span style="display:flex;gap:6px"><input class="input" type="time" data-time="quietStart" value="' + esc(s.quietStart) + '"><input class="input" type="time" data-time="quietEnd" value="' + esc(s.quietEnd) + '"></span>') +
        row('Frequentie', 'Bij ‘Weinig’ krijg je maximaal één aanbeveling per dag', sel('notifFrequency', [['normal', 'Normaal'], ['low', 'Weinig']], s.notifFrequency)) +
        row('Tijd dagplanning', 'Wanneer de dagelijkse samenvatting verschijnt', '<input class="input" type="time" data-time="summaryTime" value="' + esc(s.summaryTime) + '">') +
        row('Browsermeldingen', 'Status: ' + notifPerm + '. Werkt alleen terwijl Angel OS open is (er is geen pushserver).', tog('browserPush', s.browserPush)) + '</div>' +
        (isIOS ? '<p class="faint" style="font-size:13px">iPhone: browsermeldingen werken alleen als je Angel OS via Deel → ‘Zet op beginscherm’ installeert (iOS 16.4 of nieuwer) en toestemming geeft. ' + (standalone ? 'Je gebruikt de geïnstalleerde versie.' : 'Je gebruikt nu de browser, dus meldingen blijven in-app.') + '</p>' : '') + '</section>' +

        '<section class="set-section" id="privacy"><h3>Privacy</h3><p>Angel kijkt alleen naar wat je binnen Angel OS doet (geopende websites, zoekopdrachten hier, bekeken mappen). Niets daarbuiten, en alles blijft in deze browser.</p><div class="set-group">' +
        row('Activiteit bijhouden', store.get('activity', []).length + ' gebeurtenissen opgeslagen', tog('privacy.tracking', s.privacy.tracking)) +
        row('Aanbevelingen op basis van gebruik', '', tog('privacy.recommendations', s.privacy.recommendations)) +
        row('Activiteitsgeschiedenis wissen', '', '<button class="btn btn-sm btn-danger" data-clear-activity>Wissen</button>') +
        row('Locatie', wloc ? 'Nu: ' + esc(wloc.name) + ' (afgerond op ±1 km)' : 'Niet ingesteld', '<button class="btn btn-sm" data-clear-loc' + (wloc ? '' : ' disabled') + '>Locatie vergeten</button>') + '</div></section>' +

        '<section class="set-section" id="weer"><h3>Weer & locatie</h3><p>Weerdata komt van Open-Meteo. Je locatie wordt alleen gevraagd als je daarop klikt.</p><div class="set-group">' +
        row('Locatie', wloc ? esc(wloc.name) : 'Geen', '<span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-gps>' + icon('mapPin') + 'Mijn locatie</button><button class="btn btn-sm" data-city>Stad kiezen</button></span>') + '</div></section>' +

        '<section class="set-section" id="bibliotheek"><h3>Websitebibliotheek</h3><div class="set-group">' +
        row('Standaard sorteren', '', sel('library.sort', [['manual', 'Standaard'], ['name', 'Naam'], ['added', 'Nieuwst'], ['used', 'Meest gebruikt'], ['rating', 'Beoordeling']], s.library.sort)) +
        row('Automatisch indelen', 'Nieuwe websites krijgen meteen een map en tags', tog('library.autoCategorize', s.library.autoCategorize)) +
        row('Dubbelen voorkomen', 'Waarschuw bij een URL die al bestaat', tog('library.duplicateDetect', s.library.duplicateDetect)) +
        row('Eigen websites meecontroleren', 'De maandcontrole draait op GitHub en ziet alleen wat in de repo staat. Download de lijst van websites die je zelf toevoegde en zet hem als data/check-list.json in de repo.', '<button class="btn btn-sm" data-export-checklist>Lijst downloaden</button>') +
        row('Controlefrequentie', 'De GitHub Action draait maandelijks; een handmatige controle kan altijd', sel('library.checkFrequency', [['monthly', 'Maandelijks']], 'monthly')) +
        row('Mappen beheren', data.folders().length + ' mappen', '<button class="btn btn-sm" data-go="library">Openen</button>') + '</div></section>' +

        '<section class="set-section" id="taken"><h3>Taken</h3><div class="set-group">' +
        row('Standaarddatum', 'Voor taken zonder datum', sel('tasks.defaultDate', [['today', 'Vandaag'], ['none', 'Geen datum']], s.tasks.defaultDate)) +
        row('Onafgemaakte taken', 'Wat er gebeurt als een taak niet af is aan het eind van de dag', sel('tasks.rollover', [['ask', t('roll.ask')], ['auto', t('roll.auto')], ['overdue', t('roll.overdue')]], s.tasks.rollover)) +
        row('Standaardweergave agenda', '', sel('tasks.defaultView', [['day', 'Vandaag'], ['week', 'Week'], ['month', 'Maand']], s.tasks.defaultView)) +
        row('Vakken', esc(data.subjects().join(', ')), '<button class="btn btn-sm" data-subjects>Bewerken</button>') + '</div>' +
        '<div class="set-group"><div class="set-row"><div><b>Swipe-gevoel</b><div class="sub">Voor afvinken/verwijderen door te vegen</div></div><button class="btn btn-sm" data-swipe-reset>Standaard</button></div>' +
        [['threshold', 'Drempel', 0.1, 0.9, 0.05], ['maxTravel', 'Max. afstand (px)', 60, 260, 10], ['flickVelocity', 'Flick-snelheid', 0.2, 2, 0.05]].map(([k, l, mi, ma, stp]) => row(l, '', '<span style="display:flex;gap:10px;align-items:center"><input type="range" min="' + mi + '" max="' + ma + '" step="' + stp + '" value="' + swipe[k] + '" data-swipe="' + k + '"><code style="min-width:40px">' + swipe[k] + '</code></span>')).join('') + '</div></section>' +

        '<section class="set-section" id="agendas"><h3>Agenda\'s & rooster</h3><p>Lessen en afspraken verschijnen in Vandaag, Dag, Week en Rooster. Somtoday en andere iCal-links worden rechtstreeks opgehaald; Google Agenda gaat via je eigen proxy (zie hieronder).</p>' +
        '<div class="set-group">' + row('Automatisch verversen', 'Terwijl Angel OS open is. Een gesloten app kan niets verversen.', tog('calendars.auto', s.calendars.auto)) +
        row('Hoe vaak', '', sel('calendars.everyHours', [['1', 'Elk uur'], ['3', 'Elke 3 uur'], ['6', 'Elke 6 uur'], ['12', 'Elke 12 uur']], String(s.calendars.everyHours))) + '</div>' +
        '<div class="set-group" style="margin-top:10px"><div class="set-row" style="flex-wrap:wrap"><select class="input" data-cal-kind style="max-width:170px"><option>🏫 Somtoday</option><option>🗓️ Andere iCal</option></select><input class="input" data-cal-url placeholder="https://… .ics" style="flex:1;max-width:none"><button class="btn btn-primary btn-sm" data-cal-add>Toevoegen</button><label class="btn btn-sm">' + icon('upload') + '.ics importeren<input type="file" accept=".ics,text/calendar" data-ics hidden></label></div></div>' +
        '<h4 style="margin:18px 0 6px">📆 Google Agenda (geheim iCal-adres via proxy)</h4><p class="faint" style="font-size:12.5px;line-height:1.5">Je geheime adres wordt nooit in de repo of in deze browser bewaard, maar versleuteld in je eigen proxy. Google ververst iCal-feeds traag (vaak enkele uren). Zie docs/GOOGLE-AGENDA.md voor het snellere alternatief (OAuth) en worker/README.md om de proxy in te stellen.</p>' +
        '<div class="set-group"><div class="set-row" style="flex-wrap:wrap"><input class="input" data-px-base placeholder="Adres van je proxy: https://angel-os-agenda.….workers.dev" value="' + esc(A.cal.proxy.get().base) + '" style="flex:1;max-width:none"></div>' +
        '<div class="set-row" style="flex-wrap:wrap"><input class="input" data-px-key type="password" autocomplete="off" placeholder="Jouw persoonlijke sleutel" value="' + esc(A.cal.proxy.get().key) + '" style="flex:1;max-width:none"><button class="btn btn-sm" data-px-gen>Nieuwe sleutel</button><button class="btn btn-sm" data-px-copy>Kopiëren</button></div>' +
        '<div class="set-row" style="flex-wrap:wrap"><input class="input" data-px-url type="password" autocomplete="off" placeholder="Geheim adres in iCal-indeling (Google Agenda → instellingen)" style="flex:1;max-width:none"><button class="btn btn-primary btn-sm" data-px-add>Koppelen</button></div></div>' +
        '<p class="faint" style="font-size:12px">De sleutel staat alleen in deze browser en zit bewust niet in de back-up-export. Gebruik op een ander apparaat dezelfde sleutel (kopiëren en plakken).</p>' +
        '<h4 style="margin:18px 0 6px;display:flex;align-items:center;gap:8px">Gekoppelde agenda\'s<span class="spacer" style="flex:1"></span><button class="btn btn-sm" data-cal-all>' + icon('refresh') + 'Alles verversen</button></h4><div class="set-group">' +
        (cals.length ? cals.map((c, i) => row(esc(c.label) + (c.kind === 'proxy' ? ' <span class="chip">via proxy</span>' : ''), (c.count || 0) + ' items · ' + (c.updated ? 'bijgewerkt ' + esc(A.relTime(c.updated)) : 'nog niet opgehaald') + (c.error ? '<br><span style="color:var(--danger)">⚠ ' + esc(c.error) + '</span>' : ''), '<span style="display:flex;gap:6px">' + ((c.url || c.kind === 'proxy') ? '<button class="btn btn-sm" data-cal-refresh="' + i + '" aria-label="Verversen">' + icon('refresh') + '</button>' : '') + '<button class="btn btn-sm btn-danger" data-cal-del="' + i + '" aria-label="Verwijderen">' + icon('trash') + '</button></span>')).join('') : '<div class="set-row"><span class="faint">Nog geen agenda\'s gekoppeld.</span></div>') + '</div><p class="faint" style="font-size:12px">Lukt ophalen niet (de server van je school kan dat blokkeren), download dan het .ics-bestand en importeer het. Bij een fout blijven je bestaande afspraken gewoon staan.</p></section>' +

        '<section class="set-section" id="ai"><h3>Angel AI</h3><p>Standaard gebruikt Angel slimme ingebouwde regels — gratis en zonder sleutel. Optioneel kun je je eigen AI-sleutel gebruiken; dan interpreteert die AI je opdrachten en kiest uit dezelfde echte acties.</p><div class="set-group">' +
        row('Eigen AI gebruiken', A.ai.available() ? 'Actief' : 'Uit', tog('ai.enabled', s.ai.enabled)) +
        row('Aanbieder', '', sel('ai.provider', [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI']], s.ai.provider)) +
        row('API-sleutel', 'Wordt alleen in deze browser bewaard en rechtstreeks naar de aanbieder gestuurd. Niet in back-ups.', '<input class="input" type="password" autocomplete="off" data-aikey value="' + esc(s.ai.apiKey) + '" placeholder="sk-…">') +
        row('Model', 'Leeg = standaard (' + (s.ai.provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-5') + ')', '<input class="input" data-aimodel value="' + esc(s.ai.model) + '" placeholder="optioneel">') +
        row('Verbinding testen', '', '<button class="btn btn-sm" data-aitest>Testen</button>') + '</div><p class="faint" style="font-size:12px">Let op: gebruik kost geld bij de aanbieder. Als de AI niet bereikbaar is, valt Angel automatisch terug op de ingebouwde regels en meldt dat.</p></section>' +

        '<section class="set-section" id="beveiliging"><h3>Pincode</h3><div class="set-group">' + row('Pincode', 'Snelle vergrendeling op dit apparaat', hasPin ? '<button class="btn btn-sm btn-danger" data-pin-off>Verwijderen</button>' : '<span style="display:flex;gap:6px"><input class="input" type="password" inputmode="numeric" style="max-width:120px" data-pin placeholder="4+ cijfers"><button class="btn btn-sm" data-pin-on>Instellen</button></span>') + '</div></section>' +

        '<section class="set-section" id="gegevens"><h3>Gegevens</h3><p>Alles staat in de opslag van deze browser. Afbeeldingen uit notities staan apart in IndexedDB.</p><div class="stats"><div class="stat" data-go="library"><b>' + data.websites().length + '</b><span>Websites</span></div><div class="stat" data-go="library"><b>' + data.folders().length + '</b><span>Mappen</span></div><div class="stat" data-go="notes"><b>' + data.notes().length + '</b><span>Notities</span></div><div class="stat" data-go="agenda"><b>' + data.items().length + '</b><span>Agenda-items</span></div></div>' +
        '<div class="set-group">' + row('Back-up exporteren', 'Alles behalve je AI-sleutel en notitie-afbeeldingen', '<button class="btn btn-sm btn-primary" data-export>' + icon('download') + 'Exporteren</button>') +
        row('Back-up of websitelijst importeren', 'Websites worden toegevoegd; dubbele overgeslagen', '<label class="btn btn-sm">' + icon('upload') + 'Importeren<input type="file" accept=".json,application/json" data-import hidden></label>') +
        row('Lijst voor maandcontrole', 'Download en zet als data/check-list.json in je GitHub-repo, zodat ook zelf toegevoegde websites worden gecontroleerd', '<button class="btn btn-sm" data-checklist>' + icon('download') + 'check-list.json</button>') +
        row('Standaardwebsites herstellen', 'Zet ontbrekende websites uit de oorspronkelijke 70 terug', '<button class="btn btn-sm" data-reseed>Herstellen</button>') + '</div>' +
        '<div class="set-group"><div class="set-row"><div><b>Automatische back-ups</b><div class="sub">Gemaakt vóór upgrades en terugzetacties (max. 3)</div></div><button class="btn btn-sm" data-mkbackup>Nu maken</button></div>' + store.get('backups', []).map((b) => row(esc(b.reason), esc(A.fmtDateTime(b.at)) + ' · ' + ((b.data.websites || []).length) + ' websites', '<button class="btn btn-sm" data-restore="' + esc(b.id) + '">Terugzetten</button>')).join('') + '</div>' +
        '<div class="set-group">' + row('Alles wissen', 'Kan niet ongedaan worden gemaakt', '<button class="btn btn-sm btn-danger" data-reset>Alles wissen</button>') + '</div></section>' +
        '</div></div></div>';

      const main = el.querySelector('.settings-main');
      el.querySelectorAll('[data-jump]').forEach((b) => (b.onclick = () => { const x = el.querySelector('#' + b.dataset.jump); if (x) x.scrollIntoView({ behavior: 'smooth' }); }));
      el.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => { data.patchSettings({ theme: b.dataset.theme }); A.rerender(); }));
      el.querySelectorAll('[data-accent]').forEach((b) => (b.onclick = () => { data.patchSettings({ accent: b.dataset.accent }); A.rerender(); }));
      el.querySelectorAll('[data-wall]').forEach((b) => (b.onclick = () => { data.patchSettings({ wallpaper: b.dataset.wall }); A.rerender(); }));
      el.querySelectorAll('[data-tog]').forEach((b) => (b.onclick = async () => {
        const key = b.dataset.tog; const cur = !!getPath(data.settings(), key);
        if (key === 'browserPush' && !cur) { if (!('Notification' in window)) { A.toast('Deze browser ondersteunt geen meldingen'); return; } const p = await Notification.requestPermission(); if (p !== 'granted') { A.toast('Meldingen zijn niet toegestaan in je browser'); return; } }
        if (key === 'ai.enabled' && !cur && !data.settings().ai.apiKey) { A.toast('Vul eerst een API-sleutel in'); return; }
        setPath(key, !cur); if (key === 'weatherBg') A.weather.applyBackground(); A.rerender();
      }));
      el.querySelectorAll('[data-sel]').forEach((s2) => (s2.onchange = async () => {
        const key = s2.dataset.sel;
        if (key === 'homeLayout') { if (!(await A.confirmDialog('Indeling toepassen?', 'Toepassen', 'Je huidige widgets worden vervangen.'))) { s2.value = data.settings().homeLayout; return; } A.homeWidgets.setLayout(s2.value); A.toast('Indeling toegepast'); return; }
        setPath(key, s2.value); A.toast(t('common.saved'));
      }));
      el.querySelectorAll('[data-time]').forEach((i) => (i.onchange = () => { setPath(i.dataset.time, i.value); A.toast(t('common.saved')); }));
      el.querySelector('[data-name]').onchange = (e) => setPath('name', e.target.value.trim());
      el.querySelector('[data-go-home]').onclick = () => A.go('home');
      el.querySelector('[data-launcher]').onclick = () => A.openLauncher(true);
      el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => A.go(b.dataset.go)));
      el.querySelector('[data-clear-activity]').onclick = async () => { if (await A.confirmDialog('Activiteitsgeschiedenis wissen?', 'Wissen')) { store.set('activity', []); A.toast('Gewist'); A.rerender(); } };
      el.querySelector('[data-clear-loc]').onclick = () => { store.remove('weatherGps'); store.remove('weatherCache'); data.patchSettings({ weatherCity: null, privacy: { location: 'ask' } }); document.documentElement.removeAttribute('data-weather'); A.rerender(); };
      el.querySelector('[data-gps]').onclick = async () => { try { await A.weather.requestGps(); A.weather.applyBackground(); A.rerender(); } catch (e) { A.toast(e.message); } };
      el.querySelector('[data-city]').onclick = () => A.cityPicker();
      el.querySelector('[data-subjects]').onclick = () => A.openModal('<h2>Vakken</h2><p class="muted">ANGEL herkent alleen deze vakken in Snel noteren. Eén per regel.</p><textarea class="input" rows="10">' + esc(data.subjects().join('\n')) + '</textarea><div class="modal-actions"><button class="btn btn-ghost" data-def style="margin-right:auto">Standaard</button><button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-ok>' + t('common.save') + '</button></div>', (m, close) => {
        m.querySelector('[data-ok]').onclick = () => { store.set('subjects', m.querySelector('textarea').value.split('\n').map((x) => x.trim()).filter(Boolean)); close(); A.rerender(); };
        m.querySelector('[data-def]').onclick = () => { m.querySelector('textarea').value = A.DEFAULT_SUBJECTS.join('\n'); };
      });
      el.querySelectorAll('[data-swipe]').forEach((r) => (r.oninput = () => { const c = store.get('swipe', {}); c[r.dataset.swipe] = +r.value; store.set('swipe', c); r.nextElementSibling.textContent = r.value; }));
      el.querySelector('[data-swipe-reset]').onclick = () => { store.remove('swipe'); A.rerender(); };
      el.querySelector('[data-export-checklist]').onclick = () => {
        const seed = new Set((window.ANGEL_SEED_WEBSITES || []).map((x) => x.url)); const list = data.websites().filter((w) => !seed.has(w.url)).map((w) => ({ name: w.name, url: w.url }));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(list, null, 1)], { type: 'application/json' })); a.download = 'check-list.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); A.toast(list.length + ' eigen websites in de lijst');
      };
      // agenda's
      const cal = A.cal; const busy = (btn, on) => { if (btn) { btn.disabled = on; btn.style.opacity = on ? .5 : ''; } };
      const reportResults = (res) => { const bad = res.filter((r) => !r.ok); A.toast(bad.length ? bad.length + ' van ' + res.length + ' agenda\'s gaven een fout (zie lijst)' : res.reduce((n, r) => n + r.count, 0) + ' items bijgewerkt', null, bad.length ? 'warn' : ''); A.rerender(); };
      el.querySelector('[data-cal-add]').onclick = async (e) => {
        const url = el.querySelector('[data-cal-url]').value.trim(); if (!url) { A.toast('Plak eerst een link'); return; }
        const label = el.querySelector('[data-cal-kind]').value; const c = { label, url };
        busy(e.currentTarget, true);
        // direct toevoegen: eerst proberen, pas opslaan als het lukt (zoals voorheen)
        try { const r = await fetch(url.replace(/^webcal:/i, 'https:')); if (!r.ok) throw new Error('HTTP ' + r.status); const ev = cal.parseText(await r.text(), 'direct'); const now = new Date().toISOString(); cal.writeSource(c, { url, count: ev.length, updated: now, lastTry: now, error: null }, ev); A.toast(ev.length + ' items opgehaald'); A.rerender(); }
        catch (er) { A.toast('Ophalen lukte niet (' + er.message + '). Importeer het .ics-bestand.', null, 'warn'); busy(e.target, false); }
      };
      el.querySelector('[data-ics]').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const ev = cal.parseText(r.result, 'direct'); cal.writeSource({ label: '📁 ' + f.name }, { url: null, count: ev.length, updated: new Date().toISOString() }, ev); A.toast(ev.length + ' items geïmporteerd'); A.rerender(); }; r.readAsText(f); };
      el.querySelectorAll('[data-cal-refresh]').forEach((b) => (b.onclick = async () => { busy(b, true); reportResults([await cal.refreshOne(cals[+b.dataset.calRefresh])]); }));
      el.querySelector('[data-cal-all]').onclick = async (e) => { busy(e.currentTarget, true); reportResults(await cal.refreshAll({ manual: true })); };
      el.querySelectorAll('[data-cal-del]').forEach((b) => (b.onclick = async () => { const c = cals[+b.dataset.calDel]; if (!(await A.confirmDialog('“' + c.label + '” loskoppelen?', 'Loskoppelen', 'De bijbehorende afspraken verdwijnen uit het rooster.' + (c.kind === 'proxy' ? ' Het versleutelde adres wordt ook uit je proxy verwijderd.' : '')))) return; await cal.removeSource(c); A.rerender(); }));
      // Google via proxy
      const pxSave = () => cal.proxy.set({ base: el.querySelector('[data-px-base]').value, key: el.querySelector('[data-px-key]').value });
      el.querySelector('[data-px-base]').onchange = pxSave; el.querySelector('[data-px-key]').onchange = pxSave;
      el.querySelector('[data-px-gen]').onclick = async () => { const cur = el.querySelector('[data-px-key]').value; if (cur && store.get('calendars', []).some((c) => c.kind === 'proxy') && !(await A.confirmDialog('Nieuwe sleutel maken?', 'Nieuwe sleutel', 'Bestaande Google-koppelingen werken dan niet meer en moeten opnieuw worden gekoppeld.'))) return; el.querySelector('[data-px-key]').value = cal.proxy.genKey(); pxSave(); A.toast('Sleutel gemaakt. Bewaar hem op een veilige plek.'); };
      el.querySelector('[data-px-copy]').onclick = async () => { const v = el.querySelector('[data-px-key]').value; if (!v) { A.toast('Nog geen sleutel'); return; } try { await navigator.clipboard.writeText(v); A.toast('Sleutel gekopieerd'); } catch (er) { A.toast('Kopiëren lukte niet; selecteer de sleutel handmatig', null, 'warn'); } };
      el.querySelector('[data-px-add]').onclick = async (e) => {
        pxSave(); const u = el.querySelector('[data-px-url]').value.trim();
        if (!u) { A.toast('Plak eerst je geheime iCal-adres'); return; }
        if (!cal.proxy.ready()) { A.toast('Vul het proxy-adres (https://…) in en maak een sleutel', null, 'warn'); return; }
        busy(e.currentTarget, true);
        try { const r = await cal.addProxyCalendar('📆 Google Agenda', u.replace(/^webcal:/i, 'https:')); el.querySelector('[data-px-url]').value = ''; A.toast(r.ok ? 'Google Agenda gekoppeld: ' + r.count + ' items' : 'Gekoppeld, maar ophalen gaf een fout: ' + r.error, null, r.ok ? '' : 'warn'); A.rerender(); }
        catch (er) { A.toast('Koppelen mislukt: ' + er.message, null, 'err'); busy(e.target, false); }
      };
      // AI
      el.querySelector('[data-aikey]').onchange = (e) => { setPath('ai.apiKey', e.target.value.trim()); A.toast(t('common.saved')); };
      el.querySelector('[data-aimodel]').onchange = (e) => { setPath('ai.model', e.target.value.trim()); A.toast(t('common.saved')); };
      el.querySelector('[data-aitest]').onclick = async (e) => { if (!data.settings().ai.apiKey) { A.toast('Vul eerst een API-sleutel in'); return; } e.target.disabled = true; e.target.textContent = 'Testen…'; try { await A.ai.test(); A.toast('Verbinding werkt ✓'); } catch (er) { A.toast('Mislukt: ' + er.message, null, 'err'); } e.target.disabled = false; e.target.textContent = 'Testen'; };
      // pincode
      const pinOn = el.querySelector('[data-pin-on]'); if (pinOn) pinOn.onclick = async () => { const v = el.querySelector('[data-pin]').value; if (!/^\d{4,}$/.test(v)) { A.toast('Gebruik minstens 4 cijfers'); return; } store.set('pinHash', await sha256(v)); try { sessionStorage.setItem('aos-unlocked', '1'); } catch (e) {} A.toast('Pincode ingesteld'); A.rerender(); };
      const pinOff = el.querySelector('[data-pin-off]'); if (pinOff) pinOff.onclick = () => { store.remove('pinHash'); A.toast('Pincode verwijderd'); A.rerender(); };
      // gegevens
      el.querySelector('[data-export]').onclick = exportAll;
      el.querySelector('[data-import]').onchange = (e) => { if (e.target.files[0]) importAll(e.target.files[0]); };
      el.querySelector('[data-checklist]').onclick = exportCheckList;
      el.querySelector('[data-mkbackup]').onclick = () => { A.toast(A.makeBackup('Handmatige back-up') ? 'Back-up gemaakt' : 'Back-up mislukt (opslag vol?)'); A.rerender(); };
      el.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => { if (!(await A.confirmDialog('Deze back-up terugzetten?', 'Terugzetten', 'Je huidige gegevens worden vervangen door de back-up.'))) return; A.restoreBackup(b.dataset.restore); location.reload(); }));
      el.querySelector('[data-reseed]').onclick = async () => {
        const seed = window.ANGEL_SEED_WEBSITES || []; const list = data.websites(); const urls = new Set(list.map((x) => A.normUrl(x.url))); const missing = seed.filter((x) => !urls.has(A.normUrl(x.url)));
        if (!missing.length) { A.toast('Alle ' + seed.length + ' standaardwebsites staan er al'); return; }
        if (!(await A.confirmDialog(missing.length + ' ontbrekende websites terugzetten?', 'Herstellen'))) return;
        const folders = data.folders(); const unc = A.folders.uncategorized(folders);
        missing.forEach((x) => { const c = A.folders.classify(x); const f = A.folderByPath(folders, c.path) || unc; list.push(Object.assign({ id: A.uid(), tags: [], use_count: 0 }, x, { folder_id: f.id })); });
        data.saveWebsites(list); A.toast(missing.length + ' websites hersteld'); A.rerender();
      };
      el.querySelector('[data-reset]').onclick = async () => { if (!(await A.confirmDialog('Echt alles wissen?', 'Alles wissen', 'Websites, notities, taken en instellingen in deze browser worden verwijderd. Maak eerst een back-up.'))) return; store.keys().forEach((k) => store.remove(k)); try { indexedDB.deleteDatabase('angel-os-files'); } catch (e) {} location.hash = '#/home'; location.reload(); };
      if (route.params.section) setTimeout(() => { const x = el.querySelector('#' + route.params.section); if (x) main.scrollTop = x.offsetTop - 10; }, 30);
    }
  });

  // ---------- Websitecontrole ----------
  function repoInfo() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    if (m) { const repo = location.pathname.split('/').filter(Boolean)[0] || (m[1] + '.github.io'); return { owner: m[1], repo }; }
    return { owner: 'hj07NL', repo: 'angel-os' };
  }
  async function quickCheck(url) {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 8000); const t0 = performance.now();
    try { await fetch(url, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-store', referrerPolicy: 'no-referrer' }); return { ok: true, ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { ok: false, err: e.name === 'AbortError' ? 'time-out' : 'geen verbinding' }; } finally { clearTimeout(tm); }
  }
  A.registerApp({
    id: 'health', name: t('app.health'), icon: 'shield', color: 'linear-gradient(160deg,#30d158,#0a84ff)', keywords: 'websitecontrole health check status offline beveiliging',
    render(el) {
      const st = { filter: 'all', quick: {} };
      const draw = async () => {
        const h = data.health(); const sites = data.websites(); const ri = repoInfo();
        const rows = sites.map((s) => ({ s, r: h.results ? h.results[s.url] : null }));
        const count = (k) => rows.filter((x) => (x.r ? x.r.status : 'unchecked') === k).length;
        const problems = rows.filter((x) => x.r && !['online', 'https_valid'].includes(x.r.status));
        const shown = st.filter === 'all' ? rows : st.filter === 'problems' ? problems : rows.filter((x) => (x.r ? x.r.status : 'unchecked') === st.filter);
        const notInReport = rows.filter((x) => !x.r).length;
        el.innerHTML = '<div class="pad narrow" style="max-width:1100px"><div class="ag-head" style="margin-top:0"><div><h2>' + t('app.health') + '</h2><div class="muted" style="font-size:13px;margin-top:4px">' + (h.checked_at ? 'Laatste controle: ' + esc(A.fmtDateTime(h.checked_at)) + ' · via ' + esc(h.runner || 'GitHub Actions') : 'Nog geen controle-rapport gevonden.') + '</div></div><span class="spacer"></span><a class="btn btn-primary" href="https://github.com/' + ri.owner + '/' + ri.repo + '/actions/workflows/health-check.yml" target="_blank" rel="noopener">' + icon('refresh') + 'Nu controleren (GitHub)</a><button class="btn" data-quick>Snelle browsercheck</button></div>' +
          '<div class="stats">' + [['online', 'Online'], ['https_valid', 'HTTPS geldig'], ['redirected', 'Doorverwezen'], ['offline', 'Offline'], ['cert_problem', 'Certificaat'], ['suspicious', 'Verdacht'], ['parked', 'Geparkeerd'], ['inconclusive', 'Onduidelijk']].map(([k, l]) => '<div class="stat" data-f="' + k + '"><b>' + count(k) + '</b><span>' + l + '</span></div>').join('') + '</div>' +
          '<div class="card" style="margin-bottom:12px;font-size:13.5px;line-height:1.55"><b>Hoe werkt dit?</b> Elke 1e van de maand controleert een GitHub Action (een echte server, geen browser) alle websites in je repo: DNS, serverantwoord, doorverwijzingen, HTTPS en certificaat-vervaldatum, geparkeerde domeinen en grote wijzigingen. Interne en privé-adressen worden geweigerd. <span class="muted">HTTPS bewijst niet dat een website betrouwbaar is; ‘Beveiliging niet geverifieerd’ betekent dat er geen reputatie-database is geraadpleegd. Er wordt niet op malware gescand.</span>' + (notInReport ? '<br><span class="muted">' + notInReport + ' websites staan niet in het laatste rapport (bijv. zelf toegevoegd). Download de lijst bij Instellingen → Gegevens → check-list.json en zet die in de repo.</span>' : '') + '</div>' +
          '<div class="tags" style="margin-bottom:10px"><button class="chip ' + (st.filter === 'all' ? 'on' : '') + '" data-f="all">Alles (' + rows.length + ')</button><button class="chip ' + (st.filter === 'problems' ? 'on' : '') + '" data-f="problems">Aandacht nodig (' + problems.length + ')</button><button class="chip ' + (st.filter === 'unchecked' ? 'on' : '') + '" data-f="unchecked">Niet gecontroleerd (' + notInReport + ')</button></div>' +
          '<div style="overflow:auto"><table class="health-table"><thead><tr><th>Website</th><th>Status</th><th>Beveiliging</th><th>Details</th><th>Browsercheck</th></tr></thead><tbody>' +
          shown.map(({ s, r }) => { const q = st.quick[s.id]; return '<tr><td><b>' + esc(s.name) + '</b><div class="faint" style="font-size:12px;word-break:break-all">' + esc(s.url) + '</div></td><td><span class="status st-' + (r ? r.status : 'unchecked') + '">' + esc(t('site.status.' + (r ? r.status : 'unchecked'))) + '</span>' + (r && r.http ? '<div class="faint" style="font-size:11px">HTTP ' + r.http + (r.ms ? ' · ' + r.ms + ' ms' : '') + '</div>' : '') + '</td><td style="font-size:12.5px">' + esc(r ? (r.security || 'Beveiliging niet geverifieerd') : '—') + (r && r.cert_expires ? '<div class="faint" style="font-size:11px">Certificaat tot ' + esc(A.fmtNum(new Date(r.cert_expires))) + '</div>' : '') + '</td><td style="font-size:12.5px">' + esc(r ? r.detail || '' : '') + (r && r.final_url && r.final_url !== s.url ? '<div class="faint" style="font-size:11px;word-break:break-all">→ ' + esc(r.final_url) + '</div>' : '') + (r && r.changed ? '<div class="faint" style="font-size:11px">Pagina flink gewijzigd sinds vorige controle</div>' : '') + '</td><td style="font-size:12px">' + (q ? (q.ok ? '<span style="color:var(--ok)">bereikbaar</span> ' + q.ms + ' ms' : '<span style="color:var(--danger)">' + esc(q.err) + '</span>') : '<span class="faint">—</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<p class="faint" style="font-size:12px">De browsercheck kan alleen zien óf een server antwoordt (browsers verbergen statuscodes en certificaten van andere sites). Gebruik voor echte resultaten de GitHub-controle.</p></div>';
        el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; draw(); }));
        el.querySelector('[data-quick]').onclick = async (e) => {
          const list = shown.slice(0, 120).map((x) => x.s); e.target.disabled = true; A.bus.emit('angel-busy', true);
          for (let i = 0; i < list.length; i += 6) { const part = list.slice(i, i + 6); const res = await Promise.all(part.map((s) => quickCheck(s.url))); part.forEach((s, j) => { st.quick[s.id] = res[j]; }); e.target.textContent = 'Bezig… ' + Math.min(list.length, i + 6) + '/' + list.length; }
          A.bus.emit('angel-busy', false); draw();
        };
      };
      draw();
    }
  });

  // ---------- Kwaliteitscontrole ----------
  async function runChecks() {
    const sites = data.websites(); const folders = data.folders(); const ids = new Set(folders.map((f) => f.id));
    const orphan = sites.filter((s) => !ids.has(s.folder_id)).length;
    const bad = sites.filter((s) => { try { new URL(s.url); return false; } catch (e) { return true; } });
    const dupes = A.folders.findDuplicates(sites).filter((d) => d.kind === 'url').length;
    const s = data.settings(); const last = store.get('lastBackup', null); const total = store.keys().reduce((n, k) => n + store.sizeOf(k), 0);
    const files = await A.files.stats(); const h = data.health(); const seedCount = store.get('seedCount', 70);
    const w = A.weather.location();
    return [
      ['Opslag beschikbaar', store.available() ? 'ok' : 'bad', store.available() ? 'localStorage werkt' : 'Opslag geblokkeerd (privévenster?)'],
      ['Gegevensversie', store.get('schema', 2) === A.SCHEMA ? 'ok' : 'warn', 'schema ' + store.get('schema', 2) + ' (nieuwste: ' + A.SCHEMA + ')'],
      ['Websites aanwezig', sites.length >= seedCount ? 'ok' : 'warn', sites.length + ' websites (oorspronkelijk ' + seedCount + ')'],
      ['Alle websites in een map', orphan ? 'warn' : 'ok', orphan ? orphan + ' zonder geldige map' : folders.length + ' mappen, alles ingedeeld'],
      ['Geldige URL\'s', bad.length ? 'warn' : 'ok', bad.length ? bad.length + ' ongeldig' : 'Alles geldig'],
      ['Dubbele URL\'s', dupes ? 'warn' : 'ok', dupes ? dupes + ' groepen — bekijk in de bibliotheek' : 'Geen'],
      ['Notitie-afbeeldingen', files.error ? 'warn' : 'ok', files.error ? 'IndexedDB niet beschikbaar' : files.count + ' afbeeldingen · ' + A.fmtBytes(files.bytes)],
      ['Websitecontrole', h.checked_at ? (Date.now() - new Date(h.checked_at) < 40 * 86400000 ? 'ok' : 'warn') : 'warn', h.checked_at ? 'Rapport van ' + A.fmtDateTime(h.checked_at) : 'Nog geen rapport'],
      ['Weer', w ? 'ok' : 'warn', w ? w.name : 'Geen locatie ingesteld'],
      ['Angel AI', A.ai.available() ? 'ok' : 'ok', A.ai.available() ? 'Eigen sleutel actief (' + s.ai.provider + ')' : 'Ingebouwde regels (geen sleutel nodig)'],
      ['Verbinding', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? 'Online' : 'Offline (lokale gegevens blijven werken)'],
      ['Opslaggebruik', total > 4.5e6 ? 'warn' : 'ok', A.fmtBytes(total) + ' van ±5 MB'],
      ['Laatste back-up', last ? 'ok' : 'warn', last ? A.relTime(last) : 'Nog nooit — exporteer via Instellingen → Gegevens']
    ];
  }
  A.registerApp({
    id: 'quality', name: t('app.quality'), icon: 'circleCheck', color: 'linear-gradient(160deg,#ff453a,#c81e1e)', keywords: 'kwaliteit controle check',
    render(el) {
      const draw = async () => {
        const checks = await runChecks(); const issues = checks.filter((c) => c[1] !== 'ok').length;
        el.innerHTML = '<div class="pad narrow"><div class="ag-head" style="margin-top:0"><div><h2>' + t('app.quality') + '</h2><div class="muted" style="font-size:13px;margin-top:4px">' + (issues ? issues + ' aandachtspunt' + (issues > 1 ? 'en' : '') + '.' : 'Alles in orde.') + '</div></div><span class="spacer"></span><button class="btn" data-rerun>' + icon('refresh') + 'Opnieuw</button></div>' +
          checks.map(([n, s2, d]) => '<div class="check-row"><span class="' + s2 + '">' + icon(s2 === 'ok' ? 'circleCheck' : 'alert') + '</span><b>' + esc(n) + '</b><small>' + esc(d) + '</small></div>').join('') + '</div>';
        el.querySelector('[data-rerun]').onclick = () => { draw(); A.toast('Controle opnieuw uitgevoerd'); };
      };
      draw();
    }
  });

  // ---------- Taakbeheer ----------
  A.registerApp({
    id: 'tasks', name: t('app.tasks'), icon: 'activity', color: 'linear-gradient(160deg,#64d2ff,#bf5af2)', keywords: 'taakbeheer opslag systeem task manager',
    render(el) {
      const draw = () => {
        const keys = store.keys().filter((k) => k !== 'backups').sort((a, b) => store.sizeOf(b) - store.sizeOf(a)); const total = store.keys().reduce((n, k) => n + store.sizeOf(k), 0);
        const secs = Math.floor((Date.now() - A.sessionStart) / 1000); const tm = A.timer.state();
        el.innerHTML = '<div class="pad narrow"><div class="ag-head" style="margin-top:0"><h2>' + t('app.tasks') + '</h2></div><div class="tm-grid"><div class="stat"><span>Actieve app</span><b>' + esc(A.currentApp() || '') + '</b></div><div class="stat"><span>Focustimer</span><b>' + (tm ? Math.ceil(A.timer.left() / 60000) + ' min' : 'uit') + '</b></div><div class="stat"><span>Lokale opslag</span><b>' + A.fmtBytes(total) + '</b></div><div class="stat"><span>Sessie</span><b data-sess>' + Math.floor(secs / 60) + 'm ' + (secs % 60) + 's</b></div></div>' +
          '<h3 style="margin:24px 0 10px">Snelle acties</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-a="note">Nieuwe notitie</button><button class="btn" data-a="focus">Focus 25 min</button><button class="btn" data-a="theme">Licht / donker</button><button class="btn" data-a="lib">Appbibliotheek</button><button class="btn" data-a="angel">Vraag Angel</button><button class="btn" data-a="backup">Back-up</button><button class="btn" data-a="notif">Meldingen</button></div>' +
          '<h3 style="margin:24px 0 10px">Opgeslagen op dit apparaat</h3><div class="card">' + keys.map((k) => '<div class="kv"><span>' + esc(k) + '</span><span class="muted">' + A.fmtBytes(store.sizeOf(k)) + '</span></div>').join('') + '<div class="kv"><span>backups</span><span class="muted">' + A.fmtBytes(store.sizeOf('backups')) + '</span></div></div><p class="faint" style="font-size:12px">Sneltoetsen: Ctrl/⌘+K zoeken · Ctrl/⌘+. eiland · Alt+1–9 dock-apps.</p></div>';
        el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'note') { const n = A.angel.createNote('', ''); A.go('notes', null, { id: n.id }); }
          if (a === 'focus') A.timer.start(25);
          if (a === 'theme') { const cur = document.documentElement.getAttribute('data-theme'); data.patchSettings({ theme: cur === 'dark' ? 'light' : 'dark' }); }
          if (a === 'lib') A.openLauncher(); if (a === 'angel') A.go('angel'); if (a === 'backup') exportAll(); if (a === 'notif') A.openNotifications();
        }));
      };
      draw();
      const iv = setInterval(() => { const x = el.querySelector('[data-sess]'); if (x) { const secs = Math.floor((Date.now() - A.sessionStart) / 1000); x.textContent = Math.floor(secs / 60) + 'm ' + (secs % 60) + 's'; } }, 1000);
      return () => clearInterval(iv);
    }
  });
})();
