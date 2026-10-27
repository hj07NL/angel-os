/* Angel OS shell: router, dock, bewerkbare appbibliotheek, Dynamic Island, focustimer, meldingencentrum,
   Spotlight (Ctrl/⌘+K), websiteviewer en de dagelijkse achtergrondtaken (doorschuiven, herinneringen, rapporten). */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, html, $, data, store, t } = A;
  let current = null, currentCleanup = null;

  // ---------- Router ----------
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (query) query.split('&').forEach((kv) => { const i = kv.indexOf('='); const k = i < 0 ? kv : kv.slice(0, i); params[decodeURIComponent(k)] = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1)); });
    return { id: parts[0] || 'home', sub: parts.slice(1), params };
  }
  function go(id, sub, params) {
    let h = '#/' + id + (sub && sub.length ? '/' + [].concat(sub).join('/') : '');
    if (params) { const q = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); if (q) h += '?' + q; }
    if (location.hash === h) render(); else location.hash = h;
  }
  A.go = go;
  const appName = (a) => a.name;
  function appIcon(a, cls) { return '<span class="app-icon ' + (cls || '') + '" style="background:' + a.color + '">' + icon(a.icon) + '</span>'; }
  A.appIcon = appIcon;

  function render() {
    const route = parseHash();
    const app = A.apps.find((a) => a.id === route.id) || A.apps.find((a) => a.id === 'home');
    if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
    current = app;
    document.title = app.id === 'home' ? 'Angel OS — je persoonlijke startpagina' : appName(app) + ' — Angel OS';
    document.body.setAttribute('data-app', app.id);
    const win = $('#window'); win.innerHTML = '';
    const body = html('<div class="window-body" id="main" tabindex="-1"></div>');
    win.appendChild(body);
    win.classList.remove('win-in'); void win.offsetWidth; win.classList.add('win-in');
    if (route.id !== 'viewer' && route.id !== 'home') A.track('view_app', { app: app.id });
    try { const r = app.render(body, route); if (typeof r === 'function') currentCleanup = r; }
    catch (e) { console.error(e); body.innerHTML = '<div class="pad"><div class="empty">' + esc(t('common.error')) + ': ' + esc(e.message) + '</div></div>'; }
    renderDock();
  }
  A.rerender = () => { if (current) render(); };
  A.currentApp = () => current && current.id;

  // ---------- Appbibliotheek-configuratie ----------
  const DEFAULT_DOCK = ['home', 'agenda', 'library', 'angel', 'notes', 'projects', 'personax', 'settings'];
  function launcherCfg() {
    const cfg = store.get('launcher', null) || { items: [], groups: [] };
    let changed = false;
    A.apps.forEach((a, i) => {
      if (a.hiddenApp) return;
      if (!cfg.items.some((x) => x.kind === 'app' && x.appId === a.id)) { cfg.items.push({ id: 'app:' + a.id, kind: 'app', appId: a.id, name: null, icon: null, openIn: 'os', group: null, hidden: false, dock: DEFAULT_DOCK.includes(a.id), order: i }); changed = true; }
    });
    if (changed) store.set('launcher', cfg);
    return cfg;
  }
  function saveLauncher(cfg) { store.set('launcher', cfg); renderDock(); }
  function itemLabel(it) { if (it.name) return it.name; if (it.kind === 'app') { const a = A.apps.find((x) => x.id === it.appId); return a ? appName(a) : it.appId; } return A.hostOf(it.url); }
  function itemIcon(it, big) {
    if (it.kind === 'app') {
      const a = A.apps.find((x) => x.id === it.appId); if (!a) return '';
      if (it.icon) return '<span class="app-icon ' + (big ? 'big' : '') + '" style="background:' + a.color + '"><span class="emoji-ic">' + esc(it.icon) + '</span></span>';
      return appIcon(a, big ? 'big' : '');
    }
    if (it.icon && /^data:image\//.test(it.icon)) return '<span class="app-icon web ' + (big ? 'big' : '') + '"><img src="' + esc(it.icon) + '" alt=""></span>';
    if (it.icon) return '<span class="app-icon web ' + (big ? 'big' : '') + '"><span class="emoji-ic">' + esc(it.icon) + '</span></span>';
    return '<span class="app-icon web ' + (big ? 'big' : '') + '"><img src="https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(A.hostOf(it.url)) + '" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'' + esc(A.initials(itemLabel(it)).slice(0, 1)) + '\'))"></span>';
  }
  function openItem(it) {
    if (it.kind === 'app') return go(it.appId);
    A.track('open_shortcut', { host: A.hostOf(it.url) });
    if (it.openIn === 'os') go('viewer', null, { url: it.url, name: itemLabel(it) }); else window.open(it.url, '_blank', 'noopener');
  }
  A.launcher = { cfg: launcherCfg, save: saveLauncher, itemLabel, itemIcon, openItem };

  function renderDock() {
    const dock = $('#dock'); if (!dock) return;
    const cfg = launcherCfg();
    dock.innerHTML = '';
    cfg.items.filter((x) => x.dock && !x.hidden).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((it) => {
      const active = it.kind === 'app' && current && current.id === it.appId;
      const b = html('<button class="dock-btn app ' + (active ? 'active' : '') + '" title="' + esc(itemLabel(it)) + '" aria-label="' + esc(itemLabel(it)) + '">' + itemIcon(it) + '</button>');
      b.onclick = () => openItem(it);
      dock.appendChild(b);
    });
    dock.appendChild(html('<span class="dock-sep"></span>'));
    const g = html('<button class="dock-btn" title="' + t('app.launcher') + '" aria-label="' + t('app.launcher') + '"><span class="app-icon grid-btn">' + icon('grid') + '</span></button>');
    g.onclick = () => openLauncher();
    dock.appendChild(g);
  }

  // ---------- Appbibliotheek (Launchpad-stijl, bewerkbaar) ----------
  function openLauncher(startEdit) {
    let editing = !!startEdit, q = '', showHidden = false;
    const ov = html('<div class="overlay launcher-ov"><div class="launcher"><div class="launcher-top"><label class="search big">' + icon('search') + '<input placeholder="' + t('launcher.search') + '" aria-label="' + t('launcher.search') + '"></label><button class="btn btn-glass" data-edit></button></div><div class="launcher-body"></div></div></div>');
    const body = ov.querySelector('.launcher-body'); const inp = ov.querySelector('input'); const editBtn = ov.querySelector('[data-edit]');
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && !editing) { const f = body.querySelector('.l-item'); if (f) f.click(); } };
    let dragId = null;
    const draw = () => {
      const cfg = launcherCfg();
      editBtn.textContent = editing ? t('launcher.doneEdit') : t('launcher.edit');
      const items = cfg.items.filter((x) => (showHidden ? x.hidden : !x.hidden) && (!q || itemLabel(x).toLowerCase().includes(q))).sort((a, b) => (a.order || 0) - (b.order || 0));
      const groups = [{ id: null, name: '' }].concat(cfg.groups);
      body.innerHTML = '';
      if (editing) {
        const bar = html('<div class="launcher-tools"><button class="btn btn-glass btn-sm" data-add-web>' + icon('plus') + t('launcher.addWebsite') + '</button><button class="btn btn-glass btn-sm" data-add-group>' + icon('folderPlus') + t('launcher.addGroup') + '</button><button class="btn btn-glass btn-sm" data-hidden>' + icon(showHidden ? 'eye' : 'eyeOff') + (showHidden ? 'Zichtbare apps' : t('launcher.hidden') + ' (' + cfg.items.filter((x) => x.hidden).length + ')') + '</button><span class="faint" style="font-size:12px">Sleep om te ordenen · klik om aan te passen</span></div>');
        bar.querySelector('[data-add-web]').onclick = () => editItem(null, draw);
        bar.querySelector('[data-add-group]').onclick = async () => { const n = await A.promptDialog('Naam van de groep', '', 'Bijv. School'); if (!n) return; const c = launcherCfg(); c.groups.push({ id: A.uid(), name: n }); saveLauncher(c); draw(); };
        bar.querySelector('[data-hidden]').onclick = () => { showHidden = !showHidden; draw(); };
        body.appendChild(bar);
      }
      groups.forEach((g) => {
        const list = items.filter((x) => (x.group || null) === g.id);
        if (!list.length && (!editing || g.id === null)) return;
        const sec = html('<section class="l-group"' + (g.id ? ' data-group="' + g.id + '"' : ' data-group=""') + '>' + (g.id ? '<div class="l-group-head"><span>' + esc(g.name) + '</span>' + (editing ? '<button class="icon-btn sm" data-rename-group title="Hernoemen">' + icon('pencil') + '</button><button class="icon-btn sm" data-del-group title="Groep opheffen">' + icon('trash') + '</button>' : '') + '</div>' : '') + '<div class="launcher-grid"></div></section>');
        const grid = sec.querySelector('.launcher-grid');
        list.forEach((it) => {
          const b = html('<button class="l-item ' + (editing ? 'jiggle' : '') + '" draggable="' + editing + '" data-id="' + esc(it.id) + '">' + itemIcon(it, true) + '<span>' + esc(itemLabel(it)) + '</span>' + (editing && it.dock ? '<i class="dock-dot" title="In dock"></i>' : '') + '</button>');
          b.onclick = () => { if (editing) editItem(it, draw); else { close(); openItem(it); } };
          b.addEventListener('dragstart', (e) => { dragId = it.id; e.dataTransfer.effectAllowed = 'move'; });
          b.addEventListener('dragover', (e) => { if (editing) e.preventDefault(); });
          b.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); if (!dragId || dragId === it.id) return; const c = launcherCfg(); const arr = c.items.sort((x, y) => (x.order || 0) - (y.order || 0)); const from = arr.findIndex((x) => x.id === dragId); const [mv] = arr.splice(from, 1); mv.group = it.group || null; const to = arr.findIndex((x) => x.id === it.id); arr.splice(to, 0, mv); arr.forEach((x, i) => (x.order = i)); c.items = arr; saveLauncher(c); draw(); });
          grid.appendChild(b);
        });
        sec.addEventListener('dragover', (e) => { if (editing) e.preventDefault(); });
        sec.addEventListener('drop', (e) => { e.preventDefault(); if (!dragId) return; const c = launcherCfg(); const it = c.items.find((x) => x.id === dragId); it.group = g.id; saveLauncher(c); draw(); });
        const rg = sec.querySelector('[data-rename-group]'); if (rg) rg.onclick = async () => { const n = await A.promptDialog('Groep hernoemen', g.name); if (!n) return; const c = launcherCfg(); c.groups.find((x) => x.id === g.id).name = n; saveLauncher(c); draw(); };
        const dg = sec.querySelector('[data-del-group]'); if (dg) dg.onclick = () => { const c = launcherCfg(); c.items.forEach((x) => { if (x.group === g.id) x.group = null; }); c.groups = c.groups.filter((x) => x.id !== g.id); saveLauncher(c); draw(); };
        body.appendChild(sec);
      });
      if (!body.querySelector('.l-item')) body.appendChild(html('<p class="muted" style="text-align:center">' + (showHidden ? 'Geen verborgen apps.' : 'Geen apps gevonden.') + '</p>'));
    };
    editBtn.onclick = () => { editing = !editing; showHidden = false; draw(); };
    inp.oninput = () => { q = inp.value.toLowerCase(); draw(); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov || e.target.classList.contains('launcher')) close(); });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov); draw(); setTimeout(() => inp.focus(), 20);
  }
  A.openLauncher = openLauncher;

  function editItem(it, redraw) {
    const isNew = !it;
    it = it || { id: 'web:' + A.uid(), kind: 'web', url: '', name: '', icon: null, openIn: 'tab', group: null, hidden: false, dock: false };
    const cfg = launcherCfg();
    A.openModal('<h2>' + (isNew ? t('launcher.addWebsite') : esc(itemLabel(it))) + '</h2>' +
      (it.kind === 'web' ? '<label class="field">' + t('common.url') + '<input class="input" name="url" value="' + esc(it.url || '') + '" placeholder="https://"></label>' : '') +
      '<label class="field">' + t('common.name') + '<input class="input" name="name" value="' + esc(it.name || '') + '" placeholder="' + esc(it.kind === 'app' ? itemLabel(Object.assign({}, it, { name: null })) : 'Naam') + '"></label>' +
      '<div class="row2"><label class="field">' + t('common.icon') + ' (emoji)<input class="input" name="icon" maxlength="4" value="' + esc(it.icon && !/^data:/.test(it.icon) ? it.icon : '') + '" placeholder="bijv. 📘"></label>' +
      '<label class="field">Eigen afbeelding<input class="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" name="img"></label></div>' +
      (it.kind === 'web' ? '<label class="field">' + t('launcher.openIn') + '<select class="input" name="openIn"><option value="tab"' + (it.openIn !== 'os' ? ' selected' : '') + '>' + t('launcher.openTab') + '</option><option value="os"' + (it.openIn === 'os' ? ' selected' : '') + '>' + t('launcher.openOs') + ' (werkt niet bij elke site)</option></select></label>' : '') +
      '<label class="field">Groep<select class="input" name="group"><option value="">Geen groep</option>' + cfg.groups.map((g) => '<option value="' + g.id + '"' + (it.group === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label>' +
      '<div class="set-row"><span>' + t('launcher.inDock') + '</span><input type="checkbox" name="dock"' + (it.dock ? ' checked' : '') + '></div>' +
      '<div class="set-row"><span>' + t('common.hide') + ' (gegevens blijven bewaard)</span><input type="checkbox" name="hidden"' + (it.hidden ? ' checked' : '') + '></div>' +
      '<div class="modal-actions">' + (!isNew && it.kind === 'web' ? '<button class="btn btn-danger" data-del style="margin-right:auto">' + t('common.delete') + '</button>' : '') + (it.icon ? '<button class="btn btn-ghost" data-noicon>Standaardicoon</button>' : '') + '<button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-save>' + t('common.save') + '</button></div>',
      (m, close) => {
        const f = (n) => m.querySelector('[name="' + n + '"]');
        let imgData = null;
        f('img').onchange = (e) => {
          const file = e.target.files[0]; if (!file) return;
          try { A.files.validate(file); } catch (er) { A.toast(er.message); return; }
          const img = new Image(); const u = URL.createObjectURL(file);
          img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d'); const s = Math.max(128 / img.width, 128 / img.height); ctx.drawImage(img, (128 - img.width * s) / 2, (128 - img.height * s) / 2, img.width * s, img.height * s); imgData = c.toDataURL('image/png'); URL.revokeObjectURL(u); };
          img.src = u;
        };
        const ni = m.querySelector('[data-noicon]'); if (ni) ni.onclick = () => { it.icon = null; f('icon').value = ''; imgData = null; ni.remove(); };
        m.querySelector('[data-save]').onclick = () => {
          const c = launcherCfg();
          if (it.kind === 'web') { let u = f('url').value.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { new URL(u); } catch (e) { A.toast(t('err.invalidUrl')); return; } it.url = u; it.openIn = f('openIn').value; }
          it.name = f('name').value.trim() || null; it.icon = imgData || f('icon').value.trim() || (it.icon && /^data:/.test(it.icon) ? it.icon : null);
          it.group = f('group').value || null; it.dock = f('dock').checked; it.hidden = f('hidden').checked;
          if (isNew) { if (c.items.some((x) => x.kind === 'web' && A.normUrl(x.url) === A.normUrl(it.url))) { A.toast('Deze website staat al in je appbibliotheek'); return; } it.order = c.items.length; c.items.push(it); }
          else Object.assign(c.items.find((x) => x.id === it.id), it);
          saveLauncher(c); close(); redraw && redraw();
        };
        const d = m.querySelector('[data-del]'); if (d) d.onclick = () => { const c = launcherCfg(); c.items = c.items.filter((x) => x.id !== it.id); saveLauncher(c); close(); redraw && redraw(); };
      });
  }

  // ---------- Focustimer ----------
  const timer = {
    state() {
      const s = store.get('timer', null); if (!s) return null;
      if (s.running && s.end < Date.now() - 3600000) { store.remove('timer'); return null; } // verouderd
      return s;
    },
    left() { const s = this.state(); if (!s) return 0; return s.running ? Math.max(0, s.end - Date.now()) : s.remaining; },
    start(min) { store.set('timer', { running: true, total: min * 60000, end: Date.now() + min * 60000, remaining: min * 60000 }); A.track('focus_start', { min }); tick(true); },
    pause() { const s = this.state(); if (!s || !s.running) return; s.remaining = Math.max(0, s.end - Date.now()); s.running = false; store.set('timer', s); tick(true); },
    resume() { const s = this.state(); if (!s || s.running) return; s.end = Date.now() + s.remaining; s.running = true; store.set('timer', s); tick(true); },
    reset() { store.remove('timer'); tick(true); }
  };
  A.timer = timer;
  const fmtLeft = (ms) => Math.floor(ms / 60000) + ':' + A.pad2(Math.floor((ms % 60000) / 1000));

  // ---------- Dynamic Island ----------
  let islandOpen = false, angelBusy = false;
  function nextTask() {
    const nowD = A.now(); const d = A.today(); const m = nowD.getHours() * 60 + nowD.getMinutes();
    return data.items().filter((i) => !i.done && i.date === d && i.time && A.hmToMin(i.time) >= m - 5).sort((a, b) => a.time.localeCompare(b.time))[0] || null;
  }
  function compactHtml() {
    const nowD = A.now(); const clock = A.pad2(nowD.getHours()) + ':' + A.pad2(nowD.getMinutes());
    const unread = store.get('notifications', []).filter((n) => !n.read).length;
    const tm = timer.state();
    const w = (store.get('weatherCache', null) || {}).data;
    let center;
    if (angelBusy) center = '<span class="spin"></span><span>Angel is bezig…</span>';
    else if (tm) { const left = timer.left(); center = '<span class="pill-dot ' + (tm.running ? 'live' : '') + '"></span><span>' + t('island.focus') + ' ' + fmtLeft(left) + '</span>'; }
    else { const nt = nextTask(); center = nt && A.hmToMin(nt.time) - (nowD.getHours() * 60 + nowD.getMinutes()) <= 90 ? '<span class="dot t-' + esc(nt.type) + '"></span><span class="isl-text">' + esc(nt.time) + ' · ' + esc(nt.title) + '</span>' : icon('search') + '<span class="isl-text">' + t('island.search') + '</span>'; }
    return center + (w && w.status === 'ok' ? '<span class="muted hide-sm">' + esc(w.emoji) + ' ' + w.temp + '°</span>' : '') + (unread ? '<span class="badge" title="' + t('island.notifications') + '">' + unread + '</span>' : '') + '<span class="muted">' + clock + '</span>';
  }
  function tick(force) {
    const isl = $('#island'); if (!isl) return;
    const tm = timer.state();
    if (tm && tm.running && timer.left() === 0) { store.remove('timer'); A.notify(null, 'timer-' + Date.now(), 'Focus-sessie klaar', 'Goed gedaan! Neem even pauze.'); A.toast('Focus-sessie klaar — goed gedaan!'); }
    if (!islandOpen) isl.querySelector('.isl-compact').innerHTML = compactHtml();
    else if (force) renderIslandPanel();
    else { const tl = isl.querySelector('[data-timeleft]'); if (tl) tl.textContent = fmtLeft(timer.left() || 25 * 60000); }
  }
  function renderIslandPanel() {
    const panel = $('#island .isl-panel'); if (!panel) return;
    const nowD = A.now(); const d = A.today();
    const tasks = data.items().filter((i) => !i.done && (i.date === d || (i.date && i.date < d && i.type !== 'event'))).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')).slice(0, 4);
    const tm = timer.state(); const w = (store.get('weatherCache', null) || {}).data;
    const unread = store.get('notifications', []).filter((n) => !n.read);
    panel.innerHTML =
      '<div class="isl-row isl-head"><div><b class="isl-clock">' + A.pad2(nowD.getHours()) + ':' + A.pad2(nowD.getMinutes()) + '</b><div class="muted">' + esc(A.fmtLong(d)) + '</div></div>' +
      (w && w.status === 'ok' ? '<button class="isl-weather" data-go="settings" data-sec="weer">' + esc(w.emoji) + ' <b>' + w.temp + '°</b><small>' + esc(w.label) + ' · ' + esc(w.place) + '</small></button>' : '<button class="isl-weather" data-go="settings" data-sec="weer">' + icon('mapPin') + '<small>' + t('weather.setCity') + '</small></button>') + '</div>' +
      '<div class="isl-card"><div class="isl-card-head"><span class="label">' + t('island.focus') + '</span><b data-timeleft>' + fmtLeft(tm ? timer.left() : 25 * 60000) + '</b></div><div class="isl-actions">' +
      (!tm ? '<button class="btn btn-sm btn-primary" data-t="25">' + icon('play') + '25 min</button><button class="btn btn-sm" data-t="50">50 min</button><button class="btn btn-sm" data-t="5">5 min pauze</button>'
        : (tm.running ? '<button class="btn btn-sm" data-pause>' + icon('pause') + t('island.pause') + '</button>' : '<button class="btn btn-sm btn-primary" data-resume>' + icon('play') + t('island.resume') + '</button>') + '<button class="btn btn-sm" data-reset>' + icon('refresh') + t('common.reset') + '</button>') + '</div></div>' +
      '<div class="isl-card"><div class="isl-card-head"><span class="label">' + t('island.next') + '</span><button class="link" data-go="agenda">Alles →</button></div>' +
      (tasks.length ? tasks.map((i) => '<div class="isl-task"><button class="check sm" data-done="' + esc(i.id) + '" aria-label="Afvinken"></button><span>' + (i.date < d ? '<em class="late">te laat</em> ' : '') + (i.time ? '<b>' + esc(i.time) + '</b> ' : '') + esc(i.title) + '</span></div>').join('') : '<p class="muted" style="margin:6px 0 0">' + t('island.noTasks') + '</p>') + '</div>' +
      '<form class="isl-quick"><input placeholder="' + t('island.quick') + '" aria-label="Snel noteren"><button class="btn btn-sm btn-primary">' + icon('plus') + '</button></form>' +
      '<div class="isl-row isl-buttons"><button class="btn btn-sm btn-glass" data-angel>' + icon('bot') + t('island.openAngel') + '</button><button class="btn btn-sm btn-glass" data-notifs>' + icon('bell') + t('island.notifications') + (unread.length ? ' <span class="badge">' + unread.length + '</span>' : '') + '</button><button class="btn btn-sm btn-glass" data-search>' + icon('search') + t('island.toSearch') + '</button></div>';
    panel.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => timer.start(+b.dataset.t)));
    const ps = panel.querySelector('[data-pause]'); if (ps) ps.onclick = () => timer.pause();
    const rs = panel.querySelector('[data-resume]'); if (rs) rs.onclick = () => timer.resume();
    const rt = panel.querySelector('[data-reset]'); if (rt) rt.onclick = () => timer.reset();
    panel.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => { A.tasks.toggleDone(b.dataset.done); A.toast('Afgevinkt ✓'); renderIslandPanel(); if (A.currentApp() === 'home' || A.currentApp() === 'agenda') A.rerender(); }));
    panel.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { closeIsland(); go(b.dataset.go, null, b.dataset.sec ? { section: b.dataset.sec } : null); }));
    panel.querySelector('[data-angel]').onclick = () => { closeIsland(); go('angel'); };
    panel.querySelector('[data-notifs]').onclick = () => { closeIsland(); openNotifications(); };
    panel.querySelector('[data-search]').onclick = () => { closeIsland(); if (A.currentApp() !== 'home') go('home'); setTimeout(() => { const s = $('#web-search'); if (s) s.focus(); }, 80); };
    const form = panel.querySelector('.isl-quick');
    form.onsubmit = async (e) => { e.preventDefault(); const v = form.querySelector('input').value.trim(); if (!v) return; const out = await A.angel.command(v); handleQuickResult(out, v); form.querySelector('input').value = ''; renderIslandPanel(); };
  }
  function openIsland() {
    const isl = $('#island'); if (islandOpen) return;
    islandOpen = true; isl.classList.add('open'); isl.setAttribute('aria-expanded', 'true');
    renderIslandPanel();
    setTimeout(() => { const i = isl.querySelector('.isl-quick input'); if (i && window.matchMedia('(pointer:fine)').matches) i.focus(); }, 180);
  }
  function closeIsland() { const isl = $('#island'); if (!islandOpen) return; islandOpen = false; isl.classList.remove('open'); isl.setAttribute('aria-expanded', 'false'); tick(); }
  A.island = { open: openIsland, close: closeIsland };

  // gedeelde afhandeling van een snel-noteren-resultaat (eiland, startpagina, spotlight)
  function handleQuickResult(out, original) {
    if (!out) return;
    if (out.question) {
      A.openModal('<h2>' + esc(out.question.text) + '</h2><p class="muted">“' + esc(original) + '”</p>' + (out.question.options ? '<div class="tags">' + out.question.options.map((o) => '<button class="chip big" data-a="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>' : '') + '<div class="row2" style="margin-top:12px"><input class="input" data-free placeholder="' + (out.question.kind === 'date' ? 'of kies een datum' : 'Antwoord') + '"' + (out.question.kind === 'date' ? ' type="date"' : '') + '><button class="btn btn-primary" data-ok>' + t('common.ok') + '</button></div>', (m, close) => {
        const answer = async (a) => { close(); const r = await A.angel.answerQuestion(out, a); handleQuickResult(r, original); };
        m.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => answer(b.dataset.a)));
        m.querySelector('[data-ok]').onclick = () => { const v = m.querySelector('[data-free]').value.trim(); if (v) answer(v); };
      });
      return;
    }
    if (out.confirm) {
      A.confirmDialog(out.confirm.text, t('common.confirm'), out.confirm.detail).then((ok) => { if (ok) { const r = out.confirm.run(); A.toast(r.text); A.rerender(); } else A.toast('Niets gewijzigd'); });
      return;
    }
    if (out.results || out.tasks || (out.open && !out.undo)) { go('angel', null, { q: original }); return; }
    A.toast(out.text || (out.ok ? t('common.done') : t('common.error')), out.undo ? { label: t('common.undo'), run: () => { out.undo(); A.toast('Ongedaan gemaakt'); A.rerender(); } } : null, out.ok ? '' : 'err');
    if (out.notice) A.toast(out.notice, null, 'warn');
    if (A.currentApp() === 'home' || A.currentApp() === 'agenda' || A.currentApp() === 'notes') A.rerender();
  }
  A.handleQuickResult = handleQuickResult;

  // ---------- Meldingencentrum ----------
  function openNotifications() {
    const draw = (m) => {
      const list = store.get('notifications', []);
      m.innerHTML = '<div class="ag-head" style="margin:0 0 12px"><h2 style="margin:0">' + t('app.notifications') + '</h2><span class="spacer"></span>' + (list.length ? '<button class="btn btn-sm" data-read>Alles gelezen</button><button class="btn btn-sm btn-ghost" data-clear>Wissen</button>' : '') + '<button class="icon-btn" data-x aria-label="' + t('common.close') + '">' + icon('x') + '</button></div>' +
        (list.length ? list.slice(0, 60).map((n) => '<div class="notif ' + (n.read ? '' : 'unread') + '" data-id="' + esc(n.id) + '"><div class="notif-ic">' + icon({ site_availability: 'globe', site_security: 'shield', monthly: 'shield', recommendations: 'sparkles', weather: 'cloud', overdue: 'alert', task_reminders: 'bell', daily_summary: 'calendar', weekly: 'calendar' }[n.kind] || 'bell') + '</div><div style="flex:1;min-width:0"><b>' + esc(n.title) + '</b>' + (n.body ? '<div class="muted" style="font-size:13px">' + esc(n.body) + '</div>' : '') + '<div class="faint" style="font-size:11px;margin-top:2px">' + esc(A.relTime(n.at)) + '</div></div>' + (n.link ? '<button class="btn btn-sm" data-link="' + esc(n.link) + '">Bekijk</button>' : '') + '</div>').join('') : '<div class="empty">' + t('notif.empty') + '</div>') +
        '<p class="faint" style="font-size:12px;margin-top:12px">Meldingen instellen: Instellingen → Meldingen.</p>';
      const close = () => m.closest('.overlay').remove();
      m.querySelector('[data-x]').onclick = close;
      const rd = m.querySelector('[data-read]'); if (rd) rd.onclick = () => { store.set('notifications', store.get('notifications', []).map((n) => Object.assign(n, { read: true }))); A.bus.emit('notifications'); draw(m); };
      const cl = m.querySelector('[data-clear]'); if (cl) cl.onclick = () => { store.set('notifications', []); A.bus.emit('notifications'); draw(m); };
      m.querySelectorAll('[data-link]').forEach((b) => (b.onclick = () => { close(); location.hash = b.dataset.link; }));
    };
    A.openModal('<div data-n></div>', (m) => { draw(m.querySelector('[data-n]')); setTimeout(() => { store.set('notifications', store.get('notifications', []).map((n) => Object.assign(n, { read: true }))); A.bus.emit('notifications'); }, 1500); }, { wide: false });
  }
  A.openNotifications = openNotifications;

  // ---------- Spotlight ----------
  function openSpotlight(initial) {
    if ($('.spotlight')) return;
    const ov = html('<div class="overlay"><div class="spotlight"><div class="spotlight-input">' + icon('search') + '<input placeholder="Zoek, open een URL of geef Angel een opdracht…" aria-label="Zoeken"><kbd>esc</kbd></div><div class="spotlight-results"></div></div></div>');
    const inp = ov.querySelector('input'); const res = ov.querySelector('.spotlight-results');
    let items = [], sel = 0;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    const isUrl = (v) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v) && !/\s/.test(v);
    const draw = () => {
      const raw = inp.value.trim(); const q = raw.toLowerCase();
      items = []; res.innerHTML = '';
      const groups = [];
      if (raw) {
        const first = [{ label: 'Angel: “' + raw + '”', hint: 'uitvoeren', ic: 'bot', run: async () => handleQuickResult(await A.angel.command(raw), raw) }];
        if (isUrl(raw)) first.unshift({ label: 'Open ' + raw, ic: 'external', run: () => window.open(/^https?:/i.test(raw) ? raw : 'https://' + raw, '_blank', 'noopener') });
        first.push({ label: 'Zoek op Google: ' + raw, ic: 'globe', run: () => { A.track('search', { engine: 'google' }); window.open('https://www.google.com/search?q=' + encodeURIComponent(raw), '_blank', 'noopener'); } });
        groups.push(['Acties', first]);
      }
      const cfg = launcherCfg();
      groups.push(['Apps', cfg.items.filter((x) => !x.hidden && (!q || itemLabel(x).toLowerCase().includes(q))).slice(0, q ? 6 : 12).map((x) => ({ label: itemLabel(x), ic: x.kind === 'app' ? (A.apps.find((a) => a.id === x.appId) || {}).icon : 'globe', run: () => openItem(x) }))]);
      if (q) {
        groups.push(['Websites', A.angel.searchWebsites(raw, 6).map((r) => ({ label: r.site.name, hint: A.hostOf(r.site.url), ic: 'globe', run: () => data.useWebsite(r.site.id) }))]);
        groups.push(['Notities', data.notes().filter((n) => ((n.title || '') + ' ' + (n.content || '')).toLowerCase().includes(q)).slice(0, 4).map((n) => ({ label: n.title || 'Naamloze notitie', ic: 'note', run: () => go('notes', null, { id: n.id }) }))]);
        groups.push(['Taken', data.items().filter((i) => i.title.toLowerCase().includes(q)).slice(0, 4).map((i) => ({ label: i.title, hint: i.date ? A.fmtShort(i.date) : '', ic: 'calendar', run: () => go('agenda', null, i.date ? { date: i.date } : null) }))]);
        groups.push(['Mappen', data.folders().filter((f) => f.name.toLowerCase().includes(q)).slice(0, 4).map((f) => ({ label: A.folders.pathLabel(data.folders(), f.id), ic: 'folder', run: () => go('library', null, { folder: f.id }) }))]);
      }
      groups.forEach(([title, list]) => {
        if (!list.length) return;
        res.appendChild(html('<div class="sp-group">' + esc(title) + '</div>'));
        list.forEach((it) => { const idx = items.length; items.push(it); const el = html('<div class="sp-item" data-i="' + idx + '">' + icon(it.ic) + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</div>'); el.onclick = () => { close(); it.run(); }; res.appendChild(el); });
      });
      sel = 0; mark();
    };
    const mark = () => { res.querySelectorAll('.sp-item').forEach((e, i) => e.classList.toggle('sel', i === sel)); const s = res.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); };
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); const it = items[sel]; close(); it.run(); }
    };
    inp.oninput = draw; document.addEventListener('keydown', key, true);
    document.body.appendChild(ov); inp.value = initial || ''; draw(); setTimeout(() => inp.focus(), 20);
  }
  A.openSpotlight = openSpotlight;

  // ---------- Websiteviewer ----------
  A.registerApp({
    id: 'viewer', name: t('app.viewer'), icon: 'globe', hiddenApp: true, color: 'linear-gradient(135deg,#94a3b8,#475569)',
    render(el, route) {
      const url = route.params.url || ''; let safe = '';
      try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:') safe = u.href; } catch (e) {}
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="viewer"><div class="viewer-bar"><button class="icon-btn" data-back aria-label="' + t('common.back') + '">' + icon('chevL') + '</button><span class="viewer-url">' + icon('lock') + esc(safe ? A.hostOf(safe) : 'Ongeldige URL') + '</span><span class="faint hide-sm" style="font-size:12px">Blijft leeg? Deze site staat weergave binnen een andere site niet toe.</span><a class="btn btn-sm btn-primary" href="' + esc(safe) + '" target="_blank" rel="noopener">' + icon('external') + 'Nieuw tabblad</a></div>' +
        (safe ? '<iframe src="' + esc(safe) + '" title="' + esc(route.params.name || safe) + '" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe>' : '<div class="empty">' + t('err.invalidUrl') + '</div>') + '</div>';
      el.querySelector('[data-back]').onclick = () => history.back();
    }
  });

  // ---------- Health-rapport (geschreven door de maandelijkse GitHub Action) ----------
  async function loadHealthReport() {
    try {
      const r = await fetch('data/health/latest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const rep = await r.json();
      if (!rep || !rep.checked_at || !rep.results) return;
      const prev = data.health();
      if (prev.checked_at === rep.checked_at) return;
      store.set('health', rep);
      // betekenisvolle veranderingen melden
      const sites = data.websites();
      const byUrl = Object.fromEntries(sites.map((s) => [s.url, s]));
      let changes = 0;
      Object.entries(rep.results).forEach(([url, r2]) => {
        const s = byUrl[url]; if (!s) return;
        const was = prev.results && prev.results[url] ? prev.results[url].status : null;
        if (['offline', 'parked'].includes(r2.status) && was !== r2.status) { changes++; A.notify('site_availability', 'avail-' + url + '-' + rep.checked_at, s.name + ' is ' + A.t('site.status.' + r2.status).toLowerCase(), r2.detail || '', { link: '#/health' }); }
        if (['suspicious', 'cert_problem'].includes(r2.status) && was !== r2.status) { changes++; A.notify('site_security', 'sec-' + url + '-' + rep.checked_at, s.name + ': ' + A.t('site.status.' + r2.status).toLowerCase(), r2.detail || '', { link: '#/health' }); }
      });
      const counts = rep.summary || {};
      A.notify('monthly', 'monthly-' + rep.checked_at, 'Websitecontrole klaar', (counts.total || Object.keys(rep.results).length) + ' websites gecontroleerd · ' + (counts.problems || 0) + ' met aandacht nodig.', { link: '#/health' });
      if (A.currentApp() === 'health') A.rerender();
    } catch (e) { /* lokaal geopend of nog geen rapport */ }
  }

  // ---------- Dagelijkse achtergrondtaken (draaien terwijl Angel OS open is) ----------
  function daily() {
    const s = data.settings(); const d = A.today(); const nowD = A.now(); const m = nowD.getHours() * 60 + nowD.getMinutes();
    // 1) doorschuiven bij een nieuwe dag
    const lastDay = store.get('lastDay', null);
    if (lastDay !== d) {
      store.set('lastDay', d);
      const elig = A.tasks.eligibleRollover(d);
      if (elig.length) {
        if (s.tasks.rollover === 'auto') { const n = A.tasks.rollover(elig.map((x) => x.id), d); A.notify(null, 'roll-' + d, n + ' onafgemaakte taken doorgeschoven naar vandaag', 'Automatisch doorschuiven staat aan in Instellingen → Taken.', { link: '#/agenda' }); }
        else if (s.tasks.rollover === 'ask') A.notify(null, 'rollask-' + d, elig.length + ' onafgemaakte taken van eerdere dagen', 'Open Agenda & taken om ze door te schuiven.', { link: '#/agenda' });
        if (s.notifications.overdue) A.notify('overdue', 'overdue-' + d, elig.length + ' taken zijn te laat', elig.slice(0, 3).map((x) => x.title).join(', '), { link: '#/agenda' });
      }
    }
    // 1b) staat doorschuiven op automatisch, dan schuift alles van eerdere dagen mee (ook na het aanzetten van de instelling)
    if (s.tasks.rollover === 'auto') { const left = A.tasks.eligibleRollover(d); if (left.length) A.tasks.rollover(left.map((x) => x.id), d); }
    // 2) taakherinneringen op het tijdstip
    if (!A.inQuietHours(s)) data.items().filter((i) => !i.done && i.date === d && i.time && Math.abs(A.hmToMin(i.time) - m) <= 1).forEach((i) => A.notify('task_reminders', 'rem-' + i.id + '-' + d + '-' + i.time, (i.type === 'reminder' ? '⏰ ' : '') + i.title, 'Nu · ' + i.time, { link: '#/agenda' }));
    // 3) dagplanning
    if (m >= A.hmToMin(s.summaryTime) && !A.inQuietHours(s)) {
      const todays = data.items().filter((i) => i.date === d && !i.done);
      A.notify('daily_summary', 'daily-' + d, 'Je dag: ' + todays.length + ' open ' + (todays.length === 1 ? 'item' : 'items'), todays.slice(0, 4).map((i) => (i.time ? i.time + ' ' : '') + i.title).join(' · ') || 'Niets gepland — fijne dag!', { link: '#/agenda' });
    }
    // 4) weekoverzicht op maandag
    if (nowD.getDay() === 1 && m >= A.hmToMin(s.summaryTime)) {
      const ws = A.ymd(A.addDays(A.startOfWeek(nowD), -7)); const we = A.ymd(A.addDays(A.startOfWeek(nowD), -1));
      const done = data.items().filter((i) => i.done && i.doneAt && i.doneAt.slice(0, 10) >= ws && i.doneAt.slice(0, 10) <= we).length;
      A.notify('weekly', 'weekly-' + d, 'Weekoverzicht', done + ' taken afgerond vorige week.', { link: '#/agenda/week' });
    }
    // 5) één aanbeveling per dag (alleen op basis van gebruik binnen Angel OS)
    if (s.privacy.recommendations && A.recommend) { const r = A.recommend()[0]; if (r) A.notify('recommendations', 'rec-' + d, r.title, r.body, { link: r.link }); }
  }

  // ---------- Opstarten ----------
  function seed() {
    if (!store.get('seeded', false)) {
      const seedSites = Array.isArray(window.ANGEL_SEED_WEBSITES) ? window.ANGEL_SEED_WEBSITES : [];
      if (!store.get('websites', null)) store.set('websites', seedSites.map((s, i) => Object.assign({ id: A.uid(), sort_order: i, use_count: 0, tags: [], is_favorite: false, created_at: new Date().toISOString() }, s)));
      store.set('seeded', true); store.set('seedCount', seedSites.length);
    }
    if (!store.get('shortcuts', null)) store.set('shortcuts', [
      { id: A.uid(), name: 'Google', url: 'https://www.google.com', icon: null }, { id: A.uid(), name: 'YouTube', url: 'https://www.youtube.com', icon: null },
      { id: A.uid(), name: 'Drive', url: 'https://drive.google.com', icon: null }, { id: A.uid(), name: 'Agenda', url: 'https://calendar.google.com', icon: null }
    ]);
  }

  function boot() {
    seed();
    const mig = A.migrate();
    A.applySettings();
    if (window.matchMedia) { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', A.applySettings); }
    const isl = $('#island');
    isl.innerHTML = '<div class="isl-compact"></div><div class="isl-panel" role="dialog" aria-label="Dynamic Island"></div>';
    isl.querySelector('.isl-compact').addEventListener('click', (e) => { e.stopPropagation(); islandOpen ? closeIsland() : openIsland(); });
    isl.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === isl) { e.preventDefault(); islandOpen ? closeIsland() : openIsland(); } if (e.key === 'Escape') { closeIsland(); isl.focus(); } });
    document.addEventListener('mousedown', (e) => { if (islandOpen && !isl.contains(e.target) && !e.target.closest('.overlay')) closeIsland(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSpotlight(); }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); islandOpen ? closeIsland() : openIsland(); }
      if (e.altKey && /^[1-9]$/.test(e.key)) { const items = launcherCfg().items.filter((x) => x.dock && !x.hidden).sort((a, b) => (a.order || 0) - (b.order || 0)); const it = items[+e.key - 1]; if (it) { e.preventDefault(); openItem(it); } }
    });
    A.bus.on('angel-busy', (b) => { angelBusy = b; tick(); });
    A.bus.on('notifications', () => tick(true));
    A.bus.on('settings', () => { renderDock(); A.weather.applyBackground(); });
    window.addEventListener('hashchange', () => { closeIsland(); render(); });
    tick(); setInterval(tick, 1000);
    render();
    if (!mig.ok) A.notify(null, 'migfail-' + A.today(), 'Upgrade van je gegevens is niet uitgevoerd', 'Je gegevens zijn ongewijzigd gebleven (' + mig.reason + '). Kijk bij Instellingen → Gegevens.', { link: '#/settings?section=gegevens' });
    if (mig.ok) { const mr = A.folders.migrateRoot(); if (mr.ok === false) A.notify(null, 'rootfail-' + A.today(), 'Hoofdmap niet aangemaakt', 'Je mappen zijn ongewijzigd gebleven (' + mr.reason + ').', { link: '#/library' }); else if (mr.migrated) A.toast('Alle mappen staan nu onder “Algemene mappen” — niets kwijtgeraakt ✓'); }
    if (mig.ok && mig.migrated) A.toast('Angel OS is bijgewerkt — al je ' + mig.count + ' websites zijn behouden ✓');
    A.weather.applyBackground();
    setInterval(() => A.weather.applyBackground(), 20 * 60000);
    loadHealthReport();
    setTimeout(daily, 1500); setInterval(daily, 60000);
    A.cal.start();
    // altijd bereikbare snel-toevoegknop
    const fab = document.createElement('button'); fab.className = 'fab'; fab.id = 'fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Snel toevoegen'); fab.title = 'Snel toevoegen (taak, afspraak, herinnering…)'; fab.innerHTML = A.icon('plus');
    fab.onclick = () => A.openQuickAdd({}); document.body.appendChild(fab);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
