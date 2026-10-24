/* Mappen (genest), automatische indeling, dubbelen, en de veilige "Websites opnieuw indelen"-workflow met geschiedenis/ongedaan maken.
   Websites worden hier NOOIT verwijderd: alleen hun map-toewijzing (folder_id), tags en lege beschrijvingen kunnen veranderen. */
(function () {
  'use strict';
  const A = window.AOS;
  const { data, store, uid } = A;

  // ---------- Boom-hulpfuncties ----------
  const children = (folders, pid) => folders.filter((f) => (f.parent_id || null) === (pid || null)).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  function pathOf(folders, id) { const out = []; let f = folders.find((x) => x.id === id); let guard = 0; while (f && guard++ < 50) { out.unshift(f); f = folders.find((x) => x.id === f.parent_id); } return out; }
  const pathLabel = (folders, id) => pathOf(folders, id).map((f) => f.name).join(' › ') || A.t('site.uncategorized');
  function descendants(folders, id) { const out = []; const walk = (pid) => children(folders, pid).forEach((c) => { out.push(c.id); walk(c.id); }); walk(id); return out; }
  function uncategorized(folders) { return folders.find((f) => f.system) || folders.find((f) => f.name === 'Niet ingedeeld'); }
  function countIn(folders, sites, id, deep) { const ids = new Set([id].concat(deep ? descendants(folders, id) : [])); return sites.filter((s) => ids.has(s.folder_id)).length; }

  function createFolder(name, parentId, emoji) {
    name = (name || '').trim(); if (!name) throw new Error('Geef de map een naam');
    const folders = data.folders();
    const exists = folders.find((f) => (f.parent_id || null) === (parentId || null) && f.name.toLowerCase() === name.toLowerCase());
    if (exists) return { folder: exists, created: false };
    const f = { id: uid(), name, emoji: emoji || '📁', parent_id: parentId || null, order: folders.length, created_at: new Date().toISOString() };
    folders.push(f); data.saveFolders(folders);
    return { folder: f, created: true };
  }
  function renameFolder(id, name) { const folders = data.folders(); const f = folders.find((x) => x.id === id); if (!f) return; f.name = name.trim() || f.name; data.saveFolders(folders); }
  function moveFolder(id, newParent) {
    const folders = data.folders();
    if (id === newParent || descendants(folders, id).includes(newParent)) throw new Error('Een map kan niet in zichzelf worden geplaatst');
    const f = folders.find((x) => x.id === id); if (!f) return; f.parent_id = newParent || null; f.order = folders.length; data.saveFolders(folders);
  }
  // Verwijderen van een map verplaatst de inhoud (websites én submappen) naar de bovenliggende map of "Niet ingedeeld" — er gaan nooit websites verloren.
  function deleteFolder(id) {
    const folders = data.folders(); const f = folders.find((x) => x.id === id); if (!f || f.system) throw new Error('Deze map kan niet worden verwijderd');
    const target = f.parent_id || uncategorized(folders).id;
    folders.forEach((x) => { if (x.parent_id === id) x.parent_id = f.parent_id || null; });
    const sites = data.websites(); let moved = 0; sites.forEach((s) => { if (s.folder_id === id) { s.folder_id = target; moved++; } });
    data.saveWebsites(sites); data.saveFolders(folders.filter((x) => x.id !== id));
    return moved;
  }
  function mergeFolders(sourceId, targetId) {
    if (sourceId === targetId) return 0;
    const folders = data.folders();
    if (descendants(folders, sourceId).includes(targetId)) throw new Error('Kan een map niet samenvoegen met een eigen submap');
    folders.forEach((x) => { if (x.parent_id === sourceId) x.parent_id = targetId; });
    const sites = data.websites(); let moved = 0; sites.forEach((s) => { if (s.folder_id === sourceId) { s.folder_id = targetId; moved++; } });
    data.saveWebsites(sites); data.saveFolders(folders.filter((x) => x.id !== sourceId));
    return moved;
  }

  // ---------- Indelingsregels ----------
  const RULES = [
    [['Technologie', 'Kunstmatige intelligentie', 'AI-chatbots'], ['chatbot', 'chatbots', 'ai-chat', 'llm', 'ai-aggregator', 'ai-assistant', 'chatgpt', 'claude', 'gemini', 'voice-control', 'ai-workspace', 'chat-threads', 'ai-agents']],
    [['Technologie', 'Kunstmatige intelligentie', 'AI-beeldgeneratie'], ['ai-art', '3d', 'generative-ai', 'image-analysis', 'ai-design', 'logo-maker', 'inpainting', 'geolocation']],
    [['Technologie', 'Kunstmatige intelligentie', 'AI-schrijven'], ['writing-assistant', 'ai-writing', 'copywriting', 'paraphrase']],
    [['Technologie', 'Kunstmatige intelligentie', 'AI-programmeren'], ['ai-coding', 'app-builder', 'no-code', 'game-maker', 'ai-generator']],
    [['Technologie', 'Kunstmatige intelligentie'], ['ai', 'ai-tools', 'ai-powered', 'artificial intelligence', 'ai-learning']],
    [['Technologie', 'Programmeren', 'HTML en CSS'], ['css', 'html', 'tailwind', 'ui-components', 'frontend']],
    [['Technologie', 'Programmeren', 'JavaScript'], ['javascript', 'react', 'node', 'typescript']],
    [['Technologie', 'Programmeren', 'Python'], ['python']],
    [['Technologie', 'Programmeren'], ['programming', 'coding', 'developer-roadmap', 'cheat-sheet', 'syntax', 'iot', 'arduino', 'esp32', 'microcontrollers', 'web-development', 'developer-tools']],
    [['Technologie', 'Productiviteit', 'Planning'], ['planning', 'planner', 'calendar', 'workflow', 'automation', 'forecasting']],
    [['Technologie', 'Productiviteit', 'Notities'], ['notes', 'note-taking']],
    [['Technologie', 'Productiviteit', 'Presentaties'], ['presentations', 'slides']],
    [['Technologie', 'Productiviteit'], ['productivity', 'focus', 'deep work']],
    [['Technologie', 'Hulpmiddelen'], ['file-converter', 'utilities', 'converters', 'pdf-tools', 'pdf-editor', 'online-utilities', 'tools', 'generator', 'printable', 'graph-paper', 'apk-downloads', 'repair', 'diy', 'directory', 'free-resources', 'pc-builder', 'hardware', 'wifi']],
    [['Technologie', 'Beveiliging'], ['security', 'osint', 'privacy', 'data-breach', 'passwords', 'threat-intelligence', 'identity-theft', 'sms-verification', 'cybersecurity', 'investigation', 'facial-recognition', 'surveillance']],
    [['Onderwijs', 'Economie'], ['economics', 'economie', 'finance', 'business']],
    [['Onderwijs', 'Engels'], ['english', 'engels', 'vocabulary']],
    [['Onderwijs', 'Wiskunde'], ['math', 'mathematics', 'wiskunde', 'algebra', 'calculus']],
    [['Onderwijs', 'Geschiedenis'], ['history', 'geschiedenis']],
    [['Onderwijs'], ['education', 'learning', 'courses', 'online courses', 'mooc', 'moocs', 'study-tools', 'flashcards', 'quizzes', 'university', 'certificates', 'edtech', 'training', 'simulation', 'typing-practice', 'distance-learning']],
    [['Creativiteit', 'Grafisch ontwerp'], ['design', 'graphic-design', 'branding', 'typography', 'mockups', 'design-tools', 'design-system', 'ui-design', 'poster-design', 'content-creation']],
    [['Creativiteit', 'Videobewerking'], ['video-editor', 'motion-design', 'animation', 'ui-animation', 'video-export', 'stock-footage', 'video-creator', 'kinetic-type']],
    [['Creativiteit', 'Afbeeldingen'], ['png', 'clipart', 'transparent-background', 'stock-images', 'wallpapers', 'live-wallpapers', 'photo-editing', 'object-removal', 'images']],
    [['Entertainment', 'Muziek'], ['music', 'audio', 'vocal-remover', 'karaoke', 'focus music', 'ambient audio', 'music-production']],
    [['Entertainment'], ['games', 'casual-games', 'streaming', 'movies', 'tv-shows', 'entertainment', 'virtual-pets', 'memory-games']],
    [['Onderzoek', 'Boeken en documenten'], ['ebooks', 'books', 'library', 'literature', 'public-domain', 'reading', 'archive']],
    [['Onderzoek'], ['research', 'deep-research', 'people-search', 'intelligence', 'search-engine', 'webcams', 'live-map', 'flight-tracking']],
    [['Persoonlijk', 'Reizen en kaarten'], ['travel', 'road-trip', 'trip-planner', 'maps', 'map-generator', 'flight-tracker', 'aviation', 'hotspots', 'cartography']],
    [['Persoonlijk', 'Koken'], ['cooking', 'recipes', 'food', 'meal-planning']]
  ];
  function textOf(s, health) {
    const h = health && health.results ? health.results[s.url] : null;
    return [s.name, s.url, s.description, s.ai_summary, s.notes, (s.tags || []).join(' | '), h && h.title, h && h.meta_description].filter(Boolean).join(' | ').toLowerCase();
  }
  function hit(text, kw) { return new RegExp('(^|[^a-z0-9-])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9-])').test(text); }

  // Geeft het beste mappad terug met zekerheid en reden.
  function classify(site, health) {
    const text = textOf(site, health);
    const tagSet = new Set((site.tags || []).map((x) => x.toLowerCase()));
    const scored = RULES.map(([path, kws]) => {
      let score = 0; const why = [];
      kws.forEach((k) => { if (tagSet.has(k)) { score += 3; why.push('tag “' + k + '”'); } else if (hit(text, k)) { score += 1; why.push('“' + k + '”'); } });
      return { path, score: score + (score ? path.length * 0.4 : 0), why };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return { path: ['Niet ingedeeld'], confidence: 0, why: ['geen herkenbare kenmerken'], uncertain: true };
    const best = scored[0], second = scored[1];
    const margin = second ? best.score - second.score : best.score;
    const confidence = Math.max(0.2, Math.min(0.97, 0.35 + best.score / 12 + margin / 10));
    return { path: best.path, confidence: Math.round(confidence * 100) / 100, why: best.why.slice(0, 3), uncertain: confidence < 0.5, alt: second ? second.path : null };
  }

  function suggestTags(site) {
    const text = textOf(site);
    const tags = new Set(site.tags || []);
    RULES.forEach(([, kws]) => kws.forEach((k) => { if (tags.size < 6 && !k.includes(' ') && hit(text, k)) tags.add(k); }));
    return Array.from(tags);
  }

  // Dubbelen: zelfde genormaliseerde URL, of zelfde naam + host
  function findDuplicates(sites) {
    const groups = {};
    sites.forEach((s) => { const k = A.normUrl(s.url); (groups[k] = groups[k] || []).push(s.id); });
    const byHost = {};
    sites.forEach((s) => { const k = A.hostOf(s.url) + '|' + (s.name || '').toLowerCase().trim(); (byHost[k] = byHost[k] || []).push(s.id); });
    const out = [];
    Object.entries(groups).forEach(([k, ids]) => { if (ids.length > 1) out.push({ kind: 'url', key: k, ids }); });
    Object.entries(byHost).forEach(([k, ids]) => { if (ids.length > 1 && !out.some((o) => ids.every((i) => o.ids.includes(i)))) out.push({ kind: 'mogelijk', key: k, ids }); });
    return out;
  }

  // ---------- Voorstel maken ----------
  async function proposeReorganization(opts) {
    opts = opts || {};
    const folders = data.folders();
    let sites = data.websites();
    const health = data.health();
    if (opts.folderIds && opts.folderIds.length) {
      const scope = new Set(opts.folderIds.flatMap((id) => [id].concat(descendants(folders, id))));
      sites = sites.filter((s) => scope.has(s.folder_id));
    }
    const newFolders = []; // { key, name, parentKey|parentId, path }
    const keyForPath = (path) => {
      let parentId = null, parentKey = null;
      for (let i = 0; i < path.length; i++) {
        const name = path[i];
        const existing = parentKey ? null : folders.find((f) => (f.parent_id || null) === parentId && f.name.toLowerCase() === name.toLowerCase());
        if (existing) { parentId = existing.id; continue; }
        const key = 'new:' + path.slice(0, i + 1).join('/');
        if (!newFolders.find((n) => n.key === key)) newFolders.push({ key, name, parentId: parentKey ? null : parentId, parentKey, path: path.slice(0, i + 1) });
        parentKey = key; parentId = null;
      }
      return parentKey || parentId;
    };
    let aiUsed = false;
    const changes = [];
    for (const s of sites) {
      let c = classify(s, health);
      if (c.uncertain && opts.useAI && A.ai && A.ai.available()) {
        try { const r = await A.ai.classifyWebsite(s, folders); if (r && r.path && r.path.length) { c = { path: r.path, confidence: r.confidence || 0.6, why: ['AI: ' + (r.reason || 'analyse')], uncertain: (r.confidence || 0.6) < 0.5 }; aiUsed = true; } } catch (e) { /* regels blijven gelden */ }
      }
      const target = keyForPath(c.path);
      const flags = [];
      if (!s.description || s.description.length < 25) flags.push('beschrijving ontbreekt');
      const h = health.results && health.results[s.url];
      if (h && ['offline', 'parked', 'suspicious', 'cert_problem'].includes(h.status)) flags.push('controle: ' + A.t('site.status.' + h.status));
      changes.push({ siteId: s.id, name: s.name, url: s.url, from: s.folder_id, to: target, confidence: c.confidence, why: c.why, uncertain: !!c.uncertain, flags, newTags: suggestTags(s), approve: target !== s.folder_id && !c.uncertain });
    }
    const dupes = opts.detectDuplicates === false ? [] : findDuplicates(data.websites());
    return { createdAt: new Date().toISOString(), scope: opts.folderIds || null, changes, newFolders, duplicates: dupes, aiUsed, analyzedOnly: !!opts.analyzeOnly };
  }

  // ---------- Toepassen + geschiedenis ----------
  function applyReorganization(plan) {
    const before = data.websites();
    const baseline = before.length;
    const folders = data.folders();
    const history = store.get('folderHistory', []);
    const snap = { id: uid(), at: new Date().toISOString(), label: 'Opnieuw indelen (' + plan.changes.filter((c) => c.approve).length + ' wijzigingen)', assignments: Object.fromEntries(before.map((s) => [s.id, s.folder_id])), tags: Object.fromEntries(before.map((s) => [s.id, s.tags || []])), folders: JSON.parse(JSON.stringify(folders)) };
    const keyToId = {};
    const approved = plan.changes.filter((c) => c.approve);
    const neededKeys = new Set();
    approved.forEach((c) => { if (typeof c.to === 'string' && c.to.startsWith('new:')) { let k = c.to; while (k) { neededKeys.add(k); const nf = plan.newFolders.find((n) => n.key === k); k = nf && nf.parentKey; } } });
    plan.newFolders.filter((n) => neededKeys.has(n.key)).sort((a, b) => a.path.length - b.path.length).forEach((n) => {
      const parentId = n.parentKey ? keyToId[n.parentKey] : n.parentId;
      const f = { id: uid(), name: n.name, emoji: '📁', parent_id: parentId || null, order: folders.length, created_at: new Date().toISOString(), created_by: 'reorganize' };
      folders.push(f); keyToId[n.key] = f.id;
    });
    const sites = data.websites();
    let moved = 0, tagged = 0;
    approved.forEach((c) => {
      const s = sites.find((x) => x.id === c.siteId); if (!s) return;
      const dest = typeof c.to === 'string' && c.to.startsWith('new:') ? keyToId[c.to] : c.to;
      if (dest && dest !== s.folder_id) { s.folder_id = dest; moved++; }
      if (c.applyTags && c.newTags) { const before2 = (s.tags || []).length; s.tags = Array.from(new Set((s.tags || []).concat(c.newTags))); if (s.tags.length !== before2) tagged++; }
    });
    if (sites.length !== baseline) throw new Error('Aantal websites veranderde onverwacht — niets opgeslagen');
    data.saveFolders(folders); data.saveWebsites(sites);
    history.unshift(snap); store.set('folderHistory', history.slice(0, 10));
    return { moved, tagged, createdFolders: Object.keys(keyToId).length, snapshotId: snap.id };
  }

  function undoLast() {
    const history = store.get('folderHistory', []);
    const snap = history.find((h) => h.label && !h.label.startsWith('Eerste'));
    if (!snap) return null;
    const sites = data.websites();
    sites.forEach((s) => { if (snap.assignments[s.id]) s.folder_id = snap.assignments[s.id]; if (snap.tags && snap.tags[s.id]) s.tags = snap.tags[s.id]; });
    // mappen herstellen; mappen die later handmatig zijn gemaakt blijven bestaan
    const current = data.folders();
    const restored = snap.folders.slice();
    current.forEach((f) => { if (!restored.some((r) => r.id === f.id) && f.created_by !== 'reorganize') restored.push(f); });
    const ids = new Set(restored.map((f) => f.id));
    const unc = uncategorized(restored);
    sites.forEach((s) => { if (!ids.has(s.folder_id)) s.folder_id = unc.id; });
    data.saveFolders(restored); data.saveWebsites(sites);
    store.set('folderHistory', history.filter((h) => h.id !== snap.id));
    return snap;
  }

  A.folders = { children, pathOf, pathLabel, descendants, uncategorized, countIn, createFolder, renameFolder, moveFolder, deleteFolder, mergeFolders, classify, suggestTags, findDuplicates, proposeReorganization, applyReorganization, undoLast, RULES };
})();
