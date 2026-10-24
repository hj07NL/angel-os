/* Agenda & taken — Angel OS-agenda gecombineerd met Focus (Vandaag, Week, Maand, Vakken, Afgerond, Rooster) */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data } = A;
  const P = () => A.parser;

  const VIEWS = [
    { id: 'today', label: 'Vandaag', ic: 'target' },
    { id: 'week', label: 'Week', ic: 'list' },
    { id: 'month', label: 'Maand', ic: 'grid' },
    { id: 'subjects', label: 'Vakken', ic: 'library' },
    { id: 'done', label: 'Afgerond', ic: 'check' },
    { id: 'rooster', label: 'Rooster', ic: 'calendar' }
  ];
  const TYPES = ['task', 'reminder', 'event', 'homework', 'test', 'project', 'reading'];
  const DEFAULT_SWIPE = { threshold: 0.4, maxTravel: 140, rubberBand: 0.25, axisLockDistance: 6, snapBackMs: 220, completeOutMs: 200, flickVelocity: 0.65, flickMinDistance: 26, ease: 'cubic-bezier(.22,.61,.36,1)' };
  A.DEFAULT_SWIPE = DEFAULT_SWIPE;

  // ---------- Data-helpers ----------
  function addItem(rec) {
    const list = data.items();
    const item = Object.assign({ id: A.uid(), title: '', type: 'task', date: A.today(), time: null, deadline: null, subject: null, category: 'overig', priority: 'normal', estimate: null, details: '', done: false, doneAt: null, createdAt: new Date().toISOString() }, rec);
    list.push(item); data.saveItems(list);
    return item;
  }
  function updateItem(id, patch) { const list = data.items(); const it = list.find((x) => x.id === id); if (it) Object.assign(it, patch); data.saveItems(list); return it; }
  const redrawAny = () => { if (A._agendaDraw && document.querySelector('.ag')) A._agendaDraw(); else A.rerender(); };
  function removeItem(id) {
    const list = data.items(); const idx = list.findIndex((x) => x.id === id); if (idx < 0) return;
    const [rem] = list.splice(idx, 1); data.saveItems(list);
    A.toast('“' + rem.title + '” verwijderd', { label: 'Ongedaan maken', run: () => { const l = data.items(); l.splice(idx, 0, rem); data.saveItems(l); redrawAny(); } });
  }
  function toggleDone(id) { const it = data.items().find((x) => x.id === id); if (it) updateItem(id, { done: !it.done, doneAt: it.done ? null : new Date().toISOString() }); }
  A.agenda = { addItem, updateItem, removeItem };

  const sortItems = (a, b) => (a.done - b.done) || ((b.priority === 'high') - (a.priority === 'high')) || ((a.time || '99') .localeCompare(b.time || '99')) || a.createdAt.localeCompare(b.createdAt);

  // ---------- Rooster (iCal) ----------
  function parseICS(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let cur = null;
    const toDate = (v) => {
      const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
      if (!m) return null;
      if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    };
    lines.forEach((l) => {
      if (l === 'BEGIN:VEVENT') cur = {};
      else if (l === 'END:VEVENT') { if (cur && cur.start) out.push(cur); cur = null; }
      else if (cur) {
        const i = l.indexOf(':'); if (i < 0) return;
        const key = l.slice(0, i).split(';')[0]; const val = l.slice(i + 1).replace(/\\,/g, ',').replace(/\\n/g, ' ');
        if (key === 'DTSTART') cur.start = toDate(val)?.toISOString();
        if (key === 'DTEND') cur.end = toDate(val)?.toISOString();
        if (key === 'SUMMARY') cur.summary = val;
        if (key === 'LOCATION') cur.location = val;
      }
    });
    return out;
  }
  A.parseICS = parseICS;
  function lessonsOn(dateStr) {
    return A.store.get('rooster', []).filter((e) => A.ymd(new Date(e.start)) === dateStr).sort((a, b) => a.start.localeCompare(b.start));
  }
  const hm = (iso) => { const d = new Date(iso); return A.pad2(d.getHours()) + ':' + A.pad2(d.getMinutes()); };

  // ---------- Dialoog ----------
  function openItemDialog(existing, preset) {
    const it = Object.assign({ type: 'task', priority: 'normal', category: 'overig' }, preset || {}, existing || {});
    const subj = data.subjects();
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
    A.openModal(
      '<h2>' + (existing ? 'Item bewerken' : 'Nieuwe taak of opdracht') + '</h2>' +
      '<label class="field">Titel<input class="input" name="title" value="' + esc(it.title || '') + '"></label>' +
      '<div class="row2"><label class="field">Type<select class="input" name="type">' + TYPES.map((t) => opt(t, P().TYPE_LABELS[t], it.type)).join('') + '</select></label>' +
      '<label class="field">Vak<select class="input" name="subject">' + opt('', 'Geen vak', it.subject || '') + subj.map((s) => opt(s, s, it.subject)).join('') + '</select></label></div>' +
      '<div class="row2"><label class="field">Datum<input class="input" type="date" name="date" value="' + esc(it.date || '') + '"></label>' +
      '<label class="field">Tijd<input class="input" type="time" name="time" value="' + esc(it.time || '') + '"></label></div>' +
      '<div class="row2"><label class="field">Deadline<input class="input" type="date" name="deadline" value="' + esc(it.deadline || '') + '"></label>' +
      '<label class="field">Prioriteit<select class="input" name="priority">' + opt('low', 'laag', it.priority) + opt('normal', 'normaal', it.priority) + opt('high', 'hoog', it.priority) + '</select></label></div>' +
      '<div class="row2"><label class="field">Categorie<select class="input" name="category">' + Object.entries(P().CATEGORIES).map(([k, v]) => opt(k, v, it.category)).join('') + '</select></label>' +
      '<label class="field">Schatting (minuten)<input class="input" type="number" min="0" name="estimate" value="' + esc(it.estimate || '') + '"></label></div>' +
      '<label class="field">Details<textarea class="input" name="details">' + esc(it.details || '') + '</textarea></label>' +
      '<div class="modal-actions">' + (existing ? '<button class="btn btn-danger" data-del style="margin-right:auto">Verwijderen</button>' : '') + '<button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-save>' + (existing ? 'Opslaan' : 'Toevoegen') + '</button></div>',
      (m, close) => {
        const v = (n) => m.querySelector('[name="' + n + '"]').value;
        m.querySelector('[data-save]').onclick = () => {
          const title = v('title').trim();
          if (!title) { A.toast('Geef een titel'); return; }
          const rec = { title, type: v('type'), subject: v('subject') || null, date: v('date') || null, time: v('time') || null, deadline: v('deadline') || null, priority: v('priority'), category: v('subject') ? 'school' : v('category'), estimate: v('estimate') ? +v('estimate') : null, details: v('details') };
          if (!rec.date && !rec.deadline) rec.date = A.today();
          if (existing) updateItem(existing.id, rec); else addItem(rec);
          close(); redrawAny();
        };
        const del = m.querySelector('[data-del]');
        if (del) del.onclick = () => { close(); removeItem(existing.id); redrawAny(); };
      });
  }
  A.openItemDialog = openItemDialog;

  // ---------- Weergave-onderdelen ----------
  function metaChips(it) {
    const cats = P().CATEGORIES;
    return '<div class="t-meta">' +
      '<span class="chip"><span class="dot t-' + esc(it.type) + '"></span>' + esc(P().TYPE_LABELS[it.type] || it.type) + '</span>' +
      (it.subject ? '<span class="chip">📚 ' + esc(it.subject) + '</span>' : '<span class="chip">' + esc(cats[it.category] || cats.overig) + '</span>') +
      (it.time ? '<span class="chip">🕑 ' + esc(it.time) + '</span>' : '') +
      (it.deadline ? '<span class="chip" style="color:var(--danger)">⏳ ' + esc(A.fmtShort(it.deadline)) + '</span>' : '') +
      (it.estimate ? '<span class="chip">⌛ ' + esc(it.estimate) + ' min</span>' : '') +
      (it.priority === 'high' ? '<span class="chip prio-high">! hoog</span>' : '') +
      '</div>';
  }

  function taskRow(it) {
    return '<div class="task-wrap" data-id="' + esc(it.id) + '"><div class="task-under"><span class="l">✓ Klaar</span><span class="r">Verwijderen</span></div>' +
      '<div class="task ' + (it.done ? 'done' : '') + '"><button class="check ' + (it.done ? 'on' : '') + '" data-check aria-label="Markeren als afgerond">' + (it.done ? icon('check') : '') + '</button>' +
      '<div class="t-body"><div class="t-title">' + (it.priority === 'high' ? '<span class="prio-high">! </span>' : '') + esc(it.title) + '</div>' + metaChips(it) + (it.details ? '<div class="muted" style="font-size:13px;margin-top:6px">' + esc(it.details) + '</div>' : '') + '</div>' +
      '<div class="t-actions"><button class="icon-btn" data-edit aria-label="Bewerken">' + icon('pencil') + '</button><button class="icon-btn" data-del aria-label="Verwijderen">' + icon('trash') + '</button></div></div></div>';
  }

  function bindTasks(root, redraw) {
    const cfg = Object.assign({}, DEFAULT_SWIPE, A.store.get('swipe', {}));
    root.querySelectorAll('.task-wrap').forEach((w) => {
      const id = w.dataset.id;
      const card = w.querySelector('.task');
      w.querySelector('[data-check]').onclick = (e) => { e.stopPropagation(); toggleDone(id); redraw(); };
      w.querySelector('[data-edit]').onclick = (e) => { e.stopPropagation(); openItemDialog(data.items().find((x) => x.id === id)); };
      w.querySelector('[data-del]').onclick = (e) => { e.stopPropagation(); removeItem(id); redraw(); };
      card.ondblclick = () => openItemDialog(data.items().find((x) => x.id === id));
      // swipe: rechts = afvinken, links = verwijderen
      let sx = 0, sy = 0, dx = 0, lock = null, t0 = 0, active = false;
      card.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        active = true; sx = e.clientX; sy = e.clientY; dx = 0; lock = null; t0 = performance.now();
        card.style.transition = 'none';
      });
      card.addEventListener('pointermove', (e) => {
        if (!active) return;
        const mx = e.clientX - sx, my = e.clientY - sy;
        if (!lock) { if (Math.abs(mx) > cfg.axisLockDistance) { lock = 'x'; try { card.setPointerCapture(e.pointerId); } catch (er) {} } else if (Math.abs(my) > cfg.axisLockDistance) { lock = 'y'; active = false; return; } else return; }
        const abs = Math.abs(mx);
        dx = abs > cfg.maxTravel ? Math.sign(mx) * (cfg.maxTravel + (abs - cfg.maxTravel) * cfg.rubberBand) : mx;
        card.style.transform = 'translateX(' + dx + 'px)';
      });
      const end = () => {
        if (!active) return; active = false;
        const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
        const trigger = Math.abs(dx) >= cfg.maxTravel * cfg.threshold || (v >= cfg.flickVelocity && Math.abs(dx) >= cfg.flickMinDistance);
        if (lock === 'x' && trigger) {
          card.style.transition = 'transform ' + cfg.completeOutMs + 'ms ' + cfg.ease;
          card.style.transform = 'translateX(' + (dx > 0 ? '110%' : '-110%') + ')';
          setTimeout(() => { if (dx > 0) toggleDone(id); else removeItem(id); redraw(); }, cfg.completeOutMs);
        } else {
          card.style.transition = 'transform ' + cfg.snapBackMs + 'ms ' + cfg.ease;
          card.style.transform = '';
        }
      };
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    });
  }

  function dragBind(root, redraw) {
    root.querySelectorAll('[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
      el.addEventListener('click', (e) => { e.stopPropagation(); openItemDialog(data.items().find((x) => x.id === el.dataset.id)); });
    });
    root.querySelectorAll('[data-drop]').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        if (id) { updateItem(id, { date: col.dataset.drop }); A.toast('Verplaatst naar ' + A.fmtLong(col.dataset.drop)); redraw(); }
      });
    });
  }

  function miniItem(it) {
    return '<div class="mini-item ' + (it.done ? 'done' : '') + '" draggable="true" data-id="' + esc(it.id) + '" title="' + esc(it.title) + '"><span class="dot t-' + esc(it.type) + '"></span><span>' + (it.time ? '<b>' + esc(it.time) + '</b> ' : '') + esc(it.title) + '</span></div>';
  }

  // ---------- App ----------
  A.registerApp({
    id: 'agenda', name: 'Agenda & taken', icon: 'calendar', dock: true, keywords: 'focus taken todo rooster deadline vakken',
    color: 'linear-gradient(135deg,#f87171,#dc2626)',
    render(el, route) {
      const view = VIEWS.some((v) => v.id === route.sub[0]) ? route.sub[0] : 'today';
      let cursor = route.params.date ? A.parseYmd(route.params.date) : new Date();
      let subjFilter = 'all';
      let quickPrio = false;
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="ag"><nav class="ag-side"><div class="brand"><b>FOCUS</b><div class="muted" style="font-size:13px;margin-top:4px">Taken &amp; rooster</div></div>' +
        VIEWS.map((v) => '<button class="nav-item ' + (v.id === view ? 'on' : '') + '" data-view="' + v.id + '">' + icon(v.ic) + '<span>' + v.label + '</span></button>').join('') +
        '</nav><main class="ag-main"></main></div>';
      el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => A.go('agenda', [b.dataset.view])));
      const main = el.querySelector('.ag-main');

      const quickBar = () => '<div class="quick"><span style="color:var(--accent)">' + icon('sparkles') + '</span><input data-quick placeholder="Snel noteren — bijv. ‘Morgen om 16:00 economie leren’ of ‘vrijdag toets wiskunde’" aria-label="Snel noteren"><button class="prio ' + (quickPrio ? 'on' : '') + '" data-prio title="Hoge prioriteit">!</button><button class="btn btn-primary" data-qadd>Toevoegen</button></div><div class="parse-preview" data-preview></div>';

      function bindQuick(defaultDate) {
        const inp = main.querySelector('[data-quick]');
        const prev = main.querySelector('[data-preview]');
        if (!inp) return;
        const show = () => {
          const v = inp.value.trim();
          if (!v) { prev.innerHTML = '<span class="faint">ANGEL herkent vak, type, datum, tijd en prioriteit.</span>'; return; }
          const r = P().parse(v, { defaultDate });
          prev.innerHTML = '<span class="faint">ANGEL:</span>' +
            '<span class="chip"><span class="dot t-' + r.type + '"></span>' + P().TYPE_LABELS[r.type] + '</span>' +
            (r.subject ? '<span class="chip on">📚 ' + esc(r.subject) + '</span>' : '<span class="chip">' + P().CATEGORIES[r.category] + '</span>') +
            '<span class="chip ' + (r.found.includes('datum') ? 'on' : '') + '">📅 ' + (r.date ? A.fmtLong(r.date) : 'vandaag') + '</span>' +
            (r.time ? '<span class="chip on">🕑 ' + r.time + '</span>' : '') +
            (r.deadline ? '<span class="chip on">⏳ deadline</span>' : '') +
            ((r.priority === 'high' || quickPrio) ? '<span class="chip on prio-high">! hoog</span>' : '');
        };
        const add = () => {
          const v = inp.value.trim(); if (!v) return;
          const r = P().parse(v, { defaultDate });
          addItem({ title: r.title, type: r.type, date: r.date || defaultDate || A.today(), time: r.time, deadline: r.deadline, subject: r.subject, category: r.category, priority: quickPrio ? 'high' : r.priority });
          inp.value = ''; quickPrio = false; draw();
          A.toast('Toegevoegd' + (r.date ? ' voor ' + A.fmtLong(r.date) : ''));
          setTimeout(() => { const i = main.querySelector('[data-quick]'); if (i) i.focus(); }, 10);
        };
        inp.oninput = show;
        inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
        main.querySelector('[data-qadd]').onclick = add;
        main.querySelector('[data-prio]').onclick = (e) => { quickPrio = !quickPrio; e.currentTarget.classList.toggle('on', quickPrio); show(); };
        show();
      }

      function head(title, nav) {
        return '<div class="ag-head"><h2>' + icon('calendar') + esc(title) + '</h2><span class="spacer"></span>' +
          (nav ? '<button class="icon-btn" data-prev aria-label="Vorige">' + icon('chevL') + '</button><button class="btn btn-sm" data-now>Vandaag</button><button class="icon-btn" data-next aria-label="Volgende">' + icon('chevR') + '</button>' : '') +
          '<button class="btn btn-primary btn-sm" data-new>' + icon('plus') + 'Nieuw</button></div>';
      }
      function bindHead(step) {
        const p = main.querySelector('[data-prev]'), n = main.querySelector('[data-next]'), now = main.querySelector('[data-now]');
        if (p) p.onclick = () => { cursor = step(cursor, -1); draw(); };
        if (n) n.onclick = () => { cursor = step(cursor, 1); draw(); };
        if (now) now.onclick = () => { cursor = new Date(); draw(); };
        main.querySelector('[data-new]').onclick = () => openItemDialog(null, { date: A.ymd(cursor) });
        main.querySelectorAll('h2 svg').forEach((s) => { s.style.cssText = 'width:20px;height:20px;color:var(--accent)'; });
      }
      const legend = '<div class="legend"><span><span class="dot t-task"></span>Taken</span><span><span class="dot t-event"></span>Afspraken</span><span><span class="dot t-reminder"></span>Herinneringen</span><span><span class="dot t-test"></span>Toetsen</span><span><span class="dot t-homework"></span>Huiswerk</span><span>· Sleep een item naar een andere dag om het te verplaatsen</span></div>';

      // ---- Vandaag / dag ----
      function drawToday() {
        const d = A.ymd(cursor);
        const isToday = d === A.today();
        const s = data.settings();
        const all = data.items();
        let overdue = all.filter((i) => !i.done && i.date && i.date < A.today() && i.type !== 'event');
        if (isToday && overdue.length && s.unfinished === 'auto') {
          overdue.forEach((i) => updateItem(i.id, { date: A.today() }));
          A.toast(overdue.length + ' onafgemaakte taken doorgeschoven naar vandaag');
          return draw();
        }
        const list = data.items().filter((i) => i.date === d).sort(sortItems);
        const dueHere = data.items().filter((i) => !i.done && i.deadline === d && i.date !== d);
        const done = list.filter((i) => i.done).length;
        const pct = list.length ? Math.round((done / list.length) * 100) : 0;
        const lessons = lessonsOn(d);
        main.innerHTML = quickBar() +
          '<div class="ag-head"><div><div class="label" style="color:var(--accent)">' + (isToday ? 'Vandaag' : (d < A.today() ? 'Verleden' : 'Gepland')) + '</div><h2 style="margin-top:4px">' + esc(A.fmtLong(d)) + '</h2><div class="muted" style="font-size:13px;margin-top:4px">' + done + ' van ' + list.length + ' afgerond</div></div><span class="spacer"></span>' +
          '<button class="icon-btn" data-prev aria-label="Vorige dag">' + icon('chevL') + '</button><button class="btn btn-sm" data-now>Vandaag</button><button class="icon-btn" data-next aria-label="Volgende dag">' + icon('chevR') + '</button><button class="btn btn-primary btn-sm" data-new>' + icon('plus') + 'Nieuw</button></div>' +
          (isToday && overdue.length && s.unfinished === 'ask' ? '<div class="banner">' + icon('alert') + '<span style="flex:1">' + overdue.length + ' onafgemaakte ' + (overdue.length === 1 ? 'taak' : 'taken') + ' van eerdere dagen.</span><button class="btn btn-sm btn-primary" data-roll>Doorschuiven naar vandaag</button><button class="btn btn-sm" data-dismiss>Laten staan</button></div>' : '') +
          '<div class="ag-today"><div><div class="task-list">' +
          (list.length ? list.map(taskRow).join('') : '<div class="empty">Niets gepland voor ' + (isToday ? 'vandaag' : 'deze dag') + '. Typ hierboven iets bij <i>Snel noteren</i>.</div>') +
          (dueHere.length ? '<div class="label" style="margin-top:14px">Deadlines op deze dag</div>' + dueHere.map(taskRow).join('') : '') +
          '</div></div><aside style="display:flex;flex-direction:column;gap:12px">' +
          '<div class="card"><div style="display:flex;justify-content:space-between"><span class="label">Voortgang</span><span style="color:var(--accent);font-weight:700">' + pct + '%</span></div><div style="font-size:34px;font-weight:800;margin-top:8px">' + done + '<span class="muted" style="font-size:18px"> / ' + list.length + '</span></div><div class="progress"><div style="width:' + pct + '%"></div></div><div class="muted" style="font-size:13px">taken afgerond</div></div>' +
          '<div class="card" style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-ghost" data-now2>⌂ Naar vandaag</button><button class="btn btn-ghost" data-roll2>→ Onafgerond doorschuiven</button><button class="btn btn-ghost" data-focus>◎ Focus 25 minuten</button></div>' +
          '<div class="card"><div class="label">Rooster</div>' + (lessons.length ? '<div class="rooster-list" style="margin-top:8px">' + lessons.map((l) => '<div class="kv"><span>' + hm(l.start) + '</span><span style="text-align:right">' + esc(l.summary || '') + '</span></div>').join('') + '</div>' : '<p class="muted" style="font-size:13px;margin:8px 0 0">Geen lessen. <a href="#/agenda/rooster">Rooster koppelen</a></p>') + '</div>' +
          '<div class="card"><div class="label">Tips</div><p class="muted" style="font-size:13px;line-height:1.5;margin:8px 0 0">Swipe naar rechts om af te vinken, naar links om te verwijderen. Dubbelklik om te bewerken.</p></div>' +
          '</aside></div>';
        bindQuick(d);
        bindTasks(main, draw);
        const step = (c, n) => A.addDays(c, n);
        main.querySelector('[data-prev]').onclick = () => { cursor = step(cursor, -1); draw(); };
        main.querySelector('[data-next]').onclick = () => { cursor = step(cursor, 1); draw(); };
        main.querySelector('[data-now]').onclick = main.querySelector('[data-now2]').onclick = () => { cursor = new Date(); draw(); };
        main.querySelector('[data-new]').onclick = () => openItemDialog(null, { date: d });
        main.querySelector('[data-focus]').onclick = () => A.startFocus(25);
        const roll = () => {
          const od = data.items().filter((i) => !i.done && i.date && i.date < A.today() && i.type !== 'event');
          if (!od.length) { A.toast('Geen onafgemaakte taken uit het verleden'); return; }
          od.forEach((i) => updateItem(i.id, { date: A.today() }));
          A.toast(od.length + ' taken doorgeschoven naar vandaag'); cursor = new Date(); draw();
        };
        main.querySelector('[data-roll2]').onclick = roll;
        const r1 = main.querySelector('[data-roll]'); if (r1) r1.onclick = roll;
        const dm = main.querySelector('[data-dismiss]'); if (dm) dm.onclick = () => { dm.closest('.banner').remove(); };
      }

      // ---- Week ----
      function drawWeek() {
        const start = A.startOfWeek(cursor);
        const end = A.addDays(start, 6);
        const items = data.items();
        main.innerHTML = quickBar() + head('Week ' + A.weekNumber(start) + ' · ' + start.getDate() + ' ' + A.MONTHS[start.getMonth()].slice(0, 3) + ' – ' + end.getDate() + ' ' + A.MONTHS[end.getMonth()].slice(0, 3) + ' ' + end.getFullYear(), true) + legend +
          '<div class="week">' + [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const day = A.addDays(start, i); const d = A.ymd(day);
            const list = items.filter((x) => x.date === d).sort(sortItems);
            const dl = items.filter((x) => x.deadline === d && x.date !== d && !x.done);
            const les = lessonsOn(d);
            return '<div class="day-col ' + (d === A.today() ? 'today' : '') + '" data-drop="' + d + '"><h4><span>' + A.DAYS_SHORT[day.getDay()] + '</span>' + day.getDate() + (list.length ? ' <span class="chip" style="margin-left:auto">' + list.length + '</span>' : '') + '</h4>' +
              (les.length ? '<div class="mini-item" style="cursor:default;opacity:.8"><span class="dot t-event"></span><span>' + les.length + ' lessen · ' + hm(les[0].start) + '–' + hm(les[les.length - 1].end || les[les.length - 1].start) + '</span></div>' : '') +
              list.map(miniItem).join('') + dl.map((x) => '<div class="mini-item" data-id="' + esc(x.id) + '" draggable="true" style="color:var(--danger)">⏳ ' + esc(x.title) + '</div>').join('') +
              '<button class="add-mini" data-add-day="' + d + '">+ toevoegen</button></div>';
          }).join('') + '</div>';
        bindQuick(A.ymd(cursor));
        bindHead((c, n) => A.addDays(c, 7 * n));
        dragBind(main, draw);
        main.querySelectorAll('[data-add-day]').forEach((b) => (b.onclick = () => openItemDialog(null, { date: b.dataset.addDay })));
        main.querySelectorAll('.day-col h4').forEach((h) => { h.style.cursor = 'pointer'; h.onclick = () => { cursor = A.parseYmd(h.parentElement.dataset.drop); A.go('agenda', ['today'], { date: A.ymd(cursor) }); }; });
      }

      // ---- Maand ----
      function drawMonth() {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const start = A.startOfWeek(first);
        const items = data.items();
        let cells = '';
        for (let i = 0; i < 42; i++) {
          const day = A.addDays(start, i); const d = A.ymd(day);
          if (i >= 35 && day.getMonth() !== cursor.getMonth()) break;
          const list = items.filter((x) => x.date === d || (x.deadline === d && x.date !== d)).sort(sortItems);
          cells += '<div class="mcell ' + (day.getMonth() !== cursor.getMonth() ? 'other ' : '') + (d === A.today() ? 'today' : '') + '" data-drop="' + d + '" data-day="' + d + '"><span class="n">' + day.getDate() + '</span>' + list.slice(0, 3).map(miniItem).join('') + (list.length > 3 ? '<span class="faint" style="font-size:11px">+' + (list.length - 3) + ' meer</span>' : '') + '</div>';
        }
        main.innerHTML = quickBar() + head(A.cap(A.MONTHS[cursor.getMonth()]) + ' ' + cursor.getFullYear(), true) + legend +
          '<div class="month">' + ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((x) => '<div class="dow">' + x + '</div>').join('') + cells + '</div>';
        bindQuick(A.ymd(cursor));
        bindHead((c, n) => new Date(c.getFullYear(), c.getMonth() + n, 1));
        dragBind(main, draw);
        main.querySelectorAll('[data-day]').forEach((c) => (c.onclick = () => A.go('agenda', ['today'], { date: c.dataset.day })));
      }

      // ---- Vakken ----
      function drawSubjects() {
        const subj = data.subjects();
        const items = data.items();
        const shown = subjFilter === 'all' ? subj : [subjFilter];
        main.innerHTML = '<div class="ag-head"><div><h2>Per vak</h2><div class="muted" style="font-size:13px;margin-top:4px">Wat er per vak nog openstaat, inclusief deadlines.</div></div></div>' +
          '<div class="tags" style="margin-bottom:16px"><button class="chip ' + (subjFilter === 'all' ? 'on' : '') + '" data-sf="all">Alles</button>' + subj.map((s) => '<button class="chip ' + (subjFilter === s ? 'on' : '') + '" data-sf="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
          '<div class="subject-grid">' + shown.map((s) => {
            const open = items.filter((i) => i.subject === s && !i.done).sort((a, b) => (a.deadline || a.date || '9').localeCompare(b.deadline || b.date || '9'));
            const done = items.filter((i) => i.subject === s && i.done).length;
            return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b>' + esc(s) + '</b><span class="muted" style="font-size:12px">' + open.length + ' open · ' + done + ' klaar</span></div>' +
              (open.length ? '<div style="display:flex;flex-direction:column;gap:6px;margin:10px 0">' + open.map((i) => '<div class="mini-item" data-id="' + esc(i.id) + '"><span class="dot t-' + esc(i.type) + '"></span><span style="flex:1">' + esc(i.title) + '</span><span class="faint">' + (i.deadline ? '⏳ ' + A.fmtShort(i.deadline) : i.date ? A.fmtShort(i.date) : '') + '</span></div>').join('') + '</div>' : '<p class="muted" style="font-size:13px">Niets open. Lekker bezig ✓</p>') +
              '<button class="add-mini" style="width:100%" data-add-subj="' + esc(s) + '">+ Taak met deadline</button></div>';
          }).join('') + '</div>';
        main.querySelectorAll('[data-sf]').forEach((b) => (b.onclick = () => { subjFilter = b.dataset.sf; draw(); }));
        main.querySelectorAll('[data-add-subj]').forEach((b) => (b.onclick = () => openItemDialog(null, { subject: b.dataset.addSubj, type: 'homework', category: 'school', date: A.today(), deadline: A.ymd(A.addDays(new Date(), 7)) })));
        main.querySelectorAll('.mini-item[data-id]').forEach((m) => (m.onclick = () => openItemDialog(data.items().find((x) => x.id === m.dataset.id))));
      }

      // ---- Afgerond ----
      function drawDone() {
        const list = data.items().filter((i) => i.done).sort((a, b) => (a.deadline || a.date || '').localeCompare(b.deadline || b.date || ''));
        main.innerHTML = '<div class="ag-head"><div><h2>Afgerond</h2><div class="muted" style="font-size:13px;margin-top:4px">' + list.length + ' taken gedaan, gesorteerd op deadline.</div></div><span class="spacer"></span>' + (list.length ? '<button class="btn btn-sm btn-danger" data-clear>Opruimen</button>' : '') + '</div>' +
          '<div class="task-list">' + (list.length ? list.map(taskRow).join('') : '<div class="empty">Nog niets afgerond.</div>') + '</div>';
        bindTasks(main, draw);
        const c = main.querySelector('[data-clear]');
        if (c) c.onclick = async () => { if (await A.confirmDialog('Alle ' + list.length + ' afgeronde taken verwijderen?', 'Verwijderen')) { data.saveItems(data.items().filter((i) => !i.done)); draw(); } };
      }

      // ---- Rooster ----
      function drawRooster() {
        const d = A.ymd(cursor);
        const ev = A.store.get('rooster', []);
        const lessons = lessonsOn(d);
        let body;
        if (!ev.length) {
          body = '<div class="empty">Nog geen rooster gekoppeld. Voeg je Somtoday- of Google Agenda-link (iCal) toe, of importeer een .ics-bestand.<div style="margin-top:14px"><button class="btn btn-primary" data-link>Rooster koppelen</button></div></div>';
        } else if (!lessons.length) {
          body = '<div class="empty">Geen lessen of afspraken op deze dag. Je bent vrij 🎉</div>';
        } else {
          const rows = [];
          lessons.forEach((l, i) => {
            if (i > 0) { const gap = (new Date(l.start) - new Date(lessons[i - 1].end || lessons[i - 1].start)) / 60000; if (gap >= 30) rows.push('<div class="free-slot">Vrij · ' + Math.round(gap) + ' min</div>'); }
            rows.push('<div class="lesson"><time>' + hm(l.start) + (l.end ? '–' + hm(l.end) : '') + '</time><div><b>' + esc(l.summary || 'Les') + '</b>' + (l.location ? '<div class="muted" style="font-size:13px">' + esc(l.location) + '</div>' : '') + '</div></div>');
          });
          const lastEnd = lessons[lessons.length - 1].end;
          if (lastEnd) rows.push('<div class="free-slot">Vrij vanaf ' + hm(lastEnd) + '</div>');
          body = '<div class="rooster-list">' + rows.join('') + '</div>';
        }
        main.innerHTML = '<div class="ag-head"><div><h2>Rooster</h2><div class="muted" style="font-size:13px;margin-top:4px">' + esc(A.fmtLong(d)) + '</div></div><span class="spacer"></span><button class="icon-btn" data-prev aria-label="Vorige">' + icon('chevL') + '</button><button class="btn btn-sm" data-now>Vandaag</button><button class="icon-btn" data-next aria-label="Volgende">' + icon('chevR') + '</button>' + (ev.length ? '<button class="btn btn-sm" data-link>Agenda\'s</button>' : '') + '</div>' + body;
        main.querySelector('[data-prev]').onclick = () => { cursor = A.addDays(cursor, -1); draw(); };
        main.querySelector('[data-next]').onclick = () => { cursor = A.addDays(cursor, 1); draw(); };
        main.querySelector('[data-now]').onclick = () => { cursor = new Date(); draw(); };
        main.querySelectorAll('[data-link]').forEach((b) => (b.onclick = () => A.go('settings', null, { section: 'agendas' })));
      }

      function draw() {
        ({ today: drawToday, week: drawWeek, month: drawMonth, subjects: drawSubjects, done: drawDone, rooster: drawRooster })[view]();
      }
      A._agendaDraw = draw;
      draw();
    }
  });
})();
