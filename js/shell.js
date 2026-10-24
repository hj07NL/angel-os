/* Angel OS shell: router, dock, app-bibliotheek, Spotlight-zoeken, focustimer */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, html, $, data } = A;
  let current = null;
  let currentCleanup = null;

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (query) query.split('&').forEach((kv) => { const [k, v] = kv.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { id: parts[0] || 'home', sub: parts.slice(1), params };
  }

  function go(id, sub, params) {
    let h = '#/' + id + (sub && sub.length ? '/' + [].concat(sub).join('/') : '');
    if (params) { const q = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); if (q) h += '?' + q; }
    if (location.hash === h) render(); else location.hash = h;
  }
  A.go = go;

  function appIcon(app, cls) {
    return '<span class="app-icon ' + (cls || '') + '" style="background:' + app.color + '">' + icon(app.icon) + '</span>';
  }
  A.appIcon = appIcon;

  function render() {
    const route = parseHash();
    let app = A.apps.find((a) => a.id === route.id);
    if (!app) { app = A.apps[0]; }
    if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
    current = app;
    document.title = (app.id === 'home' ? 'Angel OS — je persoonlijke internet-desktop' : app.name + ' — Angel OS');
    const win = $('#window');
    win.innerHTML = '';
    const body = html('<div class="window-body"></div>');
    win.appendChild(body);
    win.style.animation = 'none'; void win.offsetWidth; win.style.animation = '';
    const r = app.render(body, route);
    if (typeof r === 'function') currentCleanup = r;
    renderDock();
  }
  A.rerender = () => { if (current) render(); };

  function renderDock() {
    const dock = $('#dock');
    dock.innerHTML = '';
    A.apps.filter((a) => a.dock).forEach((a) => {
      const b = html('<button class="app-icon ' + (current && current.id === a.id ? 'active' : '') + '" title="' + esc(a.name) + '" aria-label="' + esc(a.name) + '" style="background:' + a.color + '">' + icon(a.icon) + '</button>');
      b.onclick = () => go(a.id);
      dock.appendChild(b);
    });
    dock.appendChild(html('<span class="dock-sep"></span>'));
    const g = html('<button class="app-icon grid-btn" title="Alle apps" aria-label="Alle apps">' + icon('grid') + '</button>');
    g.onclick = openLauncher;
    dock.appendChild(g);
  }

  // ---------- App-bibliotheek ----------
  function openLauncher() {
    const ov = html('<div class="overlay"><div class="launcher"><input class="input" placeholder="Zoek apps" aria-label="Zoek apps"><div class="launcher-grid"></div></div></div>');
    const grid = ov.querySelector('.launcher-grid');
    const inp = ov.querySelector('input');
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter') { const f = grid.querySelector('button'); if (f) f.click(); } };
    const draw = () => {
      const q = inp.value.toLowerCase();
      grid.innerHTML = '';
      A.apps.filter((a) => !q || a.name.toLowerCase().includes(q)).forEach((a) => {
        const b = html('<button class="launcher-item">' + appIcon(a) + '<span>' + esc(a.name) + '</span></button>');
        b.onclick = () => { close(); go(a.id); };
        grid.appendChild(b);
      });
    };
    inp.oninput = draw; draw();
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
    setTimeout(() => inp.focus(), 20);
  }
  A.openLauncher = openLauncher;

  // ---------- Spotlight ----------
  function openSpotlight(initial) {
    if ($('.spotlight')) return;
    const ov = html('<div class="overlay"><div class="spotlight"><div class="spotlight-input">' + icon('search') + '<input placeholder="Zoek of vraag het Angel…" aria-label="Zoeken"><button class="icon-btn" data-x aria-label="Sluiten">' + icon('x') + '</button></div><div class="spotlight-results"></div></div></div>');
    const inp = ov.querySelector('input');
    const res = ov.querySelector('.spotlight-results');
    let items = []; let sel = 0;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
    ov.querySelector('[data-x]').onclick = close;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      items = []; res.innerHTML = '';
      const groups = [];
      if (q) groups.push(['Angel', [{ label: 'Vraag Angel: “' + inp.value.trim() + '”', ic: 'bot', run: () => go('angel', null, { q: inp.value.trim() }) }]]);
      groups.push(['Apps', A.apps.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.keywords || '').includes(q)).map((a) => ({ label: a.name, ic: a.icon, run: () => go(a.id) }))]);
      if (q) {
        groups.push(['Notities', data.notes().filter((n) => (n.title + ' ' + n.content).toLowerCase().includes(q)).slice(0, 5).map((n) => ({ label: n.title || 'Naamloze notitie', ic: 'note', run: () => go('notes', null, { id: n.id }) }))]);
        groups.push(['Websites', data.websites().filter((s) => (s.name + ' ' + s.url + ' ' + (s.description || '') + ' ' + (s.tags || []).join(' ')).toLowerCase().includes(q)).slice(0, 8).map((s) => ({ label: s.name, hint: A.hostOf(s.url), ic: 'globe', run: () => data.useWebsite(s.id) }))]);
        groups.push(['Projecten', data.projects().filter((p) => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)).slice(0, 5).map((p) => ({ label: p.name, ic: 'folder', run: () => go('projects') }))]);
        groups.push(['Taken', data.items().filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5).map((t) => ({ label: t.title, hint: t.date ? A.fmtShort(t.date) : '', ic: 'calendar', run: () => go('agenda', null, t.date ? { date: t.date } : null) }))]);
        groups.push(['PersonaX', [{ label: 'Onderzoek “' + inp.value.trim() + '” in PersonaX', ic: 'users', run: () => go('personax', null, { q: inp.value.trim() }) }]]);
      }
      groups.forEach(([title, list]) => {
        if (!list.length) return;
        res.appendChild(html('<div class="sp-group">' + esc(title) + '</div>'));
        list.forEach((it) => {
          const idx = items.length; items.push(it);
          const el = html('<div class="sp-item" data-i="' + idx + '">' + icon(it.ic) + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</div>');
          el.onclick = () => { close(); it.run(); };
          res.appendChild(el);
        });
      });
      sel = 0; mark();
    };
    const mark = () => { res.querySelectorAll('.sp-item').forEach((e, i) => e.classList.toggle('sel', i === sel)); const s = res.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); };
    const key = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { const it = items[sel]; close(); it.run(); }
    };
    inp.oninput = draw;
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
    inp.value = initial || '';
    draw();
    setTimeout(() => inp.focus(), 20);
  }
  A.openSpotlight = openSpotlight;

  // ---------- Focustimer ----------
  const focus = { end: A.store.get('focusEnd', null) };
  function startFocus(min) {
    focus.end = Date.now() + min * 60000;
    A.store.set('focusEnd', focus.end);
    A.toast('Focus gestart: ' + min + ' minuten');
    tick();
  }
  function stopFocus() { focus.end = null; A.store.set('focusEnd', null); tick(); }
  A.startFocus = startFocus; A.stopFocus = stopFocus;

  function tick() {
    const isl = $('#island');
    const now = new Date();
    const clock = A.pad2(now.getHours()) + ':' + A.pad2(now.getMinutes());
    let focusHtml = '';
    if (focus.end) {
      const left = Math.max(0, focus.end - Date.now());
      if (left === 0) { focus.end = null; A.store.set('focusEnd', null); A.toast('Focus-sessie klaar — goed gedaan!'); }
      else focusHtml = '<span class="focus-pill" title="Focus-sessie (klik om te stoppen)" data-focus>' + Math.floor(left / 60000) + ':' + A.pad2(Math.floor((left % 60000) / 1000)) + '</span>';
    }
    isl.innerHTML = icon('search', '') + '<span>Zoek of vraag Angel</span>' + focusHtml + '<span class="muted hide-sm">' + icon('wifi', '') + '</span><span class="muted">' + clock + '</span>';
    isl.querySelectorAll('svg').forEach((s) => { s.style.width = '15px'; s.style.height = '15px'; });
    const f = isl.querySelector('[data-focus]');
    if (f) f.onclick = (e) => { e.stopPropagation(); stopFocus(); A.toast('Focus gestopt'); };
  }

  // ---------- Opstarten ----------
  function seed() {
    if (!A.store.get('seeded', false)) {
      const seedSites = Array.isArray(window.ANGEL_SEED_WEBSITES) ? window.ANGEL_SEED_WEBSITES : [];
      if (!A.store.get('websites', null)) A.store.set('websites', seedSites.map((s, i) => Object.assign({ id: A.uid(), sort_order: i, use_count: 0, tags: [], is_favorite: false, created_at: new Date().toISOString() }, s)));
      A.store.set('seeded', true);
      A.store.set('seedCount', seedSites.length);
    }
  }

  function boot() {
    seed();
    A.applySettings();
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', A.applySettings);
    $('#island').onclick = () => openSpotlight();
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSpotlight(); }
    });
    window.addEventListener('hashchange', render);
    tick(); setInterval(tick, 1000);
    render();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
