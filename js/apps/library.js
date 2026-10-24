(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data } = A;

  // Lokale "analyse": raad categorie en tags op basis van naam, URL en beschrijving.
  const HINTS = {
    ai: ['ai', 'gpt', 'chat', 'bot', 'llm', 'claude', 'gemini', 'agent'],
    design: ['design', 'logo', 'ui', 'figma', 'font', 'type', 'color', 'mockup', 'animation', 'motion'],
    coding: ['code', 'coding', 'dev', 'github', 'react', 'css', 'html', 'program', 'api', 'cheat'],
    school: ['learn', 'leren', 'school', 'study', 'course', 'cursus', 'edu', 'university', 'quiz', 'flashcard'],
    video: ['video', 'movie', 'film', 'stream', 'youtube', 'tv'],
    music: ['music', 'muziek', 'audio', 'song', 'spotify', 'vocal'],
    documents: ['pdf', 'doc', 'document', 'book', 'ebook', 'library'],
    images: ['image', 'photo', 'png', 'jpg', 'picture', 'wallpaper', 'afbeelding'],
    tools: ['tool', 'convert', 'generator', 'calculator', 'utility', 'editor'],
    security: ['security', 'privacy', 'breach', 'osint', 'pwned', 'vpn', 'password'],
    productivity: ['productivity', 'focus', 'task', 'todo', 'notes', 'planner', 'agenda']
  };
  function guess(name, url, desc) {
    const text = (name + ' ' + url + ' ' + desc).toLowerCase();
    let best = 'other', score = 0;
    const tags = [];
    Object.entries(HINTS).forEach(([cat, words]) => {
      const hits = words.filter((w) => new RegExp('\\b' + w).test(text));
      hits.forEach((h) => { if (!tags.includes(h) && tags.length < 5) tags.push(h); });
      if (hits.length > score) { score = hits.length; best = cat; }
    });
    return { category: best, tags };
  }

  function openWebsiteDialog(existing) {
    const s = existing || {};
    const cats = A.CATEGORIES.map((c) => '<option value="' + c.id + '"' + (s.category === c.id ? ' selected' : '') + '>' + c.emoji + ' ' + c.name + '</option>').join('');
    A.openModal(
      '<h2>' + (existing ? 'Website bewerken' : 'Website toevoegen') + '</h2>' +
      '<label class="field">URL<input class="input" name="url" placeholder="https://…" value="' + esc(s.url || '') + '"></label>' +
      '<div class="row2"><label class="field">Naam<input class="input" name="name" value="' + esc(s.name || '') + '"></label>' +
      '<label class="field">Categorie<select class="input" name="category"><option value="">Automatisch</option>' + cats + '</select></label></div>' +
      '<label class="field">Wat doet het?<textarea class="input" name="description" rows="2">' + esc(s.description || '') + '</textarea></label>' +
      '<label class="field">Wanneer gebruik je het?<textarea class="input" name="ai_summary" rows="2">' + esc(s.ai_summary || '') + '</textarea></label>' +
      '<label class="field">Tags (komma-gescheiden)<input class="input" name="tags" value="' + esc((s.tags || []).join(', ')) + '"></label>' +
      '<label class="field">Eigen notities<textarea class="input" name="notes" rows="2">' + esc(s.notes || '') + '</textarea></label>' +
      '<div class="modal-actions"><button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-save>' + (existing ? 'Opslaan' : 'Toevoegen') + '</button></div>',
      (m, close) => {
        const f = (n) => m.querySelector('[name="' + n + '"]');
        f('url').addEventListener('blur', () => {
          let u = f('url').value.trim();
          if (u && !/^https?:\/\//i.test(u)) { u = 'https://' + u; f('url').value = u; }
          if (u && !f('name').value) { const host = A.hostOf(u).split('.')[0]; f('name').value = host.charAt(0).toUpperCase() + host.slice(1); }
        });
        m.querySelector('[data-save]').onclick = () => {
          let url = f('url').value.trim();
          if (!url) { A.toast('Vul een URL in'); return; }
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          try { new URL(url); } catch (e) { A.toast('Ongeldige URL'); return; }
          const name = f('name').value.trim() || A.hostOf(url);
          const desc = f('description').value.trim();
          const g = guess(name, url, desc);
          let tags = f('tags').value.split(',').map((t) => t.trim()).filter(Boolean);
          if (!tags.length && !existing) tags = g.tags;
          const list = data.websites();
          const now = new Date().toISOString();
          const rec = {
            name, url, description: desc, ai_summary: f('ai_summary').value.trim(), notes: f('notes').value.trim(),
            category: f('category').value || (existing ? s.category : g.category), tags, updated_at: now
          };
          if (existing) {
            Object.assign(list.find((x) => x.id === s.id), rec);
          } else {
            if (list.some((x) => A.hostOf(x.url) === A.hostOf(url) && x.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) { A.toast('Deze website staat al in je bibliotheek'); return; }
            list.unshift(Object.assign({ id: A.uid(), favicon_url: null, folder: null, is_favorite: false, use_count: 0, sort_order: 0, last_used_at: null, created_at: now, analysis_status: 'local' }, rec));
          }
          data.saveWebsites(list);
          close();
          A.toast(existing ? 'Opgeslagen' : name + ' toegevoegd');
          A.rerender();
        };
      });
  }
  A.openWebsiteDialog = openWebsiteDialog;

  A.registerApp({
    id: 'library', name: 'Web Library', icon: 'library', dock: true, keywords: 'websites bibliotheek',
    color: 'linear-gradient(135deg,#60a5fa,#2563eb)',
    render(el, route) {
      const st = { filter: route.params.filter || 'all', q: route.params.q || '', view: A.store.get('libView', 'grid'), sel: route.params.id || null };

      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="lib"><aside class="lib-side"></aside><section class="lib-main"><div class="lib-toolbar"><label class="search">' + icon('search') + '<input placeholder="Zoek in je websites" aria-label="Zoek in je websites"></label>' +
        '<div class="seg"><button data-v="grid" title="Raster">' + icon('layout') + '</button><button data-v="list" title="Lijst">' + icon('list') + '</button></div>' +
        '<button class="btn btn-primary" data-add>' + icon('plus') + '<span class="hide-sm">Website</span></button></div><div class="lib-grid"></div></section><aside class="lib-detail"></aside></div>';
      el.querySelector('.seg').querySelectorAll('svg').forEach((s) => { s.style.width = '15px'; s.style.height = '15px'; });
      const side = el.querySelector('.lib-side'), grid = el.querySelector('.lib-grid'), detail = el.querySelector('.lib-detail'), q = el.querySelector('.search input');
      q.value = st.q;

      function filtered() {
        let list = data.websites();
        if (st.filter === 'fav') list = list.filter((s) => s.is_favorite);
        else if (st.filter === 'recent') list = list.filter((s) => s.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at));
        else if (st.filter === 'most') list = list.slice().sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
        else if (st.filter.startsWith('cat:')) list = list.filter((s) => s.category === st.filter.slice(4));
        if (st.q) {
          const t = st.q.toLowerCase();
          list = list.filter((s) => [s.name, s.url, s.description, s.ai_summary, s.notes, (s.tags || []).join(' ')].join(' ').toLowerCase().includes(t));
        }
        return list;
      }

      function drawSide() {
        const all = data.websites();
        const nav = (key, label, ic, count) => '<button class="nav-item ' + (st.filter === key ? 'on' : '') + '" data-f="' + key + '">' + ic + '<span>' + esc(label) + '</span>' + (count != null ? '<small>' + count + '</small>' : '') + '</button>';
        side.innerHTML = nav('all', 'Alle websites', icon('library'), all.length) + nav('fav', 'Favorieten', icon('star'), all.filter((s) => s.is_favorite).length) + nav('recent', 'Recent', icon('clock')) + nav('most', 'Meest gebruikt', icon('flame')) +
          '<div class="label" style="padding:16px 10px 6px">Categorieën</div>' +
          A.CATEGORIES.map((c) => { const n = all.filter((s) => s.category === c.id).length; return n ? nav('cat:' + c.id, c.name, '<span>' + c.emoji + '</span>', n) : ''; }).join('');
        side.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; drawSide(); drawGrid(); }));
      }

      function drawGrid() {
        const list = filtered();
        grid.className = 'lib-grid ' + (st.view === 'list' ? 'list' : '');
        el.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
        if (!list.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Geen websites gevonden.</div>'; return; }
        grid.innerHTML = list.map((s) => '<div class="site-card ' + (s.id === st.sel ? 'sel' : '') + '" data-id="' + esc(s.id) + '" tabindex="0">' + (s.is_favorite ? '<span class="star">★</span>' : '') + A.favicon(s) + '<div style="min-width:0"><b>' + esc(s.name) + '</b><div class="host">' + esc(A.hostOf(s.url)) + '</div></div><p>' + esc(s.description || '') + '</p></div>').join('');
        grid.querySelectorAll('.site-card').forEach((c) => {
          c.onclick = () => { st.sel = c.dataset.id; drawGrid(); drawDetail(); };
          c.ondblclick = () => data.useWebsite(c.dataset.id);
          c.onkeydown = (e) => { if (e.key === 'Enter') data.useWebsite(c.dataset.id); };
        });
      }

      function drawDetail() {
        const s = data.websites().find((x) => x.id === st.sel);
        detail.classList.toggle('hidden-sm', !s);
        if (!s) { detail.innerHTML = '<div class="empty" style="border:none;margin-top:40%">' + icon('library') + '<p>Selecteer een website om de details te zien.</p></div>'; detail.querySelector('svg').style.cssText = 'width:28px;height:28px'; return; }
        const c = A.catOf(s.category);
        detail.innerHTML = '<div class="detail-head">' + A.favicon(s) + '<div style="min-width:0;flex:1"><h2>' + esc(s.name) + '</h2><div class="muted" style="font-size:13px">' + esc(A.hostOf(s.url)) + '</div></div><button class="icon-btn" data-close-detail aria-label="Sluiten">' + icon('x') + '</button></div>' +
          '<button class="btn btn-primary" style="width:100%;justify-content:center" data-open>' + icon('external') + 'Openen</button>' +
          (s.description ? '<div class="detail-block"><div class="label">Wat het doet</div><p>' + esc(s.description) + '</p></div>' : '') +
          (s.ai_summary ? '<div class="detail-block"><div class="label">Wanneer gebruik je het</div><p class="muted">' + esc(s.ai_summary) + '</p></div>' : '') +
          '<div class="detail-block"><div class="label">Categorie</div><p>' + c.emoji + ' ' + esc(c.name) + '</p></div>' +
          ((s.tags || []).length ? '<div class="detail-block"><div class="label">Tags</div><div class="tags">' + s.tags.map((t) => '<button class="chip" data-tag="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div></div>' : '') +
          (s.notes ? '<div class="detail-block"><div class="label">Notities</div><p>' + esc(s.notes) + '</p></div>' : '') +
          '<div class="detail-block"><div class="label">Laatst gebruikt</div><p class="muted">' + (s.last_used_at ? A.relTime(s.last_used_at) + ' · ' + (s.use_count || 0) + '× geopend' : 'Nog niet vanuit hier geopend') + '</p></div>' +
          '<div class="detail-block" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-fav>' + icon('star') + (s.is_favorite ? 'Uit favorieten' : 'Favoriet') + '</button><button class="btn btn-sm" data-edit>' + icon('pencil') + 'Bewerken</button><button class="btn btn-sm btn-danger" data-del>' + icon('trash') + 'Verwijderen</button></div>';
        detail.querySelector('[data-open]').onclick = () => { data.useWebsite(s.id); drawDetail(); };
        detail.querySelector('[data-close-detail]').onclick = () => { st.sel = null; drawGrid(); drawDetail(); };
        detail.querySelector('[data-edit]').onclick = () => openWebsiteDialog(s);
        detail.querySelector('[data-fav]').onclick = () => { const l = data.websites(); const x = l.find((y) => y.id === s.id); x.is_favorite = !x.is_favorite; data.saveWebsites(l); drawSide(); drawGrid(); drawDetail(); };
        detail.querySelector('[data-del]').onclick = () => {
          const l = data.websites(); const idx = l.findIndex((y) => y.id === s.id); const removed = l.splice(idx, 1)[0];
          data.saveWebsites(l); st.sel = null; drawSide(); drawGrid(); drawDetail();
          A.toast(removed.name + ' verwijderd', { label: 'Ongedaan maken', run: () => { const l2 = data.websites(); l2.splice(idx, 0, removed); data.saveWebsites(l2); A.rerender(); } });
        };
        detail.querySelectorAll('[data-tag]').forEach((b) => (b.onclick = () => { st.q = b.dataset.tag; q.value = st.q; st.filter = 'all'; drawSide(); drawGrid(); }));
      }

      q.oninput = () => { st.q = q.value; drawGrid(); };
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { st.view = b.dataset.v; A.store.set('libView', st.view); drawGrid(); }));
      el.querySelector('[data-add]').onclick = () => openWebsiteDialog();
      drawSide(); drawGrid(); drawDetail();
    }
  });
})();
