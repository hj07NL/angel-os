/* Ask Angel — doorzoekt je eigen websites, notities, projecten en taken en legt uit waarom iets past.
   Werkt volledig lokaal (geen externe AI): zoekwoorden + synoniemen + categorie-herkenning. */
(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data } = A;

  const SYN = {
    background: ['background', 'achtergrond', 'remove', 'verwijder', 'cutout', 'transparent', 'cleanup', 'objects'],
    achtergrond: ['background', 'achtergrond', 'remove', 'cutout', 'transparent'],
    pdf: ['pdf', 'document', 'convert', 'converteren', 'documents', 'files'],
    video: ['video', 'film', 'movie', 'motion', 'animation', 'stream'],
    muziek: ['music', 'audio', 'song', 'vocal', 'focus'],
    music: ['music', 'audio', 'song', 'vocal'],
    leren: ['learn', 'learning', 'course', 'courses', 'education', 'study', 'school', 'roadmap', 'quiz', 'flashcards'],
    learn: ['learn', 'learning', 'course', 'education', 'study'],
    studeren: ['study', 'learn', 'flashcards', 'quiz', 'school'],
    logo: ['logo', 'brand', 'design'],
    foto: ['image', 'photo', 'picture', 'png', 'images'],
    afbeelding: ['image', 'photo', 'picture', 'png', 'images'],
    image: ['image', 'photo', 'picture', 'png'],
    presentatie: ['presentation', 'slides', 'deck'],
    presentation: ['presentation', 'slides', 'deck'],
    code: ['code', 'coding', 'developer', 'programming', 'react', 'css', 'html'],
    programmeren: ['code', 'coding', 'developer', 'programming'],
    wallpaper: ['wallpaper', 'wallpapers', 'live', 'animated', 'background'],
    boek: ['book', 'books', 'ebook', 'library', 'read'],
    boeken: ['book', 'books', 'ebook', 'library'],
    lezen: ['read', 'book', 'ebook', 'typing'],
    typen: ['typing', 'type', 'speed'],
    kaart: ['map', 'maps', 'location', 'poster'],
    map: ['map', 'maps', 'location'],
    vliegtuig: ['flight', 'flights', 'air', 'tracking'],
    veilig: ['security', 'breach', 'privacy', 'osint'],
    wachtwoord: ['password', 'breach', 'pwned'],
    pc: ['pc', 'computer', 'builder', 'hardware'],
    repareren: ['repair', 'fix', 'guides'],
    recept: ['recipe', 'recipes', 'cooking', 'food', 'meal'],
    koken: ['recipe', 'cooking', 'food', 'meal'],
    naam: ['name', 'names', 'brand', 'domain'],
    game: ['game', 'games', 'playable', 'gaming'],
    spel: ['game', 'games'],
    chatbot: ['chat', 'chatbot', 'assistant', 'ai'],
    website: ['web', 'website', 'site', 'app', 'builder']
  };
  const STOP = new Set(['i', 'need', 'a', 'to', 'the', 'my', 'me', 'show', 'which', 'should', 'use', 'for', 'website', 'websites', 'an', 'of', 'and', 'is', 'can', 'what', 'find', 'ik', 'wil', 'een', 'de', 'het', 'mijn', 'welke', 'voor', 'om', 'te', 'met', 'van', 'en', 'is', 'zoek', 'toon', 'laat', 'zien', 'heb', 'nodig', 'site', 'sites', 'do', 'how', 'edit', 'bewerken']);

  function tokens(q) { return q.toLowerCase().replace(/[^\p{L}\p{N}&\s-]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)); }

  function catFromQuery(q) {
    const l = q.toLowerCase();
    return A.CATEGORIES.find((c) => new RegExp('\\b(' + c.id + '|' + c.name.toLowerCase() + ')\\b').test(l) && /\b(my|mijn|alle|all|show|toon)\b/.test(l));
  }

  function scoreText(fields, words) {
    let score = 0; const why = [];
    words.forEach((w) => {
      const variants = [w].concat(SYN[w] || [], w.length >= 6 ? [w.slice(0, Math.max(4, w.length - 3))] : []);
      for (const [label, text, weight] of fields) {
        const t = (text || '').toLowerCase();
        const hit = variants.find((v) => t.includes(v));
        if (hit) { score += weight * (hit === w ? 1 : 0.7); why.push(label + ' bevat “' + hit + '”'); break; }
      }
    });
    return { score, why: Array.from(new Set(why)).slice(0, 3) };
  }

  function ask(q) {
    const res = [];
    const cat = catFromQuery(q);
    const lower = q.toLowerCase();
    if (cat) {
      data.websites().filter((s) => s.category === cat.id).forEach((s) => res.push({ kind: 'site', item: s, score: 5, why: ['Categorie ' + cat.emoji + ' ' + cat.name] }));
      return { intro: 'Je hebt ' + res.length + ' websites in ' + cat.emoji + ' ' + cat.name + ':', res };
    }
    if (/lovable/.test(lower)) {
      data.projects().forEach((p) => res.push({ kind: 'project', item: p, score: 5, why: ['Project in je Projecten-app'] }));
      data.websites().filter((s) => /lovable\.(app|dev)/.test(s.url)).forEach((s) => res.push({ kind: 'site', item: s, score: 4, why: ['Gehost op ' + A.hostOf(s.url)] }));
      return { intro: res.length ? 'Dit zijn je Lovable-projecten en -sites:' : 'Ik vond geen Lovable-projecten. Voeg ze toe in Projecten.', res };
    }
    const words = tokens(q);
    if (!words.length) return { intro: 'Vertel wat je wilt doen, bijvoorbeeld “een website om een achtergrond te verwijderen”.', res };
    data.websites().forEach((s) => {
      const r = scoreText([['Naam', s.name, 3], ['Tags', (s.tags || []).join(' '), 2.5], ['Beschrijving', s.description, 2], ['Gebruik', s.ai_summary, 1.5], ['Notities', s.notes, 1.5], ['URL', s.url, 1], ['Categorie', A.catOf(s.category).name, 1]], words);
      if (r.score > 0) res.push({ kind: 'site', item: s, score: r.score + (s.is_favorite ? 0.3 : 0) + Math.min(1, (s.use_count || 0) / 20), why: r.why });
    });
    data.notes().forEach((n) => { const r = scoreText([['Titel', n.title, 3], ['Notitie', n.content, 1.5]], words); if (r.score > 0) res.push({ kind: 'note', item: n, score: r.score, why: r.why }); });
    data.projects().forEach((p) => { const r = scoreText([['Naam', p.name, 3], ['Beschrijving', p.description, 2], ['URL', p.url, 1]], words); if (r.score > 0) res.push({ kind: 'project', item: p, score: r.score, why: r.why }); });
    data.items().filter((i) => !i.done).forEach((i) => { const r = scoreText([['Taak', i.title + ' ' + (i.subject || ''), 2]], words); if (r.score > 0) res.push({ kind: 'task', item: i, score: r.score * 0.8, why: r.why }); });
    res.sort((a, b) => b.score - a.score);
    const top = res.slice(0, 8);
    return { intro: top.length ? 'Dit past het best bij “' + q + '”:' : 'Ik vond niets in je eigen bibliotheek voor “' + q + '”. Probeer andere woorden of voeg een website toe.', res: top };
  }
  A.angelAsk = ask;

  function resultHtml(r, i) {
    const why = '<div class="why">' + (i === 0 ? '⭐ Beste match · ' : '') + esc(r.why.join(' · ')) + '</div>';
    if (r.kind === 'site') { const s = r.item; return '<div class="result" data-k="site" data-id="' + esc(s.id) + '">' + A.favicon(s) + '<div style="min-width:0;flex:1"><b>' + esc(s.name) + '</b> <span class="faint" style="font-size:12px">' + esc(A.hostOf(s.url)) + '</span><div class="muted" style="font-size:13px;margin-top:2px">' + esc(s.description || '') + '</div>' + why + '</div>' + icon('external') + '</div>'; }
    if (r.kind === 'note') return '<div class="result" data-k="note" data-id="' + esc(r.item.id) + '"><span class="favicon">' + icon('note') + '</span><div style="flex:1"><b>' + esc(r.item.title || 'Naamloze notitie') + '</b><div class="muted" style="font-size:13px">Notitie</div>' + why + '</div></div>';
    if (r.kind === 'project') return '<div class="result" data-k="project" data-id="' + esc(r.item.id) + '"><span class="favicon">' + icon('folder') + '</span><div style="flex:1"><b>' + esc(r.item.name) + '</b><div class="muted" style="font-size:13px">' + esc(r.item.url || 'Project') + '</div>' + why + '</div></div>';
    return '<div class="result" data-k="task" data-id="' + esc(r.item.id) + '"><span class="favicon">' + icon('calendar') + '</span><div style="flex:1"><b>' + esc(r.item.title) + '</b><div class="muted" style="font-size:13px">Taak' + (r.item.date ? ' · ' + A.fmtLong(r.item.date) : '') + '</div>' + why + '</div></div>';
  }

  A.registerApp({
    id: 'angel', name: 'Angel', icon: 'bot', dock: true, keywords: 'ask vraag ai assistent',
    color: 'linear-gradient(135deg,#fb923c,#60a5fa)',
    render(el, route) {
      el.style.overflow = 'hidden';
      el.innerHTML = '<div class="angel"><div class="angel-feed"></div><form class="angel-bar"><input class="input" placeholder="Waarvoor heb je een website nodig?" aria-label="Vraag Angel"><button class="btn btn-primary" type="submit">↵ Vraag</button></form></div>';
      const feed = el.querySelector('.angel-feed'), form = el.querySelector('form'), inp = form.querySelector('input');
      const hero = () => {
        feed.innerHTML = '<div class="angel-hero"><div class="angel-logo">' + icon('bot') + '</div><h2 style="margin:0">Vraag Angel</h2><p class="muted">Angel doorzoekt je eigen websites, notities, projecten en taken — en legt uit waarom een resultaat past.</p><div class="suggests">' +
          ['Ik heb een website nodig om een achtergrond te verwijderen', 'Welke website gebruik ik om een PDF te bewerken?', 'Toon mijn AI websites', 'Vind mijn Lovable projecten', 'Iets om te leren programmeren'].map((s) => '<button class="chip" type="button">' + esc(s) + '</button>').join('') + '</div></div>';
        feed.querySelectorAll('.suggests .chip').forEach((b) => (b.onclick = () => run(b.textContent)));
      };
      const run = (q) => {
        q = q.trim(); if (!q) return;
        if (feed.querySelector('.angel-hero')) feed.innerHTML = '';
        const out = ask(q);
        const block = A.html('<div><div class="msg-q"><span>' + esc(q) + '</span></div><div class="msg-a"><div style="display:flex;gap:10px;align-items:center"><span class="angel-logo" style="width:28px;height:28px;border-radius:9px;margin:0">' + icon('bot') + '</span><b>' + esc(out.intro) + '</b></div>' + out.res.map(resultHtml).join('') + '</div></div>');
        block.querySelectorAll('.angel-logo svg').forEach((s) => { s.style.cssText = 'width:16px;height:16px'; });
        block.querySelectorAll('.result svg').forEach((s) => { s.style.cssText = 'width:16px;height:16px;flex:none;color:var(--muted)'; });
        block.querySelectorAll('.result').forEach((r) => (r.onclick = () => {
          const k = r.dataset.k, id = r.dataset.id;
          if (k === 'site') data.useWebsite(id);
          else if (k === 'note') A.go('notes', null, { id });
          else if (k === 'project') { const p = data.projects().find((x) => x.id === id); if (p && p.url) window.open(p.url, '_blank', 'noopener'); else A.go('projects'); }
          else { const t = data.items().find((x) => x.id === id); A.go('agenda', ['today'], t && t.date ? { date: t.date } : null); }
        }));
        feed.appendChild(block);
        feed.scrollTop = feed.scrollHeight;
        inp.value = '';
      };
      form.onsubmit = (e) => { e.preventDefault(); run(inp.value); };
      hero();
      if (route.params.q) run(route.params.q);
      setTimeout(() => inp.focus(), 50);
    }
  });
})();
