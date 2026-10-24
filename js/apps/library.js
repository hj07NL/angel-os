/* Websitebibliotheek — geneste mappen, tags, beoordeling, status uit de websitecontrole en de veilige workflow "Websites opnieuw indelen". */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, store, t } = A;
  const F = () => A.folders;

  function folderOptions(sel, excludeId) {
    const folders = data.folders(); const out = [];
    const walk = (pid, depth) => F().children(folders, pid).forEach((f) => { if (f.id === excludeId) return; out.push('<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + '  '.repeat(depth) + esc((f.emoji ? f.emoji + ' ' : '') + f.name) + '</option>'); walk(f.id, depth + 1); });
    walk(null, 0); return out.join('');
  }
  A.folderOptions = folderOptions;

  function healthOf(s) { const h = data.health(); return h.results ? h.results[s.url] : null; }
  function statusChip(s) { const r = healthOf(s); const st = r ? r.status : 'unchecked'; return '<span class="status st-' + st + '" title="' + esc(r && r.detail ? r.detail : '') + '">' + esc(t('site.status.' + st)) + '</span>'; }

  // ---------- Website toevoegen/bewerken ----------
  function openWebsiteDialog(existing, presetFolder) {
    const s = existing || {};
    A.openModal('<h2>' + (existing ? 'Website bewerken' : 'Website toevoegen') + '</h2>' +
      '<label class="field">' + t('common.url') + '<input class="input" name="url" placeholder="https://…" value="' + esc(s.url || '') + '"></label>' +
      '<div class="row2"><label class="field">' + t('common.name') + '<input class="input" name="name" value="' + esc(s.name || '') + '"></label><label class="field">Map<select class="input" name="folder"><option value="">' + (existing ? '' : 'Automatisch (Angel)') + '</option>' + folderOptions(s.folder_id || presetFolder) + '</select></label></div>' +
      '<label class="field">Korte beschrijving<textarea class="input" name="description" rows="2">' + esc(s.description || '') + '</textarea></label>' +
      '<label class="field">Wanneer gebruik je het?<textarea class="input" name="ai_summary" rows="2">' + esc(s.ai_summary || '') + '</textarea></label>' +
      '<label class="field">Tags (komma-gescheiden)<input class="input" name="tags" value="' + esc((s.tags || []).join(', ')) + '"></label>' +
      '<label class="field">Eigen notities<textarea class="input" name="notes" rows="2">' + esc(s.notes || '') + '</textarea></label>' +
      '<div class="modal-actions"><button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-save>' + (existing ? t('common.save') : t('common.add')) + '</button></div>',
      (m, close) => {
        const f = (n) => m.querySelector('[name="' + n + '"]');
        f('url').addEventListener('blur', () => { let u = f('url').value.trim(); if (u && !/^https?:\/\//i.test(u)) { u = 'https://' + u; f('url').value = u; } if (u && !f('name').value) { const host = A.hostOf(u).split('.')[0]; f('name').value = host.charAt(0).toUpperCase() + host.slice(1); } });
        m.querySelector('[data-save]').onclick = async () => {
          let url = f('url').value.trim(); if (!url) { A.toast('Vul een URL in'); return; }
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (e) { A.toast(t('err.invalidUrl')); return; }
          const list = data.websites(); const now = new Date().toISOString();
          const rec = { name: f('name').value.trim() || A.hostOf(url), url, description: f('description').value.trim(), ai_summary: f('ai_summary').value.trim(), notes: f('notes').value.trim(), tags: f('tags').value.split(',').map((x) => x.trim()).filter(Boolean), updated_at: now };
          if (existing) {
            if (existing.url !== url && !(await A.confirmDialog('URL wijzigen?', 'Wijzigen', existing.url + ' → ' + url))) return;
            const x = list.find((y) => y.id === s.id); Object.assign(x, rec); if (f('folder').value) x.folder_id = f('folder').value;
          } else {
            const dup = list.find((x) => A.normUrl(x.url) === A.normUrl(url));
            if (dup && data.settings().library.duplicateDetect) { A.toast(dup.name + ' staat al in je bibliotheek (' + F().pathLabel(data.folders(), dup.folder_id) + ')'); return; }
            const site = Object.assign({ id: A.uid(), category: 'other', favicon_url: null, is_favorite: false, rating: 0, use_count: 0, sort_order: 0, last_used_at: null, created_at: now }, rec);
            if (f('folder').value) site.folder_id = f('folder').value;
            else {
              const c = data.settings().library.autoCategorize ? F().classify(site) : { path: ['Niet ingedeeld'], confidence: 0, uncertain: true, why: [] };
              const folders = data.folders(); let target = A.folderByPath(folders, c.path);
              if (!target && !c.uncertain) { let pid = null; c.path.forEach((n) => { pid = F().createFolder(n, pid).folder.id; }); target = data.folders().find((x) => x.id === pid); }
              site.folder_id = (target || F().uncategorized(data.folders())).id;
              site.classification = { confidence: c.confidence, uncertain: c.uncertain, why: c.why, at: now };
              if (!site.tags.length) site.tags = F().suggestTags(site);
            }
            list.unshift(site);
            A.toast(site.name + ' toegevoegd aan ' + F().pathLabel(data.folders(), site.folder_id) + (site.classification && site.classification.uncertain ? ' — Angel twijfelt, controleer de map' : ''));
          }
          data.saveWebsites(list); close(); A.rerender();
        };
      });
  }
  A.openWebsiteDialog = openWebsiteDialog;

  // ---------- Opnieuw indelen ----------
  function openReorganize(preselectFolder) {
    const folders = data.folders(); const aiOk = A.ai.available();
    const hist = store.get('folderHistory', []).filter((h) => !h.label.startsWith('Eerste'));
    A.openModal('<h2>' + icon('wand') + ' ' + t('site.reorganize') + '</h2><p class="muted" style="margin-top:-6px">Angel bekijkt al je websites en stelt een betere indeling voor. Je ziet eerst een voorbeeld; er wordt niets verwijderd en je kunt het daarna ongedaan maken.</p>' +
      '<div class="set-group"><div class="set-row"><div><b>Wat wil je doen?</b></div><select class="input" name="mode"><option value="all">Alles opnieuw indelen</option><option value="folders">Alleen geselecteerde mappen</option><option value="analyze">Alleen analyseren (niets wijzigen)</option></select></div>' +
      '<div class="set-row" data-folder-pick hidden><div style="width:100%"><b>Mappen</b><div class="tags" style="margin-top:8px">' + F().children(folders, null).concat(folders.filter((f) => f.parent_id)).map((f) => '<label class="chip"><input type="checkbox" value="' + f.id + '"' + (f.id === preselectFolder ? ' checked' : '') + '> ' + esc(F().pathLabel(folders, f.id)) + '</label>').join('') + '</div></div></div>' +
      '<div class="set-row"><div><b>Tags aanvullen</b><div class="sub">Voeg herkende tags toe aan goedgekeurde websites</div></div><input type="checkbox" name="tags" checked></div>' +
      '<div class="set-row"><div><b>AI gebruiken bij twijfel</b><div class="sub">' + (aiOk ? 'Je eigen AI-sleutel helpt bij websites die de regels niet zeker weten' : 'Niet beschikbaar — stel een AI-sleutel in bij Instellingen → Angel AI') + '</div></div><input type="checkbox" name="ai"' + (aiOk ? '' : ' disabled') + '></div></div>' +
      '<p class="faint" style="font-size:12px">Angel gebruikt naam, beschrijving, tags en — als die er is — de paginatitel uit de websitecontrole. Websites zelf worden niet live geopend vanuit je browser.</p>' +
      '<div class="modal-actions">' + (hist.length ? '<button class="btn btn-ghost" data-undo style="margin-right:auto">' + icon('refresh') + 'Laatste indeling ongedaan maken</button>' : '') + '<button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-run>Analyse starten</button></div>',
      (m, close) => {
        const mode = m.querySelector('[name="mode"]'); const pick = m.querySelector('[data-folder-pick]');
        if (preselectFolder) { mode.value = 'folders'; pick.hidden = false; }
        mode.onchange = () => { pick.hidden = mode.value !== 'folders'; };
        const u = m.querySelector('[data-undo]'); if (u) u.onclick = async () => { if (!(await A.confirmDialog('De laatste indeling (' + hist[0].label + ', ' + A.fmtDateTime(hist[0].at) + ') terugdraaien?', 'Terugdraaien', 'Mapindeling en tags worden hersteld; websites blijven allemaal bestaan.'))) return; const r = F().undoLast(); close(); A.toast(r ? 'Indeling teruggezet ✓' : 'Niets om terug te draaien'); A.rerender(); };
        m.querySelector('[data-run]').onclick = async (e) => {
          const ids = Array.from(m.querySelectorAll('[data-folder-pick] input:checked')).map((x) => x.value);
          if (mode.value === 'folders' && !ids.length) { A.toast('Kies minstens één map'); return; }
          e.target.disabled = true; e.target.textContent = 'Bezig met analyseren…'; A.bus.emit('angel-busy', true);
          try {
            const plan = await F().proposeReorganization({ folderIds: mode.value === 'folders' ? ids : null, useAI: m.querySelector('[name="ai"]').checked, analyzeOnly: mode.value === 'analyze', detectDuplicates: data.settings().library.duplicateDetect });
            plan.changes.forEach((c) => { c.applyTags = m.querySelector('[name="tags"]').checked; });
            close(); showPlan(plan);
          } catch (er) { A.toast(t('common.error') + ': ' + er.message, null, 'err'); e.target.disabled = false; e.target.textContent = 'Analyse starten'; }
          finally { A.bus.emit('angel-busy', false); }
        };
      }, { wide: true });
  }

  function showPlan(plan) {
    const folders = data.folders();
    const label = (to) => { if (typeof to === 'string' && to.startsWith('new:')) { const nf = plan.newFolders.find((n) => n.key === to); return '<span class="new">' + esc(nf.path.join(' › ')) + ' (nieuw)</span>'; } return esc(F().pathLabel(folders, to)); };
    const moves = plan.changes.filter((c) => c.to !== c.from);
    const flagged = plan.changes.filter((c) => c.flags.length);
    const uncertain = plan.changes.filter((c) => c.uncertain);
    A.openModal('<h2>Voorstel: ' + moves.length + ' van ' + plan.changes.length + ' websites verplaatsen</h2>' +
      '<div class="tags" style="margin-bottom:10px"><span class="chip">' + plan.newFolders.length + ' nieuwe mappen voorgesteld</span><span class="chip">' + uncertain.length + ' onzeker (niet aangevinkt)</span><span class="chip">' + plan.duplicates.length + ' mogelijke dubbelen</span><span class="chip">' + flagged.length + ' met aandachtspunten</span>' + (plan.aiUsed ? '<span class="chip on">AI gebruikt</span>' : '') + '</div>' +
      (moves.length ? '<div style="display:flex;gap:8px;margin-bottom:8px"><button class="btn btn-sm" data-all>Alles aanvinken</button><button class="btn btn-sm" data-none>Niets aanvinken</button></div><div class="reorg-list"><div class="reorg-row head"><span></span><span>Website</span><span class="c-from">Nu</span><span>Voorstel</span><span class="c-conf">Zekerheid</span></div>' +
        moves.map((c, i) => '<label class="reorg-row" title="' + esc(c.why.join(', ')) + '"><input type="checkbox" data-i="' + plan.changes.indexOf(c) + '"' + (c.approve ? ' checked' : '') + (plan.analyzedOnly ? ' disabled' : '') + '><span><b>' + esc(c.name) + '</b><br><span class="faint c-why" style="font-size:11px">' + esc(c.why.join(', ')) + (c.flags.length ? ' · ⚠ ' + esc(c.flags.join(', ')) : '') + '</span></span><span class="from">' + label(c.from) + '</span><span class="to">' + label(c.to) + '</span><span class="c-conf"><div class="conf-bar ' + (c.uncertain ? 'low' : '') + '"><div style="width:' + Math.round(c.confidence * 100) + '%"></div></div><small class="faint">' + Math.round(c.confidence * 100) + '%</small></span></label>').join('') + '</div>' : '<div class="empty">Alle websites staan al in de beste map. 👌</div>') +
      (plan.duplicates.length ? '<h3 style="margin:18px 0 6px;font-size:15px">Mogelijke dubbelen (alleen gemarkeerd, niets verwijderd)</h3>' + plan.duplicates.map((d) => '<div class="kv"><span>' + d.ids.map((id) => esc((data.websites().find((s) => s.id === id) || {}).name || id)).join(' · ') + '</span><span class="faint">' + (d.kind === 'url' ? 'zelfde URL' : 'zelfde naam en domein') + '</span></div>').join('') : '') +
      (flagged.length ? '<details style="margin-top:12px"><summary class="muted" style="cursor:pointer">' + flagged.length + ' websites met aandachtspunten</summary>' + flagged.map((c) => '<div class="kv"><span>' + esc(c.name) + '</span><span class="faint">' + esc(c.flags.join(', ')) + '</span></div>').join('') + '</details>' : '') +
      '<div class="modal-actions"><button class="btn" data-close>' + (plan.analyzedOnly ? t('common.close') : t('common.cancel')) + '</button>' + (plan.analyzedOnly ? '' : '<button class="btn btn-primary" data-apply>Toepassen</button>') + '</div>',
      (m, close) => {
        const upd = () => { const n = m.querySelectorAll('[data-i]:checked').length; const b = m.querySelector('[data-apply]'); if (b) { b.textContent = n + ' wijzigingen toepassen'; b.disabled = !n; } };
        m.querySelectorAll('[data-i]').forEach((cb) => (cb.onchange = () => { plan.changes[+cb.dataset.i].approve = cb.checked; upd(); }));
        const all = m.querySelector('[data-all]'); if (all) all.onclick = () => { m.querySelectorAll('[data-i]').forEach((cb) => { cb.checked = true; plan.changes[+cb.dataset.i].approve = true; }); upd(); };
        const none = m.querySelector('[data-none]'); if (none) none.onclick = () => { m.querySelectorAll('[data-i]').forEach((cb) => { cb.checked = false; plan.changes[+cb.dataset.i].approve = false; }); upd(); };
        upd();
        const ap = m.querySelector('[data-apply]');
        if (ap) ap.onclick = async () => {
          const n = plan.changes.filter((c) => c.approve).length;
          if (!(await A.confirmDialog(n + ' websites verplaatsen?', 'Toepassen', 'Er worden geen websites verwijderd. Je kunt dit daarna ongedaan maken.'))) return;
          try {
            const before = data.websites().length;
            const r = F().applyReorganization(plan);
            if (data.websites().length !== before) throw new Error('telling klopt niet');
            close();
            A.openModal('<h2>Klaar ✓</h2><div class="kv"><span>Websites verplaatst</span><b>' + r.moved + '</b></div><div class="kv"><span>Nieuwe mappen</span><b>' + r.createdFolders + '</b></div><div class="kv"><span>Websites met nieuwe tags</span><b>' + r.tagged + '</b></div><div class="kv"><span>Websites in bibliotheek</span><b>' + data.websites().length + ' (ongewijzigd)</b></div><div class="modal-actions"><button class="btn" data-undo2>' + t('common.undo') + '</button><button class="btn btn-primary" data-close>' + t('common.done') + '</button></div>', (m2, close2) => {
              m2.querySelector('[data-undo2]').onclick = () => { F().undoLast(); close2(); A.toast('Indeling teruggezet'); A.rerender(); };
            });
            A.rerender();
          } catch (er) { A.toast(t('common.error') + ': ' + er.message, null, 'err'); }
        };
      }, { wide: true });
  }
  A.openReorganize = openReorganize;

  // ---------- App ----------
  A.registerApp({
    id: 'library', name: t('app.library'), icon: 'library', color: 'linear-gradient(160deg,#5ac8fa,#0a6cff)', keywords: 'websites bibliotheek library bookmarks mappen folders',
    render(el, route) {
      const st = { folder: route.params.folder || null, filter: route.params.filter || (route.params.folder ? 'folder' : 'all'), q: route.params.q || '', view: store.get('libView', 'grid'), sel: route.params.id || null, deep: store.get('libDeep', true), selectMode: false, picked: new Set(), open: new Set(store.get('libOpen', [])) };
      if (st.sel) { const s = data.websites().find((x) => x.id === st.sel); if (s && !route.params.folder) { st.folder = s.folder_id; st.filter = 'folder'; } }
      const sort = () => data.settings().library.sort;
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="lib"><aside class="lib-side"></aside><section class="lib-main"><div class="lib-toolbar"><button class="icon-btn" data-tree title="Mappen" style="display:none">' + icon('folder') + '</button><label class="search">' + icon('search') + '<input placeholder="Zoek in je websites" aria-label="Zoek in je websites"></label>' +
        '<select class="input" style="width:auto" data-sort aria-label="Sorteren"><option value="manual">Standaard</option><option value="name">Naam</option><option value="added">Nieuwst</option><option value="used">Meest gebruikt</option><option value="rating">Beoordeling</option></select>' +
        '<div class="seg"><button data-v="grid" title="Raster" aria-label="Raster">' + icon('layout') + '</button><button data-v="list" title="Lijst" aria-label="Lijst">' + icon('list') + '</button></div>' +
        '<button class="btn" data-select>Selecteren</button><button class="btn" data-reorg>' + icon('wand') + '<span class="hide-sm">' + t('site.reorganize') + '</span></button><button class="btn btn-primary" data-add>' + icon('plus') + '<span class="hide-sm">Website</span></button></div><div class="crumbs"></div><div class="lib-grid"></div></section><aside class="lib-detail"></aside></div>';
      const lib = el.querySelector('.lib'); const side = el.querySelector('.lib-side'), grid = el.querySelector('.lib-grid'), detail = el.querySelector('.lib-detail'), q = el.querySelector('.search input'), crumbs = el.querySelector('.crumbs');
      el.querySelector('[data-sort]').value = sort();
      if (window.matchMedia('(max-width: 760px)').matches) el.querySelector('[data-tree]').style.display = '';
      q.value = st.q;

      function scopeIds() { const folders = data.folders(); return new Set([st.folder].concat(st.deep ? F().descendants(folders, st.folder) : [])); }
      function filtered() {
        let list = data.websites();
        if (st.filter === 'fav') list = list.filter((s) => s.is_favorite);
        else if (st.filter === 'recent') list = list.filter((s) => s.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at));
        else if (st.filter === 'most') list = list.filter((s) => s.use_count).sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
        else if (st.filter === 'dupes') { const ids = new Set(F().findDuplicates(list).flatMap((d) => d.ids)); list = list.filter((s) => ids.has(s.id)); }
        else if (st.filter === 'problems') { const h = data.health(); list = list.filter((s) => h.results[s.url] && !['online', 'https_valid'].includes(h.results[s.url].status)); }
        else if (st.filter === 'folder' && st.folder) { const ids = scopeIds(); list = list.filter((s) => ids.has(s.folder_id)); }
        if (st.q) { const tq = st.q.toLowerCase(); list = list.filter((s) => [s.name, s.url, s.description, s.ai_summary, s.notes, (s.tags || []).join(' ')].join(' ').toLowerCase().includes(tq)); }
        if (['all', 'folder', 'fav'].includes(st.filter)) {
          const so = sort();
          if (so === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
          else if (so === 'added') list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          else if (so === 'used') list.sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
          else if (so === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }
        return list;
      }

      // ---- boom ----
      let dragSite = null, dragFolder = null;
      function drawSide() {
        const all = data.websites(); const folders = data.folders(); const dupN = F().findDuplicates(all).length; const h = data.health(); const probN = all.filter((s) => h.results[s.url] && !['online', 'https_valid'].includes(h.results[s.url].status)).length;
        const nav = (key, label, ic, count) => '<button class="nav-item ' + (st.filter === key ? 'on' : '') + '" data-f="' + key + '">' + ic + '<span>' + esc(label) + '</span>' + (count != null ? '<small>' + count + '</small>' : '') + '</button>';
        let tree = '';
        const walk = (pid, depth) => F().children(folders, pid).forEach((f) => {
          const kids = F().children(folders, f.id).length; const open = st.open.has(f.id) || (st.folder && F().pathOf(folders, st.folder).some((p) => p.id === f.id));
          tree += '<div class="tree-row ' + (st.filter === 'folder' && st.folder === f.id ? 'on' : '') + '" data-fid="' + f.id + '" draggable="true" style="padding-left:' + (depth * 14) + 'px">' + (kids ? '<button class="tw ' + (open ? 'open' : '') + '" data-tw="' + f.id + '" aria-label="Uitklappen">' + icon('chevR') + '</button>' : '<span class="tw"></span>') + '<button class="tn" data-folder="' + f.id + '"><span>' + esc(f.emoji || '📁') + '</span><span>' + esc(f.name) + '</span></button><small>' + F().countIn(folders, all, f.id, true) + '</small></div>';
          if (kids && open) walk(f.id, depth + 1);
        });
        walk(null, 0);
        side.innerHTML = nav('all', 'Alle websites', icon('library'), all.length) + nav('fav', 'Favorieten', icon('star'), all.filter((s) => s.is_favorite).length) + nav('recent', 'Recent', icon('clock')) + nav('most', 'Meest gebruikt', icon('trending')) +
          (probN ? nav('problems', 'Aandacht nodig', icon('alert'), probN) : '') + (dupN ? nav('dupes', 'Mogelijke dubbelen', icon('layout'), dupN) : '') +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 10px 6px"><span class="label">Mappen</span><button class="icon-btn sm" data-newfolder title="Nieuwe map" aria-label="Nieuwe map">' + icon('folderPlus') + '</button></div><div class="tree">' + tree + '</div>';
        side.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; st.folder = null; lib.classList.remove('show-tree'); drawAll(); }));
        side.querySelectorAll('[data-folder]').forEach((b) => (b.onclick = () => { st.filter = 'folder'; st.folder = b.dataset.folder; st.open.add(b.dataset.folder); store.set('libOpen', Array.from(st.open)); A.track('view_folder', { folder: st.folder }); lib.classList.remove('show-tree'); drawAll(); }));
        side.querySelectorAll('[data-tw]').forEach((b) => (b.onclick = () => { const id = b.dataset.tw; if (st.open.has(id)) st.open.delete(id); else st.open.add(id); store.set('libOpen', Array.from(st.open)); drawSide(); }));
        side.querySelector('[data-newfolder]').onclick = () => newFolder(st.filter === 'folder' ? st.folder : null);
        side.querySelectorAll('.tree-row').forEach((row) => {
          row.addEventListener('dragstart', (e) => { if (dragSite) return; dragFolder = row.dataset.fid; e.dataTransfer.setData('text/plain', 'folder:' + dragFolder); });
          row.addEventListener('dragend', () => { dragFolder = null; });
          row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
          row.addEventListener('dragleave', () => row.classList.remove('drop'));
          row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drop'); dropOnFolder(row.dataset.fid); });
        });
      }
      function dropOnFolder(fid) {
        try {
          if (dragFolder && dragFolder !== fid) { F().moveFolder(dragFolder, fid); A.toast('Map verplaatst'); }
          else if (dragSite) { const ids = st.picked.size && st.picked.has(dragSite) ? Array.from(st.picked) : [dragSite]; moveSites(ids, fid); }
        } catch (er) { A.toast(er.message, null, 'err'); }
        dragSite = dragFolder = null; drawAll();
      }
      function moveSites(ids, fid) { const list = data.websites(); ids.forEach((id) => { const s = list.find((x) => x.id === id); if (s) s.folder_id = fid; }); data.saveWebsites(list); A.toast(ids.length + (ids.length === 1 ? ' website' : ' websites') + ' verplaatst naar ' + F().pathLabel(data.folders(), fid)); st.picked.clear(); }
      async function newFolder(parentId) {
        const name = await A.promptDialog(parentId ? 'Nieuwe submap in ' + F().pathLabel(data.folders(), parentId) : 'Nieuwe map', '', 'Naam van de map'); if (!name) return;
        const r = F().createFolder(name, parentId); if (!r.created) A.toast('Die map bestaat al'); st.filter = 'folder'; st.folder = r.folder.id; if (parentId) st.open.add(parentId); drawAll();
      }

      // ---- kruimelpad + mapacties ----
      function drawCrumbs() {
        const folders = data.folders();
        if (st.filter !== 'folder' || !st.folder) { crumbs.innerHTML = '<span>' + esc({ all: 'Alle websites', fav: 'Favorieten', recent: 'Recent', most: 'Meest gebruikt', dupes: 'Mogelijke dubbelen — niets wordt automatisch verwijderd', problems: 'Websites met aandachtspunten uit de websitecontrole' }[st.filter] || '') + '</span>'; return; }
        const path = F().pathOf(folders, st.folder); const f = path[path.length - 1];
        crumbs.innerHTML = '<button data-root>Mappen</button>' + path.map((p) => '›<button data-c="' + p.id + '">' + esc(p.name) + '</button>').join('') +
          '<span style="flex:1"></span><label class="chip"><input type="checkbox" data-deep' + (st.deep ? ' checked' : '') + '> incl. submappen</label>' +
          '<button class="btn btn-sm" data-sub>' + icon('folderPlus') + 'Submap</button><button class="btn btn-sm" data-ren>' + icon('pencil') + t('common.rename') + '</button><button class="btn btn-sm" data-mv>' + t('common.move') + '</button><button class="btn btn-sm" data-merge>Samenvoegen</button>' + (f.system ? '' : '<button class="btn btn-sm btn-danger" data-delf>' + icon('trash') + '</button>');
        crumbs.querySelector('[data-root]').onclick = () => { st.filter = 'all'; st.folder = null; drawAll(); };
        crumbs.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { st.folder = b.dataset.c; drawAll(); }));
        crumbs.querySelector('[data-deep]').onchange = (e) => { st.deep = e.target.checked; store.set('libDeep', st.deep); drawGrid(); };
        crumbs.querySelector('[data-sub]').onclick = () => newFolder(f.id);
        crumbs.querySelector('[data-ren]').onclick = async () => { const n = await A.promptDialog('Map hernoemen', f.name); if (n) { F().renameFolder(f.id, n); drawAll(); } };
        const pickFolder = (title, exclude, cb) => A.openModal('<h2>' + esc(title) + '</h2><select class="input" data-p><option value="">— Bovenste niveau —</option>' + folderOptions(null, exclude) + '</select><div class="modal-actions"><button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-ok>' + t('common.ok') + '</button></div>', (m, close) => { m.querySelector('[data-ok]').onclick = () => { const v = m.querySelector('[data-p]').value; close(); cb(v); }; });
        crumbs.querySelector('[data-mv]').onclick = () => pickFolder('“' + f.name + '” verplaatsen naar…', f.id, (v) => { try { F().moveFolder(f.id, v || null); drawAll(); } catch (er) { A.toast(er.message, null, 'err'); } });
        crumbs.querySelector('[data-merge]').onclick = () => pickFolder('“' + f.name + '” samenvoegen met…', f.id, async (v) => { if (!v) return; if (!(await A.confirmDialog('“' + f.name + '” samenvoegen met “' + F().pathLabel(data.folders(), v) + '”?', 'Samenvoegen', 'Alle websites en submappen gaan mee. Er wordt niets verwijderd behalve de lege map.'))) return; try { const n = F().mergeFolders(f.id, v); st.folder = v; A.toast(n + ' websites samengevoegd'); drawAll(); } catch (er) { A.toast(er.message, null, 'err'); } });
        const df = crumbs.querySelector('[data-delf]'); if (df) df.onclick = async () => { const n = F().countIn(folders, data.websites(), f.id, false); if (!(await A.confirmDialog('Map “' + f.name + '” verwijderen?', t('common.delete'), n ? 'De ' + n + ' websites en eventuele submappen worden naar de bovenliggende map verplaatst — er gaan geen websites verloren.' : 'De map is leeg.'))) return; const parent = f.parent_id; F().deleteFolder(f.id); st.folder = parent; st.filter = parent ? 'folder' : 'all'; drawAll(); };
      }

      // ---- raster ----
      function drawGrid() {
        const list = filtered(); const folders = data.folders();
        grid.className = 'lib-grid ' + (st.view === 'list' ? 'list' : '');
        el.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
        const subs = st.filter === 'folder' && !st.q ? F().children(folders, st.folder) : (st.filter === 'all' && !st.q ? F().children(folders, null) : []);
        let htmlS = subs.map((f) => '<div class="folder-card" data-open-folder="' + f.id + '"><span class="fi">' + esc(f.emoji || '📁') + '</span><div style="min-width:0"><b>' + esc(f.name) + '</b><small>' + F().countIn(folders, data.websites(), f.id, true) + ' websites</small></div></div>').join('');
        if (st.filter === 'all' && !st.q) htmlS = ''; // in "alle websites" geen mapkaarten
        const sitesHtml = list.map((s) => '<div class="site-card ' + (s.id === st.sel ? 'sel' : '') + '" data-id="' + esc(s.id) + '" tabindex="0" draggable="true">' + (st.selectMode ? '<input type="checkbox" class="sel-box" data-pick="' + esc(s.id) + '"' + (st.picked.has(s.id) ? ' checked' : '') + ' aria-label="Selecteer ' + esc(s.name) + '">' : '') + '<span class="badges">' + (s.is_favorite ? '<span class="star">★</span>' : '') + (healthOf(s) && !['online', 'https_valid'].includes(healthOf(s).status) ? statusChip(s) : '') + '</span>' + A.favicon(s) + '<div style="min-width:0"><b>' + esc(s.name) + '</b><div class="host">' + esc(A.hostOf(s.url)) + '</div></div><p>' + esc(s.description || '') + '</p></div>').join('');
        grid.innerHTML = htmlS + sitesHtml || '<div class="empty" style="grid-column:1/-1">Geen websites gevonden.</div>';
        if (!htmlS && !sitesHtml) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">' + (st.filter === 'folder' ? 'Deze map is leeg. Sleep websites hierheen of voeg er een toe.' : 'Geen websites gevonden.') + '</div>';
        grid.querySelectorAll('[data-open-folder]').forEach((c) => {
          c.onclick = () => { st.filter = 'folder'; st.folder = c.dataset.openFolder; drawAll(); };
          c.addEventListener('dragover', (e) => { e.preventDefault(); c.classList.add('drop'); }); c.addEventListener('dragleave', () => c.classList.remove('drop')); c.addEventListener('drop', (e) => { e.preventDefault(); dropOnFolder(c.dataset.openFolder); });
        });
        grid.querySelectorAll('.site-card').forEach((c) => {
          c.onclick = (e) => { if (e.target.matches('[data-pick]')) return; if (st.selectMode) { const id = c.dataset.id; st.picked.has(id) ? st.picked.delete(id) : st.picked.add(id); drawGrid(); drawSelBar(); return; } st.sel = c.dataset.id; drawGrid(); drawDetail(); };
          c.ondblclick = () => data.useWebsite(c.dataset.id);
          c.onkeydown = (e) => { if (e.key === 'Enter') data.useWebsite(c.dataset.id); };
          c.addEventListener('dragstart', (e) => { dragSite = c.dataset.id; e.dataTransfer.setData('text/plain', 'site:' + c.dataset.id); });
          c.addEventListener('dragend', () => { dragSite = null; });
        });
        grid.querySelectorAll('[data-pick]').forEach((cb) => (cb.onchange = () => { cb.checked ? st.picked.add(cb.dataset.pick) : st.picked.delete(cb.dataset.pick); drawSelBar(); }));
      }
      function drawSelBar() {
        let bar = el.querySelector('.sel-bar'); if (bar) bar.remove();
        if (!st.selectMode) return;
        bar = A.html('<div class="lib-toolbar sel-bar"><b>' + st.picked.size + ' geselecteerd</b><select class="input" style="width:auto" data-to><option value="">Verplaats naar map…</option>' + folderOptions() + '</select><button class="btn btn-sm" data-fav>★ Favoriet</button><button class="btn btn-sm" data-tag>' + icon('tag') + 'Tag toevoegen</button><span style="flex:1"></span><button class="btn btn-sm" data-done>' + t('common.done') + '</button></div>');
        el.querySelector('.lib-main').insertBefore(bar, crumbs);
        bar.querySelector('[data-to]').onchange = (e) => { if (!e.target.value || !st.picked.size) return; moveSites(Array.from(st.picked), e.target.value); drawAll(); };
        bar.querySelector('[data-fav]').onclick = () => { const l = data.websites(); l.forEach((s) => { if (st.picked.has(s.id)) s.is_favorite = true; }); data.saveWebsites(l); drawAll(); };
        bar.querySelector('[data-tag]').onclick = async () => { const tg = await A.promptDialog('Tag toevoegen aan ' + st.picked.size + ' websites', '', 'bijv. school'); if (!tg) return; const l = data.websites(); l.forEach((s) => { if (st.picked.has(s.id)) s.tags = Array.from(new Set((s.tags || []).concat([tg]))); }); data.saveWebsites(l); drawAll(); };
        bar.querySelector('[data-done]').onclick = () => { st.selectMode = false; st.picked.clear(); drawAll(); };
      }

      // ---- details ----
      function drawDetail() {
        const s = data.websites().find((x) => x.id === st.sel);
        lib.classList.toggle('no-detail', false);
        detail.classList.toggle('hidden-sm', !s);
        if (!s) { detail.innerHTML = '<div class="empty" style="border:none;margin-top:40%">Selecteer een website om de details te zien.</div>'; return; }
        const folders = data.folders(); const h = healthOf(s);
        detail.innerHTML = '<div class="detail-head">' + A.favicon(s) + '<div style="min-width:0;flex:1"><h2>' + esc(s.name) + '</h2><div class="muted" style="font-size:13px;word-break:break-all">' + esc(A.hostOf(s.url)) + '</div></div><button class="icon-btn" data-x aria-label="' + t('common.close') + '">' + icon('x') + '</button></div>' +
          '<div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" data-open>' + icon('external') + t('common.open') + '</button><button class="btn" data-open-os title="Binnen Angel OS openen">' + icon('monitor') + '</button></div>' +
          (s.description ? '<div class="detail-block"><div class="label">Wat het doet</div><p>' + esc(s.description) + '</p></div>' : '<div class="detail-block"><div class="label">Wat het doet</div><p class="muted">Nog geen beschrijving.</p></div>') +
          (s.ai_summary ? '<div class="detail-block"><div class="label">Wanneer gebruik je het</div><p class="muted">' + esc(s.ai_summary) + '</p></div>' : '') +
          '<div class="detail-block"><div class="label">Map</div><select class="input" data-folder style="margin-top:6px">' + folderOptions(s.folder_id) + '</select>' + (s.classification && s.classification.uncertain ? '<p class="faint" style="font-size:12px">Angel twijfelde bij het indelen (' + Math.round((s.classification.confidence || 0) * 100) + '%).</p>' : '') + '</div>' +
          '<div class="detail-block"><div class="label">Tags</div><div class="tags">' + (s.tags || []).map((x) => '<button class="chip" data-tag="' + esc(x) + '">' + esc(x) + '</button>').join('') + '<button class="chip" data-addtag>+ tag</button></div></div>' +
          '<div class="detail-block"><div class="label">Beoordeling</div><div class="stars">' + [1, 2, 3, 4, 5].map((n) => '<button data-rate="' + n + '" class="' + ((s.rating || 0) >= n ? 'on' : '') + '" aria-label="' + n + ' sterren">★</button>').join('') + '</div></div>' +
          '<div class="detail-block"><div class="label">Status</div><div style="margin-top:6px">' + statusChip(s) + '</div>' + (h ? '<div class="kv"><span>Laatst gecontroleerd</span><span class="muted">' + esc(A.fmtDateTime(h.checked_at || data.health().checked_at)) + '</span></div><div class="kv"><span>Beveiliging</span><span class="muted">' + esc(h.security || 'niet geverifieerd') + '</span></div>' + (h.detail ? '<p class="faint" style="font-size:12px">' + esc(h.detail) + '</p>' : '') : '<p class="faint" style="font-size:12px;margin:6px 0 0">Wordt meegenomen in de volgende maandelijkse controle.</p>') + '</div>' +
          (s.notes ? '<div class="detail-block"><div class="label">Notities</div><p>' + esc(s.notes) + '</p></div>' : '') +
          '<div class="detail-block"><div class="kv"><span>Toegevoegd</span><span class="muted">' + esc(s.created_at ? A.fmtNum(new Date(s.created_at)) : '—') + '</span></div><div class="kv"><span>Laatst geopend</span><span class="muted">' + esc(s.last_used_at ? A.relTime(s.last_used_at) + ' · ' + (s.use_count || 0) + '×' : 'Nog niet vanuit hier') + '</span></div><div class="kv"><span>Map</span><span class="muted">' + esc(F().pathLabel(folders, s.folder_id)) + '</span></div></div>' +
          '<div class="detail-block" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-fav>' + icon('star') + (s.is_favorite ? 'Uit favorieten' : 'Favoriet') + '</button><button class="btn btn-sm" data-analyze>' + icon('sparkles') + 'Laat Angel analyseren</button><button class="btn btn-sm" data-edit>' + icon('pencil') + t('common.edit') + '</button><button class="btn btn-sm btn-danger" data-del>' + icon('trash') + '</button></div>';
        const mut = (fn) => { const l = data.websites(); const x = l.find((y) => y.id === s.id); fn(x); data.saveWebsites(l); drawSide(); drawGrid(); drawDetail(); };
        detail.querySelector('[data-x]').onclick = () => { st.sel = null; drawGrid(); drawDetail(); };
        detail.querySelector('[data-open]').onclick = () => { data.useWebsite(s.id); drawDetail(); };
        detail.querySelector('[data-open-os]').onclick = () => data.useWebsite(s.id, 'os');
        detail.querySelector('[data-folder]').onchange = (e) => mut((x) => { x.folder_id = e.target.value; });
        detail.querySelectorAll('[data-rate]').forEach((b) => (b.onclick = () => mut((x) => { x.rating = x.rating === +b.dataset.rate ? 0 : +b.dataset.rate; })));
        detail.querySelector('[data-fav]').onclick = () => mut((x) => { x.is_favorite = !x.is_favorite; });
        detail.querySelector('[data-edit]').onclick = () => openWebsiteDialog(s);
        detail.querySelector('[data-addtag]').onclick = async () => { const tg = await A.promptDialog('Tag toevoegen', '', 'bijv. economie'); if (tg) mut((x) => { x.tags = Array.from(new Set((x.tags || []).concat(tg.split(',').map((y) => y.trim()).filter(Boolean)))); }); };
        detail.querySelectorAll('[data-tag]').forEach((b) => (b.onclick = () => { st.q = b.dataset.tag; q.value = st.q; st.filter = 'all'; drawAll(); }));
        detail.querySelector('[data-analyze]').onclick = async (e) => {
          e.target.disabled = true; let c = F().classify(s, data.health());
          if (c.uncertain && A.ai.available()) { try { const r = await A.ai.classifyWebsite(s, data.folders()); if (r && r.path) c = { path: r.path, confidence: r.confidence || .6, why: ['AI: ' + (r.reason || '')], uncertain: (r.confidence || .6) < .5 }; } catch (er) { A.toast(t('err.ai'), null, 'warn'); } }
          const tags = F().suggestTags(s); const target = A.folderByPath(data.folders(), c.path);
          A.openModal('<h2>Analyse: ' + esc(s.name) + '</h2><div class="kv"><span>Voorgestelde map</span><b>' + esc(c.path.join(' › ')) + (target ? '' : ' (nieuw)') + '</b></div><div class="kv"><span>Zekerheid</span><span>' + Math.round(c.confidence * 100) + '%' + (c.uncertain ? ' — onzeker' : '') + '</span></div><div class="kv"><span>Waarom</span><span class="muted">' + esc(c.why.join(', ')) + '</span></div><div class="kv"><span>Tags</span><span class="muted">' + esc(tags.join(', ')) + '</span></div>' + (!s.description ? '<p class="muted" style="font-size:13px">Er is geen beschrijving; vul die in via Bewerken.</p>' : '') + '<div class="modal-actions"><button class="btn" data-close>' + t('common.close') + '</button><button class="btn btn-primary" data-ok>Toepassen</button></div>', (m, close) => {
            m.querySelector('[data-ok]').onclick = () => { let fid = target && target.id; if (!fid) { let pid = null; c.path.forEach((n) => { pid = F().createFolder(n, pid).folder.id; }); fid = pid; } mut((x) => { x.folder_id = fid; x.tags = tags; x.classification = { confidence: c.confidence, uncertain: c.uncertain, why: c.why, at: new Date().toISOString() }; }); close(); A.toast('Ingedeeld in ' + c.path.join(' › ')); };
          });
          e.target.disabled = false;
        };
        detail.querySelector('[data-del]').onclick = async () => {
          if (!(await A.confirmDialog('“' + s.name + '” uit je bibliotheek verwijderen?', t('common.delete'), 'Je kunt dit direct daarna nog ongedaan maken.'))) return;
          const l = data.websites(); const idx = l.findIndex((y) => y.id === s.id); const removed = l.splice(idx, 1)[0];
          data.saveWebsites(l); st.sel = null; drawAll();
          A.toast(removed.name + ' verwijderd', { label: t('common.undo'), run: () => { const l2 = data.websites(); l2.splice(idx, 0, removed); data.saveWebsites(l2); A.rerender(); } });
        };
      }
      function drawAll() { drawSide(); drawCrumbs(); drawGrid(); drawDetail(); drawSelBar(); }

      q.oninput = () => { st.q = q.value; if (st.q) A.track('library_search', {}); drawGrid(); };
      el.querySelector('[data-sort]').onchange = (e) => { A.data.patchSettings({ library: { sort: e.target.value } }); drawGrid(); };
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { st.view = b.dataset.v; store.set('libView', st.view); drawGrid(); }));
      el.querySelector('[data-add]').onclick = () => openWebsiteDialog(null, st.filter === 'folder' ? st.folder : null);
      el.querySelector('[data-reorg]').onclick = () => openReorganize(st.filter === 'folder' ? st.folder : null);
      el.querySelector('[data-select]').onclick = () => { st.selectMode = !st.selectMode; st.picked.clear(); drawGrid(); drawSelBar(); };
      el.querySelector('[data-tree]').onclick = () => lib.classList.toggle('show-tree');
      drawAll();
      if (route.params.reorganize) setTimeout(() => openReorganize(), 50);
    }
  });
})();
