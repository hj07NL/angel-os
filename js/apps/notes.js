(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data } = A;

  // Eenvoudige, veilige markdown-weergave
  function md(src) {
    const lines = esc(src).split('\n');
    let out = '', inList = false;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    lines.forEach((l) => {
      const m = l.match(/^(#{1,3})\s+(.*)/);
      const li = l.match(/^\s*[-*]\s+(.*)/);
      if (li) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + inline(li[1]) + '</li>'; return; }
      if (inList) { out += '</ul>'; inList = false; }
      if (m) out += '<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>';
      else if (l.trim() === '') out += '<br>';
      else out += '<p style="margin:.3em 0">' + inline(l) + '</p>';
    });
    if (inList) out += '</ul>';
    return out;
  }

  A.registerApp({
    id: 'notes', name: 'Notities', icon: 'note', dock: true, keywords: 'notes notities',
    color: 'linear-gradient(135deg,#fcd34d,#d97706)',
    render(el, route) {
      let sel = route.params.id || null, q = '', preview = false;
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="notes"><aside class="notes-side"><div class="top"><label class="search">' + icon('search') + '<input placeholder="Zoek notities" aria-label="Zoek notities"></label><button class="btn btn-primary" data-new aria-label="Nieuwe notitie" style="padding:9px 11px">' + icon('plus') + '</button></div><div class="note-list"></div></aside><section class="note-editor"></section></div>';
      const list = el.querySelector('.note-list'), ed = el.querySelector('.note-editor'), wrap = el.querySelector('.notes');
      el.querySelector('.search input').oninput = (e) => { q = e.target.value.toLowerCase(); drawList(); };
      el.querySelector('[data-new]').onclick = () => {
        const n = { id: A.uid(), title: '', content: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        data.saveNotes([n].concat(data.notes())); sel = n.id; preview = false; drawList(); drawEditor();
        setTimeout(() => { const t = ed.querySelector('.note-title'); if (t) t.focus(); }, 20);
      };
      function drawList() {
        const notes = data.notes().filter((n) => !q || (n.title + ' ' + n.content).toLowerCase().includes(q)).sort((a, b) => (b.pinned - a.pinned) || b.updated_at.localeCompare(a.updated_at));
        list.innerHTML = notes.length ? notes.map((n) => '<div class="note-item ' + (n.id === sel ? 'on' : '') + '" data-id="' + esc(n.id) + '"><b>' + (n.pinned ? '📌 ' : '') + esc(n.title || 'Nieuwe notitie') + '</b><small>' + esc(n.content.slice(0, 80) || 'Leeg') + '</small></div>').join('') : '<p class="muted" style="padding:16px;font-size:13px">Geen notities.</p>';
        list.querySelectorAll('.note-item').forEach((it) => (it.onclick = () => { sel = it.dataset.id; preview = false; drawList(); drawEditor(); }));
      }
      let saveT = null;
      function drawEditor() {
        const n = data.notes().find((x) => x.id === sel);
        wrap.classList.toggle('editing', !!n);
        if (!n) { ed.innerHTML = '<div class="empty" style="border:none;margin:auto">Selecteer een notitie of maak een nieuwe.</div>'; return; }
        ed.innerHTML = '<div class="bar"><button class="btn btn-sm btn-ghost" data-back>' + icon('chevL') + 'Notities</button><span class="faint" style="font-size:12px" data-saved>Bewerkt ' + esc(A.relTime(n.updated_at)) + '</span><span style="flex:1"></span>' +
          '<button class="btn btn-sm" data-preview>' + (preview ? 'Bewerken' : 'Voorbeeld') + '</button><button class="btn btn-sm" data-pin>' + (n.pinned ? 'Losmaken' : '📌 Vastzetten') + '</button><button class="btn btn-sm" data-dl>' + icon('download') + '</button><button class="btn btn-sm btn-danger" data-del>' + icon('trash') + '</button></div>' +
          '<input class="note-title" placeholder="Titel" value="' + esc(n.title) + '">' +
          (preview ? '<div class="md">' + md(n.content) + '</div>' : '<textarea class="note-body" placeholder="Begin met schrijven… (markdown wordt ondersteund)">' + esc(n.content) + '</textarea>');
        const save = () => {
          clearTimeout(saveT);
          saveT = setTimeout(() => {
            const all = data.notes(); const x = all.find((y) => y.id === sel); if (!x) return;
            x.title = ed.querySelector('.note-title').value; const b = ed.querySelector('.note-body'); if (b) x.content = b.value;
            x.updated_at = new Date().toISOString(); data.saveNotes(all); drawList();
            const s = ed.querySelector('[data-saved]'); if (s) s.textContent = 'Opgeslagen';
          }, 350);
        };
        ed.querySelector('.note-title').oninput = save;
        const body = ed.querySelector('.note-body'); if (body) body.oninput = save;
        ed.querySelector('[data-back]').onclick = () => { sel = null; drawList(); drawEditor(); };
        ed.querySelector('[data-preview]').onclick = () => { preview = !preview; drawEditor(); };
        ed.querySelector('[data-pin]').onclick = () => { const all = data.notes(); const x = all.find((y) => y.id === sel); x.pinned = !x.pinned; data.saveNotes(all); drawList(); drawEditor(); };
        ed.querySelector('[data-dl]').onclick = () => { const blob = new Blob(['# ' + n.title + '\n\n' + n.content], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (n.title || 'notitie').replace(/[^\w-]+/g, '_') + '.md'; a.click(); };
        ed.querySelector('[data-del]').onclick = async () => {
          if (!(await A.confirmDialog('Notitie “' + (n.title || 'Naamloos') + '” verwijderen?', 'Verwijderen'))) return;
          data.saveNotes(data.notes().filter((y) => y.id !== sel)); sel = null; drawList(); drawEditor();
        };
      }
      drawList(); drawEditor();
    }
  });

  // ---------- Projecten ----------
  const STATUSES = { idee: 'Idee', bezig: 'Bezig', live: 'Live', gepauzeerd: 'Gepauzeerd' };
  function openProjectDialog(p) {
    p = p || {};
    A.openModal('<h2>' + (p.id ? 'Project bewerken' : 'Project toevoegen') + '</h2>' +
      '<label class="field">Naam<input class="input" name="name" value="' + esc(p.name || '') + '"></label>' +
      '<label class="field">URL (bijv. je Lovable- of GitHub-link)<input class="input" name="url" value="' + esc(p.url || '') + '" placeholder="https://"></label>' +
      '<label class="field">Status<select class="input" name="status">' + Object.entries(STATUSES).map(([k, v]) => '<option value="' + k + '"' + ((p.status || 'bezig') === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<label class="field">Beschrijving<textarea class="input" name="description">' + esc(p.description || '') + '</textarea></label>' +
      '<div class="modal-actions">' + (p.id ? '<button class="btn btn-danger" data-del style="margin-right:auto">Verwijderen</button>' : '') + '<button class="btn" data-close>Annuleren</button><button class="btn btn-primary" data-save>Opslaan</button></div>',
      (m, close) => {
        const v = (n) => m.querySelector('[name="' + n + '"]').value.trim();
        m.querySelector('[data-save]').onclick = () => {
          if (!v('name')) { A.toast('Geef een naam'); return; }
          let url = v('url'); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
          const list = data.projects(); const now = new Date().toISOString();
          const rec = { name: v('name'), url, status: v('status'), description: v('description'), updated_at: now };
          if (p.id) Object.assign(list.find((x) => x.id === p.id), rec); else list.unshift(Object.assign({ id: A.uid(), created_at: now }, rec));
          data.saveProjects(list); close(); A.rerender();
        };
        const d = m.querySelector('[data-del]');
        if (d) d.onclick = () => { data.saveProjects(data.projects().filter((x) => x.id !== p.id)); close(); A.rerender(); };
      });
  }

  A.registerApp({
    id: 'projects', name: 'Projecten', icon: 'folder', dock: true, keywords: 'projects lovable github',
    color: 'linear-gradient(135deg,#4ade80,#16a34a)',
    render(el, route) {
      const filter = route.params.status || '';
      const list = data.projects().filter((p) => !filter || p.status === filter);
      el.innerHTML = '<div class="pad"><div class="ag-head" style="margin-top:0"><h2>Projecten</h2><span class="spacer"></span><select class="input" style="width:auto" data-filter><option value="">Alle statussen</option>' + Object.entries(STATUSES).map(([k, v]) => '<option value="' + k + '"' + (filter === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><button class="btn btn-primary" data-add>' + icon('plus') + 'Project toevoegen</button></div>' +
        (list.length ? '<div class="proj-grid">' + list.map((p) => '<div class="card" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1">' + esc(p.name) + '</b><span class="status st-' + esc(p.status) + '">' + esc(STATUSES[p.status] || p.status) + '</span></div>' + (p.url ? '<span class="faint" style="font-size:12px;word-break:break-all">' + esc(A.hostOf(p.url)) + '</span>' : '') + (p.description ? '<p class="muted" style="margin:0;font-size:13px">' + esc(p.description) + '</p>' : '') + '<div style="display:flex;gap:8px;margin-top:auto">' + (p.url ? '<a class="btn btn-sm btn-primary" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + icon('external') + 'Openen</a>' : '') + '<button class="btn btn-sm" data-edit="' + esc(p.id) + '">' + icon('pencil') + 'Bewerken</button></div></div>').join('') + '</div>'
          : '<div class="empty">' + icon('folder') + '<h3 style="margin:8px 0 4px;color:var(--text)">Nog geen projecten</h3><p>Voeg je Lovable- of GitHub-projecten toe zodat ze één klik weg zijn.</p><button class="btn btn-primary" data-add>Project toevoegen</button></div>') + '</div>';
      el.querySelectorAll('.empty > svg').forEach((s) => { s.style.cssText = 'width:28px;height:28px'; });
      el.querySelector('[data-filter]').onchange = (e) => A.go('projects', null, { status: e.target.value });
      el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => openProjectDialog()));
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProjectDialog(data.projects().find((x) => x.id === b.dataset.edit))));
    }
  });
})();
