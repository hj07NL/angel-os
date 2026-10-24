/* Agenda & taken — één geïntegreerd systeem: Vandaag (automatische dagelijst), Dag, Week, Maand, Per vak, Afgerond en Rooster.
   Afspraken, herinneringen en taken staan samen in de agenda en zijn duidelijk te onderscheiden. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, store, t } = A;
  const P = () => A.parser;
  const VIEWS = [['today', 'Vandaag', 'target'], ['day', 'Dag', 'list'], ['week', 'Week', 'layout'], ['month', 'Maand', 'grid'], ['subjects', 'Per vak', 'library'], ['done', 'Afgerond', 'check'], ['rooster', 'Rooster', 'calendar']];
  const TYPES = ['task', 'reminder', 'event', 'homework', 'test', 'project', 'reading'];
  const DEFAULT_SWIPE = { threshold: 0.4, maxTravel: 140, rubberBand: 0.25, axisLockDistance: 6, snapBackMs: 220, completeOutMs: 200, flickVelocity: 0.65, flickMinDistance: 26, ease: 'cubic-bezier(.22,.61,.36,1)' };
  A.DEFAULT_SWIPE = DEFAULT_SWIPE;
  const HOUR_PX = 52, START_H = 0;
  const kindLabel = (k) => P().TYPE_LABELS[k] || k;
  const isEventLike = (i) => i.type === 'event';
  const durMin = (i) => (i.end && i.time ? Math.max(15, A.hmToMin(i.end) - A.hmToMin(i.time)) : isEventLike(i) ? 60 : 30);
  let redraw = () => A.rerender();

  // ---------- Rooster (iCal) ----------
  function parseICS(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/); const out = []; let cur = null;
    const toDate = (v) => { const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/); if (!m) return null; if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))); return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); };
    lines.forEach((l) => {
      if (l === 'BEGIN:VEVENT') cur = {}; else if (l === 'END:VEVENT') { if (cur && cur.start) out.push(cur); cur = null; }
      else if (cur) { const i = l.indexOf(':'); if (i < 0) return; const key = l.slice(0, i).split(';')[0]; const val = l.slice(i + 1).replace(/\\,/g, ',').replace(/\\n/g, ' '); const d = (key === 'DTSTART' || key === 'DTEND') ? toDate(val) : null;
        if (key === 'DTSTART' && d) cur.start = d.toISOString(); if (key === 'DTEND' && d) cur.end = d.toISOString(); if (key === 'SUMMARY') cur.summary = val; if (key === 'LOCATION') cur.location = val; }
    });
    return out;
  }
  A.parseICS = parseICS;
  const hm = (iso) => { const d = new Date(iso); return A.pad2(d.getHours()) + ':' + A.pad2(d.getMinutes()); };
  const lessonsOn = (d) => store.get('rooster', []).filter((e) => A.ymd(new Date(e.start)) === d).sort((a, b) => a.start.localeCompare(b.start));

  // ---------- Dialoog ----------
  function openItemDialog(existing, preset) {
    const it = Object.assign({ type: 'task', priority: 'normal', category: 'overig' }, preset || {}, existing || {});
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
    A.openModal('<h2>' + (existing ? 'Bewerken' : 'Nieuw in je agenda') + '</h2>' +
      '<label class="field">Titel<input class="input" name="title" value="' + esc(it.title || '') + '"></label>' +
      '<div class="row2"><label class="field">Soort<select class="input" name="type">' + TYPES.map((x) => opt(x, kindLabel(x), it.type)).join('') + '</select></label>' +
      '<label class="field">Vak<select class="input" name="subject">' + opt('', 'Geen vak', it.subject || '') + data.subjects().map((s) => opt(s, s, it.subject)).join('') + '</select></label></div>' +
      '<div class="row3"><label class="field">Datum<input class="input" type="date" name="date" value="' + esc(it.date || '') + '"></label><label class="field">Van<input class="input" type="time" name="time" value="' + esc(it.time || '') + '"></label><label class="field">Tot<input class="input" type="time" name="end" value="' + esc(it.end || '') + '"></label></div>' +
      '<div class="row3"><label class="field">Deadline<input class="input" type="date" name="deadline" value="' + esc(it.deadline || '') + '"></label><label class="field">Prioriteit<select class="input" name="priority">' + opt('low', 'laag', it.priority) + opt('normal', 'normaal', it.priority) + opt('high', 'hoog', it.priority) + '</select></label><label class="field">Minuten (schatting)<input class="input" type="number" min="0" name="estimate" value="' + esc(it.estimate || '') + '"></label></div>' +
      '<label class="field">Categorie<select class="input" name="category">' + Object.entries(P().CATEGORIES).map(([k, v]) => opt(k, v, it.category)).join('') + '</select></label>' +
      '<label class="field">Details<textarea class="input" name="details">' + esc(it.details || '') + '</textarea></label>' +
      (existing && (existing.history || []).length ? '<details style="margin-bottom:8px"><summary class="muted" style="cursor:pointer;font-size:13px">Geschiedenis (' + existing.history.length + ')</summary>' + existing.history.slice().reverse().map((h) => '<div class="kv"><span>' + esc(h.action) + (h.from ? ' ' + esc(A.fmtShort(h.from)) + ' → ' + esc(A.fmtShort(h.to)) : '') + '</span><span class="faint">' + esc(A.fmtDateTime(h.at)) + '</span></div>').join('') + '</details>' : '') +
      '<div class="modal-actions">' + (existing ? '<button class="btn btn-danger" data-del style="margin-right:auto">' + t('common.delete') + '</button>' : '') + '<button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-save>' + (existing ? t('common.save') : t('common.add')) + '</button></div>',
      (m, close) => {
        const v = (n) => m.querySelector('[name="' + n + '"]').value;
        m.querySelector('[data-save]').onclick = () => {
          const title = v('title').trim(); if (!title) { A.toast('Geef een titel'); return; }
          if (v('time') && v('end') && A.hmToMin(v('end')) <= A.hmToMin(v('time'))) { A.toast('De eindtijd moet na de begintijd liggen'); return; }
          const rec = { title, type: v('type'), subject: v('subject') || null, date: v('date') || null, time: v('time') || null, end: v('end') || null, deadline: v('deadline') || null, priority: v('priority'), category: v('subject') ? 'school' : v('category'), estimate: v('estimate') ? +v('estimate') : null, details: v('details') };
          if (!rec.date && !rec.deadline) rec.date = A.today();
          if (existing) { const moved = existing.date !== rec.date; A.tasks.updateItem(existing.id, rec, moved ? 'verplaatst naar ' + (rec.date || 'geen datum') : 'bewerkt'); }
          else A.tasks.addItem(rec);
          close(); redraw();
        };
        const del = m.querySelector('[data-del]');
        if (del) del.onclick = async () => { close(); removeItem(existing.id); };
      });
  }
  A.openItemDialog = openItemDialog;
  function removeItem(id) {
    const list = data.items(); const idx = list.findIndex((x) => x.id === id); if (idx < 0) return;
    const [rem] = list.splice(idx, 1); data.saveItems(list); redraw();
    A.toast('“' + rem.title + '” verwijderd', { label: t('common.undo'), run: () => { const l = data.items(); l.splice(idx, 0, rem); data.saveItems(l); redraw(); } });
  }

  // ---------- Taakregel ----------
  function metaChips(it) {
    return '<div class="t-meta"><span class="chip"><span class="dot t-' + esc(it.type) + '"></span>' + esc(kindLabel(it.type)) + '</span>' +
      (it.subject ? '<span class="chip">📚 ' + esc(it.subject) + '</span>' : (it.category && it.category !== 'overig' ? '<span class="chip">' + esc(P().CATEGORIES[it.category] || '') + '</span>' : '')) +
      (it.time ? '<span class="chip">🕑 ' + esc(it.time) + (it.end ? '–' + esc(it.end) : '') + '</span>' : '') +
      (it.deadline ? '<span class="chip" style="color:var(--danger)">⏳ ' + esc(A.fmtShort(it.deadline)) + '</span>' : '') +
      (it.originalDate && it.originalDate !== it.date ? '<span class="chip" title="Oorspronkelijke datum">↪ ' + esc(A.fmtShort(it.originalDate)) + '</span>' : '') +
      (it.estimate ? '<span class="chip">⌛ ' + esc(it.estimate) + ' min</span>' : '') + '</div>';
  }
  function taskRow(it, opts) {
    opts = opts || {};
    return '<div class="task-wrap" data-id="' + esc(it.id) + '"><div class="task-under"><span class="l">✓ Klaar</span><span class="r">Verwijderen</span></div>' +
      '<div class="task ' + (it.done ? 'done' : '') + '" draggable="' + (opts.reorder ? 'true' : 'false') + '">' + (opts.reorder ? '<span class="grip" title="Sleep om te ordenen">' + icon('grip') + '</span>' : '') +
      '<button class="check ' + (it.done ? 'on' : '') + '" data-check aria-label="' + (it.done ? 'Heropenen' : 'Afvinken') + '">' + (it.done ? icon('check') : '') + '</button>' +
      '<div class="t-body"><div class="t-title">' + (it.priority === 'high' ? '<span class="prio-high">! </span>' : '') + esc(it.title) + '</div>' + metaChips(it) + (it.details ? '<div class="muted" style="font-size:13px;margin-top:6px">' + esc(it.details) + '</div>' : '') + '</div>' +
      '<div class="t-actions">' + (opts.move ? '<button class="btn btn-sm" data-tomorrow title="Naar morgen">→ morgen</button>' : '') + '<button class="icon-btn sm" data-edit aria-label="Bewerken">' + icon('pencil') + '</button></div></div></div>';
  }
  function bindTasks(root) {
    const cfg = Object.assign({}, DEFAULT_SWIPE, store.get('swipe', {}));
    let dragId = null;
    root.querySelectorAll('.task-wrap').forEach((w) => {
      const id = w.dataset.id; const card = w.querySelector('.task');
      w.querySelector('[data-check]').onclick = (e) => { e.stopPropagation(); A.tasks.toggleDone(id); redraw(); };
      w.querySelector('[data-edit]').onclick = (e) => { e.stopPropagation(); openItemDialog(data.items().find((x) => x.id === id)); };
      const tm = w.querySelector('[data-tomorrow]'); if (tm) tm.onclick = (e) => { e.stopPropagation(); A.tasks.rollover([id], A.ymd(A.addDays(A.now(), 1))); A.toast('Naar morgen verplaatst'); redraw(); };
      card.ondblclick = () => openItemDialog(data.items().find((x) => x.id === id));
      // herordenen (slepen met de greep)
      card.addEventListener('dragstart', (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      card.addEventListener('dragover', (e) => { if (dragId && dragId !== id) { e.preventDefault(); card.classList.add('drag-over'); } });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drag-over'); if (!dragId || dragId === id) return; const ids = Array.from(root.querySelectorAll('.task-wrap')).map((x) => x.dataset.id).filter((x) => x !== dragId); ids.splice(ids.indexOf(id), 0, dragId); const list = data.items(); ids.forEach((x, i) => { const it = list.find((y) => y.id === x); if (it) it.order = i; }); data.saveItems(list); redraw(); });
      // swipen: rechts = afvinken, links = verwijderen
      let sx = 0, sy = 0, dx = 0, lock = null, t0 = 0, active = false;
      card.addEventListener('pointerdown', (e) => { if (e.target.closest('button') || e.pointerType === 'mouse' && e.target.closest('.grip')) return; active = true; sx = e.clientX; sy = e.clientY; dx = 0; lock = null; t0 = performance.now(); card.style.transition = 'none'; });
      card.addEventListener('pointermove', (e) => {
        if (!active) return; const mx = e.clientX - sx, my = e.clientY - sy;
        if (!lock) { if (Math.abs(mx) > cfg.axisLockDistance && Math.abs(mx) > Math.abs(my)) { lock = 'x'; try { card.setPointerCapture(e.pointerId); } catch (er) {} } else if (Math.abs(my) > cfg.axisLockDistance) { lock = 'y'; active = false; return; } else return; }
        const abs = Math.abs(mx); dx = abs > cfg.maxTravel ? Math.sign(mx) * (cfg.maxTravel + (abs - cfg.maxTravel) * cfg.rubberBand) : mx;
        card.style.transform = 'translateX(' + dx + 'px)';
      });
      const end = () => {
        if (!active) return; active = false;
        const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
        const trig = lock === 'x' && (Math.abs(dx) >= cfg.maxTravel * cfg.threshold || (v >= cfg.flickVelocity && Math.abs(dx) >= cfg.flickMinDistance));
        if (trig) { card.style.transition = 'transform ' + cfg.completeOutMs + 'ms ' + cfg.ease; card.style.transform = 'translateX(' + (dx > 0 ? '110%' : '-110%') + ')'; setTimeout(() => { if (dx > 0) { A.tasks.toggleDone(id); redraw(); } else removeItem(id); }, cfg.completeOutMs); }
        else { card.style.transition = 'transform ' + cfg.snapBackMs + 'ms ' + cfg.ease; card.style.transform = ''; }
      };
      card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    });
  }

  // ---------- App ----------
  A.registerApp({
    id: 'agenda', name: t('app.agenda'), icon: 'calendar', color: 'linear-gradient(160deg,#ff6b6b,#e0245e)', keywords: 'agenda kalender calendar taken tasks focus rooster herinneringen todo',
    render(el, route) {
      const s = data.settings();
      const view = VIEWS.some((v) => v[0] === route.sub[0]) ? route.sub[0] : (route.params.date ? 'day' : (s.tasks.defaultView === 'day' ? 'today' : s.tasks.defaultView));
      let cursor = route.params.date ? A.parseYmd(route.params.date) : A.now();
      let subjFilter = 'all', quickPrio = false;
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="ag"><nav class="ag-side" aria-label="Weergaven">' + VIEWS.map(([k, l, ic]) => '<button class="nav-item ' + (k === view ? 'on' : '') + '" data-view="' + k + '">' + icon(ic) + '<span>' + l + '</span>' + (k === 'today' ? '<small data-cnt></small>' : '') + '</button>').join('') + '<div class="mini-cal"></div></nav><main class="ag-main"></main></div>';
      el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => A.go('agenda', [b.dataset.view], b.dataset.view === 'today' ? null : { date: A.ymd(cursor) })));
      const main = el.querySelector('.ag-main'); const mini = el.querySelector('.mini-cal');

      function drawMini() {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = A.startOfWeek(first);
        const dates = new Set(data.items().filter((i) => !i.done).map((i) => i.date));
        let cells = ''; for (let i = 0; i < 42; i++) { const d = A.addDays(start, i); const k = A.ymd(d); cells += '<button class="' + (d.getMonth() !== cursor.getMonth() ? 'other ' : '') + (k === A.today() ? 'today ' : '') + (k === A.ymd(cursor) ? 'sel ' : '') + (dates.has(k) ? 'has' : '') + '" data-d="' + k + '">' + d.getDate() + '</button>'; }
        mini.innerHTML = '<div class="mc-head"><button class="icon-btn sm" data-mp aria-label="Vorige maand">' + icon('chevL') + '</button><span>' + A.cap(A.MONTHS[cursor.getMonth()]) + ' ' + cursor.getFullYear() + '</span><button class="icon-btn sm" data-mn aria-label="Volgende maand">' + icon('chevR') + '</button></div><div class="mc-grid">' + ['M', 'D', 'W', 'D', 'V', 'Z', 'Z'].map((x) => '<span>' + x + '</span>').join('') + cells + '</div>';
        mini.querySelector('[data-mp]').onclick = () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); draw(); };
        mini.querySelector('[data-mn]').onclick = () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); draw(); };
        mini.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { cursor = A.parseYmd(b.dataset.d); if (view === 'today' || view === 'subjects' || view === 'done') A.go('agenda', ['day'], { date: b.dataset.d }); else draw(); }));
        const cnt = el.querySelector('[data-cnt]'); if (cnt) { const n = data.items().filter((i) => !i.done && (i.date === A.today() || (i.date && i.date < A.today() && i.type !== 'event'))).length; cnt.textContent = n || ''; }
      }

      const quickBar = () => '<div class="quick"><span style="color:var(--accent)">' + icon('sparkles') + '</span><input data-quick placeholder="Snel noteren — bijv. ‘Morgen om 16:00 economie leren’ of ‘Herinner me Joey te appen’" aria-label="Snel noteren"><button class="prio ' + (quickPrio ? 'on' : '') + '" data-prio title="Hoge prioriteit" aria-pressed="' + quickPrio + '">!</button><button class="btn btn-primary" data-qadd>' + t('common.add') + '</button></div><div class="parse-preview" data-preview></div>';
      function bindQuick(defaultDate) {
        const inp = main.querySelector('[data-quick]'); const prev = main.querySelector('[data-preview]'); if (!inp) return;
        const show = () => {
          const v = inp.value.trim();
          if (!v) { prev.innerHTML = '<span class="faint">Zonder datum komt het op ' + (defaultDate === A.today() ? 'vandaag' : A.fmtLong(defaultDate)) + '. Angel vraagt het als iets onduidelijk is.</span>'; return; }
          const r = P().parse(v, { defaultDate });
          prev.innerHTML = '<span class="faint">Angel:</span><span class="chip"><span class="dot t-' + r.type + '"></span>' + esc(kindLabel(r.type)) + '</span><span class="chip">“' + esc(r.title) + '”</span>' + (r.subject ? '<span class="chip on">📚 ' + esc(r.subject) + '</span>' : '') +
            '<span class="chip ' + (r.explicitDate ? 'on' : '') + '">📅 ' + (r.date ? A.fmtLong(r.date) : 'geen datum') + '</span>' + (r.time ? '<span class="chip on">🕑 ' + r.time + (r.end ? '–' + r.end : '') + '</span>' : '') + (r.deadline ? '<span class="chip on">⏳ deadline</span>' : '') + ((r.priority === 'high' || quickPrio) ? '<span class="chip on prio-high">! hoog</span>' : '') + (r.question ? '<span class="chip" style="color:var(--yellow)">? ' + esc(r.question.text) + '</span>' : '');
        };
        const add = async () => {
          const v = inp.value.trim(); if (!v) return;
          const parsed = P().parse(v, { defaultDate });
          if (quickPrio) parsed.priority = 'high';
          if (parsed.question) { A.handleQuickResult({ ok: true, question: parsed.question, parsed, original: v }, v); inp.value = ''; return; }
          const it = A.tasks.addItem({ title: parsed.title, type: parsed.type, date: parsed.date, time: parsed.time, end: parsed.end, deadline: parsed.deadline, subject: parsed.subject, category: parsed.category, priority: parsed.priority });
          inp.value = ''; quickPrio = false; draw();
          A.toast(kindLabel(it.type) + ' toegevoegd' + (it.date ? ' · ' + (it.date === A.today() ? 'vandaag' : A.fmtLong(it.date)) : ''), { label: t('common.undo'), run: () => { data.saveItems(data.items().filter((x) => x.id !== it.id)); draw(); } });
          setTimeout(() => { const i = main.querySelector('[data-quick]'); if (i) i.focus(); }, 10);
        };
        inp.oninput = show; inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
        main.querySelector('[data-qadd]').onclick = add;
        main.querySelector('[data-prio]').onclick = (e) => { quickPrio = !quickPrio; e.currentTarget.classList.toggle('on', quickPrio); show(); };
        show();
      }
      function head(title, step, extra) {
        const h = '<div class="ag-head"><h2>' + esc(title) + '</h2><span class="spacer"></span>' + (extra || '') + (step ? '<button class="icon-btn" data-prev aria-label="Vorige">' + icon('chevL') + '</button><button class="btn btn-sm" data-now>' + t('common.today') + '</button><button class="icon-btn" data-next aria-label="Volgende">' + icon('chevR') + '</button>' : '') + '<button class="btn btn-primary btn-sm" data-new>' + icon('plus') + t('common.new') + '</button></div>';
        setTimeout(() => {
          const p = main.querySelector('[data-prev]'), n = main.querySelector('[data-next]'), nw = main.querySelector('[data-now]');
          if (p) p.onclick = () => { cursor = step(cursor, -1); draw(); }; if (n) n.onclick = () => { cursor = step(cursor, 1); draw(); }; if (nw) nw.onclick = () => { cursor = A.now(); draw(); };
          const nb = main.querySelector('[data-new]'); if (nb) nb.onclick = () => openItemDialog(null, { date: A.ymd(cursor) });
        });
        return h;
      }
      const legend = '<div class="legend"><span><span class="dot t-event"></span>Afspraken</span><span><span class="dot t-task"></span>Taken</span><span><span class="dot t-reminder"></span>Herinneringen</span><span><span class="dot t-test"></span>Toetsen</span><span><span class="dot t-homework"></span>Huiswerk</span><span class="faint">· Sleep om te verplaatsen · klik op een leeg vak voor iets nieuws</span></div>';

      // ---- Vandaag: automatische dagelijst ----
      function drawToday() {
        const d = A.today(); const nowD = A.now(); const pol = data.settings().tasks.rollover;
        const items = data.items();
        const overdue = A.tasks.eligibleRollover(d).sort((a, b) => a.date.localeCompare(b.date));
        const todays = items.filter((i) => i.date === d);
        const events = todays.filter(isEventLike).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const reminders = todays.filter((i) => i.type === 'reminder').sort((a, b) => (a.done - b.done) || (a.time || '99').localeCompare(b.time || '99'));
        const tasks = todays.filter((i) => !isEventLike(i) && i.type !== 'reminder').sort((a, b) => (a.done - b.done) || ((a.order ?? 0) - (b.order ?? 0)));
        const dueToday = items.filter((i) => !i.done && i.deadline === d && i.date !== d);
        // voorbereiden: toetsen/deadlines binnen 3 dagen waarvoor nog geen voorbereidingstaak bestaat
        const soon = items.filter((i) => !i.done && (i.type === 'test' || i.deadline) && (i.deadline || i.date) > d && (i.deadline || i.date) <= A.ymd(A.addDays(nowD, 3)) && !items.some((x) => x.prepFor === i.id));
        const lessons = lessonsOn(d);
        const all = tasks.concat(reminders); const done = all.filter((i) => i.done).length; const pct = all.length ? Math.round(done / all.length * 100) : 0;
        const openToday = all.filter((i) => !i.done);
        const late = nowD.getHours() >= 20 && openToday.length && pol !== 'auto';
        main.innerHTML = quickBar() + '<div class="ag-head"><div><div class="label" style="color:var(--accent)">' + t('common.today') + '</div><h2 style="margin-top:2px">' + esc(A.fmtLong(d)) + '</h2></div><span class="spacer"></span><button class="btn btn-primary btn-sm" data-new>' + icon('plus') + t('common.new') + '</button></div>' +
          (overdue.length && pol !== 'auto' ? '<div class="banner">' + icon('alert') + '<span style="flex:1">' + overdue.length + ' onafgemaakte ' + (overdue.length === 1 ? 'taak' : 'taken') + ' van eerdere dagen.</span><button class="btn btn-sm btn-primary" data-roll-today>Naar vandaag</button><button class="btn btn-sm" data-roll-tomorrow>Naar morgen</button></div>' : '') +
          (late ? '<div class="banner">' + icon('clock') + '<span style="flex:1">Het is al laat — ' + openToday.length + ' ' + (openToday.length === 1 ? 'taak staat' : 'taken staan') + ' nog open. Naar morgen verplaatsen?</span><button class="btn btn-sm btn-primary" data-late-roll>Naar morgen</button></div>' : '') +
          '<div class="today-grid"><div>' +
          (overdue.length ? '<section class="task-section"><div class="label" style="color:var(--danger)">' + icon('alert') + t('task.overdue') + ' (' + overdue.length + ')</div><div class="task-list">' + overdue.map((i) => taskRow(i, { move: true })).join('') + '</div></section>' : '') +
          (events.length ? '<section class="task-section"><div class="label">' + icon('calendar') + 'Afspraken vandaag</div><div class="task-list">' + events.map((i) => taskRow(i)).join('') + '</div></section>' : '') +
          (soon.length ? '<section class="task-section"><div class="label">' + icon('target') + 'Voorbereiden</div><div class="task-list">' + soon.map((i) => '<div class="task"><span class="dot t-' + esc(i.type) + '" style="margin-top:7px"></span><div class="t-body"><div class="t-title">' + esc(i.title) + '</div><div class="muted" style="font-size:13px">' + esc(kindLabel(i.type)) + ' op ' + esc(A.fmtLong(i.deadline || i.date)) + '</div></div><button class="btn btn-sm" data-prep="' + esc(i.id) + '">+ Voorbereiden vandaag</button></div>').join('') + '</div></section>' : '') +
          '<section class="task-section"><div class="label">' + icon('check') + 'Taken (' + tasks.filter((i) => !i.done).length + ' open)</div><div class="task-list" data-reorder>' + (tasks.length ? tasks.map((i) => taskRow(i, { reorder: !i.done })).join('') : '<div class="empty">' + t('task.noneToday') + ' Typ hierboven iets bij <i>Snel noteren</i>.</div>') + '</div></section>' +
          (reminders.length ? '<section class="task-section"><div class="label">' + icon('bell') + 'Herinneringen</div><div class="task-list">' + reminders.map((i) => taskRow(i)).join('') + '</div></section>' : '') +
          (dueToday.length ? '<section class="task-section"><div class="label" style="color:var(--danger)">⏳ Deadline vandaag</div><div class="task-list">' + dueToday.map((i) => taskRow(i)).join('') + '</div></section>' : '') +
          '</div><aside style="display:flex;flex-direction:column;gap:12px">' +
          '<div class="card"><div style="display:flex;justify-content:space-between"><span class="label">Voortgang</span><b style="color:var(--ok)">' + pct + '%</b></div><div style="font-size:34px;font-weight:700;margin-top:6px;letter-spacing:-.02em">' + done + '<span class="muted" style="font-size:18px"> / ' + all.length + '</span></div><div class="progress"><div style="width:' + pct + '%"></div></div><div class="muted" style="font-size:13px">taken en herinneringen afgerond</div></div>' +
          '<div class="card"><div class="label">Rooster</div>' + (lessons.length ? lessons.map((l) => '<div class="kv"><span>' + hm(l.start) + '</span><span style="text-align:right">' + esc(l.summary || '') + '</span></div>').join('') : '<p class="muted" style="font-size:13px;margin:8px 0 0">Geen lessen. <a href="#/agenda/rooster">Rooster koppelen</a></p>') + '</div>' +
          '<div class="card"><div class="label">Tips</div><p class="muted" style="font-size:13px;line-height:1.5;margin:8px 0 0">Swipe naar rechts om af te vinken, naar links om te verwijderen. Sleep aan ⋮⋮ om te ordenen. Dubbelklik om te bewerken. Onafgemaakt doorschuiven: <a href="#/settings?section=taken">' + esc(t('roll.' + pol)) + '</a>.</p></div></aside></div>';
        bindQuick(d); bindTasks(main);
        main.querySelector('[data-new]').onclick = () => openItemDialog(null, { date: d });
        const r1 = main.querySelector('[data-roll-today]'); if (r1) r1.onclick = () => { const n = A.tasks.rollover(overdue.map((x) => x.id), d); A.toast(t('task.rolled', { n })); draw(); };
        const r2 = main.querySelector('[data-roll-tomorrow]'); if (r2) r2.onclick = () => { const n = A.tasks.rollover(overdue.map((x) => x.id), A.ymd(A.addDays(nowD, 1))); A.toast(t('task.rolled', { n })); draw(); };
        const lr = main.querySelector('[data-late-roll]'); if (lr) lr.onclick = () => { const n = A.tasks.rollover(openToday.filter((x) => x.type !== 'event').map((x) => x.id), A.ymd(A.addDays(nowD, 1))); A.toast(t('task.rolled', { n }) + ' naar morgen'); draw(); };
        main.querySelectorAll('[data-prep]').forEach((b) => (b.onclick = () => { const src = data.items().find((x) => x.id === b.dataset.prep); A.tasks.addItem({ title: 'Voorbereiden: ' + src.title, type: 'homework', subject: src.subject, category: src.subject ? 'school' : 'overig', date: d, prepFor: src.id }); draw(); }));
      }

      // ---- Tijdraster (dag/week) ----
      function timeGrid(days) {
        const items = data.items(); const nowD = A.now();
        const cols = days.length;
        const gridCols = '56px repeat(' + cols + ', minmax(0, 1fr))';
        const headH = '<div class="tgrid-head" style="grid-template-columns:' + gridCols + '"><div></div>' + days.map((d) => '<div class="' + (A.ymd(d) === A.today() ? 'today' : '') + '">' + A.DAYS_SHORT[d.getDay()] + '<b>' + d.getDate() + '</b></div>').join('') + '</div>';
        const allday = '<div class="tgrid-allday" style="grid-template-columns:' + gridCols + '"><div>hele dag</div>' + days.map((d) => { const k = A.ymd(d); const l = items.filter((i) => (i.date === k && !i.time) || (i.deadline === k && i.date !== k && !i.done)); return '<div data-drop="' + k + '">' + l.map((i) => '<div class="mini-item ' + (i.done ? 'done' : '') + '" draggable="true" data-id="' + esc(i.id) + '"><span class="dot t-' + esc(i.type) + '"></span>' + (i.deadline === k && i.date !== k ? '⏳ ' : '') + esc(i.title) + '</div>').join('') + '</div>'; }).join('') + '</div>';
        let hours = ''; for (let h = START_H; h < 24; h++) hours += '<div class="thour">' + A.pad2(h) + ':00</div>';
        const colsHtml = days.map((d) => {
          const k = A.ymd(d);
          const timed = items.filter((i) => i.date === k && i.time);
          const les = lessonsOn(k);
          let slots = ''; for (let h = START_H; h < 24; h++) slots += '<div class="tslot" data-slot="' + h + '"></div>';
          const evs = timed.map((i) => { const top = (A.hmToMin(i.time) - START_H * 60) / 60 * HOUR_PX; const hgt = Math.max(22, durMin(i) / 60 * HOUR_PX - 2); return '<div class="tevent k-' + esc(i.type) + (i.done ? ' done' : '') + '" draggable="true" data-id="' + esc(i.id) + '" style="top:' + top + 'px;height:' + hgt + 'px" title="' + esc(i.title) + '"><b>' + esc(i.title) + '</b>' + esc(i.time) + (i.end ? '–' + esc(i.end) : '') + '</div>'; }).join('') +
            les.map((l) => { const st = new Date(l.start), en = l.end ? new Date(l.end) : new Date(st.getTime() + 3000000); const top = (st.getHours() * 60 + st.getMinutes() - START_H * 60) / 60 * HOUR_PX; const hgt = Math.max(20, (en - st) / 3600000 * HOUR_PX - 2); return '<div class="tevent" style="top:' + top + 'px;height:' + hgt + 'px;opacity:.7;cursor:default" title="Rooster"><b>' + esc(l.summary || 'Les') + '</b>' + hm(l.start) + (l.location ? ' · ' + esc(l.location) : '') + '</div>'; }).join('');
          const nowLine = k === A.today() ? '<div class="now-line" style="top:' + ((nowD.getHours() * 60 + nowD.getMinutes() - START_H * 60) / 60 * HOUR_PX) + 'px"></div>' : '';
          return '<div class="tcol ' + (k === A.today() ? 'today' : '') + '" data-col="' + k + '">' + slots + evs + nowLine + '</div>';
        }).join('');
        return '<div class="tgrid">' + headH + allday + '<div class="tgrid-body" style="grid-template-columns:' + gridCols + '"><div>' + hours + '</div>' + colsHtml + '</div></div>';
      }
      function bindGrid() {
        main.querySelectorAll('[data-id]').forEach((e) => {
          e.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', e.dataset.id); const r = e.getBoundingClientRect(); ev.dataTransfer.setData('offset', String(ev.clientY - r.top)); });
          e.addEventListener('click', (ev) => { ev.stopPropagation(); openItemDialog(data.items().find((x) => x.id === e.dataset.id)); });
        });
        main.querySelectorAll('.tcol').forEach((col) => {
          col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
          col.addEventListener('dragleave', () => col.classList.remove('drop'));
          col.addEventListener('drop', (e) => {
            e.preventDefault(); col.classList.remove('drop');
            const id = e.dataTransfer.getData('text/plain'); if (!id) return; const off = +(e.dataTransfer.getData('offset') || 0);
            const y = e.clientY - col.getBoundingClientRect().top - off;
            const mins = Math.max(0, Math.min(23 * 60 + 45, Math.round((y / HOUR_PX * 60 + START_H * 60) / 15) * 15));
            const it = data.items().find((x) => x.id === id); if (!it) return;
            const dur = it.time ? durMin(it) : (isEventLike(it) ? 60 : 30);
            A.tasks.updateItem(id, { date: col.dataset.col, time: A.minToHm(mins), end: it.end || isEventLike(it) ? A.minToHm(Math.min(24 * 60 - 1, mins + dur)) : null }, 'verplaatst naar ' + col.dataset.col + ' ' + A.minToHm(mins));
            A.toast('Verplaatst naar ' + A.fmtLong(col.dataset.col) + ' ' + A.minToHm(mins)); draw();
          });
          col.addEventListener('click', (e) => { if (e.target.closest('.tevent')) return; const y = e.clientY - col.getBoundingClientRect().top; const mins = Math.round((y / HOUR_PX * 60 + START_H * 60) / 30) * 30; openItemDialog(null, { date: col.dataset.col, time: A.minToHm(mins), end: A.minToHm(Math.min(1439, mins + 60)), type: 'event' }); });
        });
        main.querySelectorAll('.tgrid-allday [data-drop]').forEach((c) => {
          c.addEventListener('dragover', (e) => { e.preventDefault(); }); c.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (!id) return; A.tasks.updateItem(id, { date: c.dataset.drop, time: null, end: null }, 'verplaatst naar ' + c.dataset.drop); draw(); });
        });
        const body = main.querySelector('.tgrid-body'); if (body) body.scrollTop = Math.max(0, (Math.min(A.now().getHours(), 17) - 1 - START_H) * HOUR_PX);
      }
      function drawDay() {
        main.innerHTML = quickBar() + head(A.fmtLong(cursor), (c, n) => A.addDays(c, n)) + legend + timeGrid([cursor]);
        bindQuick(A.ymd(cursor)); bindGrid();
      }
      function drawWeek() {
        const st = A.startOfWeek(cursor); const days = [0, 1, 2, 3, 4, 5, 6].map((i) => A.addDays(st, i)); const en = days[6];
        main.innerHTML = quickBar() + head('Week ' + A.weekNumber(st) + ' · ' + st.getDate() + ' ' + A.MONTHS[st.getMonth()].slice(0, 3) + ' – ' + en.getDate() + ' ' + A.MONTHS[en.getMonth()].slice(0, 3), (c, n) => A.addDays(c, 7 * n)) + legend + timeGrid(days);
        bindQuick(A.ymd(cursor)); bindGrid();
      }
      function drawMonth() {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const start = A.startOfWeek(first); const items = data.items();
        let cells = '';
        for (let i = 0; i < 42; i++) {
          const day = A.addDays(start, i); const d = A.ymd(day); if (i >= 35 && day.getMonth() !== cursor.getMonth()) break;
          const list = items.filter((x) => x.date === d || (x.deadline === d && x.date !== d)).sort((a, b) => (a.done - b.done) || (a.time || '99').localeCompare(b.time || '99'));
          cells += '<div class="mcell ' + (day.getMonth() !== cursor.getMonth() ? 'other ' : '') + (d === A.today() ? 'today' : '') + '" data-drop="' + d + '" data-day="' + d + '"><span class="n">' + day.getDate() + '</span>' + list.slice(0, 3).map((it) => '<div class="mini-item ' + (it.done ? 'done' : '') + '" draggable="true" data-id="' + esc(it.id) + '"><span class="dot t-' + esc(it.type) + '"></span><span>' + (it.time ? '<b>' + esc(it.time) + '</b> ' : '') + esc(it.title) + '</span></div>').join('') + (list.length > 3 ? '<span class="faint" style="font-size:11px">+' + (list.length - 3) + ' meer</span>' : '') + '</div>';
        }
        main.innerHTML = quickBar() + head(A.cap(A.MONTHS[cursor.getMonth()]) + ' ' + cursor.getFullYear(), (c, n) => new Date(c.getFullYear(), c.getMonth() + n, 1)) + legend + '<div class="month">' + ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((x) => '<div class="dow">' + x + '</div>').join('') + cells + '</div>';
        bindQuick(A.ymd(cursor));
        main.querySelectorAll('.mini-item[data-id]').forEach((e) => { e.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', e.dataset.id)); e.addEventListener('click', (ev) => { ev.stopPropagation(); openItemDialog(data.items().find((x) => x.id === e.dataset.id)); }); });
        main.querySelectorAll('[data-drop]').forEach((c) => { c.addEventListener('dragover', (e) => { e.preventDefault(); c.classList.add('drop'); }); c.addEventListener('dragleave', () => c.classList.remove('drop')); c.addEventListener('drop', (e) => { e.preventDefault(); c.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (!id) return; A.tasks.updateItem(id, { date: c.dataset.drop }, 'verplaatst naar ' + c.dataset.drop); A.toast('Verplaatst naar ' + A.fmtLong(c.dataset.drop)); draw(); }); });
        main.querySelectorAll('[data-day]').forEach((c) => (c.onclick = () => A.go('agenda', ['day'], { date: c.dataset.day })));
      }
      function drawSubjects() {
        const subj = data.subjects(); const items = data.items(); const shown = subjFilter === 'all' ? subj : [subjFilter];
        main.innerHTML = '<div class="ag-head" style="margin-top:0"><div><h2>Per vak</h2><div class="muted" style="font-size:13px;margin-top:4px">Wat er per vak nog openstaat, inclusief deadlines.</div></div></div><div class="tags" style="margin-bottom:16px"><button class="chip ' + (subjFilter === 'all' ? 'on' : '') + '" data-sf="all">Alles</button>' + subj.map((s2) => '<button class="chip ' + (subjFilter === s2 ? 'on' : '') + '" data-sf="' + esc(s2) + '">' + esc(s2) + '</button>').join('') + '</div><div class="subject-grid">' +
          shown.map((s2) => { const open = items.filter((i) => i.subject === s2 && !i.done).sort((a, b) => (a.deadline || a.date || '9').localeCompare(b.deadline || b.date || '9')); const dn = items.filter((i) => i.subject === s2 && i.done).length;
            return '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(s2) + '</b><span class="muted" style="font-size:12px">' + open.length + ' open · ' + dn + ' klaar</span></div>' + (open.length ? '<div style="display:flex;flex-direction:column;gap:6px;margin:10px 0">' + open.map((i) => '<div class="mini-item" data-id="' + esc(i.id) + '"><span class="dot t-' + esc(i.type) + '"></span><span style="flex:1">' + esc(i.title) + '</span><span class="faint">' + (i.deadline ? '⏳ ' + A.fmtShort(i.deadline) : i.date ? A.fmtShort(i.date) : '') + '</span></div>').join('') + '</div>' : '<p class="muted" style="font-size:13px">Niets open. Lekker bezig ✓</p>') + '<button class="add-mini" style="width:100%" data-add-subj="' + esc(s2) + '">+ Taak met deadline</button></div>'; }).join('') + '</div>';
        main.querySelectorAll('[data-sf]').forEach((b) => (b.onclick = () => { subjFilter = b.dataset.sf; draw(); }));
        main.querySelectorAll('[data-add-subj]').forEach((b) => (b.onclick = () => openItemDialog(null, { subject: b.dataset.addSubj, type: 'homework', category: 'school', date: A.today(), deadline: A.ymd(A.addDays(A.now(), 7)) })));
        main.querySelectorAll('.mini-item[data-id]').forEach((m) => (m.onclick = () => openItemDialog(data.items().find((x) => x.id === m.dataset.id))));
      }
      function drawDone() {
        const list = data.items().filter((i) => i.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
        main.innerHTML = '<div class="ag-head" style="margin-top:0"><div><h2>Afgerond</h2><div class="muted" style="font-size:13px;margin-top:4px">' + list.length + ' gedaan, nieuwste eerst.</div></div><span class="spacer"></span>' + (list.length ? '<button class="btn btn-sm btn-danger" data-clear>Opruimen</button>' : '') + '</div><div class="task-list">' + (list.length ? list.map((i) => taskRow(i)).join('') : '<div class="empty">Nog niets afgerond.</div>') + '</div>';
        bindTasks(main);
        const c = main.querySelector('[data-clear]'); if (c) c.onclick = async () => { if (await A.confirmDialog('Alle ' + list.length + ' afgeronde items verwijderen?', t('common.delete'), 'Dit kan niet ongedaan worden gemaakt.')) { data.saveItems(data.items().filter((i) => !i.done)); draw(); } };
      }
      function drawRooster() {
        const d = A.ymd(cursor); const ev = store.get('rooster', []); const lessons = lessonsOn(d);
        let body;
        if (!ev.length) body = '<div class="empty">Nog geen rooster gekoppeld. Voeg je Somtoday- of Google Agenda-link (iCal) toe, of importeer een .ics-bestand.<div style="margin-top:14px"><button class="btn btn-primary" data-link>Rooster koppelen</button></div></div>';
        else if (!lessons.length) body = '<div class="empty">Geen lessen of afspraken op deze dag. Je bent vrij 🎉</div>';
        else { const rows = []; lessons.forEach((l, i) => { if (i > 0) { const gap = (new Date(l.start) - new Date(lessons[i - 1].end || lessons[i - 1].start)) / 60000; if (gap >= 30) rows.push('<div class="free-slot">Vrij · ' + Math.round(gap) + ' min</div>'); } rows.push('<div class="lesson"><time>' + hm(l.start) + (l.end ? '–' + hm(l.end) : '') + '</time><div><b>' + esc(l.summary || 'Les') + '</b>' + (l.location ? '<div class="muted" style="font-size:13px">' + esc(l.location) + '</div>' : '') + '</div></div>'); }); const le = lessons[lessons.length - 1].end; if (le) rows.push('<div class="free-slot">Vrij vanaf ' + hm(le) + '</div>'); body = '<div style="display:flex;flex-direction:column;gap:8px">' + rows.join('') + '</div>'; }
        main.innerHTML = head('Rooster · ' + A.fmtLong(d), (c, n) => A.addDays(c, n), ev.length ? '<button class="btn btn-sm" data-link>Agenda\'s</button>' : '') + body;
        main.querySelectorAll('[data-link]').forEach((b) => (b.onclick = () => A.go('settings', null, { section: 'agendas' })));
      }

      function draw() { drawMini(); ({ today: drawToday, day: drawDay, week: drawWeek, month: drawMonth, subjects: drawSubjects, done: drawDone, rooster: drawRooster })[view](); }
      redraw = () => { if (document.querySelector('.ag')) draw(); else A.rerender(); };
      draw();
      const iv = setInterval(() => { const nl = main.querySelector('.now-line'); if (nl) { const n = A.now(); nl.style.top = ((n.getHours() * 60 + n.getMinutes() - START_H * 60) / 60 * HOUR_PX) + 'px'; } }, 60000);
      const off = A.bus.on('data', (k) => { if (k === 'items' && !document.querySelector('.modal')) { /* externe wijziging (bijv. eiland) */ } });
      return () => { clearInterval(iv); off(); redraw = () => A.rerender(); };
    }
  });
})();
