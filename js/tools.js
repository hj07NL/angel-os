/* Angel — centrale tool-registry. Elke actie die Angel kan uitvoeren staat hier één keer gedefinieerd en
   werkt op de echte gegevens. De ingebouwde regels herkennen commando's; optioneel kan een eigen AI-sleutel
   (Instellingen → Angel AI) de opdracht interpreteren — die AI kiest dan uit dezelfde tools.
   Destructieve of bulkacties vragen altijd eerst om bevestiging. Websites worden nooit door Angel verwijderd. */
(function () {
  'use strict';
  const A = window.AOS;
  const { data, store } = A;
  const P = () => A.parser;

  // ---------- Taken-helpers (gedeeld met de agenda) ----------
  function addItem(rec) {
    const list = data.items();
    const item = Object.assign({ id: A.uid(), title: '', type: 'task', date: A.today(), time: null, end: null, deadline: null, subject: null, category: 'overig', priority: 'normal', estimate: null, details: '', done: false, doneAt: null, createdAt: new Date().toISOString(), order: list.length, history: [{ at: new Date().toISOString(), action: 'aangemaakt' }] }, rec);
    list.push(item); data.saveItems(list); A.track('task_created', { type: item.type });
    return item;
  }
  function updateItem(id, patch, action) {
    const list = data.items(); const it = list.find((x) => x.id === id); if (!it) return null;
    Object.assign(it, patch);
    if (action) { it.history = (it.history || []).concat([{ at: new Date().toISOString(), action }]).slice(-30); }
    data.saveItems(list); return it;
  }
  function toggleDone(id) { const it = data.items().find((x) => x.id === id); if (!it) return null; return updateItem(id, { done: !it.done, doneAt: it.done ? null : new Date().toISOString() }, it.done ? 'heropend' : 'afgerond'); }
  // Doorschuiven: zelfde ID, geen kopie, afgeronde taken nooit. Afspraken (events) schuiven niet mee.
  function eligibleRollover(beforeDate) {
    const t = beforeDate || A.today();
    return data.items().filter((i) => !i.done && i.date && i.date < t && i.type !== 'event');
  }
  function rollover(ids, toDate) {
    const list = data.items(); let n = 0;
    list.forEach((i) => {
      if (!ids.includes(i.id) || i.done || i.type === 'event') return;
      if (i.date === toDate) return;
      i.history = (i.history || []).concat([{ at: new Date().toISOString(), action: 'doorgeschoven', from: i.date, to: toDate }]).slice(-30);
      if (!i.originalDate) i.originalDate = i.date;
      i.date = toDate; n++;
    });
    data.saveItems(list);
    return n;
  }
  A.tasks = { addItem, updateItem, toggleDone, eligibleRollover, rollover };

  function createNote(title, text) {
    const n = { id: A.uid(), title: title || '', html: '<p>' + A.esc(text || '') + '</p>', content: text || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    data.saveNotes([n].concat(data.notes())); A.track('note_created', {}); return n;
  }

  // ---------- Website zoeken (gedeeld door Angel UI en spotlight) ----------
  const SYN = {
    background: ['background', 'achtergrond', 'remove', 'cutout', 'transparent', 'object-removal'], achtergrond: ['background', 'achtergrond', 'remove', 'transparent', 'object-removal'],
    pdf: ['pdf', 'document', 'convert', 'pdf-tools', 'pdf-editor', 'file-converter'], presentatie: ['presentation', 'presentations', 'slides', 'deck'], presentation: ['presentations', 'slides', 'deck'],
    video: ['video', 'film', 'movie', 'motion', 'animation'], muziek: ['music', 'audio', 'song', 'vocal'], music: ['music', 'audio'], focus: ['focus', 'deep work', 'concentrate'],
    leren: ['learn', 'learning', 'course', 'courses', 'education', 'study', 'flashcards', 'quiz'], studeren: ['study', 'learn', 'flashcards', 'quiz'],
    logo: ['logo', 'brand', 'branding'], foto: ['image', 'photo', 'picture', 'png'], afbeelding: ['image', 'photo', 'picture', 'png'], plaatje: ['image', 'png', 'clipart'],
    code: ['code', 'coding', 'developer', 'programming'], programmeren: ['code', 'coding', 'developer', 'programming'], wallpaper: ['wallpaper', 'wallpapers', 'live'],
    boek: ['book', 'books', 'ebook'], boeken: ['book', 'books', 'ebook'], typen: ['typing'], kaart: ['map', 'maps', 'poster'], vliegtuig: ['flight', 'aviation'],
    veilig: ['security', 'breach', 'privacy'], wachtwoord: ['password', 'breach', 'pwned'], recept: ['recipe', 'recipes', 'cooking'], koken: ['recipe', 'cooking', 'meal'],
    naam: ['name', 'names', 'brand', 'domain'], game: ['game', 'games'], spel: ['game', 'games'], chatbot: ['chat', 'chatbot', 'llm'], website: ['web', 'website', 'app-builder'],
    ontwerpen: ['design', 'mockup', 'ui-design'], design: ['design', 'mockup'], economie: ['economics', 'finance', 'business'], engels: ['english', 'vocabulary']
  };
  const STOP = new Set(['i', 'need', 'a', 'to', 'the', 'my', 'me', 'show', 'which', 'should', 'use', 'for', 'website', 'websites', 'an', 'of', 'and', 'is', 'can', 'what', 'find', 'best', 'in', 'library', 'creating', 'create', 'ik', 'wil', 'een', 'de', 'het', 'mijn', 'welke', 'voor', 'om', 'te', 'met', 'van', 'en', 'zoek', 'vind', 'toon', 'laat', 'zien', 'heb', 'nodig', 'site', 'sites', 'beste', 'bibliotheek', 'maken', 'gebruik', 'do', 'how', 'edit', 'editing', 'bewerken', 'iets', 'die', 'free', 'online', 'gratis', 'tool', 'tools', 'good', 'goede', 'goed']);
  const tokens = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}&\s-]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  function searchWebsites(q, limit) {
    const words = tokens(q); if (!words.length) return [];
    const folders = data.folders();
    const res = [];
    data.websites().forEach((s) => {
      let score = 0; const why = [];
      const fields = [['Naam', s.name, 3], ['Tags', (s.tags || []).join(' '), 2.5], ['Beschrijving', s.description, 2], ['Gebruik', s.ai_summary, 1.5], ['Notitie', s.notes, 1.5], ['Map', A.folders.pathLabel(folders, s.folder_id), 1.2], ['URL', s.url, 1]];
      words.forEach((w) => {
        const variants = [w].concat(SYN[w] || [], w.length >= 6 ? [w.slice(0, Math.max(4, w.length - 3))] : []);
        for (const [label, text, weight] of fields) { const tt = (text || '').toLowerCase(); const h = variants.find((v) => tt.includes(v)); if (h) { score += weight * (h === w ? 1 : 0.7); why.push(label + ' bevat “' + h + '”'); break; } }
      });
      if (score > 0) {
        const h = data.health().results[s.url];
        if (h && ['offline', 'parked', 'suspicious'].includes(h.status)) { score *= 0.5; why.push('let op: ' + A.t('site.status.' + h.status)); }
        res.push({ site: s, score: score + (s.is_favorite ? 0.3 : 0) + Math.min(1, (s.use_count || 0) / 20) + (s.rating || 0) * 0.1, why: Array.from(new Set(why)).slice(0, 3) });
      }
    });
    return res.sort((a, b) => b.score - a.score).slice(0, limit || 8);
  }

  // ---------- Tools ----------
  const TOOLS = {
    create_task: { desc: 'Maak een taak. args: {title, date?(YYYY-MM-DD), time?(HH:MM), type?, subject?, priority?}', run(a) {
      const it = addItem({ title: a.title, date: a.date || A.today(), time: a.time || null, end: a.end || null, type: a.type || 'task', subject: a.subject || null, category: a.subject ? 'school' : (a.category || 'overig'), priority: a.priority || 'normal', deadline: a.deadline || null });
      return { ok: true, text: A.parser.TYPE_LABELS[it.type] + ' “' + it.title + '” toegevoegd voor ' + (it.date === A.today() ? 'vandaag' : A.fmtLong(it.date)) + (it.time ? ' om ' + it.time : '') + '.', item: it, undo: () => { data.saveItems(data.items().filter((x) => x.id !== it.id)); } };
    } },
    create_reminder: { desc: 'Maak een herinnering. args: {title, date?, time?}', run(a) { return TOOLS.create_task.run(Object.assign({}, a, { type: 'reminder' })); } },
    create_event: { desc: 'Maak een afspraak in de agenda. args: {title, date, time, end?}', run(a) { return TOOLS.create_task.run(Object.assign({}, a, { type: 'event' })); } },
    create_note: { desc: 'Maak een notitie. args: {title?, text}', run(a) {
      const title = a.title || (a.text || '').split(/[.!?\n]/)[0].slice(0, 60);
      const n = createNote(title, a.text || a.title || '');
      return { ok: true, text: 'Notitie “' + (n.title || 'Naamloos') + '” gemaakt.', open: { app: 'notes', params: { id: n.id } }, undo: () => data.saveNotes(data.notes().filter((x) => x.id !== n.id)) };
    } },
    search_websites: { desc: 'Zoek in de eigen websitebibliotheek. args: {query}', run(a) {
      const r = searchWebsites(a.query, a.limit || 6);
      if (!r.length) return { ok: true, text: 'Ik vond niets in je bibliotheek voor “' + a.query + '”. Probeer andere woorden, of zoek op Google.', results: [], google: a.query };
      return { ok: true, text: 'De beste match in je bibliotheek is ' + r[0].site.name + '.', results: r };
    } },
    list_category: { desc: 'Toon websites in een map. args: {folder}', run(a) {
      const folders = data.folders(); const q = (a.folder || '').toLowerCase();
      const f = folders.find((x) => x.name.toLowerCase() === q) || folders.find((x) => x.name.toLowerCase().includes(q));
      if (!f) return { ok: false, text: 'Ik vond geen map “' + a.folder + '”.' };
      const ids = new Set([f.id].concat(A.folders.descendants(folders, f.id)));
      const sites = data.websites().filter((s) => ids.has(s.folder_id));
      return { ok: true, text: sites.length + ' websites in ' + A.folders.pathLabel(folders, f.id) + ':', results: sites.map((s) => ({ site: s, why: [A.folders.pathLabel(folders, s.folder_id)] })) };
    } },
    create_folder: { desc: 'Maak een websitemap. args: {name, parent?}', run(a) {
      const folders = data.folders();
      const parent = a.parent ? folders.find((f) => f.name.toLowerCase() === a.parent.toLowerCase()) : null;
      const r = A.folders.createFolder(a.name, parent ? parent.id : null);
      if (!r.created) return { ok: true, text: 'De map “' + r.folder.name + '” bestaat al — ik heb geen dubbele gemaakt.', open: { app: 'library', params: { folder: r.folder.id } } };
      const sugg = suggestSubfolders(a.name);
      return { ok: true, text: 'Map “' + r.folder.name + '” gemaakt.' + (sugg.length ? ' Voorgestelde submappen:' : ''), suggestions: sugg.map((s) => ({ label: '+ ' + s, run: () => { A.folders.createFolder(s, r.folder.id); A.toast('Submap “' + s + '” gemaakt'); } })), open: { app: 'library', params: { folder: r.folder.id } }, undo: () => A.folders.deleteFolder(r.folder.id) };
    } },
    add_website: { desc: 'Voeg een website toe. args: {url, name?}', run(a) {
      let url = a.url.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try { new URL(url); } catch (e) { return { ok: false, text: A.t('err.invalidUrl') }; }
      const list = data.websites();
      const dup = list.find((s) => A.normUrl(s.url) === A.normUrl(url));
      if (dup) return { ok: true, text: dup.name + ' staat al in je bibliotheek.', results: [{ site: dup, why: ['bestaat al'] }] };
      const host = A.hostOf(url);
      const site = { id: A.uid(), name: a.name || host.split('.')[0].replace(/^./, (c) => c.toUpperCase()), url, description: '', ai_summary: '', notes: '', tags: [], category: 'other', folder_id: null, is_favorite: false, rating: 0, use_count: 0, sort_order: 0, last_used_at: null, created_at: new Date().toISOString() };
      const c = A.folders.classify(site);
      const folders = data.folders();
      const target = A.folderByPath(folders, c.path) || A.folders.uncategorized(folders);
      site.folder_id = target.id; site.classification = { confidence: c.confidence, uncertain: c.uncertain, why: c.why };
      list.unshift(site); data.saveWebsites(list);
      return { ok: true, text: site.name + ' toegevoegd aan ' + A.folders.pathLabel(folders, site.folder_id) + (c.uncertain ? ' (onzeker — controleer de map).' : '.'), open: { app: 'library', params: { id: site.id } }, undo: () => data.saveWebsites(data.websites().filter((x) => x.id !== site.id)) };
    } },
    reorganize_websites: { desc: 'Start de workflow om websites opnieuw in te delen (met voorbeeld, niets wordt direct gewijzigd).', run() { return { ok: true, text: 'Ik open het voorstel voor het opnieuw indelen. Er verandert niets tot je het goedkeurt.', open: { app: 'library', params: { reorganize: '1' } } }; } },
    show_health: { desc: 'Toon websites die niet (meer) goed werken volgens de websitecontrole.', run() {
      const h = data.health(); const bad = data.websites().map((s) => ({ s, r: h.results[s.url] })).filter((x) => x.r && x.r.status !== 'online' && x.r.status !== 'https_valid');
      if (!h.checked_at) return { ok: true, text: 'Er is nog geen controle uitgevoerd. De maandelijkse controle draait via GitHub Actions; je kunt hem ook handmatig starten.', open: { app: 'health' } };
      return { ok: true, text: bad.length ? bad.length + ' websites hebben aandacht nodig (controle van ' + A.fmtDateTime(h.checked_at) + '):' : 'Alle gecontroleerde websites waren bij de laatste controle bereikbaar (' + A.fmtDateTime(h.checked_at) + ').', results: bad.map((x) => ({ site: x.s, why: [A.t('site.status.' + x.r.status) + (x.r.detail ? ' — ' + x.r.detail : '')] })), open: { app: 'health' } };
    } },
    list_tasks: { desc: 'Toon taken voor een datum. args: {date?}', run(a) {
      const d = a.date || A.today(); const list = data.items().filter((i) => i.date === d && !i.done);
      const overdue = d === A.today() ? A.tasks.eligibleRollover() : [];
      return { ok: true, text: list.length || overdue.length ? (list.length + ' open voor ' + (d === A.today() ? 'vandaag' : A.fmtLong(d)) + (overdue.length ? ', plus ' + overdue.length + ' te laat' : '') + ':') : 'Niets open voor ' + (d === A.today() ? 'vandaag' : A.fmtLong(d)) + '. 🎉', tasks: overdue.concat(list) };
    } },
    rollover_tasks: { desc: 'Verplaats onafgemaakte taken naar morgen of vandaag. args: {to: "tomorrow"|"today"}', bulk: true, run(a) {
      const to = a.to === 'today' ? A.today() : A.ymd(A.addDays(A.now(), 1));
      const ids = data.items().filter((i) => !i.done && i.type !== 'event' && i.date && i.date <= A.today() && i.date !== to).map((i) => i.id);
      if (!ids.length) return { ok: true, text: 'Er zijn geen onafgemaakte taken om te verplaatsen.' };
      return { ok: true, confirm: { text: ids.length + ' onafgemaakte taken naar ' + (a.to === 'today' ? 'vandaag' : 'morgen') + ' verplaatsen?', detail: 'Afgeronde taken en afspraken blijven staan. Er worden geen kopieën gemaakt.', run: () => { const n = rollover(ids, to); return { ok: true, text: n + ' taken verplaatst naar ' + A.fmtLong(to) + '.' }; } } };
    } },
    complete_task: { desc: 'Markeer een taak als klaar. args: {title}', run(a) {
      const q = a.title.toLowerCase(); const it = data.items().find((i) => !i.done && i.title.toLowerCase().includes(q));
      if (!it) return { ok: false, text: 'Ik vond geen open taak met “' + a.title + '”.' };
      toggleDone(it.id); return { ok: true, text: '“' + it.title + '” afgevinkt ✓', undo: () => toggleDone(it.id) };
    } },
    delete_task: { desc: 'Verwijder een taak (vraagt bevestiging). args: {title}', destructive: true, run(a) {
      const q = a.title.toLowerCase(); const it = data.items().find((i) => i.title.toLowerCase().includes(q));
      if (!it) return { ok: false, text: 'Ik vond geen taak met “' + a.title + '”.' };
      return { ok: true, confirm: { text: 'Taak “' + it.title + '” verwijderen?', run: () => { data.saveItems(data.items().filter((x) => x.id !== it.id)); return { ok: true, text: 'Taak verwijderd.' }; } } };
    } },
    add_shortcut: { desc: 'Voeg een snelkoppeling toe aan de startpagina. args: {url, name?}', run(a) {
      let url = a.url.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try { new URL(url); } catch (e) { return { ok: false, text: A.t('err.invalidUrl') }; }
      const list = data.shortcuts(); if (list.some((s) => A.normUrl(s.url) === A.normUrl(url))) return { ok: true, text: 'Die snelkoppeling bestaat al.' };
      list.push({ id: A.uid(), name: a.name || A.hostOf(url), url, icon: null }); data.saveShortcuts(list);
      return { ok: true, text: 'Snelkoppeling toegevoegd aan je startpagina.' };
    } },
    open_app: { desc: 'Open een app. args: {app}', run(a) {
      const q = (a.app || '').toLowerCase();
      const app = A.apps.find((x) => x.id === q || x.name.toLowerCase() === q || x.name.toLowerCase().includes(q) || (x.keywords || '').includes(q));
      if (!app) return { ok: false, text: 'Ik ken geen app “' + a.app + '”.' };
      return { ok: true, text: app.name + ' geopend.', open: { app: app.id } };
    } },
    start_focus: { desc: 'Start een focustimer. args: {minutes}', run(a) { A.timer.start(+a.minutes || 25); return { ok: true, text: 'Focustimer van ' + (+a.minutes || 25) + ' minuten gestart.' }; } },
    weather: { desc: 'Toon het weer.', async run() {
      const w = await A.weather.get();
      if (w.status === 'nolocation') return { ok: false, text: 'Ik weet je locatie nog niet. Kies een stad bij Instellingen → Weer, of sta locatie toe.', open: { app: 'settings', params: { section: 'weer' } } };
      if (w.status !== 'ok') return { ok: false, text: A.t('weather.unavailable') };
      return { ok: true, text: w.emoji + ' ' + w.temp + '°C, ' + w.label.toLowerCase() + ' in ' + w.place + ' (voelt als ' + w.feels + '°C).' };
    } },
    set_theme: { desc: 'Wissel thema. args: {theme: "light"|"dark"|"system"}', run(a) { data.patchSettings({ theme: a.theme }); return { ok: true, text: 'Thema aangepast naar ' + ({ light: 'licht', dark: 'donker', system: 'systeem' }[a.theme] || a.theme) + '.' }; } }
  };

  function suggestSubfolders(name) {
    const n = name.toLowerCase();
    if (/\bai\b|kunstmatige|artificial/.test(n)) return ['AI-chatbots', 'AI-beeldgeneratie', 'AI-schrijven', 'AI-programmeren'];
    if (/program|cod/.test(n)) return ['HTML en CSS', 'JavaScript', 'Python'];
    if (/school|onderwijs|leren|educat/.test(n)) return ['Economie', 'Engels', 'Wiskunde', 'Geschiedenis'];
    if (/design|ontwerp|creat/.test(n)) return ['Grafisch ontwerp', 'Videobewerking', 'Lettertypen'];
    if (/muziek|music/.test(n)) return ['Afspelen', 'Maken'];
    if (/game|spel/.test(n)) return ['Browsergames', 'Downloads'];
    return [];
  }

  // ---------- Commando's herkennen (ingebouwde regels) ----------
  function route(text) {
    const s = text.trim(); const l = s.toLowerCase();
    let m;
    if ((m = s.match(/^(notitie|note)\s*:\s*(.+)$/is))) return { tool: 'create_note', args: { text: m[2].trim() } };
    if (/^(taak|task|todo|to-do)\s*:/i.test(s) || /^(herinner|remind|remember|onthoud|vergeet niet|don'?t forget|reminder)/i.test(s)) return { tool: 'parse_task', args: { text: s } };
    if ((m = l.match(/(?:maak|create|nieuwe|new|make)\s+(?:een\s+|a\s+)?(?:nieuwe\s+|new\s+)?(?:map|folder)\s+(?:voor|for|called|genaamd|met de naam)?\s*["“]?(.+?)["”]?\s*$/i))) return { tool: 'create_folder', args: { name: s.slice(s.length - m[1].length).replace(/["”]$/, '').trim() } };
    if (/(organi[sz]e|orden|reorgani|opnieuw in(?:delen)?|deel .*opnieuw in|indelen|sorteer).*(website|site|bibliotheek|library)|(website|site)s?.*(opnieuw indelen|organi[sz]e)/i.test(l)) return { tool: 'reorganize_websites', args: {} };
    if (/(no longer working|not working|niet meer werk|werken niet|kapot|broken|offline|health|websitecontrole|onbereikbaar|dead links)/i.test(l)) return { tool: 'show_health', args: {} };
    if (/(move|verplaats|schuif).*(unfinished|onafgemaakt|open taken|onafgeronde|niet afgemaakte)/i.test(l)) return { tool: 'rollover_tasks', args: { to: /(vandaag|today)/i.test(l) ? 'today' : 'tomorrow' } };
    if ((m = s.match(/(?:voeg|add)\s+(?:de\s+)?(?:website|site|snelkoppeling|shortcut)?\s*((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+[^\s]*)(?:\s+toe)?(.*)$/i))) {
      if (/snelkoppeling|shortcut/i.test(s)) return { tool: 'add_shortcut', args: { url: m[1] } };
      return { tool: 'add_website', args: { url: m[1] } };
    }
    if ((m = l.match(/(?:focus|timer)\D*(\d{1,3})/))) return { tool: 'start_focus', args: { minutes: +m[1] } };
    if (/^(focus|start focus|focustimer)$/i.test(l)) return { tool: 'start_focus', args: { minutes: 25 } };
    if (/\b(weer|weather|temperatuur|regent het)\b/i.test(l)) return { tool: 'weather', args: {} };
    if (/(wat moet ik|wat staat er|taken (?:voor )?vandaag|what.*(?:to do|today)|my tasks|mijn taken|to-?do)/i.test(l)) return { tool: 'list_tasks', args: { date: /(morgen|tomorrow)/i.test(l) ? A.ymd(A.addDays(A.now(), 1)) : A.today() } };
    if ((m = l.match(/(?:vink|complete|klaar met|af:?)\s+(.+?)(?:\s+af)?$/))) { if (/^vink|^complete|^af:/.test(l)) return { tool: 'complete_task', args: { title: m[1] } }; }
    if ((m = l.match(/^(?:verwijder|delete)\s+(?:taak|task)\s+(.+)$/))) return { tool: 'delete_task', args: { title: m[1] } };
    if (/\b(donker|dark)\b.*\b(modus|mode|thema|theme)\b/.test(l)) return { tool: 'set_theme', args: { theme: 'dark' } };
    if (/\b(licht|light)\b.*\b(modus|mode|thema|theme)\b/.test(l)) return { tool: 'set_theme', args: { theme: 'light' } };
    if ((m = l.match(/^(?:open|start|ga naar|go to)\s+(.+)$/))) { const app = A.apps.find((x) => x.name.toLowerCase().includes(m[1]) || x.id === m[1] || (x.keywords || '').includes(m[1])); if (app) return { tool: 'open_app', args: { app: app.id } }; }
    if ((m = l.match(/(?:toon|laat .*zien|show)\s+(?:mijn\s+|me\s+my\s+|my\s+)?(.+?)\s*(?:websites|sites|map)$/))) {
      const folders = data.folders(); const q = m[1].trim();
      if (folders.some((f) => f.name.toLowerCase().includes(q) || (q === 'ai' && /intelligentie/i.test(f.name)))) return { tool: 'list_category', args: { folder: q === 'ai' ? 'Kunstmatige intelligentie' : q } };
    }
    if (/(website|site|tool|app)\b|welke|which|vind|find|zoek|search|beste|best|ik heb .* nodig|i need a/i.test(l) && !/^(ik moet|i need to|i have to)\b/i.test(l)) return { tool: 'search_websites', args: { query: s } };
    return { tool: 'parse_task', args: { text: s }, guess: true };
  }

  // ---------- Uitvoeren ----------
  async function runTool(name, args) {
    const tool = TOOLS[name];
    if (!tool) return { ok: false, text: 'Onbekende actie: ' + name };
    try { A.bus.emit('angel-busy', true); return await tool.run(args || {}); }
    catch (e) { console.error('[Angel]', name, e); return { ok: false, text: A.t('common.error') + ': ' + e.message }; }
    finally { A.bus.emit('angel-busy', false); }
  }

  // parse_task → taak/herinnering of een verduidelijkingsvraag
  function taskFromText(text, overrides) {
    const r = P().parse(text);
    if (overrides) Object.assign(r, overrides);
    if (r.question && !(overrides && overrides._answered)) return { ok: true, question: r.question, parsed: r, original: text };
    const tool = r.type === 'reminder' ? 'create_reminder' : r.type === 'event' ? 'create_event' : 'create_task';
    return runTool(tool, { title: r.title, date: r.date, time: r.time, end: r.end, type: r.type, subject: r.subject, category: r.category, priority: r.priority, deadline: r.deadline });
  }
  function answerQuestion(q, answer) {
    const r = Object.assign({}, q.parsed);
    if (q.question.kind === 'time') { r.time = answer; r.title = r.title.replace(q.question.cut.trim(), '').trim(); }
    if (q.question.kind === 'date') { r.date = answer === 'Morgen' ? A.ymd(A.addDays(A.now(), 1)) : /volgende week/i.test(answer) ? A.ymd(A.addDays(A.startOfWeek(A.now()), 7)) : answer; r.deadline = r.date; }
    if (q.question.kind === 'what') { r.title = answer; }
    r.question = null;
    const tool = r.type === 'reminder' ? 'create_reminder' : r.type === 'event' ? 'create_event' : 'create_task';
    return runTool(tool, r);
  }

  // Hoofdingang: tekst → resultaat. Gebruikt AI als die is ingeschakeld en werkt; anders (of bij fout) de regels.
  async function command(text, opts) {
    opts = opts || {};
    text = (text || '').trim(); if (!text) return { ok: false, text: 'Typ een opdracht.' };
    A.track('angel_command', { len: text.length });
    if (A.ai.available() && !opts.rulesOnly) {
      try {
        const plan = await A.ai.plan(text);
        if (plan && plan.tool && (TOOLS[plan.tool] || plan.tool === 'parse_task')) {
          const out = plan.tool === 'parse_task' ? await taskFromText(plan.args.text || text) : await runTool(plan.tool, plan.args || {});
          if (plan.reply && out && out.ok) out.text = plan.reply + (out.text ? '\n' + out.text : '');
          if (out) out.via = 'ai';
          return out;
        }
        if (plan && plan.reply) return { ok: true, text: plan.reply, via: 'ai' };
      } catch (e) {
        console.warn('[Angel] AI faalde, regels gebruikt:', e);
        const fallback = await command(text, { rulesOnly: true });
        fallback.notice = A.t('err.ai') + ' (' + e.message + ')';
        return fallback;
      }
    }
    const r = route(text);
    if (r.tool === 'parse_task') {
      const out = await taskFromText(r.args.text);
      if (r.guess && out && out.ok && !out.question) out.text += ' Niet bedoeld? Maak het ongedaan.';
      if (r.guess) out.alt = { label: 'Zoek in mijn websites', query: text };
      return out;
    }
    return runTool(r.tool, r.args);
  }

  // ---------- Optionele AI (eigen sleutel) ----------
  const ai = {
    available() { const s = data.settings().ai; return !!(s.enabled && s.apiKey); },
    async complete(system, user, json) {
      const s = data.settings().ai;
      if (!s.apiKey) throw new Error('geen API-sleutel ingesteld');
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
      try {
        if (s.provider === 'openai') {
          const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.apiKey }, body: JSON.stringify({ model: s.model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, response_format: json ? { type: 'json_object' } : undefined }) });
          const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
          return j.choices[0].message.content;
        }
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: s.model || 'claude-sonnet-4-5', max_tokens: 900, system, messages: [{ role: 'user', content: user }] }) });
        const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
        return (j.content || []).map((c) => c.text || '').join('');
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'time-out' : e.message); } finally { clearTimeout(tm); }
    },
    parseJson(txt) { const m = String(txt).match(/\{[\s\S]*\}/); if (!m) throw new Error('AI gaf geen geldig antwoord'); return JSON.parse(m[0]); },
    async plan(text) {
      const folders = data.folders();
      const candidates = searchWebsites(text, 15).map((r) => ({ name: r.site.name, desc: r.site.description, tags: r.site.tags, folder: A.folders.pathLabel(folders, r.site.folder_id) }));
      const system = 'Je bent Angel, de assistent van Angel OS (een persoonlijke startpagina). Vandaag is ' + A.fmtLong(A.today()) + ' (' + A.today() + '), tijdzone ' + data.settings().timezone + '. ' +
        'Kies precies één tool voor het verzoek en antwoord ALLEEN met JSON: {"tool": naam of null, "args": {...}, "reply": korte Nederlandse zin}. ' +
        'Verzin geen websites: noem alleen websites uit "kandidaten". Gebruik tool "parse_task" met {"text": originele tekst} voor taken/herinneringen zonder duidelijke datum/tijd. ' +
        'Tools: ' + Object.entries(TOOLS).map(([k, v]) => k + ' — ' + v.desc).join('; ') + '; parse_task — laat de ingebouwde parser een taak maken. args: {text}. ' +
        'Mappen: ' + folders.slice(0, 60).map((f) => A.folders.pathLabel(folders, f.id)).join(' | ');
      const out = await this.complete(system, 'Verzoek: ' + text + '\nKandidaten (eigen bibliotheek): ' + JSON.stringify(candidates), true);
      return this.parseJson(out);
    },
    async classifyWebsite(site, folders) {
      const paths = folders.map((f) => A.folders.pathLabel(folders, f.id));
      const out = await this.complete('Je deelt websites in mappen in. Antwoord alleen met JSON: {"path": ["Hoofdmap","Submap"], "confidence": 0-1, "reason": "kort"}. Gebruik bij voorkeur een bestaand pad; maak alleen een nieuw pad als niets past. Bestaande paden: ' + paths.join(' | '),
        JSON.stringify({ name: site.name, url: site.url, description: site.description, tags: site.tags }), true);
      return this.parseJson(out);
    },
    async test() { const r = await this.complete('Antwoord met JSON {"ok":true}', 'test', true); return this.parseJson(r).ok === true; }
  };

  A.ai = ai;
  A.angel = { command, runTool, route, answerQuestion, taskFromText, searchWebsites, TOOLS, createNote };
})();
