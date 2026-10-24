/* ANGEL-parser — begrijpt korte zinnen in het Nederlands en Engels en maakt er een taak, herinnering of afspraak van.
   Zonder datum → vandaag (instelbaar). Bij echte twijfel (bijv. "om 4" of "herinner me morgen") geeft de parser een vraag terug
   in plaats van iets te verzinnen. */
(function () {
  'use strict';
  const A = window.AOS;

  const ALIASES = {
    'Aardrijkskunde': ['aardrijkskunde', 'ak', 'geography'], 'B&S': ['b&s', 'burgerschap'], 'Bedrijfseconomie': ['bedrijfseconomie', 'beco', 'm&o'],
    'Biologie': ['biologie', 'bio', 'biology'], 'Duits': ['duits', 'german'], 'Economie': ['economie', 'eco', 'econ', 'economics'],
    'Engels': ['engels', 'eng', 'english'], 'Frans': ['frans', 'french'], 'Geschiedenis': ['geschiedenis', 'gs', 'gesch', 'history'],
    'Informatica': ['informatica', 'inf', 'computer science'], 'Kunst': ['kunst', 'ckv', 'art'], 'Natuurkunde': ['natuurkunde', 'nat', 'physics'],
    'Nederlands': ['nederlands', 'ned', 'dutch'], 'Scheikunde': ['scheikunde', 'sk', 'schei', 'chemistry'], 'Wiskunde B': ['wiskunde b', 'wiskunde', 'wisb', 'wis', 'math', 'maths'],
    'Wiskunde A': ['wiskunde a', 'wisa'], 'Maatschappijleer': ['maatschappijleer', 'maat']
  };
  const WEEKDAYS = { zondag: 0, sunday: 0, maandag: 1, monday: 1, dinsdag: 2, tuesday: 2, woensdag: 3, wednesday: 3, donderdag: 4, thursday: 4, vrijdag: 5, friday: 5, zaterdag: 6, saturday: 6 };
  const MONTHS = { jan: 0, januari: 0, january: 0, feb: 1, februari: 1, february: 1, mrt: 2, maart: 2, mar: 2, march: 2, apr: 3, april: 3, mei: 4, may: 4, jun: 5, juni: 5, june: 5, jul: 6, juli: 6, july: 6, aug: 7, augustus: 7, august: 7, sep: 8, sept: 8, september: 8, okt: 9, oct: 9, oktober: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const MONTH_RE = '(jan(?:uari|uary)?|feb(?:ruari|ruary)?|mrt|maart|mar(?:ch)?|apr(?:il)?|mei|may|jun[ie]?|jul[iy]?|aug(?:ustus|ust)?|sept?(?:ember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  const TYPE_WORDS = [
    { type: 'test', words: ['toets', 'proefwerk', 'pw', 'so', 'tentamen', 'examen', 'overhoring', 'test', 'exam', 'quiz'], deadline: true },
    { type: 'homework', words: ['inleveren', 'deadline', 'opdracht', 'pws', 'verslag', 'presentatie', 'due', 'hand in', 'assignment', 'essay'], deadline: true },
    { type: 'homework', words: ['huiswerk', 'leren', 'samenvatten', 'oefenen', 'homework', 'study', 'studeren', 'vocabulary', 'woordjes'] },
    { type: 'reading', words: ['lezen', 'leesboek', 'hoofdstuk', 'read', 'reading', 'chapter'] },
    { type: 'event', words: ['afspraak', 'training', 'wedstrijd', 'tandarts', 'dokter', 'feest', 'verjaardag', 'meeting', 'appointment', 'match', 'party', 'dentist', 'les'] },
    { type: 'project', words: ['project', 'profielwerkstuk'] }
  ];
  const REMINDER_RE = /^(?:\s*)(herinner\s+me(?:\s+eraan\b)?(?:\s+(?:om|dat|aan)\b)?|herinnering:?|onthoud(?:\s+(?:om|dat)\b)?|vergeet\s+niet(?:\s+(?:om|te)\b)?|niet\s+vergeten:?|remind\s+me(?:\s+to\b)?|remember\s+to\b|don'?t\s+forget\s+to\b|reminder:?)\s*/i;
  const CATEGORY_WORDS = [
    { cat: 'sport', words: ['training', 'wedstrijd', 'hockey', 'voetbal', 'sport', 'gym', 'zwemmen', 'fitness', 'match'] },
    { cat: 'werk', words: ['werk', 'bijbaan', 'dienst', 'meeting', 'work', 'shift'] },
    { cat: 'persoonlijk', words: ['tandarts', 'dokter', 'verjaardag', 'feest', 'kamer', 'boodschappen', 'opruimen', 'eten', 'eat', 'message', 'appen', 'bellen', 'call', 'mail', 'dentist'] }
  ];
  const CATEGORIES = { school: '📚 School', sport: '⚽ Sport', werk: '💼 Werk', persoonlijk: '🏠 Persoonlijk', overig: '📦 Overig' };
  const TYPE_LABELS = { task: A.t('task.type.task'), reminder: A.t('task.type.reminder'), event: A.t('task.type.event'), homework: A.t('task.type.homework'), test: A.t('task.type.test'), project: A.t('task.type.project'), reading: A.t('task.type.reading') };

  const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (w) => new RegExp('(^|[\\s,.;:!?("\'])' + escRe(w) + '(?=$|[\\s,.;:!?)"\'])', 'i');
  function nextWeekday(base, wd, forceNext) { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate()); let diff = (wd - d.getDay() + 7) % 7; if (diff === 0 && forceNext) diff = 7; return A.addDays(d, diff); }
  const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '').trim();
  const capFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  function parse(input, opts) {
    opts = opts || {};
    const subjects = opts.subjects || A.data.subjects();
    const nowD = opts.now || A.now();
    const raw = String(input || '').trim();
    const res = { title: '', date: null, time: null, end: null, deadline: null, subject: null, type: 'task', category: 'overig', priority: 'normal', found: [], question: null, explicitDate: false };
    let text = ' ' + raw + ' ';
    let title = raw;
    const cut = (m) => { if (!m) return; text = text.replace(m, ' '); title = title.replace(m.trim ? m.trim() : m, ' '); };

    // expliciet voorvoegsel: "Taak:", "Task:"
    const pre = raw.match(/^\s*(taak|task|todo|to-do)\s*:\s*/i);
    if (pre) { cut(pre[0]); res.found.push('type'); }
    // herinnering
    const rem = title.match(REMINDER_RE);
    if (rem && rem[0].trim()) { res.type = 'reminder'; res.found.push('herinnering'); cut(rem[0]); }

    // prioriteit
    if (/(^|\s)!+(\s|$)/.test(text) || /\b(belangrijk|urgent|asap|important)\b/i.test(text)) {
      res.priority = 'high'; res.found.push('prioriteit');
      text = text.replace(/(^|\s)!+(?=\s|$)/g, ' '); title = title.replace(/(^|\s)!+(?=\s|$)/g, ' ').replace(/\b(belangrijk|urgent|asap|important)\b/gi, ' ');
    }

    // tijd: "van 14:00 tot 15:30", "14:00-15:30", "om 16:00", "at 4pm", "16u"
    let m = text.match(/\b(?:van\s+|from\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|tot|to|until)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
    if (m) { res.time = A.pad2(+m[1]) + ':' + m[2]; res.end = A.pad2(+m[3]) + ':' + m[4]; res.found.push('tijd'); cut(m[0]); }
    else if ((m = text.match(/\b(?:om|at)?\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)/i))) {
      let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; res.time = A.pad2(h) + ':' + (m[2] || '00'); res.found.push('tijd'); cut(m[0]);
    } else if ((m = text.match(/\b(?:om\s+|at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uur|u)?\b/i))) {
      res.time = A.pad2(+m[1]) + ':' + m[2]; res.found.push('tijd'); cut(m[0]);
    } else if ((m = text.match(/\b([01]?\d|2[0-3])\s*(?:uur|u)\b/i))) {
      res.time = A.pad2(+m[1]) + ':00'; res.found.push('tijd'); cut(m[0]);
    } else if ((m = text.match(/\b(?:om|at)\s+([1-9]|1[0-2])\b(?!\s*(?:dag|dagen|week|weken|days?|weeks?))/i))) {
      const h = +m[1];
      if (/\b(vanavond|avond|middag|tonight|evening|afternoon)\b/i.test(text)) { res.time = A.pad2(h < 12 ? h + 12 : h) + ':00'; res.found.push('tijd'); cut(m[0]); }
      else if (/\b(ochtend|morning|vanochtend)\b/i.test(text)) { res.time = A.pad2(h) + ':00'; res.found.push('tijd'); cut(m[0]); }
      else res.question = { kind: 'time', text: 'Bedoel je ' + A.pad2(h) + ':00 of ' + A.pad2(h + 12) + ':00?', options: [A.pad2(h) + ':00', A.pad2(h + 12) + ':00'], cut: m[0] };
    }

    // datum
    let date = null;
    const dateRes = [
      [/\b(overmorgen|day after tomorrow)\b/i, () => A.addDays(nowD, 2)],
      [/\b(morgen|tomorrow)\b/i, () => A.addDays(nowD, 1)],
      [/\b(vandaag|vanavond|vanmiddag|vanochtend|today|tonight|this evening)\b/i, () => nowD],
      [/\b(?:over|in)\s+(\d+)\s+(dag|dagen|week|weken|day|days|week|weeks)\b/i, (mm) => A.addDays(nowD, +mm[1] * (/w/i.test(mm[2]) ? 7 : 1))],
      [/\b(volgende\s+week|next\s+week)\b/i, () => A.addDays(A.startOfWeek(nowD), 7)],
      [/\b(dit\s+weekend|this\s+weekend|weekend)\b/i, () => nextWeekday(nowD, 6, false)],
      [new RegExp('\\b(?:op\\s+|on\\s+)?(\\d{1,2})(?:st|nd|rd|th|e)?\\s*' + MONTH_RE + '\\b\\.?(?:\\s+(\\d{4}))?', 'i'), (mm) => { const mon = MONTHS[mm[2].toLowerCase()] ?? MONTHS[mm[2].toLowerCase().slice(0, 3)]; let y = mm[3] ? +mm[3] : nowD.getFullYear(); let d = new Date(y, mon, +mm[1]); if (!mm[3] && d < A.addDays(nowD, -60)) d = new Date(y + 1, mon, +mm[1]); return d; }],
      [new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i'), (mm) => { const mon = MONTHS[mm[1].toLowerCase()] ?? MONTHS[mm[1].toLowerCase().slice(0, 3)]; let d = new Date(nowD.getFullYear(), mon, +mm[2]); if (d < A.addDays(nowD, -60)) d = new Date(nowD.getFullYear() + 1, mon, +mm[2]); return d; }],
      [/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/, (mm) => { let y = mm[3] ? +mm[3] : nowD.getFullYear(); if (y < 100) y += 2000; let d = new Date(y, +mm[2] - 1, +mm[1]); if (!mm[3] && d < A.addDays(nowD, -60)) d = new Date(y + 1, +mm[2] - 1, +mm[1]); return d; }],
      [/\b(?:(volgende|next)\s+|(?:op|on)\s+)?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (mm) => nextWeekday(nowD, WEEKDAYS[mm[2].toLowerCase()], !!mm[1])]
    ];
    for (const [re, fn] of dateRes) { const mm = text.match(re); if (mm) { date = fn(mm); if (date && !isNaN(date)) { res.date = A.ymd(date); res.explicitDate = true; res.found.push('datum'); cut(mm[0]); } break; } }
    if (/\b(vanavond|tonight|this evening)\b/i.test(raw) && !res.time) res.time = null;

    // vak
    const lower = text.toLowerCase();
    const cands = [];
    subjects.forEach((s) => { (ALIASES[s] || []).concat([s.toLowerCase()]).forEach((n) => { if (wordRe(n).test(lower)) cands.push({ s, n }); }); });
    if (cands.length) { cands.sort((a, b) => b.n.length - a.n.length); res.subject = cands[0].s; res.category = 'school'; res.found.push('vak'); }

    // type (herinnering blijft herinnering)
    if (res.type !== 'reminder') {
      for (const tw of TYPE_WORDS) {
        const w = tw.words.find((x) => wordRe(x).test(lower));
        if (w) { res.type = tw.type; res.found.push('type'); if (tw.deadline && res.date) res.deadline = res.date; break; }
      }
      if (res.type === 'task' && res.time && res.end) res.type = 'event';
    }
    if (['test', 'homework', 'reading', 'project'].includes(res.type) && !res.subject) res.category = 'school';
    if (res.category === 'overig') for (const c of CATEGORY_WORDS) { if (c.words.some((w) => wordRe(w).test(lower))) { res.category = c.cat; break; } }

    // titel opschonen
    title = tidy(title.replace(/\b(om|at|op|on|van|from)\s*$/i, ''));
    if (res.type === 'reminder') title = capFirst(title.replace(/^(to|om|te|dat)\s+/i, ''));
    res.title = title || raw;

    // twijfels die we liever vragen dan invullen
    if (!res.question && res.type === 'reminder' && tidy(title).length < 2) res.question = { kind: 'what', text: 'Waaraan wil je herinnerd worden?' };
    if (!res.question && res.type === 'test' && !res.explicitDate && !/\b(vandaag|today)\b/i.test(raw)) res.question = { kind: 'date', text: 'Wanneer is de ' + (res.subject ? res.subject.toLowerCase() + '-' : '') + 'toets?', options: ['Morgen', 'Volgende week'] };

    if (!res.date) {
      const def = opts.defaultDate !== undefined ? opts.defaultDate : (A.data.settings().tasks.defaultDate === 'today' ? A.ymd(nowD) : null);
      res.date = def;
    }
    return res;
  }

  window.AOS.parser = { parse, CATEGORIES, TYPE_LABELS, ALIASES };
})();
