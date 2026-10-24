/* Angel OS core: opslag, hulpfuncties, iconen, app-register */
(function () {
  'use strict';
  const NS = 'angel-os:v2:';

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
      catch (e) { toast('Opslaan mislukt: ' + e.message); return false; }
    },
    remove(key) { try { localStorage.removeItem(NS + key); } catch (e) {} },
    keys() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(NS)) out.push(k.slice(NS.length)); } } catch (e) {}
      return out;
    },
    sizeOf(key) { try { const v = localStorage.getItem(NS + key); return v ? v.length * 2 : 0; } catch (e) { return 0; } },
    available() { try { localStorage.setItem(NS + '__t', '1'); localStorage.removeItem(NS + '__t'); return true; } catch (e) { return false; } }
  };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function html(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; }

  // ---------- Datums (NL) ----------
  const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const DAYS_SHORT = ['ZO', 'MA', 'DI', 'WO', 'DO', 'VR', 'ZA'];
  const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtLong = (s) => { const d = typeof s === 'string' ? parseYmd(s) : s; return cap(DAYS[d.getDay()]) + ' ' + d.getDate() + ' ' + cap(MONTHS[d.getMonth()]); };
  const fmtShort = (s) => { const d = typeof s === 'string' ? parseYmd(s) : s; return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
  const weekNumber = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
  const fmtDateTime = (iso) => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const relTime = (iso) => {
    if (!iso) return 'Nooit';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'zojuist';
    if (diff < 3600) return Math.floor(diff / 60) + ' min geleden';
    if (diff < 86400) return Math.floor(diff / 3600) + ' uur geleden';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' dagen geleden';
    return fmtDateTime(iso);
  };
  const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  // ---------- Iconen (lucide-stijl) ----------
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
    library: '<path d="M4 4v16M8.5 4v16"/><path d="m13 4.5 4.6 15.3"/><path d="M18 4l2 .6"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><path d="M2 13v3M22 13v3"/><path d="M9 13v2M15 13v2"/>',
    note: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="15" cy="13.5" r="2"/><path d="M15 15.5V18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 19.5h.01"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    layout: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    compare: '<path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>'
  };
  const icon = (name, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';

  // ---------- Toast & dialogen ----------
  function toast(msg, action) {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = html('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const t = html('<div class="toast"><span>' + esc(msg) + '</span></div>');
    if (action) {
      const b = html('<button class="btn btn-sm">' + esc(action.label) + '</button>');
      b.onclick = () => { action.run(); t.remove(); };
      t.appendChild(b);
    }
    wrap.appendChild(t);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
    setTimeout(() => t.remove(), action ? 6000 : 2800);
  }

  function openModal(innerHtml, onMount) {
    const ov = html('<div class="overlay"><div class="modal" role="dialog" aria-modal="true">' + innerHtml + '</div></div>');
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    $$('[data-close]', ov).forEach((b) => (b.onclick = close));
    if (onMount) onMount(ov.querySelector('.modal'), close);
    const first = ov.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return close;
  }

  function confirmDialog(text, okLabel) {
    return new Promise((resolve) => {
      let done = false;
      const close = openModal('<h2>' + esc(text) + '</h2><div class="modal-actions"><button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-ok>' + esc(okLabel || 'OK') + '</button></div>', (m, cl) => {
        m.querySelector('[data-ok]').onclick = () => { done = true; cl(); resolve(true); };
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(document.querySelector('.modal'))) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(document.body, { childList: true });
      void close;
    });
  }

  // ---------- Domein ----------
  const CATEGORIES = [
    { id: 'design', name: 'Design', emoji: '🎨' },
    { id: 'ai', name: 'AI', emoji: '🤖' },
    { id: 'coding', name: 'Coding', emoji: '💻' },
    { id: 'school', name: 'School', emoji: '📚' },
    { id: 'video', name: 'Video', emoji: '🎬' },
    { id: 'music', name: 'Music', emoji: '🎵' },
    { id: 'documents', name: 'Documents', emoji: '📄' },
    { id: 'images', name: 'Images', emoji: '🖼️' },
    { id: 'tools', name: 'Tools', emoji: '🧮' },
    { id: 'security', name: 'Security', emoji: '🔐' },
    { id: 'productivity', name: 'Productivity', emoji: '🚀' },
    { id: 'other', name: 'Other', emoji: '🧪' }
  ];
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; } };
  const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function favicon(site, size) {
    const host = hostOf(site.url);
    const src = site.favicon_url || (host ? 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(host) : '');
    const letter = esc(initials(site.name).slice(0, 1));
    return '<span class="favicon" style="' + (size ? 'width:' + size + 'px;height:' + size + 'px' : '') + '">' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'' + letter + '\'))">' : letter) + '</span>';
  }

  // ---------- Data ----------
  const data = {
    websites() { return store.get('websites', []); },
    saveWebsites(list) { store.set('websites', list); bus.emit('data'); },
    notes() { return store.get('notes', []); },
    saveNotes(list) { store.set('notes', list); bus.emit('data'); },
    projects() { return store.get('projects', []); },
    saveProjects(list) { store.set('projects', list); bus.emit('data'); },
    items() { return store.get('items', []); },
    saveItems(list) { store.set('items', list); bus.emit('data'); },
    subjects() { return store.get('subjects', DEFAULT_SUBJECTS); },
    settings() { return Object.assign({ theme: 'dark', accent: '#f97316', reduceMotion: false, name: '', unfinished: 'ask' }, store.get('settings', {})); },
    saveSettings(s) { store.set('settings', s); applySettings(); bus.emit('settings'); },
    useWebsite(id) {
      const list = this.websites();
      const s = list.find((x) => x.id === id);
      if (!s) return;
      s.use_count = (s.use_count || 0) + 1;
      s.last_used_at = new Date().toISOString();
      this.saveWebsites(list);
      window.open(s.url, '_blank', 'noopener');
    }
  };
  const DEFAULT_SUBJECTS = ['Aardrijkskunde', 'B&S', 'Bedrijfseconomie', 'Biologie', 'Duits', 'Economie', 'Engels', 'Frans', 'Geschiedenis', 'Informatica', 'Kunst', 'Natuurkunde', 'Nederlands', 'Scheikunde', 'Wiskunde B'];

  // ---------- Event bus ----------
  const bus = {
    h: {},
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); },
    emit(ev, payload) { (this.h[ev] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); }
  };

  // ---------- Instellingen toepassen ----------
  function hexToRgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applySettings() {
    const s = data.settings();
    let theme = s.theme;
    if (theme === 'system') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', s.accent);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(s.accent, 0.16));
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  }

  // ---------- App-register ----------
  const apps = [];
  function registerApp(app) { apps.push(app); }

  window.AOS = {
    store, uid, esc, $, $$, html, icon, toast, openModal, confirmDialog,
    DAYS, DAYS_SHORT, MONTHS, pad2, ymd, parseYmd, today, addDays, startOfWeek, fmtLong, fmtShort, fmtDateTime, relTime, fmtBytes, weekNumber, cap,
    CATEGORIES, catOf, hostOf, initials, favicon, data, bus, applySettings, apps, registerApp, DEFAULT_SUBJECTS,
    sessionStart: Date.now()
  };
})();
