/* Angel OS core: opslag, migratie met back-up, hulpfuncties, iconen, datalaag, meldingen, activiteit */
(function () {
  'use strict';
  const NS = 'angel-os:v2:';
  const SCHEMA = 3;
  const t = window.AOS_I18N.t;

  // ---------- Opslag ----------
  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(NS + key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
      catch (e) { console.error('[AngelOS] opslaan mislukt', key, e); toast(t('err.storage') + ': ' + (e.name === 'QuotaExceededError' ? 'opslag vol' : e.message)); return false; }
    },
    remove(key) { try { localStorage.removeItem(NS + key); } catch (e) {} },
    keys() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(NS)) out.push(k.slice(NS.length)); } } catch (e) {} return out; },
    sizeOf(key) { try { const v = localStorage.getItem(NS + key); return v ? v.length * 2 : 0; } catch (e) { return 0; } },
    available() { try { localStorage.setItem(NS + '__t', '1'); localStorage.removeItem(NS + '__t'); return true; } catch (e) { return false; } }
  };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function html(str) { const tpl = document.createElement('template'); tpl.innerHTML = str.trim(); return tpl.content.firstElementChild; }
  const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };

  // ---------- Datums (NL, Europe/Amsterdam) ----------
  const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const DAYS_SHORT = ['ZO', 'MA', 'DI', 'WO', 'DO', 'VR', 'ZA'];
  const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // "nu" in de ingestelde tijdzone (standaard Europe/Amsterdam), als lokale Date-waarde
  function now() {
    const tz = (store.get('settings', {}) || {}).timezone || 'Europe/Amsterdam';
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const g = (k) => +p.find((x) => x.type === k).value;
      return new Date(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    } catch (e) { return new Date(); }
  }
  const today = () => ymd(now());
  const fmtLong = (s) => { const d = typeof s === 'string' ? parseYmd(s) : s; return cap(DAYS[d.getDay()]) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  const fmtShort = (s) => { const d = typeof s === 'string' ? parseYmd(s) : s; return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
  const fmtNum = (d) => { const x = typeof d === 'string' ? parseYmd(d) : d; return pad2(x.getDate()) + '-' + pad2(x.getMonth() + 1) + '-' + x.getFullYear(); };
  const weekNumber = (d) => { const tt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = tt.getUTCDay() || 7; tt.setUTCDate(tt.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(tt.getUTCFullYear(), 0, 1)); return Math.ceil(((tt - y0) / 86400000 + 1) / 7); };
  const fmtDateTime = (iso) => { if (!iso) return '—'; return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const relTime = (iso) => {
    if (!iso) return t('common.never');
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'zojuist';
    if (diff < 3600) return Math.floor(diff / 60) + ' min geleden';
    if (diff < 86400) return Math.floor(diff / 3600) + ' uur geleden';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' dagen geleden';
    return fmtDateTime(iso);
  };
  const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const hmToMin = (s) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const minToHm = (m) => pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);

  // ---------- Iconen ----------
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    library: '<path d="M4 4v16M8.5 4v16"/><path d="m13 4.5 4.6 15.3"/><path d="M18 4l2 .6"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><path d="M2 13v3M22 13v3"/><path d="M9 13v2M15 13v2"/>',
    note: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M12 11v6M9 14h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    heart: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>', chevU: '<path d="m18 15-6-6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>',
    rain: '<path d="M16 13v8M8 13v8M12 15v8"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
    snow: '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    layout: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    play: '<path d="m6 3 14 9-14 9z"/>', pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M19 2v3M17.5 3.5h3"/>',
    command: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z"/>'
  };
  const icon = (name, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.globe) + '</svg>';
  const ICON_NAMES = Object.keys(P);

  // ---------- Toast & dialogen ----------
  function toast(msg, action, kind) {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = html('<div class="toast-wrap" role="status" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const el = html('<div class="toast ' + (kind || '') + '"><span>' + esc(msg) + '</span></div>');
    if (action) { const b = html('<button class="btn btn-sm">' + esc(action.label) + '</button>'); b.onclick = () => { action.run(); el.remove(); }; el.appendChild(b); }
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
    setTimeout(() => el.remove(), action ? 6500 : 3000);
  }

  function openModal(innerHtml, onMount, opts) {
    opts = opts || {};
    const ov = html('<div class="overlay"><div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' + innerHtml + '</div></div>');
    let closed = false;
    const close = () => { if (closed) return; closed = true; ov.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    $$('[data-close]', ov).forEach((b) => (b.onclick = close));
    if (onMount) onMount(ov.querySelector('.modal'), close);
    const first = ov.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return close;
  }
  function confirmDialog(text, okLabel, detail) {
    return new Promise((resolve) => {
      let answered = false;
      openModal('<h2>' + esc(text) + '</h2>' + (detail ? '<p class="muted">' + esc(detail) + '</p>' : '') + '<div class="modal-actions"><button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-ok>' + esc(okLabel || t('common.ok')) + '</button></div>',
        (m, close) => { m.querySelector('[data-ok]').onclick = () => { answered = true; close(); resolve(true); }; }, { onClose: () => { if (!answered) resolve(false); } });
    });
  }
  function promptDialog(title, value, placeholder) {
    return new Promise((resolve) => {
      let answered = false;
      openModal('<h2>' + esc(title) + '</h2><input class="input" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"><div class="modal-actions"><button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-ok>' + t('common.ok') + '</button></div>',
        (m, close) => {
          const inp = m.querySelector('input');
          const ok = () => { answered = true; const v = inp.value.trim(); close(); resolve(v || null); };
          m.querySelector('[data-ok]').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
        }, { onClose: () => { if (!answered) resolve(null); } });
    });
  }

  // ---------- Domein: legacy categorieën ----------
  const CATEGORIES = [
    { id: 'design', name: 'Design', emoji: '🎨' }, { id: 'ai', name: 'AI', emoji: '🤖' }, { id: 'coding', name: 'Coding', emoji: '💻' },
    { id: 'school', name: 'School', emoji: '📚' }, { id: 'video', name: 'Video', emoji: '🎬' }, { id: 'music', name: 'Music', emoji: '🎵' },
    { id: 'documents', name: 'Documents', emoji: '📄' }, { id: 'images', name: 'Images', emoji: '🖼️' }, { id: 'tools', name: 'Tools', emoji: '🧮' },
    { id: 'security', name: 'Security', emoji: '🔐' }, { id: 'productivity', name: 'Productivity', emoji: '🚀' }, { id: 'other', name: 'Other', emoji: '🧪' }
  ];
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; } };
  const normUrl = (url) => { try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase(); } catch (e) { return String(url || '').toLowerCase(); } };
  const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function favicon(site, size) {
    const host = hostOf(site.url);
    if (site.icon && /^data:image\//.test(site.icon)) return '<span class="favicon"><img src="' + esc(site.icon) + '" alt=""></span>';
    if (site.icon && !/^https?:/.test(site.icon)) return '<span class="favicon emoji">' + esc(site.icon) + '</span>';
    const src = site.favicon_url || (host ? 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(host) : '');
    const letter = esc(initials(site.name).slice(0, 1));
    return '<span class="favicon"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'' + letter + '\'))">' : letter) + '</span>';
  }

  // ---------- Standaard mappenstructuur ----------
  const DEFAULT_TREE = [
    ['Technologie', '💻', [
      ['Kunstmatige intelligentie', '🤖', [['AI-chatbots', '💬'], ['AI-beeldgeneratie', '🖼️'], ['AI-schrijven', '✍️'], ['AI-programmeren', '🧑‍💻']]],
      ['Programmeren', '⌨️', [['HTML en CSS', '🎨'], ['JavaScript', '🟨'], ['Python', '🐍']]],
      ['Productiviteit', '🚀', [['Planning', '🗓️'], ['Notities', '📝']]],
      ['Hulpmiddelen', '🧰'], ['Beveiliging', '🔐']]],
    ['Onderwijs', '📚', [['Economie', '📈'], ['Engels', '🇬🇧'], ['Wiskunde', '📐'], ['Geschiedenis', '🏛️']]],
    ['Creativiteit', '🎨', [['Grafisch ontwerp', '✏️'], ['Videobewerking', '🎬'], ['Architectuur', '🏗️'], ['Afbeeldingen', '🖼️']]],
    ['Entertainment', '🍿', [['Muziek', '🎵']]],
    ['Onderzoek', '🔎', [['Boeken en documenten', '📖']]],
    ['Persoonlijk', '🏠'],
    ['Niet ingedeeld', '📥']
  ];
  function buildDefaultFolders() {
    const root = { id: uid(), name: 'Algemene mappen', emoji: '🗂️', parent_id: null, order: -1, root: true, created_at: new Date().toISOString() };
    const out = [root]; let order = 0;
    const walk = (nodes, parent) => nodes.forEach(([name, emoji, kids]) => {
      const f = { id: uid(), name, emoji, parent_id: parent, order: order++, created_at: new Date().toISOString(), system: name === 'Niet ingedeeld' };
      out.push(f); if (kids) walk(kids, f.id);
    });
    walk(DEFAULT_TREE, root.id);
    return out;
  }
  const LEGACY_MAP = {
    design: ['Creativiteit', 'Grafisch ontwerp'], ai: ['Technologie', 'Kunstmatige intelligentie'], coding: ['Technologie', 'Programmeren'], school: ['Onderwijs'],
    video: ['Creativiteit', 'Videobewerking'], music: ['Entertainment', 'Muziek'], documents: ['Onderzoek', 'Boeken en documenten'], images: ['Creativiteit', 'Afbeeldingen'],
    tools: ['Technologie', 'Hulpmiddelen'], security: ['Technologie', 'Beveiliging'], productivity: ['Technologie', 'Productiviteit'], other: ['Niet ingedeeld']
  };
  function folderByPath(folders, path) {
    let parent = (folders.find((x) => x.root) || {}).id || null, f = null;
    for (const name of path) { f = folders.find((x) => x.parent_id === parent && x.name === name); if (!f) return null; parent = f.id; }
    return f;
  }

  // ---------- Instellingen ----------
  const DEFAULT_SETTINGS = {
    name: '', timezone: 'Europe/Amsterdam', lang: 'nl',
    theme: 'dark', accent: '#f97316', wallpaper: 'aurora', weatherBg: true, glass: 'normal', motion: 'system',
    homeLayout: 'balanced',
    notifications: { task_reminders: true, overdue: true, daily_summary: true, site_availability: true, site_security: true, recommendations: true, weather: false, weekly: false, monthly: true },
    quietEnabled: true, quietStart: '22:00', quietEnd: '07:00', notifFrequency: 'normal', browserPush: false, summaryTime: '07:30',
    privacy: { tracking: true, recommendations: true, location: 'ask' },
    weatherCity: null,
    library: { sort: 'manual', autoCategorize: true, duplicateDetect: true, checkFrequency: 'monthly' },
    tasks: { defaultDate: 'today', rollover: 'auto', defaultView: 'day' },
    calendars: { auto: true, everyHours: 3 },
    ai: { enabled: false, provider: 'anthropic', apiKey: '', model: '' }
  };
  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over || {}).forEach((k) => {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], over[k]);
      else if (over[k] !== undefined) out[k] = over[k];
    });
    return out;
  }

  // ---------- Event bus ----------
  const bus = { h: {}, on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return () => this.off(ev, fn); }, off(ev, fn) { this.h[ev] = (this.h[ev] || []).filter((x) => x !== fn); }, emit(ev, p) { (this.h[ev] || []).forEach((fn) => { try { fn(p); } catch (e) { console.error(e); } }); } };

  // ---------- Datalaag ----------
  const data = {
    websites() { return store.get('websites', []); },
    saveWebsites(list) { const ok = store.set('websites', list); bus.emit('data', 'websites'); return ok; },
    folders() { return store.get('folders', []); },
    saveFolders(list) { store.set('folders', list); bus.emit('data', 'folders'); },
    notes() { return store.get('notes', []); },
    saveNotes(list) { store.set('notes', list); bus.emit('data', 'notes'); },
    projects() { return store.get('projects', []); },
    saveProjects(list) { store.set('projects', list); bus.emit('data', 'projects'); },
    items() { return store.get('items', []); },
    saveItems(list) { store.set('items', list); bus.emit('data', 'items'); },
    subjects() { return store.get('subjects', DEFAULT_SUBJECTS); },
    shortcuts() { return store.get('shortcuts', []); },
    saveShortcuts(l) { store.set('shortcuts', l); bus.emit('data', 'shortcuts'); },
    settings() { return deepMerge(DEFAULT_SETTINGS, store.get('settings', {})); },
    saveSettings(s) { store.set('settings', s); applySettings(); bus.emit('settings'); },
    patchSettings(patch) { const s = deepMerge(this.settings(), patch); this.saveSettings(s); return s; },
    health() { return store.get('health', { checked_at: null, results: {} }); },
    useWebsite(id, mode) {
      const list = this.websites(); const s = list.find((x) => x.id === id); if (!s) return;
      s.use_count = (s.use_count || 0) + 1; s.last_used_at = new Date().toISOString();
      this.saveWebsites(list); track('open_site', { id: s.id, folder: s.folder_id });
      if (mode === 'os') A.go('viewer', null, { url: s.url, name: s.name }); else window.open(s.url, '_blank', 'noopener');
    }
  };
  const DEFAULT_SUBJECTS = ['Aardrijkskunde', 'B&S', 'Bedrijfseconomie', 'Biologie', 'Duits', 'Economie', 'Engels', 'Frans', 'Geschiedenis', 'Informatica', 'Kunst', 'Natuurkunde', 'Nederlands', 'Scheikunde', 'Wiskunde B'];

  // ---------- Activiteit (privacy-first, alleen binnen Angel OS) ----------
  function track(type, payload) {
    const s = data.settings();
    if (!s.privacy.tracking) return;
    const log = store.get('activity', []);
    log.push({ type, at: new Date().toISOString(), ...payload });
    store.set('activity', log.slice(-500));
  }

  // ---------- Meldingen ----------
  function inQuietHours(s) {
    if (!s.quietEnabled) return false;
    const n = now(); const m = n.getHours() * 60 + n.getMinutes();
    const a = hmToMin(s.quietStart), b = hmToMin(s.quietEnd);
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
  function notify(kind, key, title, body, extra) {
    const s = data.settings();
    if (kind && s.notifications[kind] === false) return false;
    const list = store.get('notifications', []);
    if (key && list.some((n) => n.key === key)) return false; // geen dubbele meldingen
    if (s.notifFrequency === 'low' && kind === 'recommendations' && list.filter((n) => n.kind === kind && Date.now() - new Date(n.at) < 86400000).length >= 1) return false;
    const n = Object.assign({ id: uid(), kind, key: key || uid(), title, body: body || '', at: new Date().toISOString(), read: false }, extra || {});
    list.unshift(n); store.set('notifications', list.slice(0, 200));
    bus.emit('notifications');
    if (s.browserPush && !inQuietHours(s) && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try { new Notification(title, { body: body || '', tag: n.key }); } catch (e) {}
    }
    return true;
  }

  // ---------- Thema ----------
  function hexToRgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applySettings() {
    const s = data.settings();
    let theme = s.theme;
    if (theme === 'system') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-glass', s.glass);
    root.setAttribute('data-wallpaper', s.wallpaper);
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accent-soft', hexToRgba(s.accent, 0.16));
    const reduce = s.motion === 'reduced' || (s.motion === 'system' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.body && document.body.classList.toggle('reduce-motion', reduce);
    window.AOS_I18N.setLang(s.lang || 'nl');
  }

  // ---------- Back-up en migratie ----------
  const BACKUP_KEYS = ['websites', 'folders', 'notes', 'projects', 'items', 'subjects', 'settings', 'rooster', 'calendars', 'swipe', 'shortcuts', 'widgets', 'launcher', 'px-profiles', 'px-searches', 'px-runs', 'px-last', 'pinHash', 'folderHistory', 'extDone'];
  function snapshot() { const out = {}; BACKUP_KEYS.forEach((k) => { const v = store.get(k, null); if (v != null) out[k] = v; }); return out; }
  function makeBackup(reason) {
    const backups = store.get('backups', []);
    const b = { id: uid(), at: new Date().toISOString(), reason, schema: store.get('schema', 2), data: snapshot() };
    backups.unshift(b);
    // houd maximaal 3 back-ups; als opslag vol raakt, de oudste eerst laten vallen
    let list = backups.slice(0, 3);
    while (list.length && !store.set('backups', list)) list = list.slice(0, list.length - 1);
    return list.length ? b : null;
  }
  function restoreBackup(id) {
    const b = store.get('backups', []).find((x) => x.id === id); if (!b) return false;
    BACKUP_KEYS.forEach((k) => { if (k in b.data) store.set(k, b.data[k]); });
    store.set('schema', b.schema || 2);
    return true;
  }

  function migrate() {
    const from = store.get('schema', 2);
    if (from >= SCHEMA) return { ok: true, migrated: false };
    const before = data.websites();
    const baseline = { count: before.length, urls: before.map((s) => s.id + '|' + s.url).sort().join('\n') };
    const backup = makeBackup('Voor upgrade naar schema ' + SCHEMA);
    if (before.length && !backup) { console.error('[AngelOS] back-up mislukt — migratie gestopt'); return { ok: false, reason: 'backup' }; }
    try {
      // 1) mappen aanmaken en bestaande websites toewijzen (categorie blijft bewaard)
      let folders = data.folders();
      if (!folders.length) folders = buildDefaultFolders();
      const unc = folders.find((f) => f.system) || folders[folders.length - 1];
      const sites = before.map((s) => {
        const out = Object.assign({}, s);
        if (!out.id) out.id = uid();
        if (!out.folder_id) { const f = folderByPath(folders, LEGACY_MAP[s.category] || ['Niet ingedeeld']); out.folder_id = (f || unc).id; }
        if (!Array.isArray(out.tags)) out.tags = [];
        if (out.rating == null) out.rating = 0;
        if (!out.created_at) out.created_at = new Date().toISOString();
        return out;
      });
      // 2) taken: geschiedenis en volgorde
      const items = data.items().map((i, idx) => Object.assign({ order: idx, history: [] }, i));
      // 3) instellingen omzetten
      const old = store.get('settings', {});
      const s = deepMerge(DEFAULT_SETTINGS, old);
      if (old.unfinished) s.tasks.rollover = old.unfinished === 'auto' ? 'auto' : old.unfinished === 'keep' ? 'overdue' : 'ask';
      if (old.reduceMotion) s.motion = 'reduced';
      if (old.notifications === true || old.notifications === false) s.notifications = Object.assign({}, DEFAULT_SETTINGS.notifications);
      if (old.notifications === true) s.browserPush = true;
      delete s.unfinished; delete s.reduceMotion;
      // 4) notities: platte tekst wordt veilige HTML, origineel blijft bewaard
      const notes = data.notes().map((n) => n.html != null ? n : Object.assign({}, n, { html: '<p>' + esc(n.content || '').replace(/\n/g, '<br>') + '</p>', content_original: n.content || '' }));

      // verificatie vóór wegschrijven
      const check = { count: sites.length, urls: sites.map((x) => x.id + '|' + x.url).sort().join('\n') };
      if (check.count !== baseline.count || check.urls !== baseline.urls) throw new Error('verificatie mislukt');
      store.set('folders', folders); store.set('websites', sites); store.set('items', items); store.set('settings', s); store.set('notes', notes);
      if (!store.get('folderHistory', null)) store.set('folderHistory', [{ id: uid(), at: new Date().toISOString(), label: 'Eerste indeling (migratie)', assignments: Object.fromEntries(sites.map((x) => [x.id, x.folder_id])), folders: folders }]);
      // verificatie na wegschrijven
      const after = data.websites();
      if (after.length !== baseline.count || after.map((x) => x.id + '|' + x.url).sort().join('\n') !== baseline.urls) throw new Error('verificatie na opslaan mislukt');
      store.set('schema', SCHEMA);
      console.info('[AngelOS] migratie naar schema ' + SCHEMA + ' gelukt; ' + after.length + ' websites behouden');
      return { ok: true, migrated: true, count: after.length };
    } catch (e) {
      console.error('[AngelOS] migratie teruggedraaid:', e);
      if (backup) restoreBackup(backup.id);
      return { ok: false, reason: e.message };
    }
  }

  // ---------- App-register ----------
  const apps = [];
  function registerApp(app) { apps.push(app); }

  const A = window.AOS = {
    t, store, uid, esc, $, $$, html, icon, ICON_NAMES, toast, openModal, confirmDialog, promptDialog, debounce,
    DAYS, DAYS_SHORT, MONTHS, pad2, ymd, parseYmd, today, now, addDays, startOfWeek, fmtLong, fmtShort, fmtNum, fmtDateTime, relTime, fmtBytes, weekNumber, cap, hmToMin, minToHm,
    CATEGORIES, catOf, hostOf, normUrl, initials, favicon, data, bus, applySettings, apps, registerApp, DEFAULT_SUBJECTS, DEFAULT_SETTINGS, deepMerge,
    folderByPath, buildDefaultFolders, track, notify, inQuietHours, makeBackup, restoreBackup, migrate, snapshot, BACKUP_KEYS, SCHEMA,
    sessionStart: Date.now()
  };
})();
