/* Instellingen, Quality Control en Task Manager + pincode-vergrendeling en meldingen */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, store } = A;
  const ACCENTS = ['#f97316', '#3b82f6', '#22c55e', '#ec4899', '#a78bfa'];

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Pincode ----------
  function lockScreen() {
    const hash = store.get('pinHash', null);
    let unlocked = false; try { unlocked = sessionStorage.getItem('aos-unlocked') === '1'; } catch (e) {}
    if (!hash || unlocked || !(window.crypto && crypto.subtle)) return;
    const ov = A.html('<div class="overlay" style="z-index:100;align-items:center;background:rgba(5,6,10,.9)"><form class="modal" style="width:320px;text-align:center"><div class="angel-logo">' + icon('shield') + '</div><h2>Angel OS is vergrendeld</h2><input class="input" type="password" inputmode="numeric" autocomplete="off" placeholder="Pincode" style="text-align:center;font-size:20px;letter-spacing:.3em"><p class="muted" data-err style="min-height:20px;font-size:13px"></p><button class="btn btn-primary" style="width:100%;justify-content:center">Ontgrendelen</button></form></div>');
    document.body.appendChild(ov);
    const inp = ov.querySelector('input');
    setTimeout(() => inp.focus(), 50);
    ov.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      if ((await sha256(inp.value)) === hash) { try { sessionStorage.setItem('aos-unlocked', '1'); } catch (er) {} ov.remove(); }
      else { ov.querySelector('[data-err]').textContent = 'Onjuiste pincode'; inp.value = ''; }
    };
  }

  // ---------- Meldingen ----------
  const notified = new Set();
  function checkNotifications() {
    const s = data.settings();
    if (!s.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date(); const t = A.today(); const hhmm = A.pad2(now.getHours()) + ':' + A.pad2(now.getMinutes());
    data.items().filter((i) => !i.done && i.date === t && i.time === hhmm && !notified.has(i.id)).forEach((i) => {
      notified.add(i.id);
      try { new Notification('Angel OS', { body: i.time + ' · ' + i.title }); } catch (e) {}
    });
  }

  document.addEventListener('DOMContentLoaded', () => { lockScreen(); setInterval(checkNotifications, 20000); });

  // ---------- Back-up ----------
  const BACKUP_KEYS = ['websites', 'notes', 'projects', 'items', 'subjects', 'settings', 'rooster', 'calendars', 'swipe', 'px-profiles', 'px-searches', 'px-runs'];
  function exportAll() {
    const out = { app: 'angel-os', version: 2, exported_at: new Date().toISOString(), data: {} };
    BACKUP_KEYS.forEach((k) => { const v = store.get(k, null); if (v != null) out.data[k] = v; });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'angel-os-backup-' + A.today() + '.json'; a.click();
    store.set('lastBackup', new Date().toISOString());
  }
  function importAll(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const j = JSON.parse(r.result);
        const d = j.data || j;
        if (Array.isArray(d)) { // los websites-bestand
          if (!(await A.confirmDialog(d.length + ' websites toevoegen aan je bibliotheek?', 'Importeren'))) return;
          const list = data.websites(); const urls = new Set(list.map((s) => s.url));
          d.forEach((s) => { if (s && s.url && !urls.has(s.url)) list.push(Object.assign({ id: A.uid(), tags: [], use_count: 0 }, s)); });
          data.saveWebsites(list); A.toast('Websites geïmporteerd'); A.rerender(); return;
        }
        if (!(await A.confirmDialog('Back-up terugzetten? Dit vervangt je huidige gegevens.', 'Terugzetten'))) return;
        Object.keys(d).forEach((k) => { if (BACKUP_KEYS.includes(k)) store.set(k, d[k]); });
        A.applySettings(); A.toast('Back-up teruggezet'); A.rerender();
      } catch (e) { A.toast('Kon bestand niet lezen: ' + e.message); }
    };
    r.readAsText(file);
  }
  A.exportAll = exportAll;

  // ---------- Instellingen ----------
  A.registerApp({
    id: 'settings', name: 'Instellingen', icon: 'settings', dock: true, keywords: 'settings thema kleur pincode rooster vakken',
    color: 'linear-gradient(135deg,#9ca3af,#4b5563)',
    render(el, route) {
      const s = data.settings();
      const swipe = Object.assign({}, A.DEFAULT_SWIPE, store.get('swipe', {}));
      const cals = store.get('calendars', []);
      const subj = data.subjects();
      const hasPin = !!store.get('pinHash', null);
      const notifState = !('Notification' in window) ? 'niet ondersteund' : Notification.permission;
      el.innerHTML = '<div class="pad narrow">' +
        '<section class="set-section"><h3>Uiterlijk</h3><div class="card"><div class="label">Thema</div><div class="theme-opts" style="margin:10px 0 18px">' +
        [['light', 'Licht', 'sun'], ['dark', 'Donker', 'moon'], ['system', 'Systeem', 'monitor']].map(([k, l, ic]) => '<button class="theme-opt ' + (s.theme === k ? 'on' : '') + '" data-theme="' + k + '">' + icon(ic) + l + '</button>').join('') +
        '</div><div class="label">Accentkleur</div><div class="swatches" style="margin:10px 0 8px">' + ACCENTS.map((c) => '<button class="swatch ' + (s.accent === c ? 'on' : '') + '" data-accent="' + c + '" style="background:' + c + '" aria-label="Accentkleur ' + c + '"></button>').join('') + '</div>' +
        '<div class="set-row"><div><b>Minder beweging</b><div class="muted" style="font-size:13px">Zet venster- en eilandanimaties uit.</div></div><button class="toggle ' + (s.reduceMotion ? 'on' : '') + '" data-rm aria-label="Minder beweging"></button></div>' +
        '<div class="set-row"><div><b>Jouw naam</b><div class="muted" style="font-size:13px">Voor de begroeting op Home.</div></div><input class="input" style="max-width:220px" data-name value="' + esc(s.name) + '" placeholder="Naam"></div></div></section>' +

        '<section class="set-section" id="agendas"><h3>Agenda\'s & rooster</h3><div class="card"><p class="muted" style="margin-top:0;font-size:14px">Plak je Somtoday- of Google Agenda-link (iCal). Dan zie je in Vandaag, Week en Rooster wanneer je les hebt en wanneer je vrij bent.</p>' +
        '<div class="row2"><select class="input" data-cal-kind><option value="somtoday">🏫 Somtoday</option><option value="google">📆 Google Agenda</option><option value="other">🗓️ Andere iCal</option></select><input class="input" data-cal-url placeholder="https://… .ics"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-primary" data-cal-add>Agenda toevoegen</button><label class="btn">' + icon('upload') + '.ics-bestand importeren<input type="file" accept=".ics,text/calendar" data-ics hidden></label></div>' +
        '<p class="faint" style="font-size:12px">Somtoday → Rooster → Agenda koppelen / Rooster exporteren → kopieer de iCal-link. Lukt ophalen niet (de server van je school kan dat blokkeren), download dan het .ics-bestand en importeer het.</p>' +
        (cals.length ? cals.map((c, i) => '<div class="set-row"><div><b>' + esc(c.label) + '</b><div class="faint" style="font-size:12px">' + c.count + ' items · bijgewerkt ' + esc(A.relTime(c.updated)) + '</div></div><div style="display:flex;gap:6px">' + (c.url ? '<button class="btn btn-sm" data-cal-refresh="' + i + '">' + icon('refresh') + '</button>' : '') + '<button class="btn btn-sm btn-danger" data-cal-del="' + i + '">' + icon('trash') + '</button></div></div>').join('') : '') +
        '</div></section>' +

        '<section class="set-section"><h3>Mijn vakken</h3><div class="card"><p class="muted" style="margin-top:0;font-size:14px">' + subj.length + ' vakken · ANGEL herkent alleen deze.</p><div class="tags">' + subj.map((x, i) => '<span class="chip">' + esc(x) + ' <button class="btn-ghost" style="border:none;background:none;padding:0 0 0 4px;color:var(--muted)" data-subj-del="' + i + '" aria-label="Verwijder ' + esc(x) + '">×</button></span>').join('') + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><input class="input" data-subj-new placeholder="Vak toevoegen"><button class="btn" data-subj-add>Toevoegen</button><button class="btn btn-ghost" data-subj-reset>Standaard</button></div></div></section>' +

        '<section class="set-section"><h3>Taken</h3><div class="card">' +
        '<div class="set-row"><div><b>Onafgemaakte taken</b><div class="muted" style="font-size:13px">Wat er gebeurt met taken van eerdere dagen.</div></div><select class="input" style="max-width:220px" data-unf><option value="ask"' + (s.unfinished === 'ask' ? ' selected' : '') + '>Eerst vragen</option><option value="auto"' + (s.unfinished === 'auto' ? ' selected' : '') + '>Automatisch doorschuiven</option><option value="keep"' + (s.unfinished === 'keep' ? ' selected' : '') + '>Laten staan</option></select></div>' +
        '<div class="set-row"><div><b>Meldingen</b><div class="muted" style="font-size:13px">Melding op het tijdstip van een taak (zolang Angel OS open is). Status: ' + esc(notifState) + '</div></div><button class="toggle ' + (s.notifications ? 'on' : '') + '" data-notif aria-label="Meldingen"></button></div>' +
        '<div class="set-row"><div><b>Pincode</b><div class="muted" style="font-size:13px">Snelle vergrendeling op dit apparaat.</div></div>' + (hasPin ? '<button class="btn btn-sm btn-danger" data-pin-off>Pincode verwijderen</button>' : '<div style="display:flex;gap:6px"><input class="input" type="password" inputmode="numeric" style="max-width:120px" data-pin placeholder="4+ cijfers"><button class="btn btn-sm" data-pin-on>Instellen</button></div>') + '</div>' +
        '</div></section>' +

        '<section class="set-section"><h3>Swipe</h3><div class="card"><p class="muted" style="margin-top:0;font-size:14px">Veeg-gevoel afstemmen voor de takenlijst.</p>' +
        [['threshold', 'Drempel', 0.1, 0.9, 0.05], ['maxTravel', 'Max. afstand (px)', 60, 260, 10], ['rubberBand', 'Rubberband', 0, 1, 0.05], ['flickVelocity', 'Flick-snelheid', 0.2, 2, 0.05], ['snapBackMs', 'Terugveren (ms)', 80, 600, 20]].map(([k, l, mi, ma, st]) => '<div class="set-row"><span>' + l + '</span><span style="display:flex;gap:10px;align-items:center"><input type="range" min="' + mi + '" max="' + ma + '" step="' + st + '" value="' + swipe[k] + '" data-swipe="' + k + '"><code style="min-width:42px">' + swipe[k] + '</code></span></div>').join('') +
        '<button class="btn btn-sm" data-swipe-reset>Standaardwaarden</button></div></section>' +

        '<section class="set-section"><h3>Jouw gegevens</h3><div class="stats">' +
        '<div class="stat" data-go="library"><span>Websites</span><b>' + data.websites().length + '</b></div><div class="stat" data-go="notes"><span>Notities</span><b>' + data.notes().length + '</b></div><div class="stat" data-go="projects"><span>Projecten</span><b>' + data.projects().length + '</b></div><div class="stat" data-go="agenda"><span>Taken</span><b>' + data.items().length + '</b></div></div>' +
        '<div class="card"><p class="muted" style="margin-top:0;font-size:14px">Alles wordt lokaal in deze browser opgeslagen. Maak een back-up om je gegevens naar een ander apparaat mee te nemen.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-export>' + icon('download') + 'Back-up exporteren</button><label class="btn">' + icon('upload') + 'Back-up / websites importeren<input type="file" accept=".json,application/json" data-import hidden></label><button class="btn btn-ghost" data-reseed>Standaardwebsites herstellen</button><button class="btn btn-danger" data-reset>Alles wissen</button></div></div></section>' +
        '</div>';

      const save = (patch) => { data.saveSettings(Object.assign(data.settings(), patch)); };
      el.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => { save({ theme: b.dataset.theme }); A.rerender(); }));
      el.querySelectorAll('[data-accent]').forEach((b) => (b.onclick = () => { save({ accent: b.dataset.accent }); A.rerender(); }));
      el.querySelector('[data-rm]').onclick = () => { save({ reduceMotion: !data.settings().reduceMotion }); A.rerender(); };
      el.querySelector('[data-name]').onchange = (e) => save({ name: e.target.value.trim() });
      el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => A.go(b.dataset.go)));

      // agenda's
      const saveCal = (label, url, events) => {
        const all = store.get('rooster', []).filter((e) => e.cal !== label);
        events.forEach((e) => { e.cal = label; });
        store.set('rooster', all.concat(events));
        const cl = store.get('calendars', []).filter((c) => c.label !== label);
        cl.push({ label, url: url || null, count: events.length, updated: new Date().toISOString() });
        store.set('calendars', cl);
      };
      const fetchCal = async (label, url) => {
        try {
          const r = await fetch(url.replace(/^webcal:/i, 'https:'));
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const ev = A.parseICS(await r.text());
          saveCal(label, url, ev); A.toast(ev.length + ' items opgehaald'); A.rerender();
        } catch (e) { A.toast('Ophalen lukte niet (' + e.message + '). Importeer het .ics-bestand.'); }
      };
      el.querySelector('[data-cal-add]').onclick = () => {
        const url = el.querySelector('[data-cal-url]').value.trim(); if (!url) { A.toast('Plak eerst een link'); return; }
        const kind = el.querySelector('[data-cal-kind]');
        fetchCal(kind.options[kind.selectedIndex].text, url);
      };
      el.querySelector('[data-ics]').onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader(); r.onload = () => { const ev = A.parseICS(r.result); saveCal('📁 ' + f.name, null, ev); A.toast(ev.length + ' items geïmporteerd'); A.rerender(); }; r.readAsText(f);
      };
      el.querySelectorAll('[data-cal-refresh]').forEach((b) => (b.onclick = () => { const c = cals[+b.dataset.calRefresh]; fetchCal(c.label, c.url); }));
      el.querySelectorAll('[data-cal-del]').forEach((b) => (b.onclick = () => { const c = cals[+b.dataset.calDel]; store.set('calendars', cals.filter((x) => x !== c)); store.set('rooster', store.get('rooster', []).filter((e) => e.cal !== c.label)); A.rerender(); }));

      // vakken
      el.querySelectorAll('[data-subj-del]').forEach((b) => (b.onclick = () => { const l = data.subjects(); l.splice(+b.dataset.subjDel, 1); store.set('subjects', l); A.rerender(); }));
      el.querySelector('[data-subj-add]').onclick = () => { const v = el.querySelector('[data-subj-new]').value.trim(); if (!v) return; const l = data.subjects(); if (!l.includes(v)) l.push(v); store.set('subjects', l); A.rerender(); };
      el.querySelector('[data-subj-reset]').onclick = () => { store.set('subjects', A.DEFAULT_SUBJECTS.slice()); A.rerender(); };

      // taken
      el.querySelector('[data-unf]').onchange = (e) => save({ unfinished: e.target.value });
      el.querySelector('[data-notif]').onclick = async () => {
        const on = !data.settings().notifications;
        if (on && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { A.toast('Meldingen zijn niet toegestaan in je browser'); return; } }
        save({ notifications: on }); A.rerender();
      };
      const pinOn = el.querySelector('[data-pin-on]');
      if (pinOn) pinOn.onclick = async () => { const v = el.querySelector('[data-pin]').value; if (!/^\d{4,}$/.test(v)) { A.toast('Gebruik minstens 4 cijfers'); return; } store.set('pinHash', await sha256(v)); try { sessionStorage.setItem('aos-unlocked', '1'); } catch (e) {} A.toast('Pincode ingesteld'); A.rerender(); };
      const pinOff = el.querySelector('[data-pin-off]');
      if (pinOff) pinOff.onclick = () => { store.remove('pinHash'); A.toast('Pincode verwijderd'); A.rerender(); };

      // swipe
      el.querySelectorAll('[data-swipe]').forEach((r) => (r.oninput = () => { const cfg = store.get('swipe', {}); cfg[r.dataset.swipe] = +r.value; store.set('swipe', cfg); r.nextElementSibling.textContent = r.value; }));
      el.querySelector('[data-swipe-reset]').onclick = () => { store.remove('swipe'); A.rerender(); };

      // data
      el.querySelector('[data-export]').onclick = exportAll;
      el.querySelector('[data-import]').onchange = (e) => { if (e.target.files[0]) importAll(e.target.files[0]); };
      el.querySelector('[data-reseed]').onclick = async () => {
        const seed = window.ANGEL_SEED_WEBSITES || [];
        if (!(await A.confirmDialog('De ' + seed.length + ' standaardwebsites opnieuw toevoegen (dubbele worden overgeslagen)?', 'Herstellen'))) return;
        const list = data.websites(); const urls = new Set(list.map((x) => x.url));
        let n = 0; seed.forEach((x) => { if (!urls.has(x.url)) { list.push(Object.assign({ id: A.uid(), tags: [], use_count: 0 }, x)); n++; } });
        data.saveWebsites(list); A.toast(n + ' websites hersteld'); A.rerender();
      };
      el.querySelector('[data-reset]').onclick = async () => {
        if (!(await A.confirmDialog('Echt alles wissen? Dit kan niet ongedaan worden gemaakt.', 'Alles wissen'))) return;
        store.keys().forEach((k) => store.remove(k)); location.hash = '#/home'; location.reload();
      };
      if (route.params.section) { const t = el.querySelector('#' + route.params.section); if (t) setTimeout(() => t.scrollIntoView({ behavior: 'smooth' }), 50); }
    }
  });

  // ---------- Quality Control ----------
  function runChecks() {
    const sites = data.websites();
    const bad = sites.filter((s) => { try { new URL(s.url); return false; } catch (e) { return true; } });
    const seen = {}; let dupes = 0; sites.forEach((s) => { const k = (s.url || '').replace(/\/$/, '').toLowerCase(); if (seen[k]) dupes++; seen[k] = 1; });
    const s = data.settings();
    const last = store.get('lastBackup', null);
    const total = store.keys().reduce((n, k) => n + store.sizeOf(k), 0);
    return [
      ['Opslag beschikbaar', store.available() ? 'ok' : 'bad', store.available() ? 'localStorage werkt' : 'Opslag geblokkeerd (privévenster?)'],
      ['Websites geladen', sites.length ? 'ok' : 'warn', sites.length + ' websites'],
      ['Geldige URL\'s', bad.length ? 'warn' : 'ok', bad.length ? bad.length + ' ongeldig: ' + bad.map((x) => x.name).slice(0, 3).join(', ') : 'Alles geldig'],
      ['Dubbele websites', dupes ? 'warn' : 'ok', dupes ? dupes + ' dubbel' : 'Geen'],
      ['Notities', 'ok', data.notes().length + ' notities'],
      ['Projecten', 'ok', data.projects().length + ' projecten'],
      ['Taken', 'ok', data.items().filter((i) => !i.done).length + ' open · ' + data.items().filter((i) => i.done).length + ' klaar'],
      ['Voorkeuren opgeslagen', 'ok', s.theme + ' · ' + s.accent],
      ['Verbinding', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? 'Online' : 'Offline (lokale gegevens blijven werken)'],
      ['Opslaggebruik', total > 4.5e6 ? 'warn' : 'ok', A.fmtBytes(total) + ' van ±5 MB'],
      ['Laatste back-up', last ? 'ok' : 'warn', last ? A.relTime(last) : 'Nog nooit — exporteer via Instellingen']
    ];
  }
  A.registerApp({
    id: 'quality', name: 'Quality Control', icon: 'shield', dock: false, keywords: 'kwaliteit controle check',
    color: 'linear-gradient(135deg,#f87171,#b91c1c)',
    render(el) {
      const draw = () => {
        const checks = runChecks();
        const issues = checks.filter((c) => c[1] !== 'ok').length;
        el.innerHTML = '<div class="pad narrow"><div class="ag-head" style="margin-top:0"><div><h2>Quality control</h2><div class="muted" style="font-size:13px;margin-top:4px">' + (issues ? issues + ' aandachtspunt' + (issues > 1 ? 'en' : '') + '.' : 'Alles in orde.') + '</div></div><span class="spacer"></span><button class="btn" data-rerun>' + icon('refresh') + 'Opnieuw</button></div>' +
          checks.map(([n, st, d]) => '<div class="check-row"><span class="' + st + '">' + icon(st === 'ok' ? 'circleCheck' : 'alert') + '</span><b>' + esc(n) + '</b><small>' + esc(d) + '</small></div>').join('') + '</div>';
        el.querySelectorAll('.check-row svg').forEach((s) => { s.style.cssText = 'width:18px;height:18px'; });
        el.querySelector('[data-rerun]').onclick = () => { draw(); A.toast('Controle opnieuw uitgevoerd'); };
      };
      draw();
    }
  });

  // ---------- Task Manager ----------
  A.registerApp({
    id: 'tasks', name: 'Task Manager', icon: 'activity', dock: false, keywords: 'taakbeheer opslag systeem',
    color: 'linear-gradient(135deg,#60a5fa,#f472b6)',
    render(el) {
      const draw = () => {
        const keys = store.keys().sort((a, b) => store.sizeOf(b) - store.sizeOf(a));
        const total = keys.reduce((n, k) => n + store.sizeOf(k), 0);
        const secs = Math.floor((Date.now() - A.sessionStart) / 1000);
        const sites = data.websites().slice().sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 5);
        const notes = data.notes().slice(0, 5);
        const projects = data.projects().slice(0, 5);
        const t = A.today();
        const todays = data.items().filter((i) => i.date === t);
        el.innerHTML = '<div class="pad narrow"><div class="ag-head" style="margin-top:0"><h2>' + icon('activity') + 'Task manager</h2></div><p class="muted" style="margin-top:-6px">Alles wat er nu in je OS draait.</p>' +
          '<div class="tm-grid"><div class="stat"><span>Actieve app</span><b>1</b></div><div class="stat"><span>Taken vandaag</span><b>' + todays.filter((i) => i.done).length + '/' + todays.length + '</b></div><div class="stat"><span>Lokale opslag</span><b>' + A.fmtBytes(total) + '</b></div><div class="stat"><span>Sessie</span><b>' + Math.floor(secs / 60) + 'm ' + (secs % 60) + 's</b></div></div>' +
          '<h3 style="margin:24px 0 10px">Starten</h3><div class="two-col">' +
          '<div class="card"><div class="label">Websites</div>' + (sites.length ? sites.map((s) => '<div class="kv"><span>' + esc(s.name) + '</span><a href="#" data-site="' + esc(s.id) + '">Site openen ↗</a></div>').join('') : '<p class="muted">Nog niets.</p>') + '</div>' +
          '<div class="card"><div class="label">Notities</div>' + (notes.length ? notes.map((n) => '<div class="kv"><span>' + esc(n.title || 'Naamloos') + '</span><a href="#/notes?id=' + esc(n.id) + '">Notitie openen ↗</a></div>').join('') : '<p class="muted">Nog niets.</p>') + '</div>' +
          '<div class="card"><div class="label">Projecten</div>' + (projects.length ? projects.map((p) => '<div class="kv"><span>' + esc(p.name) + '</span>' + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">Openen ↗</a>' : '') + '</div>').join('') : '<p class="muted">Nog niets.</p>') + '</div>' +
          '<div class="card"><div class="label">Acties</div><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">' +
          '<button class="btn btn-sm" data-a="note">Nieuwe notitie</button><button class="btn btn-sm" data-a="focus">Focus 25 minuten</button><button class="btn btn-sm" data-a="theme">Licht / donker wisselen</button><button class="btn btn-sm" data-a="lib">App-bibliotheek openen</button><button class="btn btn-sm" data-a="angel">Vraag Angel</button><button class="btn btn-sm" data-a="backup">Back-up exporteren</button></div></div></div>' +
          '<h3 style="margin:24px 0 10px">Opgeslagen op dit apparaat</h3><div class="card">' + keys.map((k) => '<div class="kv"><span>' + esc(k) + '</span><span class="muted">' + A.fmtBytes(store.sizeOf(k)) + '</span></div>').join('') + '</div></div>';
        el.querySelectorAll('h2 svg').forEach((s) => { s.style.cssText = 'width:20px;height:20px;color:var(--accent)'; });
        el.querySelectorAll('[data-site]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); data.useWebsite(a.dataset.site); }));
        el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'note') { const n = { id: A.uid(), title: '', content: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; data.saveNotes([n].concat(data.notes())); A.go('notes', null, { id: n.id }); }
          if (a === 'focus') A.startFocus(25);
          if (a === 'theme') { const s = data.settings(); const cur = document.documentElement.getAttribute('data-theme'); data.saveSettings(Object.assign(s, { theme: cur === 'dark' ? 'light' : 'dark' })); }
          if (a === 'lib') A.openLauncher();
          if (a === 'angel') A.go('angel');
          if (a === 'backup') exportAll();
        }));
      };
      draw();
      const iv = setInterval(() => { const st = el.querySelector('.tm-grid .stat:last-child b'); if (st) { const secs = Math.floor((Date.now() - A.sessionStart) / 1000); st.textContent = Math.floor(secs / 60) + 'm ' + (secs % 60) + 's'; } }, 1000);
      return () => clearInterval(iv);
    }
  });
})();
