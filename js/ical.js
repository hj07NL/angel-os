/* iCal-lezer (RFC 5545, het deel dat agenda's in de praktijk gebruiken).
   Ondersteunt: ingeklapte regels, TZID-tijdzones, hele dagen (VALUE=DATE), herhalingen (RRULE met
   DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH), EXDATE, RDATE,
   aangepaste voorkomens (RECURRENCE-ID) en geannuleerde afspraken. Alarmen (VALARM) worden genegeerd.
   Uitvoer per afspraak: { start, end?, summary, location, allDay?, uid } met ISO-tijden (UTC).
   Voor gewone, niet-herhalende afspraken is de uitvoer gelijk aan die van de oude lezer (Somtoday). */
(function (root) {
  'use strict';

  const WIN_TZ = {
    'W. Europe Standard Time': 'Europe/Amsterdam', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
    'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Eastern Standard Time': 'America/New_York',
    'Pacific Standard Time': 'America/Los_Angeles', 'Central Standard Time': 'America/Chicago', 'UTC': 'UTC'
  };
  const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  // ---------- tijdzones ----------
  const dtfCache = {};
  function validTz(tz) {
    if (!tz) return null;
    tz = WIN_TZ[tz] || tz.replace(/^\/?(mozilla\.org\/[^/]+\/|freeassociation\.sourceforge\.net\/[^/]+\/)/, '');
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return null; }
  }
  function tzOffsetMs(utcMs, tz) {
    const dtf = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const p = {}; dtf.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = +x.value; });
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  }
  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off = tzOffsetMs(guess, tz);
    let t = guess - off;
    const off2 = tzOffsetMs(t, tz);
    if (off2 !== off) t = guess - off2;
    return t;
  }

  // ---------- tekst ----------
  function unfold(text) { return String(text || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
  function unescapeText(v) { return v.replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1'); }
  // "NAAM;PARAM=x:waarde" -> { name, params, value }  (dubbele punten tussen aanhalingstekens tellen niet)
  function parseLine(l) {
    let inQ = false, colon = -1;
    for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') inQ = !inQ; else if (c === ':' && !inQ) { colon = i; break; } }
    if (colon < 0) return null;
    const head = l.slice(0, colon), value = l.slice(colon + 1);
    const parts = []; let cur = '', q = false;
    for (let i = 0; i < head.length; i++) { const c = head[i]; if (c === '"') q = !q; if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c; }
    parts.push(cur);
    const params = {};
    parts.slice(1).forEach((p) => { const e = p.indexOf('='); if (e > 0) params[p.slice(0, e).toUpperCase()] = p.slice(e + 1).replace(/^"|"$/g, ''); });
    return { name: parts[0].toUpperCase(), params, value };
  }

  // ---------- datums ----------
  function parseDate(value, params) {
    const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const allDay = params.VALUE === 'DATE' || m[4] === undefined;
    return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), utc: !!m[7], tz: m[7] ? null : validTz(params.TZID), allDay };
  }
  function instant(p) {
    if (p.allDay) return new Date(p.y, p.mo - 1, p.d).getTime();
    if (p.utc) return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    if (p.tz) return zonedToUtc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.tz);
    return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s).getTime();
  }
  function parseDuration(v) {
    const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return null;
    const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  // ---------- herhalingen ----------
  function parseRRule(v) {
    const r = {}; String(v).split(';').forEach((kv) => { const e = kv.indexOf('='); if (e > 0) r[kv.slice(0, e).toUpperCase()] = kv.slice(e + 1); });
    const out = { freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null, until: null, byday: [], bymonthday: [], bymonth: [], wkst: r.WKST === 'SU' ? 0 : 1 };
    if (r.UNTIL) out.until = parseDate(r.UNTIL, {});
    if (r.BYDAY) out.byday = r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); return m ? { n: m[1] ? +m[1] : 0, day: DAY_CODES.indexOf(m[2]) } : null; }).filter(Boolean);
    if (r.BYMONTHDAY) out.bymonthday = r.BYMONTHDAY.split(',').map(Number).filter((n) => n);
    if (r.BYMONTH) out.bymonth = r.BYMONTH.split(',').map(Number);
    return out;
  }
  const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
  // dagen in een maand die aan BYDAY / BYMONTHDAY voldoen
  function monthDays(y, mo, rule, startDay, startDow) {
    const n = daysIn(y, mo); const set = new Set();
    if (rule.bymonthday.length) rule.bymonthday.forEach((d) => { const dd = d > 0 ? d : n + d + 1; if (dd >= 1 && dd <= n) set.add(dd); });
    if (rule.byday.length) {
      rule.byday.forEach((b) => {
        const all = []; for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === b.day) all.push(d);
        if (!b.n) all.forEach((d) => { if (!rule.bymonthday.length || set.has(d)) set.add(d); });
        else { const d = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (d) set.add(d); }
      });
    }
    if (!rule.bymonthday.length && !rule.byday.length) { if (startDay <= n) set.add(startDay); }
    return Array.from(set).sort((a, b) => a - b);
  }
  // Geeft wandkloktijden { y, mo, d } van voorkomens vanaf dtstart, tot de grens.
  function expandDates(start, rule, lastMs, isAfterLimit) {
    const out = []; let guard = 0;
    const push = (y, mo, d) => out.push({ y, mo, d });
    const startDow = new Date(Date.UTC(start.y, start.mo - 1, start.d)).getUTCDay();
    const startUtcDay = Date.UTC(start.y, start.mo - 1, start.d);
    const maxIter = 4000;
    if (rule.freq === 'DAILY') {
      for (let i = 0; guard++ < maxIter; i += rule.interval) {
        const dt = new Date(startUtcDay + i * 86400000); const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
        if (isAfterLimit(y, mo, d)) break;
        if (rule.bymonth.length && !rule.bymonth.includes(mo)) continue;
        if (rule.byday.length && !rule.byday.some((b) => b.day === dt.getUTCDay())) continue;
        push(y, mo, d);
      }
    } else if (rule.freq === 'WEEKLY') {
      const days = rule.byday.length ? rule.byday.map((b) => b.day) : [startDow];
      const offsetToWeekStart = (startDow - rule.wkst + 7) % 7; const weekStart = startUtcDay - offsetToWeekStart * 86400000;
      for (let w = 0; guard++ < maxIter; w += rule.interval) {
        let any = false;
        days.map((dd) => (dd - rule.wkst + 7) % 7).sort((a, b) => a - b).forEach((off) => {
          const dt = new Date(weekStart + (w * 7 + off) * 86400000); const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
          if (Date.UTC(y, mo - 1, d) < startUtcDay) return;
          if (rule.bymonth.length && !rule.bymonth.includes(mo)) return;
          if (isAfterLimit(y, mo, d)) { any = 'stop'; return; }
          if (any !== 'stop') { push(y, mo, d); any = any || true; }
        });
        if (any === 'stop') break;
        if (weekStart + w * 7 * 86400000 > lastMs + 14 * 86400000) break;
      }
    } else if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
      const step = rule.freq === 'MONTHLY' ? rule.interval : rule.interval * 12;
      for (let k = 0; guard++ < maxIter; k += step) {
        const total = (start.y * 12 + start.mo - 1) + k; const y = Math.floor(total / 12), mo = (total % 12) + 1;
        if (Date.UTC(y, mo - 1, 1) > lastMs + 31 * 86400000) break;
        if (rule.freq === 'MONTHLY' && rule.bymonth.length && !rule.bymonth.includes(mo)) continue;
        if (rule.freq === 'YEARLY' && !rule.bymonth.length && mo !== start.mo) continue;
        monthDays(y, mo, rule, start.d, startDow).forEach((d) => {
          if (Date.UTC(y, mo - 1, d) < startUtcDay) return;
          if (isAfterLimit(y, mo, d)) return;
          push(y, mo, d);
        });
        if (isAfterLimit(y, mo, 1) && Date.UTC(y, mo - 1, 1) > lastMs) break;
      }
    }
    return out;
  }

  // ---------- hoofdfunctie ----------
  function parse(text, opts) {
    opts = opts || {};
    const now = Date.now();
    const from = opts.from != null ? opts.from : now - 35 * 86400000;
    const to = opts.to != null ? opts.to : now + 190 * 86400000;
    const lines = unfold(text);
    const raw = []; let cur = null, inAlarm = false;
    lines.forEach((l) => {
      if (l === 'BEGIN:VEVENT') { cur = { exdates: [], rdates: [] }; inAlarm = false; return; }
      if (l === 'END:VEVENT') { if (cur && cur.dtstart) raw.push(cur); cur = null; return; }
      if (!cur) return;
      if (l === 'BEGIN:VALARM') { inAlarm = true; return; }
      if (l === 'END:VALARM') { inAlarm = false; return; }
      if (inAlarm) return;
      const p = parseLine(l); if (!p) return;
      switch (p.name) {
        case 'DTSTART': cur.dtstart = parseDate(p.value, p.params); break;
        case 'DTEND': cur.dtend = parseDate(p.value, p.params); break;
        case 'DURATION': cur.duration = parseDuration(p.value); break;
        case 'SUMMARY': cur.summary = unescapeText(p.value); break;
        case 'LOCATION': cur.location = unescapeText(p.value); break;
        case 'UID': cur.uid = p.value; break;
        case 'STATUS': cur.status = p.value.toUpperCase(); break;
        case 'RRULE': cur.rrule = parseRRule(p.value); break;
        case 'EXDATE': p.value.split(',').forEach((v) => { const d = parseDate(v, p.params); if (d) cur.exdates.push(d); }); break;
        case 'RDATE': p.value.split(',').forEach((v) => { const d = parseDate(v.split('/')[0], p.params); if (d) cur.rdates.push(d); }); break;
        case 'RECURRENCE-ID': cur.recId = parseDate(p.value, p.params); break;
        default: break;
      }
    });

    const out = []; const iso = (ms) => new Date(ms).toISOString();
    const overrides = {};
    raw.forEach((e) => { if (e.recId && e.uid) (overrides[e.uid] = overrides[e.uid] || []).push(e); });
    const emit = (e, startMs, endMs, allDay) => {
      const o = { start: iso(startMs) };
      if (endMs != null) o.end = iso(endMs);
      o.summary = e.summary; o.location = e.location; if (allDay) o.allDay = true; if (e.uid) o.uid = e.uid;
      out.push(o);
    };

    raw.forEach((e) => {
      if (e.recId) return; // aangepaste voorkomens worden via hun hoofdafspraak verwerkt (of hieronder los)
      if (e.status === 'CANCELLED') return;
      const allDay = e.dtstart.allDay;
      const s0 = instant(e.dtstart);
      let dur = null;
      if (e.dtend) dur = instant(e.dtend) - s0; else if (e.duration != null) dur = e.duration; else if (allDay) dur = 86400000;
      if (!e.rrule && !e.rdates.length) {
        if (opts.limitNonRecurring && ((dur != null ? s0 + dur : s0) < from || s0 > to)) return;
        emit(e, s0, dur != null ? s0 + dur : null, allDay);
        return;
      }
      // herhalend: voorkomens berekenen
      const exSet = new Set(e.exdates.map((x) => (x.allDay ? 'd' + x.y + '-' + x.mo + '-' + x.d : 'i' + instant(x))));
      const ov = overrides[e.uid] || [];
      const ovMap = new Map(ov.map((x) => [x.recId.allDay ? 'd' + x.recId.y + '-' + x.recId.mo + '-' + x.recId.d : 'i' + instant(x.recId), x]));
      const occ = []; // { ms, key }
      const keyOf = (y, mo, d, ms) => (allDay ? 'd' + y + '-' + mo + '-' + d : 'i' + ms);
      const msOf = (y, mo, d) => instant({ y, mo, d, h: e.dtstart.h, mi: e.dtstart.mi, s: e.dtstart.s, utc: e.dtstart.utc, tz: e.dtstart.tz, allDay });
      if (e.rrule && e.rrule.freq) {
        const rule = e.rrule;
        const untilMs = rule.until ? (rule.until.allDay ? new Date(rule.until.y, rule.until.mo - 1, rule.until.d, 23, 59, 59).getTime() : instant(rule.until)) : null;
        const limit = Math.min(to + 86400000, untilMs != null ? untilMs : Infinity);
        const isAfterLimit = (y, mo, d) => msOf(y, mo, d) > limit;
        const dates = expandDates(e.dtstart, rule, limit, isAfterLimit);
        let n = 0;
        for (const dt of dates) {
          n++; if (rule.count && n > rule.count) break;
          const ms = msOf(dt.y, dt.mo, dt.d);
          occ.push({ ms, key: keyOf(dt.y, dt.mo, dt.d, ms) });
        }
      } else occ.push({ ms: s0, key: keyOf(e.dtstart.y, e.dtstart.mo, e.dtstart.d, s0) });
      e.rdates.forEach((r) => { const ms = instant(r); occ.push({ ms, key: keyOf(r.y, r.mo, r.d, ms) }); });
      const seen = new Set();
      occ.forEach((o) => {
        if (seen.has(o.key)) return; seen.add(o.key);
        if (exSet.has(o.key)) return;
        const endMs = dur != null ? o.ms + dur : null;
        const o2 = ovMap.get(o.key);
        if (o2) { // aangepast voorkomen vervangt dit voorkomen
          if (o2.status === 'CANCELLED') return;
          const os = instant(o2.dtstart); const od = o2.dtend ? instant(o2.dtend) - os : dur;
          if ((od != null ? os + od : os) < from || os > to) return;
          emit(o2.summary !== undefined ? o2 : e, os, od != null ? os + od : null, o2.dtstart.allDay); return;
        }
        if ((endMs != null ? endMs : o.ms) < from || o.ms > to) return;
        emit(e, o.ms, endMs, allDay);
      });
    });
    // aangepaste voorkomens zonder hoofdafspraak in dit bestand
    raw.forEach((e) => {
      if (!e.recId || e.status === 'CANCELLED') return;
      if (raw.some((m) => !m.recId && m.uid === e.uid)) return;
      const os = instant(e.dtstart); const od = e.dtend ? instant(e.dtend) - os : (e.dtstart.allDay ? 86400000 : null);
      emit(e, os, od != null ? os + od : null, e.dtstart.allDay);
    });
    out.sort((a, b) => a.start.localeCompare(b.start));
    return out;
  }

  const api = { parse, zonedToUtc, parseRRule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AOS_ICAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
