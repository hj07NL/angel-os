/* Agenda-bronnen verversen: Somtoday/andere iCal-links (direct) en Google Agenda (via je eigen proxy-Worker).
   - refreshAll(): ververst alle bronnen tegelijk, houdt per bron de laatste update en foutmelding bij
   - bij een fout blijven de al opgehaalde afspraken staan (er wordt nooit iets leeggemaakt)
   - automatisch verversen terwijl Angel OS open is (instelbaar, standaard elke 3 uur) en zodra je terugkomt/online gaat
   Het proxy-adres en jouw sleutel staan in 'calProxy' (bewust NIET in de back-up-export). */
(function () {
  'use strict';
  const A = window.AOS;
  const { store, data } = A;
  let running = null;

  const proxy = {
    get() { const p = store.get('calProxy', null); return p && typeof p === 'object' ? p : { base: '', key: '' }; },
    set(p) { store.set('calProxy', { base: String(p.base || '').trim().replace(/\/+$/, ''), key: String(p.key || '').trim() }); },
    genKey() { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    ready() { const p = this.get(); return /^https:\/\//.test(p.base) && p.key.length >= 32; }
  };

  const timeout = (ms) => { try { return AbortSignal.timeout(ms); } catch (e) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; } };
  function friendly(e) {
    const m = String((e && e.message) || e || 'Onbekende fout');
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'Time-out: de server antwoordde niet op tijd';
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m) && !/HTTP/.test(m)) return 'Geen verbinding, of de server staat ophalen vanuit de browser niet toe';
    return m;
  }
  async function readError(r) { let m = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) m = j.error; } catch (e) { /* geen json */ } return m; }

  async function fetchText(c) {
    if (c.kind === 'proxy') {
      const p = proxy.get(); if (!proxy.ready()) throw new Error('Agenda-proxy is nog niet ingesteld (Instellingen → Agenda\'s)');
      const r = await fetch(p.base + '/v1/calendars/' + encodeURIComponent(c.id) + '/ics', { headers: { Authorization: 'Bearer ' + p.key }, cache: 'no-store', signal: timeout(25000) });
      if (!r.ok) throw new Error(await readError(r));
      return r.text();
    }
    const r = await fetch(c.url.replace(/^webcal:/i, 'https:'), { signal: timeout(25000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }
  // Nieuwe lezer (herhalingen, tijdzones); valt terug op de oude lezer als de nieuwe niets vindt.
  function parseText(text, kind) {
    const legacy = A.parseICS ? A.parseICS(text) : [];
    let neu = [];
    try { const now = Date.now(); neu = window.AOS_ICAL.parse(text, kind === 'proxy' ? { from: now - 60 * 864e5, to: now + 365 * 864e5, limitNonRecurring: true } : {}); } catch (e) { neu = []; }
    return neu.length || !legacy.length ? neu : legacy;
  }

  function writeSource(c, patch, events) {
    if (events) store.set('rooster', store.get('rooster', []).filter((e) => e.cal !== c.label).concat(events.map((e) => Object.assign(e, { cal: c.label }))));
    const list = store.get('calendars', []);
    const i = list.findIndex((x) => x.label === c.label);
    if (i >= 0) list[i] = Object.assign({}, list[i], patch); else list.push(Object.assign({ label: c.label, url: null }, patch));
    store.set('calendars', list);
  }
  const refreshable = (c) => c.kind === 'proxy' || !!c.url;

  async function refreshOne(c) {
    const now = new Date().toISOString();
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline');
      const events = parseText(await fetchText(c), c.kind);
      writeSource(c, { count: events.length, updated: now, lastTry: now, error: null }, events);
      return { label: c.label, ok: true, count: events.length };
    } catch (e) {
      const msg = friendly(e);
      writeSource(c, { lastTry: now, error: msg });
      return { label: c.label, ok: false, error: msg };
    }
  }

  // Ververst alle (of alleen de aan de beurt zijnde) bronnen tegelijk.
  function refreshAll(opts) {
    opts = opts || {};
    if (running) return running;
    const everyMs = (data.settings().calendars.everyHours || 3) * 3600e3;
    const srcs = store.get('calendars', []).filter(refreshable).filter((c) => !opts.onlyDue || !c.lastTry || Date.now() - new Date(c.lastTry).getTime() >= everyMs);
    if (!srcs.length) return Promise.resolve([]);
    A.bus.emit('calendars', { busy: true });
    running = Promise.all(srcs.map(refreshOne)).then((res) => { running = null; A.bus.emit('calendars', { busy: false, results: res, manual: !!opts.manual }); return res; });
    return running;
  }

  async function addProxyCalendar(label, icalUrl) {
    const p = proxy.get(); if (!proxy.ready()) throw new Error('Vul eerst het adres van je proxy in en maak een sleutel');
    const id = 'g' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
    const r = await fetch(p.base + '/v1/calendars/' + id, { method: 'PUT', headers: { Authorization: 'Bearer ' + p.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: icalUrl, label }), signal: timeout(30000) }).catch((e) => { throw new Error(friendly(e)); });
    if (!r.ok) throw new Error(await readError(r));
    const c = { label, kind: 'proxy', id, url: null, count: 0, updated: null };
    writeSource(c, c);
    return refreshOne(c);
  }
  async function removeSource(c) {
    if (c.kind === 'proxy' && proxy.ready()) { const p = proxy.get(); try { await fetch(p.base + '/v1/calendars/' + encodeURIComponent(c.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + p.key }, signal: timeout(15000) }); } catch (e) { /* opruimen lukt later */ } }
    store.set('calendars', store.get('calendars', []).filter((x) => x.label !== c.label));
    store.set('rooster', store.get('rooster', []).filter((e) => e.cal !== c.label));
  }

  function summary() {
    const cals = store.get('calendars', []).filter(refreshable);
    const times = cals.map((c) => c.updated).filter(Boolean).sort();
    return { cals, errors: cals.filter((c) => c.error), oldest: times[0] || null, newest: times[times.length - 1] || null, busy: !!running };
  }

  let timer = null;
  function start() {
    if (timer) return; timer = setInterval(() => { if (data.settings().calendars.auto) refreshAll({ onlyDue: true }); }, 10 * 60000);
    const kick = () => { if (data.settings().calendars.auto && document.visibilityState !== 'hidden') refreshAll({ onlyDue: true }); };
    document.addEventListener('visibilitychange', kick); window.addEventListener('online', kick);
    setTimeout(kick, 3000);
  }

  A.cal = { proxy, refreshAll, refreshOne, addProxyCalendar, removeSource, summary, start, parseText, writeSource };
})();
