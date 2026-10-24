/* Startpagina: Google-zoekbalk (met URL-invoer), Angel-commandobalk, bewerkbare snelkoppelingen en aanpasbare widgets. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, store, t } = A;

  // ---------- Aanbevelingen (alleen op basis van gebruik binnen Angel OS) ----------
  A.recommend = function () {
    const s = data.settings(); if (!s.privacy.recommendations) return [];
    const out = []; const sites = data.websites(); const folders = data.folders();
    const act = store.get('activity', []).filter((a) => a.type === 'open_site');
    const freq = {}; act.forEach((a) => { if (a.folder) freq[a.folder] = (freq[a.folder] || 0) + 1; });
    const topFolder = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (topFolder) {
      const unseen = sites.filter((x) => x.folder_id === topFolder[0] && !x.use_count).slice(0, 1)[0];
      if (unseen) out.push({ title: 'Probeer ' + unseen.name, body: 'Je opent vaak websites uit ' + A.folders.pathLabel(folders, topFolder[0]) + '. Deze heb je nog niet gebruikt: ' + (unseen.description || A.hostOf(unseen.url)), link: '#/library?id=' + unseen.id, siteId: unseen.id });
    }
    const note = data.notes().slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
    if (note && note.title) { const r = A.angel.searchWebsites(note.title, 1)[0]; if (r && r.score >= 2) out.push({ title: r.site.name + ' past bij je notitie', body: '“' + note.title + '” — ' + r.why.join(', '), link: '#/library?id=' + r.site.id, siteId: r.site.id }); }
    const subjTask = data.items().find((i) => !i.done && i.subject && i.date === A.today());
    if (subjTask) { const r = A.angel.searchWebsites(subjTask.subject + ' ' + subjTask.title, 1)[0]; if (r && r.score >= 2) out.push({ title: 'Voor “' + subjTask.title + '”', body: r.site.name + ' kan helpen (' + r.why[0] + ').', link: '#/library?id=' + r.site.id, siteId: r.site.id }); }
    const missing = sites.filter((x) => !x.description || x.description.length < 25).length;
    if (missing) out.push({ title: missing + ' websites zonder goede beschrijving', body: 'Laat Angel ze nalopen via ‘Websites opnieuw indelen’.', link: '#/library?reorganize=1' });
    const h = data.health(); const bad = sites.filter((x) => h.results[x.url] && ['offline', 'parked', 'suspicious', 'cert_problem'].includes(h.results[x.url].status));
    if (bad.length) out.push({ title: bad.length + ' websites hebben aandacht nodig', body: bad.slice(0, 3).map((x) => x.name).join(', '), link: '#/health' });
    return out;
  };

  // ---------- Widgets ----------
  const WIDGETS = {
    clock: { size: 1, render(w) { const n = A.now(); return '<div class="w-big">' + A.pad2(n.getHours()) + ':' + A.pad2(n.getMinutes()) + '</div><div class="muted">' + esc(A.fmtLong(A.today())) + '</div><div class="faint" style="margin-top:auto;font-size:12px">Week ' + A.weekNumber(n) + ' · ' + esc(data.settings().timezone) + '</div>'; }, live: true },
    weather: { size: 1, async render(w, el) {
      const r = await A.weather.get();
      if (r.status === 'nolocation') return '<p class="muted" style="margin:0 0 10px;font-size:14px">Waar ben je? Locatie wordt alleen gebruikt voor het weer.</p><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-primary" data-gps>' + icon('mapPin') + 'Mijn locatie</button><button class="btn btn-sm" data-city>' + t('weather.setCity') + '</button></div>';
      if (r.status !== 'ok') return '<p class="muted">' + t('weather.unavailable') + '</p>';
      return '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:38px">' + r.emoji + '</span><div><div class="w-big" style="font-size:34px">' + r.temp + '°</div><div class="muted" style="font-size:13px">' + esc(r.label) + ' · voelt als ' + r.feels + '°</div></div></div><div class="faint" style="font-size:12px;margin:6px 0">' + icon('mapPin') + ' ' + esc(r.place) + (r.stale ? ' · niet actueel' : '') + '</div>' +
        '<div class="w-forecast">' + r.days.map((d, i) => '<div>' + (i === 0 ? 'Vandaag' : A.DAYS[A.parseYmd(d.date).getDay()].slice(0, 2)) + '<b>' + A.weather.EMOJI[d.cond] + ' ' + d.max + '°</b>' + d.min + '°</div>').join('') + '</div>';
    }, bind(el) {
      const g = el.querySelector('[data-gps]'); if (g) g.onclick = async () => { try { await A.weather.requestGps(); A.rerender(); A.weather.applyBackground(); } catch (e) { A.toast(e.message); cityPicker(); } };
      const c = el.querySelector('[data-city]'); if (c) c.onclick = cityPicker;
    } },
    agenda: { size: 1, render(w) {
      const d = A.today(); const tm = A.ymd(A.addDays(A.now(), 1));
      const list = data.items().filter((i) => !i.done && (i.date === d || i.date === tm) && (i.time || i.type === 'event')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, w.settings.count || 4);
      return list.length ? '<div class="w-list">' + list.map((i) => '<div class="w-row" data-date="' + esc(i.date) + '"><span class="dot t-' + esc(i.type) + '"></span><span>' + (i.date === tm ? '<span class="faint">morgen</span> ' : '') + (i.time ? '<b>' + esc(i.time) + '</b> ' : '') + esc(i.title) + '</span></div>').join('') + '</div>' : '<p class="muted" style="margin:0">Geen afspraken vandaag en morgen.</p>';
    }, bind(el) { el.querySelectorAll('[data-date]').forEach((r) => (r.onclick = () => A.go('agenda', null, { date: r.dataset.date }))); } },
    todo: { size: 2, render(w) {
      const d = A.today(); const over = A.tasks.eligibleRollover(d);
      const list = data.items().filter((i) => i.date === d && i.type !== 'event').sort((a, b) => (a.done - b.done) || (a.order || 0) - (b.order || 0));
      const done = list.filter((i) => i.done).length;
      return '<div class="progress" style="margin-top:0"><div style="width:' + (list.length ? Math.round(done / list.length * 100) : 0) + '%"></div></div><div class="faint" style="font-size:12px;margin-bottom:8px">' + done + ' van ' + list.length + ' klaar' + (over.length ? ' · <span style="color:var(--danger)">' + over.length + ' te laat</span>' : '') + '</div>' +
        '<div class="w-list">' + over.slice(0, 3).concat(list).slice(0, w.settings.count || 7).map((i) => '<div class="w-row ' + (i.done ? 'done' : '') + '"><button class="check sm ' + (i.done ? 'on' : '') + '" data-done="' + esc(i.id) + '" aria-label="Afvinken">' + (i.done ? icon('check') : '') + '</button><span>' + (i.date < d ? '<em style="color:var(--danger);font-style:normal;font-size:11px;font-weight:700">te laat · </em>' : '') + (i.time ? '<b>' + esc(i.time) + '</b> ' : '') + esc(i.title) + '</span></div>').join('') + '</div>' +
        (!list.length && !over.length ? '<p class="muted" style="margin:0">' + t('task.noneToday') + '</p>' : '') + '<form data-add style="display:flex;gap:6px;margin-top:auto;padding-top:10px"><input class="input" placeholder="Taak toevoegen…" aria-label="Taak toevoegen"><button class="btn btn-sm btn-primary">' + icon('plus') + '</button></form>';
    }, bind(el) {
      el.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => { A.tasks.toggleDone(b.dataset.done); A.rerender(); }));
      const f = el.querySelector('[data-add]'); f.onsubmit = async (e) => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; A.handleQuickResult(await A.angel.taskFromText(v), v); };
    } },
    quick: { size: 1, render() { return '<p class="muted" style="margin:0 0 10px;font-size:13px">Typ een taak, herinnering of opdracht. Angel snapt bijv. ‘morgen om 16:00 economie leren’.</p><form data-q style="margin-top:auto;display:flex;gap:6px"><input class="input" placeholder="Snel noteren…" aria-label="Snel noteren"><button class="btn btn-sm btn-primary">' + icon('plus') + '</button></form>'; },
      bind(el) { const f = el.querySelector('[data-q]'); f.onsubmit = async (e) => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; f.querySelector('input').value = ''; A.handleQuickResult(await A.angel.command(v), v); }; } },
    recent: { size: 1, render(w) { const l = data.websites().filter((x) => x.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at)).slice(0, w.settings.count || 5); return l.length ? siteRows(l) : '<p class="muted" style="margin:0">Open websites via Angel OS; ze verschijnen dan hier.</p>'; }, bind: bindSites },
    favorites: { size: 1, render(w) { const l = data.websites().filter((x) => x.is_favorite).slice(0, w.settings.count || 6); return l.length ? siteRows(l) : '<p class="muted" style="margin:0">Markeer websites met ★ in de bibliotheek.</p>'; }, bind: bindSites },
    added: { size: 1, render(w) { const l = data.websites().slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, w.settings.count || 5); return siteRows(l); }, bind: bindSites },
    health: { size: 1, render() {
      const h = data.health(); if (!h.checked_at) return '<p class="muted" style="margin:0;font-size:14px">Nog geen websitecontrole uitgevoerd.</p><button class="btn btn-sm" style="margin-top:auto" data-go-health>Bekijk</button>';
      const sites = data.websites(); const bad = sites.filter((x) => h.results[x.url] && !['online', 'https_valid'].includes(h.results[x.url].status));
      return '<div class="w-big" style="font-size:30px">' + (sites.length - bad.length) + '<span class="muted" style="font-size:16px"> / ' + sites.length + ' ok</span></div><div class="faint" style="font-size:12px">Controle: ' + esc(A.relTime(h.checked_at)) + '</div><div class="w-list" style="margin-top:8px">' + bad.slice(0, 3).map((x) => '<div class="w-row" data-go-health><span class="status st-' + h.results[x.url].status + '">' + esc(t('site.status.' + h.results[x.url].status)) + '</span><span>' + esc(x.name) + '</span></div>').join('') + '</div>';
    }, bind(el) { el.querySelectorAll('[data-go-health]').forEach((b) => (b.onclick = () => A.go('health'))); } },
    suggestions: { size: 2, render() { const r = A.recommend(); if (!data.settings().privacy.recommendations) return '<p class="muted" style="margin:0">Aanbevelingen staan uit (Instellingen → Privacy).</p>'; return r.length ? '<div class="w-list">' + r.slice(0, 3).map((x) => '<div class="w-row" data-link="' + esc(x.link) + '" style="align-items:flex-start"><span class="angel-logo sm">' + icon('sparkles') + '</span><span style="white-space:normal"><b>' + esc(x.title) + '</b><br><span class="muted" style="font-size:13px">' + esc(x.body) + '</span></span></div>').join('') + '</div>' : '<p class="muted" style="margin:0">Nog geen suggesties. Gebruik Angel OS een tijdje; Angel kijkt alleen naar wat je híer doet.</p>'; },
      bind(el) { el.querySelectorAll('[data-link]').forEach((r) => (r.onclick = () => { location.hash = r.dataset.link; })); } },
    quicknote: { size: 1, render() { const n = data.notes().find((x) => x.quick); return '<textarea class="input" data-qn style="flex:1;min-height:110px;resize:none" placeholder="Schrijf iets op…">' + esc(n ? n.content || '' : '') + '</textarea><div class="faint" style="font-size:11px;margin-top:6px" data-qs>Wordt bewaard als notitie ‘Snelle notitie’</div>'; },
      bind(el) { const ta = el.querySelector('[data-qn]'); ta.oninput = A.debounce(() => { const notes = data.notes(); let n = notes.find((x) => x.quick); if (!n) { n = { id: A.uid(), quick: true, title: 'Snelle notitie', created_at: new Date().toISOString() }; notes.unshift(n); } n.content = ta.value; n.html = '<p>' + esc(ta.value).replace(/\n/g, '<br>') + '</p>'; n.updated_at = new Date().toISOString(); data.saveNotes(notes); el.querySelector('[data-qs]').textContent = 'Opgeslagen ✓'; }, 500); } },
    stats: { size: 1, render() {
      const ws = A.ymd(A.startOfWeek(A.now())); const items = data.items();
      const done = items.filter((i) => i.done && i.doneAt && i.doneAt.slice(0, 10) >= ws).length;
      const act = store.get('activity', []).filter((a) => a.at.slice(0, 10) >= ws);
      return '<div class="w-big" style="font-size:34px">' + done + '</div><div class="muted" style="font-size:13px">taken afgerond deze week</div><div class="kv" style="margin-top:auto"><span>Focussessies</span><b>' + act.filter((a) => a.type === 'focus_start').length + '</b></div><div class="kv"><span>Websites geopend</span><b>' + act.filter((a) => a.type === 'open_site').length + '</b></div>';
    } }
  };
  function siteRows(l) { return '<div class="w-list">' + l.map((x) => '<div class="w-row" data-site="' + esc(x.id) + '">' + A.favicon(x) + '<span>' + esc(x.name) + '</span></div>').join('') + '</div>'; }
  function bindSites(el) { el.querySelectorAll('[data-site]').forEach((r) => (r.onclick = () => data.useWebsite(r.dataset.site))); }

  const LAYOUTS = {
    balanced: ['todo', 'weather', 'clock', 'agenda', 'quick', 'suggestions', 'favorites', 'recent', 'health', 'stats'],
    focus: ['todo', 'weather', 'quick', 'clock'],
    minimal: ['todo', 'weather']
  };
  function widgets() { let w = store.get('widgets', null); if (!w) { w = LAYOUTS[data.settings().homeLayout] .map((type) => ({ id: A.uid(), type, size: WIDGETS[type].size, settings: {} })); store.set('widgets', w); } return w.filter((x) => WIDGETS[x.type]); }
  A.homeWidgets = { WIDGETS, LAYOUTS, list: widgets, setLayout(name) { store.set('widgets', LAYOUTS[name].map((type) => ({ id: A.uid(), type, size: WIDGETS[type].size, settings: {} }))); A.data.patchSettings({ homeLayout: name }); } };

  function cityPicker() {
    A.openModal('<h2>' + t('weather.setCity') + '</h2><div class="row2"><input class="input" data-q placeholder="Bijv. Leiden"><button class="btn btn-primary" data-s>' + t('common.search') + '</button></div><div data-r style="margin-top:12px"></div>', (m, close) => {
      const run = async () => {
        const q = m.querySelector('[data-q]').value.trim(); if (!q) return;
        const box = m.querySelector('[data-r]'); box.innerHTML = '<p class="muted">' + t('common.loading') + '</p>';
        try { const r = await A.weather.searchCity(q); box.innerHTML = r.length ? r.map((c, i) => '<button class="nav-item" data-i="' + i + '">' + icon('mapPin') + esc(c.name) + '</button>').join('') : '<p class="muted">Geen plaats gevonden.</p>'; box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { A.weather.setCity(r[+b.dataset.i]); close(); A.rerender(); A.weather.applyBackground(); })); }
        catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
      };
      m.querySelector('[data-s]').onclick = run; m.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') run(); };
    });
  }
  A.cityPicker = cityPicker;

  // ---------- Google-suggesties (JSONP waar ondersteund) + eigen bibliotheek ----------
  let jsonpN = 0;
  function googleSuggest(q) {
    return new Promise((resolve) => {
      const cb = '__aosSuggest' + (++jsonpN); const s = document.createElement('script'); let done = false;
      const finish = (v) => { if (done) return; done = true; delete window[cb]; s.remove(); resolve(v); };
      window[cb] = (resp) => finish(Array.isArray(resp) && Array.isArray(resp[1]) ? resp[1].slice(0, 6) : []);
      s.src = 'https://suggestqueries.google.com/complete/search?client=youtube&hl=nl&q=' + encodeURIComponent(q) + '&callback=' + cb;
      s.onerror = () => finish([]); document.head.appendChild(s); setTimeout(() => finish([]), 1500);
    }).then((l) => l.map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === 'string'));
  }
  const isUrl = (v) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v) && !/\s/.test(v);

  // ---------- Snelkoppelingen ----------
  function shortcutIcon(s) {
    if (s.icon && /^data:image\//.test(s.icon)) return '<img src="' + esc(s.icon) + '" alt="">';
    if (s.icon) return esc(s.icon);
    return '<img src="https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(A.hostOf(s.url)) + '" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'' + esc(A.initials(s.name).slice(0, 1)) + '\'))">';
  }
  function editShortcut(s) {
    const isNew = !s; s = s || { id: A.uid(), name: '', url: '', icon: null };
    A.openModal('<h2>' + (isNew ? 'Snelkoppeling toevoegen' : 'Snelkoppeling bewerken') + '</h2><label class="field">Naam<input class="input" name="name" value="' + esc(s.name) + '"></label><label class="field">URL<input class="input" name="url" value="' + esc(s.url) + '" placeholder="https://"></label>' +
      '<div class="row2"><label class="field">Icoon (emoji, leeg = websiteicoon)<input class="input" name="icon" maxlength="4" value="' + esc(s.icon && !/^data:/.test(s.icon) ? s.icon : '') + '"></label><label class="field">Of eigen afbeelding<input class="input" type="file" name="img" accept="image/png,image/jpeg,image/webp,image/gif"></label></div>' +
      '<div class="modal-actions">' + (!isNew ? '<button class="btn btn-danger" data-del style="margin-right:auto">Verwijderen</button>' : '') + '<button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-save>Opslaan</button></div>', (m, close) => {
      const f = (n) => m.querySelector('[name="' + n + '"]'); let img = null;
      f('img').onchange = (e) => { const file = e.target.files[0]; if (!file) return; try { A.files.validate(file); } catch (er) { A.toast(er.message); return; } const im = new Image(); const u = URL.createObjectURL(file); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 96; const ctx = c.getContext('2d'); const sc = Math.max(96 / im.width, 96 / im.height); ctx.drawImage(im, (96 - im.width * sc) / 2, (96 - im.height * sc) / 2, im.width * sc, im.height * sc); img = c.toDataURL('image/png'); URL.revokeObjectURL(u); }; im.src = u; };
      m.querySelector('[data-save]').onclick = () => {
        let url = f('url').value.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        try { new URL(url); } catch (e) { A.toast(t('err.invalidUrl')); return; }
        const list = data.shortcuts();
        if (list.some((x) => x.id !== s.id && A.normUrl(x.url) === A.normUrl(url))) { A.toast('Die snelkoppeling bestaat al'); return; }
        const rec = { id: s.id, name: f('name').value.trim() || A.hostOf(url), url, icon: img || f('icon').value.trim() || (s.icon && /^data:/.test(s.icon) ? s.icon : null) };
        if (isNew) list.push(rec); else Object.assign(list.find((x) => x.id === s.id), rec);
        data.saveShortcuts(list); close(); A.rerender();
      };
      const d = m.querySelector('[data-del]'); if (d) d.onclick = () => { data.saveShortcuts(data.shortcuts().filter((x) => x.id !== s.id)); close(); A.rerender(); };
    });
  }

  // ---------- App ----------
  A.registerApp({
    id: 'home', name: t('app.home'), icon: 'home', color: 'linear-gradient(160deg,#ffb340,#ff7a00)', keywords: 'home start zoeken google',
    render(el) {
      const s = data.settings(); const n = A.now(); const h = n.getHours();
      const greet = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
      let editing = false;
      el.innerHTML = '<div class="home"><section class="home-hero"><div class="home-greet">' + greet + (s.name ? ', ' + esc(s.name) : '') + ' · ' + esc(A.fmtLong(A.today())) + '</div><div class="home-time" data-time>' + A.pad2(h) + ':' + A.pad2(n.getMinutes()) + '</div>' +
        '<div class="web-search"><form role="search" data-search><svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z"/></svg>' +
        '<input id="web-search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Zoek op Google of typ een URL" aria-label="Zoek op Google of typ een URL"><button class="btn btn-primary" type="submit">Google</button></form><div class="suggest" hidden></div></div>' +
        '<form class="home-cmd" data-cmd><input class="input" placeholder="Vraag Angel: ‘Taak: …’, ‘Notitie: …’, ‘Herinner me morgen om 16:00…’" aria-label="Opdracht voor Angel"><button class="btn">' + icon('bot') + '<span class="hide-sm">Angel</span></button></form></section>' +
        '<nav class="shortcuts" aria-label="Snelkoppelingen"></nav><section class="widgets" aria-label="Widgets"></section><div class="home-toolbar"><button class="btn btn-glass btn-sm" data-edit>' + icon('layout') + 'Startpagina aanpassen</button></div></div>';

      // zoeken
      const form = el.querySelector('[data-search]'); const inp = form.querySelector('input'); const sug = el.querySelector('.suggest');
      let sItems = [], sSel = -1;
      const runSearch = (v) => { v = v.trim(); if (!v) return; if (isUrl(v)) { window.open(/^https?:/i.test(v) ? v : 'https://' + v, '_blank', 'noopener'); A.track('open_url', { host: A.hostOf(/^https?:/i.test(v) ? v : 'https://' + v) }); } else { A.track('search', { engine: 'google' }); window.open('https://www.google.com/search?q=' + encodeURIComponent(v), '_blank', 'noopener'); } inp.value = ''; sug.hidden = true; };
      form.onsubmit = (e) => { e.preventDefault(); if (sSel >= 0 && sItems[sSel]) sItems[sSel].run(); else runSearch(inp.value); };
      const drawSug = A.debounce(async () => {
        const v = inp.value.trim(); if (!v) { sug.hidden = true; return; }
        const local = A.angel.searchWebsites(v, 3).filter((r) => r.score >= 2);
        const g = isUrl(v) ? [] : await googleSuggest(v);
        if (inp.value.trim() !== v) return;
        sItems = [].concat(isUrl(v) ? [{ label: 'Open ' + v, ic: 'external', run: () => runSearch(v) }] : [{ label: 'Zoek op Google: ' + v, ic: 'search', run: () => runSearch(v) }], g.filter((x) => x.toLowerCase() !== v.toLowerCase()).slice(0, 5).map((x) => ({ label: x, ic: 'search', run: () => runSearch(x) })), local.map((r) => ({ label: r.site.name + ' — uit je bibliotheek', ic: 'bookmark', run: () => { sug.hidden = true; data.useWebsite(r.site.id); } })));
        sSel = -1; sug.innerHTML = sItems.map((x, i) => '<div class="sp-item" data-i="' + i + '">' + icon(x.ic) + '<span>' + esc(x.label) + '</span></div>').join(''); sug.hidden = false;
        sug.querySelectorAll('[data-i]').forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); sItems[+d.dataset.i].run(); }));
      }, 160);
      inp.oninput = drawSug;
      inp.onkeydown = (e) => { if (sug.hidden) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sSel = Math.max(-1, Math.min(sItems.length - 1, sSel + (e.key === 'ArrowDown' ? 1 : -1))); sug.querySelectorAll('.sp-item').forEach((d, i) => d.classList.toggle('sel', i === sSel)); } if (e.key === 'Escape') sug.hidden = true; };
      inp.onblur = () => setTimeout(() => { sug.hidden = true; }, 120);
      if (window.matchMedia('(pointer:fine)').matches) setTimeout(() => inp.focus(), 60);

      const cmd = el.querySelector('[data-cmd]');
      cmd.onsubmit = async (e) => { e.preventDefault(); const v = cmd.querySelector('input').value.trim(); if (!v) return; cmd.querySelector('input').value = ''; A.handleQuickResult(await A.angel.command(v), v); };

      // snelkoppelingen
      const scBox = el.querySelector('.shortcuts');
      const drawShortcuts = () => {
        const list = data.shortcuts(); let dragId = null;
        scBox.innerHTML = list.map((x) => '<a class="shortcut" href="' + esc(x.url) + '" target="_blank" rel="noopener" draggable="true" data-id="' + esc(x.id) + '"><span class="sc-ic">' + shortcutIcon(x) + '</span><span>' + esc(x.name) + '</span><button class="icon-btn sm sc-edit" data-edit-sc="' + esc(x.id) + '" aria-label="Bewerk ' + esc(x.name) + '">' + icon('pencil') + '</button></a>').join('') +
          '<button class="shortcut" data-add-sc><span class="sc-ic">' + icon('plus') + '</span><span>Toevoegen</span></button>';
        scBox.querySelectorAll('.shortcut[data-id]').forEach((a) => {
          a.onclick = (e) => { if (e.target.closest('[data-edit-sc]')) { e.preventDefault(); return; } A.track('open_shortcut', { host: A.hostOf(a.href) }); };
          a.addEventListener('dragstart', (e) => { dragId = a.dataset.id; e.dataTransfer.effectAllowed = 'move'; });
          a.addEventListener('dragover', (e) => { e.preventDefault(); a.classList.add('drag-over'); });
          a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
          a.addEventListener('drop', (e) => { e.preventDefault(); a.classList.remove('drag-over'); if (!dragId || dragId === a.dataset.id) return; const l = data.shortcuts(); const from = l.findIndex((x) => x.id === dragId); const [mv] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === a.dataset.id), 0, mv); data.saveShortcuts(l); drawShortcuts(); });
        });
        scBox.querySelectorAll('[data-edit-sc]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); editShortcut(data.shortcuts().find((x) => x.id === b.dataset.editSc)); }));
        scBox.querySelector('[data-add-sc]').onclick = () => {
          // Angel raadt snelkoppelingen aan op basis van wat je in Angel OS het meest opent
          const have = new Set(data.shortcuts().map((x) => A.normUrl(x.url)));
          const rec = data.settings().privacy.recommendations ? data.websites().filter((x) => (x.use_count || 0) > 0 && !have.has(A.normUrl(x.url))).sort((a, b) => b.use_count - a.use_count).slice(0, 4) : [];
          if (!rec.length) return editShortcut(null);
          A.openModal('<h2>Snelkoppeling toevoegen</h2><p class="muted">Aanbevolen op basis van wat je via Angel OS opent:</p>' + rec.map((x) => '<button class="nav-item" data-r="' + esc(x.id) + '">' + A.favicon(x) + esc(x.name) + '<small>' + (x.use_count) + '× geopend</small></button>').join('') + '<div class="modal-actions"><button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-own>Eigen URL…</button></div>', (m, close) => {
            m.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { const x = data.websites().find((y) => y.id === b.dataset.r); const l = data.shortcuts(); l.push({ id: A.uid(), name: x.name, url: x.url, icon: null }); data.saveShortcuts(l); close(); drawShortcuts(); }));
            m.querySelector('[data-own]').onclick = () => { close(); editShortcut(null); };
          });
        };
      };
      drawShortcuts();

      // widgets
      const wBox = el.querySelector('.widgets');
      const drawWidgets = () => {
        const list = widgets(); let dragId = null;
        wBox.classList.toggle('editing', editing);
        wBox.innerHTML = '';
        list.forEach((w) => {
          const def = WIDGETS[w.type];
          const card = A.html('<article class="widget s-' + (w.size || def.size) + '" data-id="' + w.id + '" draggable="' + editing + '"><div class="widget-head"><span class="label">' + esc(t('widget.' + w.type)) + '</span><div class="widget-tools"><button class="icon-btn sm" data-size title="Grootte">' + icon('layout') + '</button>' + (['agenda', 'todo', 'recent', 'favorites', 'added'].includes(w.type) ? '<button class="icon-btn sm" data-cfg title="Instellingen">' + icon('settings') + '</button>' : '') + '<button class="icon-btn sm" data-rm title="Verwijderen">' + icon('x') + '</button></div></div><div class="widget-body" style="display:flex;flex-direction:column;flex:1;min-height:0"><p class="muted">' + t('common.loading') + '</p></div></article>');
          wBox.appendChild(card);
          Promise.resolve(def.render(w, card)).then((h2) => { const b = card.querySelector('.widget-body'); b.innerHTML = h2; b.querySelectorAll('svg[aria-hidden]').forEach((sv) => { if (!sv.closest('.btn,.icon-btn,.check,.angel-logo')) { sv.style.width = '13px'; sv.style.height = '13px'; } }); if (def.bind) def.bind(b, w); });
          card.querySelector('[data-size]').onclick = () => { const l = widgets(); const x = l.find((y) => y.id === w.id); x.size = { 1: 2, 2: 4, 4: 1 }[x.size || def.size]; store.set('widgets', l); drawWidgets(); };
          card.querySelector('[data-rm]').onclick = () => { store.set('widgets', widgets().filter((y) => y.id !== w.id)); drawWidgets(); };
          const cfg = card.querySelector('[data-cfg]'); if (cfg) cfg.onclick = async () => { const v = await A.promptDialog('Hoeveel items tonen?', String(w.settings.count || ''), 'bijv. 5'); if (!v || isNaN(+v)) return; const l = widgets(); l.find((y) => y.id === w.id).settings.count = Math.max(1, Math.min(20, +v)); store.set('widgets', l); drawWidgets(); };
          card.addEventListener('dragstart', (e) => { if (!editing) return e.preventDefault(); dragId = w.id; e.dataTransfer.effectAllowed = 'move'; });
          card.addEventListener('dragover', (e) => { if (editing) { e.preventDefault(); card.classList.add('drag-over'); } });
          card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
          card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drag-over'); if (!dragId || dragId === w.id) return; const l = widgets(); const from = l.findIndex((x) => x.id === dragId); const [mv] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === w.id), 0, mv); store.set('widgets', l); drawWidgets(); });
        });
        if (!list.length) wBox.innerHTML = '<div class="empty" style="grid-column:1/-1">Geen widgets. Klik op ‘Startpagina aanpassen’ om er toe te voegen.</div>';
      };
      drawWidgets();
      const toolbar = el.querySelector('.home-toolbar');
      const drawToolbar = () => {
        toolbar.innerHTML = editing ? '<button class="btn btn-glass btn-sm" data-addw>' + icon('plus') + 'Widget toevoegen</button><select class="input btn-sm" style="width:auto" data-layout aria-label="Indeling"><option value="">Indeling kiezen…</option><option value="balanced">Gebalanceerd</option><option value="focus">Focus</option><option value="minimal">Minimaal</option></select><button class="btn btn-primary btn-sm" data-edit>' + t('common.done') + '</button>' : '<button class="btn btn-glass btn-sm" data-edit>' + icon('layout') + 'Startpagina aanpassen</button>';
        toolbar.querySelector('[data-edit]').onclick = () => { editing = !editing; drawWidgets(); drawToolbar(); };
        const lay = toolbar.querySelector('[data-layout]'); if (lay) lay.onchange = async () => { if (!lay.value) return; if (await A.confirmDialog('Indeling ‘' + lay.options[lay.selectedIndex].text + '’ toepassen?', 'Toepassen', 'Je huidige widgets worden vervangen. Je gegevens blijven bewaard.')) { A.homeWidgets.setLayout(lay.value); drawWidgets(); } lay.value = ''; };
        const aw = toolbar.querySelector('[data-addw]'); if (aw) aw.onclick = () => {
          const have = new Set(widgets().map((w) => w.type));
          A.openModal('<h2>Widget toevoegen</h2>' + Object.keys(WIDGETS).map((k) => '<button class="nav-item" data-w="' + k + '"' + (have.has(k) ? ' disabled style="opacity:.45"' : '') + '>' + esc(t('widget.' + k)) + (have.has(k) ? '<small>al toegevoegd</small>' : '') + '</button>').join('') + '<div class="modal-actions"><button class="btn" data-close>Sluiten</button></div>', (m, close) => {
            m.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { if (b.disabled) return; const l = widgets(); l.push({ id: A.uid(), type: b.dataset.w, size: WIDGETS[b.dataset.w].size, settings: {} }); store.set('widgets', l); close(); drawWidgets(); }));
          });
        };
      };
      drawToolbar();

      const iv = setInterval(() => { const n2 = A.now(); const tEl = el.querySelector('[data-time]'); if (tEl) tEl.textContent = A.pad2(n2.getHours()) + ':' + A.pad2(n2.getMinutes()); }, 10000);
      const offWeather = A.bus.on('weather', () => drawWidgets());
      return () => { clearInterval(iv); offWeather(); };
    }
  });
})();
