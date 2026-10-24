/* Notities met afbeeldingen (plakken, uploaden, camera), opmaak en automatisch opslaan. Afbeeldingen staan als bestand in IndexedDB.
   Daarnaast: de app Projecten. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data, t } = A;

  // ---------- Veilige HTML ----------
  const ALLOWED = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, H1: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, DIV: 1, SPAN: 1, FIGURE: 1, A: 1, BLOCKQUOTE: 1, CODE: 1, PRE: 1, HR: 1 };
  function sanitize(htmlStr) {
    const doc = new DOMParser().parseFromString('<div>' + (htmlStr || '') + '</div>', 'text/html');
    const walk = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || !ALLOWED[c.tagName]) { if (c.nodeType === 1 && !['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); } else c.remove(); return; }
        Array.from(c.attributes).forEach((a) => {
          const keep = (c.tagName === 'FIGURE' && (a.name === 'data-att' || a.name === 'data-w' || a.name === 'class')) || (c.tagName === 'A' && a.name === 'href' && /^https?:\/\//i.test(a.value));
          if (!keep) c.removeAttribute(a.name);
        });
        if (c.tagName === 'FIGURE') { c.innerHTML = ''; c.className = 'img'; return; }
        if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
        walk(c);
      });
    };
    walk(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }
  const plain = (h) => { const d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

  async function hydrate(root) {
    const figs = root.querySelectorAll('figure.img[data-att]');
    for (const f of figs) {
      const id = f.dataset.att; if (!f.dataset.w) f.dataset.w = 'm';
      f.setAttribute('contenteditable', 'false');
      f.innerHTML = '<div class="img-tools"><button type="button" data-size="s">S</button><button type="button" data-size="m">M</button><button type="button" data-size="l">L</button><button type="button" data-rm aria-label="Afbeelding verwijderen">✕</button></div>';
      try { const u = await A.files.objectUrl(id); if (u) { const img = document.createElement('img'); img.src = u; img.alt = 'Afbeelding in notitie'; f.prepend(img); } else f.prepend(Object.assign(document.createElement('span'), { className: 'img-missing', textContent: 'Afbeelding niet gevonden op dit apparaat' })); }
      catch (e) { f.prepend(Object.assign(document.createElement('span'), { className: 'img-missing', textContent: 'Afbeeldingen niet beschikbaar (opslag geblokkeerd)' })); }
    }
  }
  function serialize(root) {
    const c = root.cloneNode(true);
    c.querySelectorAll('figure.img').forEach((f) => { const id = f.dataset.att, w = f.dataset.w || 'm'; const n = document.createElement('figure'); n.className = 'img'; n.dataset.att = id; n.dataset.w = w; f.replaceWith(n); });
    return sanitize(c.innerHTML);
  }

  A.registerApp({
    id: 'notes', name: t('app.notes'), icon: 'note', color: 'linear-gradient(160deg,#ffd60a,#ff9f0a)', keywords: 'notes notities afbeeldingen',
    render(el, route) {
      let sel = route.params.id || null, q = '';
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="notes"><aside class="notes-side"><div class="top"><label class="search">' + icon('search') + '<input placeholder="Zoek notities" aria-label="Zoek notities"></label><button class="btn btn-primary" data-new aria-label="Nieuwe notitie" style="padding:9px 11px">' + icon('plus') + '</button></div><div class="note-list"></div></aside><section class="note-editor" style="position:relative"></section></div>';
      const list = el.querySelector('.note-list'), ed = el.querySelector('.note-editor'), wrap = el.querySelector('.notes');
      el.querySelector('.search input').oninput = (e) => { q = e.target.value.toLowerCase(); drawList(); };
      el.querySelector('[data-new]').onclick = () => {
        const n = { id: A.uid(), title: '', html: '', content: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        data.saveNotes([n].concat(data.notes())); open(n.id); setTimeout(() => { const ti = ed.querySelector('.note-title'); if (ti) ti.focus(); }, 30);
      };
      function drawList() {
        const notes = data.notes().filter((n) => !q || ((n.title || '') + ' ' + (n.content || '')).toLowerCase().includes(q)).sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.updated_at || '').localeCompare(a.updated_at || ''));
        list.innerHTML = notes.length ? notes.map((n) => '<div class="note-item ' + (n.id === sel ? 'on' : '') + '" data-id="' + esc(n.id) + '" tabindex="0"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title || 'Nieuwe notitie') + '</b><small>' + esc(A.relTime(n.updated_at)) + ' · ' + esc((n.content || '').slice(0, 70) || 'Leeg') + '</small></div>').join('') : '<p class="muted" style="padding:16px;font-size:13px">Geen notities.</p>';
        list.querySelectorAll('.note-item').forEach((it) => { it.onclick = () => open(it.dataset.id); it.onkeydown = (e) => { if (e.key === 'Enter') open(it.dataset.id); }; });
      }
      let saveT = null, editorRoot = null;
      async function cleanupUnreferenced(noteId) {
        try { const n = data.notes().find((x) => x.id === noteId); const refs = new Set(); if (n) { const d = document.createElement('div'); d.innerHTML = n.html || ''; d.querySelectorAll('figure[data-att]').forEach((f) => refs.add(f.dataset.att)); } const atts = await A.files.byNote(noteId); for (const a of atts) if (!refs.has(a.id)) await A.files.remove(a.id); } catch (e) { /* geen IndexedDB */ }
      }
      function open(id) { const prev = sel; flush(); if (prev && prev !== id) cleanupUnreferenced(prev); sel = id; drawList(); drawEditor(); }
      function flush() {
        if (!saveT || !editorRoot) return; clearTimeout(saveT); saveT = null; doSave();
      }
      function doSave() {
        const all = data.notes(); const x = all.find((y) => y.id === sel); if (!x || !editorRoot) return;
        x.title = ed.querySelector('.note-title').value; x.html = serialize(editorRoot); x.content = plain(x.html); x.updated_at = new Date().toISOString();
        data.saveNotes(all); const s = ed.querySelector('[data-saved]'); if (s) s.textContent = t('common.saved') + ' ✓'; drawList();
      }
      const scheduleSave = () => { const s = ed.querySelector('[data-saved]'); if (s) s.textContent = 'Opslaan…'; clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; doSave(); }, 500); };

      async function insertImages(files) {
        for (const file of files) {
          try {
            const rec = await A.files.add(file, sel);
            editorRoot.focus();
            const fig = document.createElement('figure'); fig.className = 'img'; fig.dataset.att = rec.id; fig.dataset.w = rec.w && rec.w < 500 ? 's' : 'm';
            const selc = window.getSelection();
            if (selc.rangeCount && editorRoot.contains(selc.anchorNode)) { const r = selc.getRangeAt(0); r.collapse(false); r.insertNode(fig); const p = document.createElement('p'); p.innerHTML = '<br>'; fig.after(p); r.setStart(p, 0); r.collapse(true); selc.removeAllRanges(); selc.addRange(r); }
            else { editorRoot.appendChild(fig); const p = document.createElement('p'); p.innerHTML = '<br>'; editorRoot.appendChild(p); }
            await hydrate(fig.parentNode); scheduleSave();
          } catch (e) { A.toast(e.message, null, 'err'); }
        }
      }

      async function drawEditor() {
        const n = data.notes().find((x) => x.id === sel);
        wrap.classList.toggle('editing', !!n);
        if (!n) { ed.innerHTML = '<div class="empty" style="border:none;margin:auto">Selecteer een notitie of maak een nieuwe.</div>'; editorRoot = null; return; }
        ed.innerHTML = '<div class="bar"><button class="btn btn-sm btn-ghost" data-back>' + icon('chevL') + '<span class="hide-sm">Notities</span></button>' +
          '<button class="icon-btn sm" data-cmd="bold" title="Vet (Ctrl+B)"><b>B</b></button><button class="icon-btn sm" data-cmd="italic" title="Cursief (Ctrl+I)"><i>I</i></button><button class="icon-btn sm" data-block="H2" title="Kop">H</button><button class="icon-btn sm" data-cmd="insertUnorderedList" title="Opsomming">•</button>' +
          '<label class="icon-btn sm" title="Afbeelding uploaden">' + icon('image') + '<input type="file" accept="image/*" multiple hidden data-file></label><label class="icon-btn sm" title="Foto maken">' + icon('camera') + '<input type="file" accept="image/*" capture="environment" hidden data-file></label>' +
          '<span class="faint" style="font-size:12px;margin-left:6px" data-saved>Bewerkt ' + esc(A.relTime(n.updated_at)) + '</span><span style="flex:1"></span>' +
          '<button class="btn btn-sm" data-pin>' + (n.pinned ? 'Losmaken' : '📌') + '</button><button class="btn btn-sm" data-dl title="Downloaden">' + icon('download') + '</button><button class="btn btn-sm btn-danger" data-del title="' + t('common.delete') + '">' + icon('trash') + '</button></div>' +
          '<input class="note-title" placeholder="Titel" value="' + esc(n.title || '') + '" aria-label="Titel"><div class="rich" contenteditable="true" data-placeholder="Begin met schrijven… Plak (Ctrl+V) of sleep een afbeelding hierheen." role="textbox" aria-multiline="true">' + sanitize(n.html || ('<p>' + esc(n.content || '') + '</p>')) + '</div><div class="drop-hint">Laat los om de afbeelding toe te voegen</div>';
        editorRoot = ed.querySelector('.rich');
        await hydrate(editorRoot);
        ed.querySelector('.note-title').oninput = scheduleSave;
        editorRoot.addEventListener('input', scheduleSave);
        editorRoot.addEventListener('paste', (e) => {
          const files = Array.from(e.clipboardData.files || []).filter((f) => /^image\//.test(f.type));
          if (files.length) { e.preventDefault(); insertImages(files); return; }
          const txt = e.clipboardData.getData('text/plain'); if (txt) { e.preventDefault(); document.execCommand('insertText', false, txt); }
        });
        ed.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.items || []).some((i) => i.kind === 'file')) { e.preventDefault(); ed.classList.add('dragging'); } });
        ed.addEventListener('dragleave', (e) => { if (!ed.contains(e.relatedTarget)) ed.classList.remove('dragging'); });
        ed.addEventListener('drop', (e) => { ed.classList.remove('dragging'); const files = Array.from(e.dataTransfer.files || []).filter((f) => /^image\//.test(f.type)); if (files.length) { e.preventDefault(); insertImages(files); } });
        editorRoot.addEventListener('click', (e) => {
          editorRoot.querySelectorAll('figure.sel').forEach((f) => f.classList.remove('sel'));
          const fig = e.target.closest('figure.img'); if (!fig) return;
          fig.classList.add('sel');
          const sz = e.target.closest('[data-size]'); if (sz) { fig.dataset.w = sz.dataset.size; scheduleSave(); }
          if (e.target.closest('[data-rm]')) { const p = fig.nextSibling; fig.remove(); scheduleSave(); A.toast('Afbeelding verwijderd'); void p; }
        });
        ed.querySelectorAll('[data-cmd]').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); document.execCommand(b.dataset.cmd); scheduleSave(); }));
        ed.querySelectorAll('[data-block]').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); document.execCommand('formatBlock', false, b.dataset.block); scheduleSave(); }));
        ed.querySelectorAll('[data-file]').forEach((inp) => (inp.onchange = () => { insertImages(Array.from(inp.files)); inp.value = ''; }));
        ed.querySelector('[data-back]').onclick = () => { flush(); cleanupUnreferenced(sel); sel = null; drawList(); drawEditor(); };
        ed.querySelector('[data-pin]').onclick = () => { flush(); const all = data.notes(); const x = all.find((y) => y.id === sel); x.pinned = !x.pinned; data.saveNotes(all); drawList(); drawEditor(); };
        ed.querySelector('[data-dl]').onclick = async () => {
          flush(); const x = data.notes().find((y) => y.id === sel); const d = document.createElement('div'); d.innerHTML = x.html || '';
          for (const f of d.querySelectorAll('figure[data-att]')) { const u = await A.files.toDataUrl(f.dataset.att).catch(() => null); f.innerHTML = u ? '<img src="' + u + '" style="max-width:100%">' : '[afbeelding ontbreekt]'; }
          const blob = new Blob(['<!doctype html><meta charset="utf-8"><title>' + esc(x.title) + '</title><h1>' + esc(x.title) + '</h1>' + d.innerHTML], { type: 'text/html' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (x.title || 'notitie').replace(/[^\w-]+/g, '_') + '.html'; a.click();
        };
        ed.querySelector('[data-del]').onclick = async () => {
          if (!(await A.confirmDialog('Notitie “' + (n.title || 'Naamloos') + '” verwijderen?', t('common.delete'), 'Ook de afbeeldingen in deze notitie worden verwijderd.'))) return;
          const id = sel; data.saveNotes(data.notes().filter((y) => y.id !== id)); A.files.removeForNote(id).catch(() => {}); sel = null; saveT = null; drawList(); drawEditor();
        };
      }
      drawList(); drawEditor();
      return () => { flush(); if (sel) cleanupUnreferenced(sel); };
    }
  });

  // ---------- Projecten ----------
  const STATUSES = { idee: 'Idee', bezig: 'Bezig', live: 'Live', gepauzeerd: 'Gepauzeerd' };
  function openProjectDialog(p) {
    p = p || {};
    A.openModal('<h2>' + (p.id ? 'Project bewerken' : 'Project toevoegen') + '</h2><label class="field">Naam<input class="input" name="name" value="' + esc(p.name || '') + '"></label><label class="field">URL (bijv. je Lovable- of GitHub-link)<input class="input" name="url" value="' + esc(p.url || '') + '" placeholder="https://"></label><label class="field">Status<select class="input" name="status">' + Object.entries(STATUSES).map(([k, v]) => '<option value="' + k + '"' + ((p.status || 'bezig') === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label><label class="field">Beschrijving<textarea class="input" name="description">' + esc(p.description || '') + '</textarea></label>' +
      '<div class="modal-actions">' + (p.id ? '<button class="btn btn-danger" data-del style="margin-right:auto">' + t('common.delete') + '</button>' : '') + '<button class="btn" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" data-save>' + t('common.save') + '</button></div>', (m, close) => {
      const v = (n) => m.querySelector('[name="' + n + '"]').value.trim();
      m.querySelector('[data-save]').onclick = () => { if (!v('name')) { A.toast('Geef een naam'); return; } let url = v('url'); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url; const list = data.projects(); const now = new Date().toISOString(); const rec = { name: v('name'), url, status: v('status'), description: v('description'), updated_at: now }; if (p.id) Object.assign(list.find((x) => x.id === p.id), rec); else list.unshift(Object.assign({ id: A.uid(), created_at: now }, rec)); data.saveProjects(list); close(); A.rerender(); };
      const d = m.querySelector('[data-del]'); if (d) d.onclick = async () => { if (!(await A.confirmDialog('Project “' + p.name + '” verwijderen?', t('common.delete')))) return; data.saveProjects(data.projects().filter((x) => x.id !== p.id)); close(); A.rerender(); };
    });
  }
  A.registerApp({
    id: 'projects', name: t('app.projects'), icon: 'folder', color: 'linear-gradient(160deg,#34c759,#1f9d47)', keywords: 'projects projecten lovable github',
    render(el, route) {
      const filter = route.params.status || ''; const list = data.projects().filter((p) => !filter || p.status === filter);
      el.innerHTML = '<div class="pad"><div class="ag-head" style="margin-top:0"><h2>' + t('app.projects') + '</h2><span class="spacer"></span><select class="input" style="width:auto" data-filter><option value="">Alle statussen</option>' + Object.entries(STATUSES).map(([k, v]) => '<option value="' + k + '"' + (filter === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><button class="btn btn-primary" data-add>' + icon('plus') + 'Project toevoegen</button></div>' +
        (list.length ? '<div class="proj-grid">' + list.map((p) => '<div class="card" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1">' + esc(p.name) + '</b><span class="status st-' + esc(p.status) + '">' + esc(STATUSES[p.status] || p.status) + '</span></div>' + (p.url ? '<span class="faint" style="font-size:12px;word-break:break-all">' + esc(A.hostOf(p.url)) + '</span>' : '') + (p.description ? '<p class="muted" style="margin:0;font-size:13px">' + esc(p.description) + '</p>' : '') + '<div style="display:flex;gap:8px;margin-top:auto">' + (p.url ? '<a class="btn btn-sm btn-primary" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + icon('external') + t('common.open') + '</a>' : '') + '<button class="btn btn-sm" data-edit="' + esc(p.id) + '">' + icon('pencil') + t('common.edit') + '</button></div></div>').join('') + '</div>'
          : '<div class="empty"><h3 style="margin:8px 0 4px;color:var(--text)">Nog geen projecten</h3><p>Voeg je Lovable- of GitHub-projecten toe zodat ze één klik weg zijn.</p><button class="btn btn-primary" data-add>Project toevoegen</button></div>') + '</div>';
      el.querySelector('[data-filter]').onchange = (e) => A.go('projects', null, { status: e.target.value });
      el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => openProjectDialog()));
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProjectDialog(data.projects().find((x) => x.id === b.dataset.edit))));
    }
  });
})();
