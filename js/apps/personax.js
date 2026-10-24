/* PersonaX AI — openbaar profielonderzoek, geïntegreerd in Angel OS.
   Gebruikt uitsluitend openbare, gestructureerde bronnen (Wikidata, Wikipedia, Wikimedia Commons, Wikimedia-statistieken).
   Niets wordt verzonnen: onbekende velden worden als "Onbekend" getoond. Personen zonder openbaar profiel worden niet onderzocht. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, store } = A;

  const TRENDING = [['Tim Cook', 'CEO · Apple'], ['Sam Altman', 'CEO · OpenAI'], ['Satya Nadella', 'CEO · Microsoft'], ['Demis Hassabis', 'CEO · Google DeepMind'], ['Lisa Su', 'CEO · AMD'], ['Jensen Huang', 'CEO · NVIDIA']];
  const POPULAR = ['Elon Musk', 'Taylor Swift', 'Cristiano Ronaldo', 'Barack Obama', 'Mark Rutte', 'Max Verstappen', 'Greta Thunberg', 'Yuval Noah Harari'];
  const PHASES = ['Wikidata doorzoeken…', 'Kandidaten vergelijken…', 'Openbaar profiel ophalen…', 'Labels vertalen…', 'Wikipedia doorzoeken…', 'Biografie lezen…', 'Afbeeldingen zoeken…', 'Sociale profielen zoeken…', 'Paginaweergaven ophalen…', 'Feiten extraheren…', 'Bronnen vergelijken…', 'Betrouwbaarheid berekenen…', 'Tijdlijn genereren…', 'Inzichten genereren…', 'Onderzoek voltooid.'];
  const SECTIONS = [['overview', 'Overzicht'], ['bio', 'Biografie'], ['facts', 'Kernfeiten'], ['highlights', 'Hoogtepunten'], ['timeline', 'Tijdlijn'], ['career', 'Carrière'], ['education', 'Opleiding'], ['awards', 'Onderscheidingen'], ['works', 'Projecten'], ['social', 'Social'], ['gallery', 'Foto\'s'], ['media', 'Video & nieuws'], ['analysis', 'Analyse'], ['connections', 'Verbindingen'], ['locations', 'Locaties'], ['stats', 'Statistieken'], ['sources', 'Bronnen']];
  const SOCIAL = { P2002: ['X', 'https://x.com/'], P2003: ['Instagram', 'https://www.instagram.com/'], P2013: ['Facebook', 'https://www.facebook.com/'], P2397: ['YouTube', 'https://www.youtube.com/channel/'], P6634: ['LinkedIn', 'https://www.linkedin.com/in/'], P7085: ['TikTok', 'https://www.tiktok.com/@'], P2037: ['GitHub', 'https://github.com/'], P2850: ['Apple Music', 'https://music.apple.com/artist/'], P1902: ['Spotify', 'https://open.spotify.com/artist/'], P345: ['IMDb', 'https://www.imdb.com/name/'] };
  const REL = { P26: 'Partner/echtgeno(o)t(e)', P40: 'Kind', P22: 'Vader', P25: 'Moeder', P3373: 'Broer/zus', P1038: 'Familielid', P802: 'Student', P1066: 'Leerling van', P463: 'Lid van', P102: 'Politieke partij', P54: 'Team', P108: 'Werkgever', P1830: 'Eigenaar van', P127: 'Eigendom van' };

  // ---------- API ----------
  let run = null;
  async function getJSON(url) {
    if (run) run.pages++;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const WD = 'https://www.wikidata.org/w/api.php?format=json&origin=*&';
  const wp = (lang) => 'https://' + lang + '.wikipedia.org/w/api.php?format=json&origin=*&';
  const enc = encodeURIComponent;

  function wdTime(v) {
    if (!v || !v.time) return null;
    const m = v.time.match(/^([+-])(\d+)-(\d\d)-(\d\d)/);
    if (!m) return null;
    const y = +m[2] * (m[1] === '-' ? -1 : 1);
    const p = v.precision;
    const iso = (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0') + '-' + m[3] + '-' + m[4];
    const label = p >= 11 ? (+m[4]) + ' ' + A.MONTHS[+m[3] - 1] + ' ' + y : p === 10 ? A.MONTHS[+m[3] - 1] + ' ' + y : p === 9 ? String(y) : p === 8 ? Math.floor(y / 10) * 10 + '-er jaren' : String(y);
    return { iso, label, year: y };
  }

  function claimsOf(ent, prop) { return (ent.claims && ent.claims[prop]) || []; }
  const val = (c) => c.mainsnak && c.mainsnak.datavalue ? c.mainsnak.datavalue.value : null;
  const confOf = (c) => (c.references && c.references.length ? 95 : 78) - (c.rank === 'deprecated' ? 40 : 0);

  // ---------- Onderzoek ----------
  async function research(query, hints, onProgress) {
    run = { pages: 0, sources: new Map(), images: 0, videos: 0, profiles: 0, docs: 0, facts: 0, dupes: 0, log: [], phase: 0 };
    const step = (i, msg) => { run.phase = i; if (msg) run.log.unshift([new Date(), msg]); onProgress && onProgress(run); };
    const addSrc = (title, url, quality) => { const s = run.sources.get(url) || { title, url, quality, count: 0 }; s.count++; run.sources.set(url, s); };
    hints = hints || {};

    step(0, 'Zoekopdracht gestart voor “' + query + '”.');
    const [nl, en] = await Promise.all([
      getJSON(WD + 'action=wbsearchentities&type=item&limit=10&language=nl&uselang=nl&search=' + enc(query)),
      getJSON(WD + 'action=wbsearchentities&type=item&limit=10&language=en&uselang=nl&search=' + enc(query))
    ]);
    const ids = Array.from(new Set([].concat(nl.search || [], en.search || []).map((s) => s.id))).slice(0, 15);
    if (!ids.length) throw new Error('Geen openbaar profiel gevonden voor “' + query + '”. PersonaX onderzoekt alleen personen met een openbaar Wikidata/Wikipedia-profiel.');

    step(1, ids.length + ' kandidaten gevonden.');
    const cand = await getJSON(WD + 'action=wbgetentities&props=labels|descriptions|claims|sitelinks&languages=nl|en&ids=' + ids.join('|'));
    const people = ids.map((id) => cand.entities[id]).filter((e) => e && claimsOf(e, 'P31').some((c) => { const v = val(c); return v && v.id === 'Q5'; }));
    if (!people.length) throw new Error('“' + query + '” lijkt geen persoon met een openbaar profiel te zijn.');
    run.dupes = ids.length - people.length;
    // kies beste kandidaat: hints + bekendheid (aantal Wikipedia-talen)
    const hintText = Object.values(hints).filter(Boolean).join(' ').toLowerCase();
    const scored = people.map((e, i) => {
      let s = Object.keys(e.sitelinks || {}).length / 10 - i * 0.5;
      const desc = ((e.descriptions && (e.descriptions.nl || e.descriptions.en) || {}).value || '').toLowerCase();
      if (hintText) hintText.split(/\s+/).forEach((w) => { if (w.length > 2 && desc.includes(w)) s += 5; });
      if (hints.birthYear) { const b = wdTime(val(claimsOf(e, 'P569')[0] || {})); if (b && String(b.year) === String(hints.birthYear).trim()) s += 20; }
      return { e, s };
    }).sort((a, b) => b.s - a.s);
    const ent = scored[0].e;
    const qid = ent.id;
    addSrc('Wikidata — ' + qid, 'https://www.wikidata.org/wiki/' + qid, 'Hoog');

    step(2, 'Openbaar profiel ' + qid + ' geladen.');
    const label = (e) => (e.labels && (e.labels.nl || e.labels.en) || {}).value;
    const name = label(ent) || query;
    const description = ((ent.descriptions && (ent.descriptions.nl || ent.descriptions.en)) || {}).value || '';

    // labels van verwijzingen ophalen
    const refIds = new Set();
    Object.values(ent.claims || {}).forEach((cl) => cl.forEach((c) => {
      const v = val(c); if (v && v.id && /^Q\d+$/.test(v.id)) refIds.add(v.id);
      Object.values(c.qualifiers || {}).forEach((q) => q.forEach((qq) => { const qv = qq.datavalue && qq.datavalue.value; if (qv && qv.id) refIds.add(qv.id); }));
    }));
    step(3, refIds.size + ' verwijzingen vertalen.');
    const labels = {};
    const refArr = Array.from(refIds);
    for (let i = 0; i < refArr.length; i += 50) {
      const r = await getJSON(WD + 'action=wbgetentities&props=labels&languages=nl|en&ids=' + refArr.slice(i, i + 50).join('|'));
      Object.values(r.entities || {}).forEach((e) => { labels[e.id] = label(e) || e.id; });
    }
    const L = (v) => (v && v.id ? labels[v.id] || v.id : v && typeof v === 'string' ? v : v && v.text ? v.text : '');
    const items = (prop) => claimsOf(ent, prop).filter((c) => c.rank !== 'deprecated' && val(c)).map((c) => ({ label: L(val(c)), conf: confOf(c), start: wdTime(((c.qualifiers || {}).P580 || [])[0]?.datavalue?.value), end: wdTime(((c.qualifiers || {}).P582 || [])[0]?.datavalue?.value), point: wdTime(((c.qualifiers || {}).P585 || [])[0]?.datavalue?.value), of: L(((c.qualifiers || {}).P642 || (c.qualifiers || {}).P108 || [])[0]?.datavalue?.value) }));

    // Wikipedia
    step(4, 'Wikipedia doorzoeken.');
    const wpLang = ent.sitelinks && ent.sitelinks.nlwiki ? 'nl' : ent.sitelinks && ent.sitelinks.enwiki ? 'en' : null;
    let summary = '', bio = '', wpTitle = null, wpTimestamp = null, wpUrl = null, gallery = [];
    if (wpLang) {
      wpTitle = ent.sitelinks[wpLang + 'wiki'].title;
      wpUrl = 'https://' + wpLang + '.wikipedia.org/wiki/' + enc(wpTitle.replace(/ /g, '_'));
      try {
        const s = await getJSON('https://' + wpLang + '.wikipedia.org/api/rest_v1/page/summary/' + enc(wpTitle.replace(/ /g, '_')));
        summary = s.extract || ''; wpTimestamp = s.timestamp || null;
        addSrc('Wikipedia (' + wpLang + ') — ' + wpTitle, wpUrl, 'Hoog');
        step(4, 'Wikipedia-artikel verwerkt.');
      } catch (e) { step(4, 'Wikipedia-samenvatting niet beschikbaar.'); }
      step(5, 'Biografie lezen.');
      try {
        const x = await getJSON(wp(wpLang) + 'action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=' + enc(wpTitle));
        const page = Object.values(x.query.pages)[0];
        bio = ((page && page.extract) || '').slice(0, 12000);
        run.docs++;
      } catch (e) {}
      step(6, 'Afbeeldingen zoeken.');
      try {
        const m = await getJSON('https://' + wpLang + '.wikipedia.org/api/rest_v1/page/media-list/' + enc(wpTitle.replace(/ /g, '_')));
        gallery = (m.items || []).filter((i) => i.type === 'image' && i.srcset && i.srcset[0] && !/\.svg/i.test(i.title)).slice(0, 12).map((i) => ({ src: (i.srcset[0].src.startsWith('//') ? 'https:' : '') + i.srcset[0].src, title: (i.caption && i.caption.text) || i.title.replace(/^(File|Bestand):/, ''), page: 'https://commons.wikimedia.org/wiki/' + enc(i.title) }));
      } catch (e) {}
    }
    const p18 = val(claimsOf(ent, 'P18')[0] || {});
    const image = p18 ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + enc(p18) + '?width=480' : (gallery[0] && gallery[0].src) || null;
    if (p18) addSrc('Wikimedia Commons — ' + p18, 'https://commons.wikimedia.org/wiki/File:' + enc(p18), 'Hoog');
    run.images = gallery.length + (p18 ? 1 : 0);
    step(6, run.images + ' afbeeldingen gevonden.');

    // sociale profielen
    step(7, 'Sociale profielen zoeken.');
    const socials = [];
    Object.entries(SOCIAL).forEach(([p, [n, base]]) => claimsOf(ent, p).slice(0, 1).forEach((c) => { const v = val(c); if (v) socials.push({ name: n, handle: v, url: base + v, conf: confOf(c) }); }));
    const websites = claimsOf(ent, 'P856').map((c) => ({ url: val(c), conf: confOf(c) })).filter((w) => w.url);
    websites.forEach((w) => addSrc('Officiële website', w.url, 'Officieel'));
    run.profiles = socials.length;
    const videos = [];
    const yt = socials.find((s) => s.name === 'YouTube');
    if (yt) videos.push({ title: 'Officieel YouTube-kanaal', url: yt.url });
    run.videos = videos.length;

    // statistieken
    step(8, 'Paginaweergaven ophalen.');
    let views = [];
    if (wpTitle) {
      try {
        const end = new Date(); const start = A.addDays(end, -30);
        const f = (d) => d.getFullYear() + A.pad2(d.getMonth() + 1) + A.pad2(d.getDate());
        const pv = await getJSON('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' + wpLang + '.wikipedia/all-access/user/' + enc(wpTitle.replace(/ /g, '_')) + '/daily/' + f(start) + '/' + f(end));
        views = (pv.items || []).map((i) => ({ d: i.timestamp.slice(0, 8), v: i.views }));
        addSrc('Wikimedia paginaweergaven', 'https://pageviews.wmcloud.org/?pages=' + enc(wpTitle.replace(/ /g, '_')) + '&project=' + wpLang + '.wikipedia.org', 'Hoog');
      } catch (e) {}
    }

    // feiten
    step(9, 'Feiten extraheren.');
    const birth = claimsOf(ent, 'P569')[0], death = claimsOf(ent, 'P570')[0];
    const bT = birth && wdTime(val(birth)), dT = death && wdTime(val(death));
    let age = null;
    if (bT && bT.year > 0) { const endD = dT ? new Date(dT.iso) : new Date(); age = endD.getFullYear() - bT.year - ((endD.getMonth() * 100 + endD.getDate()) < ((+bT.iso.slice(5, 7) - 1) * 100 + +bT.iso.slice(8, 10)) ? 1 : 0); }
    const join = (arr, n) => arr.slice(0, n || 4).map((x) => x.label).filter(Boolean).join(', ');
    const avgConf = (arr) => arr.length ? Math.round(arr.reduce((s, x) => s + x.conf, 0) / arr.length) : null;
    const occupations = items('P106'), employers = items('P108'), positions = items('P39'), education = items('P69'), awards = items('P166'), works = items('P800'), citizenship = items('P27'), parties = items('P102'), teams = items('P54'), birthPlace = items('P19'), deathPlace = items('P20'), residence = items('P551'), nativeName = items('P1559');
    const heightC = claimsOf(ent, 'P2048')[0];
    const F = (k, arr, n) => ({ k, v: arr.length ? join(arr, n) : 'Onbekend', conf: avgConf(arr), src: 'Wikidata' });
    const facts = [
      { k: 'Volledige naam', v: name, conf: 99, src: 'Wikidata' },
      { k: 'Omschrijving', v: description || 'Onbekend', conf: description ? 90 : null, src: 'Wikidata' },
      { k: 'Geboren', v: bT ? bT.label + (birthPlace.length ? ' · ' + birthPlace[0].label : '') : 'Onbekend', conf: birth ? confOf(birth) : null, src: 'Wikidata' },
      dT ? { k: 'Overleden', v: dT.label + (deathPlace.length ? ' · ' + deathPlace[0].label : ''), conf: confOf(death), src: 'Wikidata' } : null,
      { k: dT ? 'Leeftijd bij overlijden' : 'Leeftijd', v: age != null ? age + ' jaar' : 'Onbekend', conf: age != null ? (birth ? confOf(birth) : null) : null, src: 'Berekend uit Wikidata' },
      F('Nationaliteit', citizenship, 3),
      F('Beroep', occupations, 5),
      F('Werkgever', employers, 4),
      positions.length ? F('Functies', positions, 3) : null,
      F('Opleiding', education, 3),
      parties.length ? F('Politieke partij', parties, 2) : null,
      teams.length ? F('Teams', teams, 4) : null,
      residence.length ? F('Woonplaats', residence, 2) : null,
      nativeName.length ? F('Naam in moedertaal', nativeName, 1) : null,
      heightC ? { k: 'Lengte', v: (+val(heightC).amount).toString().replace('+', '') + (val(heightC).unit.endsWith('Q11573') ? ' m' : ' cm'), conf: confOf(heightC), src: 'Wikidata' } : null,
      { k: 'Website', v: websites.length ? websites[0].url : 'Onbekend', conf: websites.length ? websites[0].conf : null, src: 'Wikidata' }
    ].filter(Boolean);
    if (hints && Object.values(hints).some(Boolean)) facts.push({ k: 'Jouw aanwijzingen', v: Object.entries(hints).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · '), conf: null, src: 'Door jou opgegeven (niet geverifieerd)' });
    run.facts = facts.filter((f) => f.v !== 'Onbekend').length + occupations.length + awards.length + education.length + works.length;

    step(10, 'Bronnen vergelijken.');
    step(11, 'Betrouwbaarheid berekenen.');
    const known = facts.filter((f) => f.conf);
    const reliability = known.length ? Math.round(known.reduce((s, f) => s + f.conf, 0) / known.length) : 0;

    step(12, 'Tijdlijn genereren.');
    const timeline = [];
    if (bT) timeline.push({ iso: bT.iso, date: bT.label, text: 'Geboren' + (birthPlace.length ? ' in ' + birthPlace[0].label : '') });
    const tl = (arr, verb) => arr.forEach((x) => { const t = x.start || x.point; if (t) timeline.push({ iso: t.iso, date: t.label + (x.end ? ' – ' + x.end.label : ''), text: verb + ' ' + x.label }); });
    tl(education, 'Opleiding:'); tl(employers, 'Werkgever:'); tl(positions, 'Functie:'); tl(teams, 'Team:'); tl(awards, 'Onderscheiding:'); tl(parties, 'Lid van');
    if (dT) timeline.push({ iso: dT.iso, date: dT.label, text: 'Overleden' + (deathPlace.length ? ' in ' + deathPlace[0].label : '') });
    timeline.sort((a, b) => a.iso.localeCompare(b.iso));

    step(13, 'Inzichten genereren.');
    const connections = [];
    Object.entries(REL).forEach(([p, lab]) => items(p).forEach((x) => connections.push({ rel: lab, name: x.label, conf: x.conf })));
    const locations = [].concat(birthPlace.map((x) => ({ type: 'Geboorteplaats', name: x.label })), deathPlace.map((x) => ({ type: 'Plaats van overlijden', name: x.label })), residence.map((x) => ({ type: 'Woonplaats', name: x.label })), citizenship.map((x) => ({ type: 'Land', name: x.label })));
    const sentences = (summary || '').split(/(?<=[.!?])\s+/).filter(Boolean);
    const highlights = [].concat(sentences.slice(0, 3), awards.slice(0, 3).map((a) => 'Ontving ' + a.label + (a.point ? ' (' + a.point.label + ')' : '') + '.'), works.slice(0, 2).map((w) => 'Bekend van ' + w.label + '.'));
    const analysis = [];
    if (occupations.length) analysis.push('Primaire rol volgens bronnen: ' + occupations[0].label + (occupations.length > 1 ? ' (en ' + (occupations.length - 1) + ' andere beroepen)' : '') + '.');
    const yrs = timeline.filter((t) => t.text !== 'Geboren' && !t.text.startsWith('Overleden')).map((t) => +t.iso.slice(0, 4)).filter((y) => !isNaN(y));
    if (yrs.length > 1) analysis.push('Gedocumenteerde loopbaan van ' + Math.min(...yrs) + ' tot ' + Math.max(...yrs) + ' (' + (Math.max(...yrs) - Math.min(...yrs)) + ' jaar).');
    analysis.push('Wikipedia-artikelen in ' + Object.keys(ent.sitelinks || {}).filter((k) => /wiki$/.test(k) && !/commons|species|wikidata/.test(k)).length + ' talen — een maat voor internationale bekendheid.');
    if (awards.length) analysis.push(awards.length + ' gedocumenteerde onderscheidingen.');
    if (views.length) { const tot = views.reduce((s, v) => s + v.v, 0); analysis.push(tot.toLocaleString('nl-NL') + ' Wikipedia-paginaweergaven in de afgelopen 30 dagen.'); }
    const unknown = facts.filter((f) => f.v === 'Onbekend').map((f) => f.k);
    if (unknown.length) analysis.push('Niet gevonden in openbare bronnen: ' + unknown.join(', ') + '.');

    step(14, 'Onderzoek voltooid.');
    const profile = {
      id: A.uid(), qid, query, hints, name, description, image, summary, bio, facts, timeline, highlights, analysis,
      career: [].concat(positions.map((x) => ({ label: x.label, start: x.start, end: x.end, kind: 'Functie' })), employers.map((x) => ({ label: x.label, start: x.start, end: x.end, kind: 'Werkgever' })), teams.map((x) => ({ label: x.label, start: x.start, end: x.end, kind: 'Team' }))),
      occupations: occupations.map((x) => x.label), education, awards, works: works.map((w) => w.label), socials, websites, gallery, videos, connections, locations,
      stats: { languages: Object.keys(ent.sitelinks || {}).length, claims: Object.keys(ent.claims || {}).length, views },
      sources: Array.from(run.sources.values()), reliability,
      media: { wpLang, wpTitle, wpUrl, wpTimestamp, wdRev: ent.lastrevid || null, checkedAt: new Date().toISOString() },
      run: { pages: run.pages, sources: run.sources.size, images: run.images, videos: run.videos, profiles: run.profiles, docs: run.docs, facts: run.facts, dupes: run.dupes },
      alternatives: scored.slice(1, 5).map((x) => ({ qid: x.e.id, name: label(x.e), desc: ((x.e.descriptions && (x.e.descriptions.nl || x.e.descriptions.en)) || {}).value || '' })),
      createdAt: new Date().toISOString()
    };
    const runs = store.get('px-runs', []); runs.unshift({ at: profile.createdAt, query, hints, qid, name, reliability, sources: profile.sources.length }); store.set('px-runs', runs.slice(0, 100));
    const last = store.get('px-last', []); last.unshift(profile); store.set('px-last', last.filter((p, i, arr) => arr.findIndex((x) => x.qid === p.qid) === i).slice(0, 15));
    return profile;
  }

  A.pxResearch = research;

  // ---------- Weergave ----------
  const confBadge = (c) => c == null ? '' : '<span class="conf ' + (c >= 85 ? '' : c >= 65 ? 'mid' : 'low') + '">' + c + '%</span>';
  const ring = (pct, color) => '<div class="ring" style="background:radial-gradient(closest-side,var(--panel-solid) 78%,transparent 80% 100%),conic-gradient(' + color + ' ' + pct + '%,rgba(255,255,255,.1) 0)">' + pct + '%</div>';
  const sec = (id, title, body) => '<section class="px-card px-sec" id="px-' + id + '"><h2>' + esc(title) + '</h2>' + body + '</section>';
  const none = '<p class="muted">Onbekend — niet gevonden in openbare bronnen.</p>';

  function sparkline(views) {
    if (!views.length) return none;
    const max = Math.max(...views.map((v) => v.v)) || 1; const w = 600, h = 120;
    const pts = views.map((v, i) => (i / Math.max(1, views.length - 1)) * w + ',' + (h - (v.v / max) * (h - 10) - 5)).join(' ');
    const total = views.reduce((s, v) => s + v.v, 0);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:120px" role="img" aria-label="Paginaweergaven laatste 30 dagen"><polyline points="' + pts + '" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linejoin="round"/></svg><div class="muted" style="font-size:13px">' + total.toLocaleString('nl-NL') + ' weergaven in 30 dagen · piek ' + max.toLocaleString('nl-NL') + ' op één dag</div>';
  }

  function profileHtml(p, compact) {
    const yearRange = (x) => (x.start ? x.start.label : '') + (x.end ? ' – ' + x.end.label : x.start ? ' – heden' : '');
    const head = '<section class="px-card"><div class="px-profile-head"><div class="px-avatar">' + (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" referrerpolicy="no-referrer">' : esc(A.initials(p.name))) + '</div><div style="flex:1;min-width:220px"><div class="label">PersonaX · openbaar profiel</div><h1>' + esc(p.name) + '</h1><div class="muted">' + esc(p.description || '') + '</div>' +
      '<div class="tags" style="margin-top:12px">' + p.occupations.slice(0, 4).map((o) => '<span class="chip">' + esc(o) + '</span>').join('') + '</div></div>' +
      '<div class="ring-wrap">' + ring(p.reliability, '#a78bfa') + '<div><b>Betrouwbaarheid</b><div class="muted" style="font-size:12px">' + p.sources.length + ' bronnen · ' + p.run.facts + ' feiten</div></div></div></div></section>';
    if (compact) {
      return head + sec('facts', 'Kernfeiten', '<div class="facts">' + p.facts.map((f) => '<div class="fact"><div class="k">' + esc(f.k) + '</div><div class="v">' + esc(f.v) + confBadge(f.conf) + '</div></div>').join('') + '</div>') +
        sec('timeline', 'Tijdlijn', p.timeline.length ? '<div class="timeline">' + p.timeline.map((t) => '<div class="tl"><b>' + esc(t.date) + '</b><div>' + esc(t.text) + '</div></div>').join('') + '</div>' : none);
    }
    return head +
      sec('overview', 'Overzicht', p.summary ? '<p style="line-height:1.65;font-size:16px;margin:0">' + esc(p.summary) + '</p>' : none) +
      sec('bio', 'Biografie', p.bio ? '<div style="line-height:1.65;font-size:14px;max-height:420px;overflow:auto;white-space:pre-line">' + esc(p.bio) + '</div><p class="faint" style="font-size:12px">Bron: Wikipedia (' + esc(p.media.wpLang) + '), CC BY-SA.</p>' : none) +
      sec('facts', 'Kernfeiten', '<div class="facts">' + p.facts.map((f) => '<div class="fact"><div class="k">' + esc(f.k) + '</div><div class="v">' + (/^https?:/.test(f.v) ? '<a href="' + esc(f.v) + '" target="_blank" rel="noopener">' + esc(A.hostOf(f.v)) + '</a>' : esc(f.v)) + confBadge(f.conf) + '</div><div class="faint" style="font-size:11px;margin-top:4px">' + esc(f.src) + '</div></div>').join('') + '</div>') +
      sec('highlights', 'Hoogtepunten', p.highlights.length ? '<ul style="line-height:1.7;margin:0;padding-left:20px">' + p.highlights.map((h) => '<li>' + esc(h) + '</li>').join('') + '</ul>' : none) +
      sec('timeline', 'Tijdlijn', p.timeline.length ? '<div class="timeline">' + p.timeline.map((t) => '<div class="tl"><b>' + esc(t.date) + '</b><div>' + esc(t.text) + '</div></div>').join('') + '</div>' : none) +
      sec('career', 'Carrière', p.career.length ? p.career.map((c) => '<div class="kv"><span>' + esc(c.label) + ' <span class="faint">· ' + esc(c.kind) + '</span></span><span class="muted">' + esc(yearRange(c)) + '</span></div>').join('') : none) +
      sec('education', 'Opleiding', p.education.length ? p.education.map((c) => '<div class="kv"><span>' + esc(c.label) + confBadge(c.conf) + '</span><span class="muted">' + esc(yearRange(c)) + '</span></div>').join('') : none) +
      sec('awards', 'Prestaties & onderscheidingen', p.awards.length ? p.awards.map((c) => '<div class="kv"><span>🏆 ' + esc(c.label) + confBadge(c.conf) + '</span><span class="muted">' + esc(c.point ? c.point.label : '') + '</span></div>').join('') : none) +
      sec('works', 'Opmerkelijke projecten', p.works.length ? '<div class="tags">' + p.works.map((w) => '<span class="chip">' + esc(w) + '</span>').join('') + '</div>' : none) +
      sec('social', 'Social media & websites', (p.socials.length || p.websites.length) ? p.websites.map((w) => '<div class="src">' + icon('globe') + '<a href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.url) + '</a>' + confBadge(w.conf) + '</div>').join('') + p.socials.map((s) => '<div class="src"><b style="min-width:90px">' + esc(s.name) + '</b><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.handle) + '</a>' + confBadge(s.conf) + '</div>').join('') : none) +
      sec('gallery', 'Publieke fotogalerij', p.gallery.length ? '<div class="gallery">' + p.gallery.map((g) => '<a href="' + esc(g.page) + '" target="_blank" rel="noopener" title="' + esc(g.title) + '"><img src="' + esc(g.src) + '" alt="' + esc(g.title) + '" loading="lazy" referrerpolicy="no-referrer"></a>').join('') + '</div><p class="faint" style="font-size:12px">Afbeeldingen via Wikimedia Commons; zie de bestandspagina voor licentie.</p>' : none) +
      sec('media', 'Video\'s & nieuws', (p.videos.length ? p.videos.map((v) => '<div class="src">▶<a href="' + esc(v.url) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></div>').join('') : '') +
        '<div class="src">🔎<a href="https://news.google.com/search?hl=nl&q=' + enc('"' + p.name + '"') + '" target="_blank" rel="noopener">Zoek het laatste nieuws over ' + esc(p.name) + '</a></div><div class="src">🔎<a href="https://www.youtube.com/results?search_query=' + enc(p.name) + '" target="_blank" rel="noopener">Zoek video\'s over ' + esc(p.name) + '</a></div><p class="faint" style="font-size:12px">Nieuws en video\'s worden niet automatisch samengevat: PersonaX toont alleen links, zodat je zelf de bron leest.</p>') +
      sec('analysis', 'Analyse', '<ul style="line-height:1.7;margin:0;padding-left:20px">' + p.analysis.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul><p class="faint" style="font-size:12px">Automatisch afgeleid uit de bovenstaande bronnen (regels, geen generatieve AI).</p>') +
      sec('connections', 'Verbindingen', p.connections.length ? p.connections.map((c) => '<div class="kv"><span>' + esc(c.name) + '</span><span class="muted">' + esc(c.rel) + '</span></div>').join('') : none) +
      sec('locations', 'Locaties', p.locations.length ? p.locations.map((l) => '<div class="kv"><span>📍 ' + esc(l.name) + '</span><span class="muted">' + esc(l.type) + '</span></div>').join('') : none) +
      sec('stats', 'Statistieken', '<div class="px-stats"><div class="px-stat"><b>' + p.stats.languages + '</b><span>Wikimedia-projecten</span></div><div class="px-stat"><b>' + p.stats.claims + '</b><span>Eigenschappen op Wikidata</span></div><div class="px-stat"><b>' + p.run.pages + '</b><span>Opvragingen</span></div><div class="px-stat"><b>' + p.run.images + '</b><span>Afbeeldingen</span></div></div><div style="margin-top:14px">' + sparkline(p.stats.views) + '</div>') +
      sec('sources', 'Bronnen & citaten · Bronkwaliteit', p.sources.map((s) => '<div class="src"><span class="chip">' + esc(s.quality) + '</span><div style="flex:1;min-width:0"><div>' + esc(s.title) + '</div><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a></div><span class="faint">' + s.count + '×</span></div>').join('') +
        '<div class="kv" style="margin-top:10px"><span>Mediastatus</span><span class="muted">Wikipedia bijgewerkt ' + esc(p.media.wpTimestamp ? A.fmtDateTime(p.media.wpTimestamp) : 'onbekend') + ' · gecontroleerd ' + esc(A.relTime(p.media.checkedAt)) + '</span></div>' +
        (p.alternatives && p.alternatives.length ? '<div class="kv"><span>Andere personen met deze naam</span><span class="muted">' + p.alternatives.map((a) => esc(a.name + (a.desc ? ' (' + a.desc + ')' : ''))).join('; ') + '</span></div>' : ''));
  }

  // ---------- App ----------
  A.registerApp({
    id: 'personax', name: A.t('app.personax'), icon: 'users', keywords: 'persona onderzoek profiel research deep-profile personen',
    color: 'linear-gradient(160deg,#a5b4fc,#8b5cf6)',
    render(el, route) {
      const tab = route.sub[0] || 'search';
      const tabs = [['search', 'Onderzoek', 'search'], ['history', 'Onderzoeksgeschiedenis', 'history'], ['compare', 'Vergelijken', 'compare'], ['side', 'Naast elkaar', 'users'], ['updates', 'Updatecentrum', 'bell']];
      el.innerHTML = '<div class="px"><nav class="px-nav"><span class="logo"><i>✦</i>PersonaX <span>AI</span></span>' + tabs.map(([k, l, ic]) => '<button class="px-tab ' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '</button>').join('') + '</nav><div class="px-body"></div></div>';
      void tabs; el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => A.go('personax', b.dataset.t === 'search' ? null : [b.dataset.t])));
      const body = el.querySelector('.px-body');
      const saved = () => store.get('px-profiles', []);
      const findAny = (id) => saved().concat(store.get('px-last', [])).find((p) => p.id === id || p.qid === id);

      if (tab === 'history') return drawHistory();
      if (tab === 'compare') return drawCompare(false);
      if (tab === 'side') return drawCompare(true);
      if (tab === 'updates') return drawUpdates();
      return drawSearch();

      function drawSearch() {
        body.innerHTML = '<div class="px-hero"><span class="pill"><i></i>Deep Research Engine online</span><h1>Leer iedereen kennen,<br><em>prachtig.</em></h1><p>PersonaX onderzoekt openbare bronnen en stelt een volledig geciteerd profiel samen — met betrouwbaarheidsscores, tijdlijnen en inzichten.</p>' +
          '<div class="label" style="margin-top:26px">Naar wie doe je onderzoek?</div><form class="px-search">' + icon('search') + '<input placeholder="Jan Jansen" aria-label="Naam"><button class="btn" type="submit">Onderzoek</button></form>' +
          '<details class="px-extra"><summary>✦ Meer informatie toevoegen ▾</summary><div class="px-card" style="margin-top:10px;text-align:left"><p class="muted" style="margin-top:0;font-size:13px">Alles wat je hier toevoegt wordt alleen gebruikt om de juiste persoon te kiezen — nooit als vaststaand feit. Er wordt niets verstuurd tot het onderzoek start.</p><div class="grid3">' +
          [['occupation', 'Beroep'], ['company', 'Bedrijf'], ['school', 'School'], ['university', 'Universiteit'], ['country', 'Land'], ['city', 'Stad'], ['birthYear', 'Geboortejaar']].map(([k, l]) => '<label class="field">' + l + '<input class="input" data-hint="' + k + '"' + (k === 'birthYear' ? ' placeholder="1984" inputmode="numeric"' : '') + '></label>').join('') + '</div></div></details></div>' +
          '<div class="px-wrap" data-result></div>' +
          '<div class="px-wrap" data-home><div class="label" style="margin-bottom:10px">Trending personen</div><div class="px-people">' + TRENDING.map(([n, r]) => '<button class="px-person" data-q="' + esc(n) + '"><i>' + esc(A.initials(n)) + '</i><span><b style="font-size:14px">' + esc(n) + '</b><small>' + esc(r) + '</small></span></button>').join('') + '</div>' +
          '<div class="label" style="margin:22px 0 10px">Populaire zoekopdrachten</div><div class="tags">' + POPULAR.map((n) => '<button class="chip" data-q="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' +
          (store.get('px-searches', []).length ? '<div class="label" style="margin:22px 0 10px">Jouw recente zoekopdrachten</div><div class="tags">' + store.get('px-searches', []).slice(0, 10).map((s) => '<button class="chip" data-q="' + esc(s.q) + '">' + esc(s.q) + '</button>').join('') + '</div>' : '') +
          '<div class="px-feat"><div class="px-card"><b>Onderzoek in ' + (PHASES.length) + ' fasen</b><p class="muted" style="font-size:14px">Wikidata, Wikipedia, Wikimedia Commons, officiële websites en paginaweergaven.</p></div><div class="px-card"><b>Geciteerd en gescoord</b><p class="muted" style="font-size:14px">Elk feit heeft een bron, een betrouwbaarheidsscore en waar mogelijk een datum.</p></div><div class="px-card"><b>Alleen openbare data</b><p class="muted" style="font-size:14px">PersonaX verzint nooit iets. Onbekende velden worden getoond als Onbekend.</p></div></div></div>';
        body.querySelectorAll('.px-search svg').forEach((s) => { s.style.cssText = 'width:20px;height:20px;color:var(--muted)'; });
        const form = body.querySelector('form'), inp = form.querySelector('input');
        const go = (q) => {
          q = q.trim(); if (!q) return;
          inp.value = q;
          const hints = {}; body.querySelectorAll('[data-hint]').forEach((h) => { if (h.value.trim()) hints[h.dataset.hint] = h.value.trim(); });
          const s = store.get('px-searches', []).filter((x) => x.q.toLowerCase() !== q.toLowerCase()); s.unshift({ q, at: new Date().toISOString() }); store.set('px-searches', s.slice(0, 30));
          startResearch(q, hints);
        };
        form.onsubmit = (e) => { e.preventDefault(); go(inp.value); };
        body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => go(b.dataset.q)));
        if (route.params.id) { const p = findAny(route.params.id); if (p) showProfile(p); }
        else if (route.params.q) go(route.params.q);
      }

      async function startResearch(q, hints) {
        const res = body.querySelector('[data-result]');
        body.querySelector('[data-home]').style.display = 'none';
        const t0 = Date.now();
        res.innerHTML = '<section class="px-card"><div style="display:flex;gap:10px;align-items:center"><b>Live onderzoek · ' + esc(q) + '</b><span class="faint" data-elapsed style="margin-left:auto;font-size:12px"></span></div><div style="display:flex;gap:30px;flex-wrap:wrap;margin-top:16px"><div class="ring-wrap" data-ring1></div><div class="ring-wrap" data-ring2></div></div><div class="px-stats" data-stats></div><div class="phases" data-phases></div><div class="log" data-log></div></section>';
        const upd = (r) => {
          const pct = Math.round((r.phase / (PHASES.length - 1)) * 100);
          res.querySelector('[data-ring1]').innerHTML = ring(pct, '#60a5fa') + '<div><b>Huidige fase</b><div class="muted" style="font-size:13px">' + esc(PHASES[r.phase]) + '</div></div>';
          res.querySelector('[data-ring2]').innerHTML = '<div><b>' + r.sources.size + ' bronnen</b><div class="muted" style="font-size:13px">' + r.pages + ' opvragingen</div></div>';
          res.querySelector('[data-stats]').innerHTML = [[r.pages, 'Opvragingen'], [r.sources.size, 'Bronnen gevonden'], [r.docs, 'Artikelen gelezen'], [r.images, 'Afbeeldingen gevonden'], [r.profiles, 'Profielen gevonden'], [r.facts, 'Feiten'], [r.dupes, 'Niet-personen gefilterd']].map(([n, l]) => '<div class="px-stat"><b>' + n + '</b><span>' + l + '</span></div>').join('');
          res.querySelector('[data-phases]').innerHTML = PHASES.map((p, i) => '<div class="phase ' + (i < r.phase ? 'done' : i === r.phase ? 'run' : 'todo') + '">' + (i < r.phase ? '✓' : i === r.phase ? '◐' : '○') + ' ' + esc(p) + '</div>').join('');
          res.querySelector('[data-log]').innerHTML = r.log.map(([d, m]) => '<div>' + A.pad2(d.getHours()) + ':' + A.pad2(d.getMinutes()) + ':' + A.pad2(d.getSeconds()) + ' — ' + esc(m) + '</div>').join('');
          res.querySelector('[data-elapsed]').textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's';
        };
        try {
          const p = await research(q, hints, upd);
          showProfile(p);
        } catch (e) {
          res.innerHTML = '<section class="px-card"><h2 style="margin-top:0">Geen profiel</h2><p>' + esc(e.message === 'Failed to fetch' ? 'Kon de openbare bronnen niet bereiken. Controleer je internetverbinding.' : e.message) + '</p><button class="btn" data-back>Nieuwe zoekopdracht</button></section>';
          res.querySelector('[data-back]').onclick = () => A.go('personax');
        }
      }

      function showProfile(p) {
        const res = body.querySelector('[data-result]');
        const home = body.querySelector('[data-home]'); if (home) home.style.display = 'none';
        const isSaved = saved().some((x) => x.qid === p.qid);
        res.innerHTML = '<section class="px-card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px"><span class="muted" style="flex:1;font-size:13px">' + esc(p.name) + ' · ' + esc(p.qid) + '</span><button class="btn btn-sm ' + (isSaved ? '' : 'btn-primary') + '" data-save>' + icon('bookmark') + (isSaved ? 'Opgeslagen' : 'Profiel opslaan') + '</button><button class="btn btn-sm" data-copy>' + icon('external') + 'Deel link</button><button class="btn btn-sm" data-cmp>Vergelijk naast elkaar</button><button class="btn btn-sm" data-json>' + icon('download') + 'JSON</button></section>' +
          '<nav class="px-chips">' + SECTIONS.map(([k, l]) => '<button class="chip" data-jump="' + k + '">' + l + '</button>').join('') + '<label class="search" style="min-width:180px;padding:0 10px">' + icon('search') + '<input placeholder="Filter secties en inhoud…" data-filter></label></nav>' + profileHtml(p);
        res.querySelectorAll('.btn svg').forEach((s) => { s.style.cssText = 'width:14px;height:14px'; });
        res.querySelectorAll('[data-jump]').forEach((b) => (b.onclick = () => { const t = res.querySelector('#px-' + b.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
        res.querySelector('[data-filter]').oninput = (e) => { const q = e.target.value.toLowerCase(); res.querySelectorAll('.px-sec').forEach((s) => { s.style.display = !q || s.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
        res.querySelector('[data-save]').onclick = () => {
          const list = saved().filter((x) => x.qid !== p.qid); list.unshift(Object.assign({}, p, { savedAt: new Date().toISOString(), favorite: false, archived: false, folder: '' })); store.set('px-profiles', list); A.toast('Profiel opgeslagen'); showProfile(p);
        };
        res.querySelector('[data-copy]').onclick = () => { const url = location.href.split('#')[0] + '#/personax?q=' + enc(p.name); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => A.toast('Link gekopieerd'), () => A.toast(url)); };
        res.querySelector('[data-cmp]').onclick = () => A.go('personax', ['side'], { a: p.qid });
        res.querySelector('[data-json]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })); a.download = 'personax-' + p.name.replace(/\W+/g, '_') + '.json'; a.click(); };
        body.closest('.window-body').scrollTop = 0;
      }

      function drawHistory() {
        const st = { tab: 'all', sort: 'recent', folder: '' };
        const draw = () => {
          let list = saved();
          if (st.tab === 'fav') list = list.filter((p) => p.favorite); else if (st.tab === 'arch') list = list.filter((p) => p.archived); else list = list.filter((p) => !p.archived);
          if (st.folder) list = list.filter((p) => p.folder === st.folder);
          list.sort((a, b) => st.sort === 'name' ? a.name.localeCompare(b.name) : st.sort === 'sources' ? b.sources.length - a.sources.length : b.savedAt.localeCompare(a.savedAt));
          const folders = Array.from(new Set(saved().map((p) => p.folder).filter(Boolean)));
          const runs = store.get('px-runs', []);
          const searches = store.get('px-searches', []);
          body.innerHTML = '<div class="px-wrap"><h1 style="margin:10px 0 4px">Onderzoeksgeschiedenis</h1><p class="muted">Opgeslagen profielen, favorieten en recente zoekopdrachten — privé op dit apparaat.</p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><div class="seg">' + [['all', 'Alles'], ['fav', 'Favorieten'], ['arch', 'Gearchiveerd']].map(([k, l]) => '<button class="' + (st.tab === k ? 'on' : '') + '" data-tab="' + k + '">' + l + '</button>').join('') + '</div>' +
            '<select class="input" style="width:auto" data-sort><option value="recent">Meest recent</option><option value="name">Naam</option><option value="sources">Bronnen</option></select>' +
            '<select class="input" style="width:auto" data-folder><option value="">Alle mappen</option>' + folders.map((f) => '<option' + (st.folder === f ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select></div>' +
            '<div class="label">Opgeslagen profielen</div>' + (list.length ? list.map((p) => '<div class="hist-item"><span class="px-avatar" style="width:44px;height:44px;border-radius:12px;font-size:15px">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" referrerpolicy="no-referrer">' : esc(A.initials(p.name))) + '</span><div style="flex:1;min-width:0"><b>' + (p.favorite ? '★ ' : '') + esc(p.name) + '</b><div class="muted" style="font-size:12px">' + esc(p.description || '') + ' · ' + p.sources.length + ' bronnen · ' + p.reliability + '%' + (p.folder ? ' · 📁 ' + esc(p.folder) : '') + '</div></div>' +
              '<button class="btn btn-sm" data-open="' + esc(p.id) + '">Openen</button><button class="btn btn-sm" data-fav="' + esc(p.id) + '">' + (p.favorite ? '★' : '☆') + '</button><button class="btn btn-sm" data-fold="' + esc(p.id) + '">📁</button><button class="btn btn-sm" data-arch="' + esc(p.id) + '">' + icon('archive') + '</button><button class="btn btn-sm btn-danger" data-del="' + esc(p.id) + '">' + icon('trash') + '</button></div>').join('') : '<div class="empty" style="margin-top:8px">Hier staat nog niets.</div>') +
            '<div class="label" style="margin-top:22px">Recente zoekopdrachten</div>' + (searches.length ? '<div class="tags" style="margin-top:8px">' + searches.map((s) => '<button class="chip" data-q="' + esc(s.q) + '">' + esc(s.q) + '</button>').join('') + '</div>' : '<div class="empty" style="margin-top:8px">Hier staat nog niets.</div>') +
            '<div class="label" style="margin-top:22px">Research runs</div><p class="muted" style="font-size:13px">Elke zoekopdracht wordt hier bewaard met de informatie die je gaf, zodat je eerdere zoekopdrachten kunt vergelijken.</p>' +
            (runs.length ? runs.slice(0, 30).map((r) => '<div class="kv"><span>' + esc(r.name || r.query) + (r.hints && Object.keys(r.hints).length ? ' <span class="faint">(' + esc(Object.values(r.hints).join(', ')) + ')</span>' : '') + '</span><span class="muted">' + r.reliability + '% · ' + r.sources + ' bronnen · ' + esc(A.relTime(r.at)) + '</span></div>').join('') + '<button class="btn btn-sm" style="margin-top:10px" data-clear-runs>Geschiedenis wissen</button>' : '') + '</div>';
          body.querySelector('[data-sort]').value = st.sort;
          body.querySelectorAll('.hist-item .btn svg').forEach((s) => { s.style.cssText = 'width:14px;height:14px'; });
          body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; draw(); }));
          body.querySelector('[data-sort]').onchange = (e) => { st.sort = e.target.value; draw(); };
          body.querySelector('[data-folder]').onchange = (e) => { st.folder = e.target.value; draw(); };
          const mut = (id, fn) => { const l = saved(); const p = l.find((x) => x.id === id); fn(p, l); store.set('px-profiles', l); draw(); };
          body.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => A.go('personax', null, { id: b.dataset.open })));
          body.querySelectorAll('[data-fav]').forEach((b) => (b.onclick = () => mut(b.dataset.fav, (p) => { p.favorite = !p.favorite; })));
          body.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = () => mut(b.dataset.arch, (p) => { p.archived = !p.archived; })));
          body.querySelectorAll('[data-fold]').forEach((b) => (b.onclick = () => {
            const p = saved().find((x) => x.id === b.dataset.fold);
            A.openModal('<h2>Map voor ' + esc(p.name) + '</h2><input class="input" value="' + esc(p.folder || '') + '" placeholder="Nieuwe map…" list="px-folders"><datalist id="px-folders">' + folders.map((f) => '<option value="' + esc(f) + '">').join('') + '</datalist><div class="modal-actions"><button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-ok>Opslaan</button></div>', (m, close) => {
              m.querySelector('[data-ok]').onclick = () => { const v = m.querySelector('input').value.trim(); close(); mut(p.id, (x) => { x.folder = v; }); };
            });
          }));
          body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { store.set('px-profiles', saved().filter((x) => x.id !== b.dataset.del)); draw(); }));
          body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => A.go('personax', null, { q: b.dataset.q })));
          const cr = body.querySelector('[data-clear-runs]'); if (cr) cr.onclick = () => { store.set('px-runs', []); store.set('px-searches', []); draw(); };
        };
        draw();
      }

      function drawCompare(side) {
        const pool = saved().concat(store.get('px-last', []).filter((p) => !saved().some((s) => s.qid === p.qid)));
        const pick = (k) => pool.find((p) => p.qid === route.params[k]);
        let a = pick('a'), b = pick('b');
        const opts = (sel) => '<option value="">' + (side ? 'Kies een onderzochte persoon…' : 'Kies een opgeslagen profiel') + '</option>' + pool.map((p) => '<option value="' + esc(p.qid) + '"' + (sel && sel.qid === p.qid ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
        const factV = (p, k) => { const f = p.facts.find((x) => x.k === k || x.k.startsWith(k)); return f ? f.v : 'Onbekend'; };
        body.innerHTML = '<div class="px-wrap"><h1 style="margin:10px 0 4px">' + (side ? 'Naast elkaar' : 'Vergelijken') + '</h1><p class="muted">' + (side ? 'Twee volledige profielen op één dashboard. Gegevens van elke persoon blijven strikt gescheiden.' : 'Vergelijk twee profielen naast elkaar. Gegevens worden nooit samengevoegd.') + '</p>' +
          '<div class="cmp" style="margin:16px 0"><label class="px-card field">PERSOON A<select class="input" data-a>' + opts(a) + '</select></label><label class="px-card field">PERSOON B<select class="input" data-b>' + opts(b) + '</select></label></div>' +
          (!pool.length ? '<div class="empty">Hier staat nog niets. Onderzoek eerst een paar personen; ze verschijnen dan in deze lijsten.</div>' :
            !(a && b) ? '<div class="empty">Kies twee personen.</div>' :
              side ? '<div class="cmp"><div>' + profileHtml(a, true) + '</div><div>' + profileHtml(b, true) + '</div></div>' :
                '<div class="px-card"><table class="cmp-table"><tr><th></th><th>' + esc(a.name) + '</th><th>' + esc(b.name) + '</th></tr>' +
                [['Omschrijving', (p) => p.description || 'Onbekend'], ['Geboren', (p) => factV(p, 'Geboren')], ['Leeftijd', (p) => factV(p, 'Leeftijd')], ['Nationaliteit', (p) => factV(p, 'Nationaliteit')], ['Beroep', (p) => factV(p, 'Beroep')], ['Werkgever', (p) => factV(p, 'Werkgever')], ['Opleiding', (p) => factV(p, 'Opleiding')], ['Onderscheidingen', (p) => String(p.awards.length)], ['Wikimedia-projecten', (p) => String(p.stats.languages)], ['Weergaven (30 d)', (p) => p.stats.views.length ? p.stats.views.reduce((s, v) => s + v.v, 0).toLocaleString('nl-NL') : 'Onbekend'], ['Bronnen', (p) => String(p.sources.length)], ['Betrouwbaarheid', (p) => p.reliability + '%']]
                  .map(([l, f]) => '<tr><th>' + l + '</th><td>' + esc(f(a)) + '</td><td>' + esc(f(b)) + '</td></tr>').join('') + '</table></div>') + '</div>';
        const upd = () => A.go('personax', [side ? 'side' : 'compare'], { a: body.querySelector('[data-a]').value, b: body.querySelector('[data-b]').value });
        body.querySelector('[data-a]').onchange = upd; body.querySelector('[data-b]').onchange = upd;
      }

      function drawUpdates() {
        const list = saved();
        const updates = store.get('px-updates', {});
        body.innerHTML = '<div class="px-wrap"><h1 style="margin:10px 0 4px">Updatecentrum</h1><p class="muted">Controleer opgeslagen profielen op nieuw gepubliceerde openbare informatie.</p>' +
          '<div style="margin:14px 0"><button class="btn btn-primary" data-check ' + (list.length ? '' : 'disabled') + '>' + icon('refresh') + 'Alles controleren</button></div>' +
          '<div class="label">Recent bijgewerkte profielen</div>' +
          (list.length ? list.map((p) => { const u = updates[p.qid]; return '<div class="hist-item"><div style="flex:1"><b>' + esc(p.name) + '</b><div class="muted" style="font-size:12px">Laatst gecontroleerd ' + esc(A.relTime(u ? u.at : p.media.checkedAt)) + '</div></div>' + (u ? (u.changed ? '<span class="chip on">Nieuwe informatie · ' + esc(u.what) + '</span><button class="btn btn-sm" data-redo="' + esc(p.name) + '">Opnieuw onderzoeken</button>' : '<span class="chip">Geen wijzigingen</span>') : '') + '</div>'; }).join('') : '<div class="empty" style="margin-top:8px">Hier staat nog niets. Sla eerst een profiel op.</div>') +
          '<div class="label" style="margin-top:22px">Nieuwste afbeeldingen</div>' + (list.some((p) => p.gallery.length) ? '<div class="gallery" style="margin-top:8px">' + list.flatMap((p) => p.gallery.slice(0, 3)).slice(0, 12).map((g) => '<a href="' + esc(g.page) + '" target="_blank" rel="noopener"><img src="' + esc(g.src) + '" alt="' + esc(g.title) + '" loading="lazy" referrerpolicy="no-referrer"></a>').join('') + '</div>' : '<div class="empty" style="margin-top:8px">Hier staat nog niets.</div>') + '</div>';
        body.querySelectorAll('.btn svg').forEach((s) => { s.style.cssText = 'width:14px;height:14px'; });
        body.querySelectorAll('[data-redo]').forEach((b) => (b.onclick = () => A.go('personax', null, { q: b.dataset.redo })));
        body.querySelector('[data-check]').onclick = async (e) => {
          e.target.disabled = true; e.target.textContent = 'Bezig met controleren…';
          const up = store.get('px-updates', {});
          for (const p of list) {
            try {
              const r = await getJSON(WD + 'action=wbgetentities&props=info|sitelinks&ids=' + p.qid);
              const ent = r.entities[p.qid];
              let changed = false, what = [];
              if (p.media.wdRev && ent.lastrevid && ent.lastrevid !== p.media.wdRev) { changed = true; what.push('Wikidata'); }
              if (p.media.wpTitle) {
                const s = await getJSON('https://' + p.media.wpLang + '.wikipedia.org/api/rest_v1/page/summary/' + enc(p.media.wpTitle.replace(/ /g, '_')));
                if (s.timestamp && p.media.wpTimestamp && s.timestamp !== p.media.wpTimestamp) { changed = true; what.push('Wikipedia ' + A.fmtDateTime(s.timestamp)); }
              }
              up[p.qid] = { at: new Date().toISOString(), changed, what: what.join(' · ') };
            } catch (er) { up[p.qid] = { at: new Date().toISOString(), changed: false, what: 'fout: ' + er.message }; }
          }
          store.set('px-updates', up); drawUpdates(); A.toast('Controle voltooid');
        };
      }
    }
  });
})();
