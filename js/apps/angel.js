/* Angel — gesprek met de app-brede assistent. Alle acties lopen via de centrale tool-registry (js/tools.js). */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, t } = A;

  A.registerApp({
    id: 'angel', name: t('app.angel'), icon: 'bot', color: 'conic-gradient(from 210deg,#ff9f0a,#ff375f,#bf5af2,#0a84ff,#64d2ff,#ff9f0a)', keywords: 'ai assistent vraag ask',
    render(el, route) {
      el.style.overflow = 'hidden';
      const aiOn = A.ai.available();
      el.innerHTML = '<div class="angel"><div class="angel-feed" aria-live="polite"></div><form class="angel-bar"><input class="input" placeholder="Vraag Angel iets of geef een opdracht…" aria-label="Vraag Angel"><button class="btn btn-primary" type="submit">' + icon('sparkles') + 'Vraag</button></form></div>';
      const feed = el.querySelector('.angel-feed'), form = el.querySelector('form'), inp = form.querySelector('input');
      const EXAMPLES = ['Taak: ik moet eten', 'Notitie: vraag de docent naar de opdracht', 'Herinner me morgen om 16:00 economie te leren', 'Vind de beste website in mijn bibliotheek om een presentatie te maken', 'Deel mijn websites opnieuw in', 'Toon websites die niet meer werken', 'Verplaats mijn onafgemaakte taken naar morgen', 'Maak een map voor AI-tools', 'Wat moet ik vandaag doen?', 'Hoe is het weer?'];
      const hero = () => {
        feed.innerHTML = '<div class="angel-hero"><div class="angel-logo">' + icon('bot') + '</div><h2 style="margin:0;font-size:26px;letter-spacing:-.02em">Vraag Angel</h2><p class="muted">Angel werkt met je echte gegevens: websites, mappen, taken, notities, snelkoppelingen en de websitecontrole. Bij grote of onomkeerbare acties vraagt Angel eerst om bevestiging.</p>' +
          '<p class="faint" style="font-size:12px">' + (aiOn ? 'Modus: AI (' + esc(data.settings().ai.provider) + ') met ingebouwde regels als terugval.' : 'Modus: ingebouwde regels — zonder kosten. Een eigen AI-sleutel kun je instellen bij <a href="#/settings?section=ai">Instellingen → Angel AI</a>.') + '</p>' +
          '<div class="suggests">' + EXAMPLES.map((s) => '<button class="chip big" type="button">' + esc(s) + '</button>').join('') + '</div></div>';
        feed.querySelectorAll('.suggests .chip').forEach((b) => (b.onclick = () => run(b.textContent)));
      };
      const siteResult = (r, i) => { const s = r.site; return '<div class="result" data-site="' + esc(s.id) + '">' + A.favicon(s) + '<div style="min-width:0;flex:1"><b>' + esc(s.name) + '</b> <span class="faint" style="font-size:12px">' + esc(A.hostOf(s.url)) + '</span><div class="muted" style="font-size:13px;margin-top:2px">' + esc(s.description || '') + '</div><div class="why">' + (i === 0 ? '⭐ Beste match · ' : '') + esc((r.why || []).join(' · ')) + '</div></div>' + icon('external') + '</div>'; };
      const taskResult = (i) => '<div class="result" data-task="' + esc(i.id) + '"><span class="dot t-' + esc(i.type) + '" style="margin-top:6px"></span><div style="flex:1"><b>' + esc(i.title) + '</b><div class="why">' + esc(A.parser.TYPE_LABELS[i.type] || i.type) + ' · ' + (i.date < A.today() ? 'te laat (' + A.fmtShort(i.date) + ')' : i.date === A.today() ? 'vandaag' : A.fmtLong(i.date)) + (i.time ? ' · ' + esc(i.time) : '') + '</div></div><button class="check sm" data-done="' + esc(i.id) + '" aria-label="Afvinken"></button></div>';

      function answer(block, out, original) {
        const box = block.querySelector('.msg-a');
        if (!out) { box.innerHTML = '<p class="muted">' + t('common.error') + '</p>'; return; }
        let h = '<div class="bubble"><span class="angel-logo sm">' + icon('bot') + '</span><div>' + esc(out.text || (out.question ? out.question.text : out.confirm ? out.confirm.text : '')) + (out.via === 'ai' ? '<div class="via">via AI</div>' : '') + '</div></div>';
        if (out.notice) h += '<p class="faint" style="font-size:12px">' + esc(out.notice) + '</p>';
        if (out.question) h += '<div class="tags" style="margin-top:10px">' + (out.question.options || []).map((o) => '<button class="chip big" data-ans="' + esc(o) + '">' + esc(o) + '</button>').join('') + '<form data-free style="display:flex;gap:6px"><input class="input" placeholder="Of typ je antwoord"' + (out.question.kind === 'date' ? ' type="date"' : '') + '><button class="btn btn-sm">OK</button></form></div>';
        if (out.confirm) h += '<p class="muted" style="font-size:13px">' + esc(out.confirm.detail || '') + '</p><div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" data-yes>' + t('common.confirm') + '</button><button class="btn btn-sm" data-no>' + t('common.cancel') + '</button></div>';
        if (out.results && out.results.length) h += out.results.slice(0, 12).map(siteResult).join('');
        if (out.results && !out.results.length && out.google) h += '<a class="btn btn-sm" style="margin-top:8px" href="https://www.google.com/search?q=' + encodeURIComponent(out.google) + '" target="_blank" rel="noopener">' + icon('search') + 'Zoek op Google</a>';
        if (out.tasks && out.tasks.length) h += out.tasks.map(taskResult).join('');
        if (out.suggestions && out.suggestions.length) h += '<div class="tags" style="margin-top:10px">' + out.suggestions.map((s, i) => '<button class="chip big" data-sugg="' + i + '">' + esc(s.label) + '</button>').join('') + '</div>';
        const acts = [];
        if (out.undo) acts.push('<button class="btn btn-sm" data-undo>' + icon('refresh') + t('common.undo') + '</button>');
        if (out.open) acts.push('<button class="btn btn-sm" data-openapp>' + icon('external') + 'Openen</button>');
        if (out.alt) acts.push('<button class="btn btn-sm btn-ghost" data-alt>' + esc(out.alt.label) + '</button>');
        if (acts.length) h += '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' + acts.join('') + '</div>';
        box.innerHTML = h;
        box.querySelectorAll('.result svg').forEach((s) => { s.style.cssText = 'width:16px;height:16px;flex:none;color:var(--muted)'; });
        box.querySelectorAll('[data-site]').forEach((r) => (r.onclick = () => data.useWebsite(r.dataset.site)));
        box.querySelectorAll('[data-task]').forEach((r) => (r.onclick = (e) => { if (e.target.closest('[data-done]')) return; const it = data.items().find((x) => x.id === r.dataset.task); A.go('agenda', ['day'], { date: it ? it.date : A.today() }); }));
        box.querySelectorAll('[data-done]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); A.tasks.toggleDone(b.dataset.done); b.classList.add('on'); b.innerHTML = icon('check'); A.toast('Afgevinkt ✓'); }));
        box.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = async () => answer(block, await A.angel.answerQuestion(out, b.dataset.ans), original)));
        const ff = box.querySelector('[data-free]'); if (ff) ff.onsubmit = async (e) => { e.preventDefault(); const v = ff.querySelector('input').value.trim(); if (v) answer(block, await A.angel.answerQuestion(out, v), original); };
        const y = box.querySelector('[data-yes]'); if (y) y.onclick = () => { const r = out.confirm.run(); answer(block, r, original); };
        const n = box.querySelector('[data-no]'); if (n) n.onclick = () => answer(block, { ok: true, text: 'Oké, ik heb niets gewijzigd.' }, original);
        box.querySelectorAll('[data-sugg]').forEach((b) => (b.onclick = () => { out.suggestions[+b.dataset.sugg].run(); b.disabled = true; b.classList.add('on'); }));
        const u = box.querySelector('[data-undo]'); if (u) u.onclick = () => { out.undo(); u.disabled = true; u.textContent = 'Ongedaan gemaakt'; };
        const o = box.querySelector('[data-openapp]'); if (o) o.onclick = () => A.go(out.open.app, null, out.open.params || null);
        const al = box.querySelector('[data-alt]'); if (al) al.onclick = async () => { if (out.undo) out.undo(); answer(block, await A.angel.runTool('search_websites', { query: out.alt.query }), original); };
      }

      async function run(q) {
        q = q.trim(); if (!q) return;
        if (feed.querySelector('.angel-hero')) feed.innerHTML = '';
        const block = A.html('<div><div class="msg-q"><span>' + esc(q) + '</span></div><div class="msg-a"><div class="bubble"><span class="angel-logo sm">' + icon('bot') + '</span><div><span class="spin" style="display:inline-block;border-color:var(--border);border-top-color:var(--accent)"></span> Even denken…</div></div></div></div>');
        feed.appendChild(block); feed.scrollTop = feed.scrollHeight; inp.value = '';
        const out = await A.angel.command(q);
        answer(block, out, q);
        feed.scrollTop = feed.scrollHeight;
      }
      form.onsubmit = (e) => { e.preventDefault(); run(inp.value); };
      hero();
      if (route.params.q) run(route.params.q);
      if (window.matchMedia('(pointer:fine)').matches) setTimeout(() => inp.focus(), 50);
    }
  });
})();
