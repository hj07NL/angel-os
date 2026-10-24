/* ANGEL — herkent vak, type, datum, tijd en prioriteit in gewone Nederlandse zinnen.
   Voorbeelden: "vrijdag toets wiskunde", "Morgen om 16:00 economie leren", "! inleveren engels 15 sep" */
(function () {
  'use strict';
  const A = window.AOS;

  const ALIASES = {
    'Aardrijkskunde': ['aardrijkskunde', 'ak', 'aardrijks'],
    'B&S': ['b&s', 'bs', 'burgerschap'],
    'Bedrijfseconomie': ['bedrijfseconomie', 'beco', 'm&o', 'mo'],
    'Biologie': ['biologie', 'bio', 'bi'],
    'Duits': ['duits', 'du', 'dutis'],
    'Economie': ['economie', 'eco', 'econ', 'ec'],
    'Engels': ['engels', 'en', 'eng'],
    'Frans': ['frans', 'fa', 'fr'],
    'Geschiedenis': ['geschiedenis', 'gs', 'ges', 'gesch'],
    'Informatica': ['informatica', 'inf', 'info'],
    'Kunst': ['kunst', 'ckv', 'ku'],
    'Natuurkunde': ['natuurkunde', 'na', 'nat'],
    'Nederlands': ['nederlands', 'ne', 'ned', 'nl'],
    'Scheikunde': ['scheikunde', 'sk', 'schei'],
    'Wiskunde B': ['wiskunde b', 'wiskunde', 'wisb', 'wis', 'wi', 'wb'],
    'Wiskunde A': ['wiskunde a', 'wisa', 'wa'],
    'Maatschappijleer': ['maatschappijleer', 'maat', 'ma-leer']
  };

  const WEEKDAYS = { zondag: 0, zo: 0, maandag: 1, ma: 1, dinsdag: 2, di: 2, woensdag: 3, wo: 3, donderdag: 4, do: 4, vrijdag: 5, vr: 5, zaterdag: 6, za: 6 };
  const MONTHS = { jan: 0, januari: 0, feb: 1, februari: 1, mrt: 2, maart: 2, apr: 3, april: 3, mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, augustus: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11 };

  const TYPE_WORDS = [
    { type: 'test', words: ['toets', 'proefwerk', 'pw', 'so', 'tentamen', 'examen', 'overhoring', 'se'], deadline: true },
    { type: 'homework', words: ['inleveren', 'deadline', 'opdracht', 'pws', 'verslag', 'presentatie'], deadline: true },
    { type: 'homework', words: ['huiswerk', 'leren', 'maken', 'samenvatten', 'oefenen', 'hw'] },
    { type: 'reading', words: ['lezen', 'boek', 'leesboek', 'hoofdstuk'] },
    { type: 'reminder', words: ['herinner', 'herinnering', 'onthoud', 'niet vergeten', 'vergeet niet'] },
    { type: 'event', words: ['afspraak', 'training', 'wedstrijd', 'tandarts', 'dokter', 'feest', 'verjaardag', 'les', 'werk', 'bijbaan', 'meeting'] },
    { type: 'project', words: ['project', 'profielwerkstuk'] }
  ];

  const CATEGORY_WORDS = [
    { cat: 'sport', words: ['training', 'wedstrijd', 'hockey', 'voetbal', 'sport', 'gym', 'zwemmen', 'fitness'] },
    { cat: 'werk', words: ['werk', 'bijbaan', 'dienst', 'meeting'] },
    { cat: 'persoonlijk', words: ['tandarts', 'dokter', 'verjaardag', 'feest', 'kamer', 'boodschappen', 'opruimen'] }
  ];

  const CATEGORIES = { school: '📚 School', sport: '⚽ Sport', werk: '💼 Werk', persoonlijk: '🏠 Persoonlijk', overig: '📦 Overig' };
  const TYPE_LABELS = { task: 'Taak', reminder: 'Herinnering', event: 'Afspraak', homework: 'Huiswerk', test: 'Toets', project: 'Project', reading: 'Lezen' };

  const wordRe = (w) => new RegExp('(^|[\\s,.;:!?(])' + w.replace(/[.*+?^${}()|[\]\\&]/g, (c) => (c === '&' ? '&' : '\\' + c)) + '(?=$|[\\s,.;:!?)])', 'i');

  function nextWeekday(base, wd, forceNext) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    let diff = (wd - d.getDay() + 7) % 7;
    if (diff === 0 && forceNext) diff = 7;
    return A.addDays(d, diff);
  }

  function parse(input, opts) {
    opts = opts || {};
    const subjects = opts.subjects || A.data.subjects();
    const now = opts.now || new Date();
    let text = ' ' + input.trim() + ' ';
    const res = { title: '', date: null, time: null, deadline: null, subject: null, type: 'task', category: 'overig', priority: 'normal', found: [] };
    const strip = (re) => { text = text.replace(re, ' '); };

    // prioriteit
    if (/(^|\s)!+(\s|$)/.test(text) || wordRe('belangrijk').test(text) || wordRe('urgent').test(text) || wordRe('asap').test(text)) {
      res.priority = 'high'; res.found.push('prioriteit');
      strip(/(^|\s)!+(?=\s|$)/g); strip(/\b(belangrijk|urgent|asap)\b/gi);
    }

    // tijd: "om 16:00", "16:30", "16.30u", "16u"
    let m = text.match(/\b(?:om\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*u?\b/i) || text.match(/\b(?:om\s+)([01]?\d|2[0-3])\s*(?:uur|u)?\b/i) || text.match(/\b([01]?\d|2[0-3])\s*(?:uur|u)\b/i);
    if (m) {
      res.time = A.pad2(+m[1]) + ':' + (m[2] ? m[2] : '00');
      res.found.push('tijd'); text = text.replace(m[0], ' ');
    }

    // datum
    let date = null;
    if ((m = text.match(/\bovermorgen\b/i))) { date = A.addDays(now, 2); }
    else if ((m = text.match(/\bmorgen\b/i))) { date = A.addDays(now, 1); }
    else if ((m = text.match(/\b(vandaag|vanavond|vanmiddag)\b/i))) { date = now; }
    else if ((m = text.match(/\bover\s+(\d+)\s+(dag|dagen|week|weken)\b/i))) { date = A.addDays(now, +m[1] * (/week/i.test(m[2]) ? 7 : 1)); }
    else if ((m = text.match(/\bvolgende\s+week\b/i))) { date = A.addDays(A.startOfWeek(now), 7); }
    else if ((m = text.match(/\b(\d{1,2})\s*(jan(?:uari)?|feb(?:ruari)?|mrt|maart|apr(?:il)?|mei|jun[i]?|jul[i]?|aug(?:ustus)?|sept?(?:ember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?(?:\s+(\d{4}))?/i))) {
      const mon = MONTHS[m[2].toLowerCase()];
      let y = m[3] ? +m[3] : now.getFullYear();
      date = new Date(y, mon, +m[1]);
      if (!m[3] && date < A.addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -60)) date = new Date(y + 1, mon, +m[1]);
    }
    else if ((m = text.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/))) {
      let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
      date = new Date(y, +m[2] - 1, +m[1]);
      if (!m[3] && date < A.addDays(now, -60)) date = new Date(y + 1, +m[2] - 1, +m[1]);
    }
    else {
      const wdRe = /\b(volgende\s+)?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i;
      if ((m = text.match(wdRe))) date = nextWeekday(now, WEEKDAYS[m[2].toLowerCase()], !!m[1]);
    }
    if (date && m) { res.date = A.ymd(date); res.found.push('datum'); text = text.replace(m[0], ' '); }

    // vak
    const lower = text.toLowerCase();
    const candidates = [];
    subjects.forEach((s) => {
      const names = (ALIASES[s] || []).concat([s.toLowerCase()]);
      names.forEach((n) => { if (wordRe(n).test(lower)) candidates.push({ s, n }); });
    });
    if (candidates.length) {
      candidates.sort((a, b) => b.n.length - a.n.length);
      res.subject = candidates[0].s; res.category = 'school'; res.found.push('vak');
    }

    // type
    for (const t of TYPE_WORDS) {
      const w = t.words.find((w) => wordRe(w).test(lower));
      if (w) {
        res.type = t.type; res.found.push('type');
        if (t.deadline && res.date) { res.deadline = res.date; }
        break;
      }
    }
    if (res.type === 'task' && res.time && !res.subject) res.type = 'event';
    if (['test', 'homework', 'reading', 'project'].includes(res.type) && !res.subject) res.category = 'school';

    // categorie
    if (res.category === 'overig') {
      for (const c of CATEGORY_WORDS) { if (c.words.some((w) => wordRe(w).test(lower))) { res.category = c.cat; res.found.push('categorie'); break; } }
    }

    res.title = input.trim().replace(/(^|\s)!+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!res.date && opts.defaultDate) res.date = opts.defaultDate;
    return res;
  }

  window.AOS.parser = { parse, CATEGORIES, TYPE_LABELS, ALIASES };
})();
