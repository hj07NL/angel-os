(function () {
  'use strict';
  const A = window.AOS;
  const { esc, icon, data } = A;

  function siteRow(s) {
    const c = A.catOf(s.category);
    return '<div class="site-row" data-site="' + esc(s.id) + '">' + A.favicon(s) + '<div style="min-width:0"><b>' + esc(s.name) + '</b><small>' + c.emoji + ' ' + esc(c.name) + '</small></div></div>';
  }

  A.registerApp({
    id: 'home', name: 'Home', icon: 'home', dock: true,
    color: 'linear-gradient(135deg,#fb923c,#ea580c)',
    render(el) {
      const s = data.settings();
      const sites = data.websites();
      const notes = data.notes();
      const projects = data.projects();
      const items = data.items();
      const t = A.today();
      const todays = items.filter((i) => i.date === t);
      const h = new Date().getHours();
      const greet = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
      const recent = sites.filter((x) => x.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at)).slice(0, 4);
      const most = sites.slice().sort((a, b) => (b.use_count || 0) - (a.use_count || 0) || (a.sort_order || 0) - (b.sort_order || 0)).slice(0, 8);
      const favs = sites.filter((x) => x.is_favorite).slice(0, 8);
      const upcoming = items.filter((i) => !i.done && (i.deadline || i.date) && (i.deadline || i.date) >= t).sort((a, b) => (a.deadline || a.date).localeCompare(b.deadline || b.date)).slice(0, 5);
      const d = new Date();

      el.innerHTML = '<div class="pad">' +
        '<div class="home-head"><div><div class="label">' + esc(A.DAYS[d.getDay()]) + ' ' + d.getDate() + ' ' + esc(A.MONTHS[d.getMonth()]) + '</div>' +
        '<h1>' + greet + (s.name ? ', <span>' + esc(s.name) + '</span>' : '') + '</h1></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" data-add>' + icon('plus') + 'Website toevoegen</button><button class="btn" data-ask>' + icon('sparkles') + 'Vraag Angel</button></div></div>' +
        '<div class="stats">' +
        '<div class="stat" data-go="library"><b>' + sites.length + '</b><span>Websites</span></div>' +
        '<div class="stat" data-go="notes"><b>' + notes.length + '</b><span>Notities</span></div>' +
        '<div class="stat" data-go="projects"><b>' + projects.length + '</b><span>Projecten</span></div>' +
        '<div class="stat" data-go="agenda"><b>' + todays.filter((i) => i.done).length + '/' + todays.length + '</b><span>Taken vandaag klaar</span></div>' +
        '</div>' +
        (upcoming.length ? '<div class="section-title">' + icon('calendar') + '<span class="label">Binnenkort</span></div><div class="site-row-grid">' +
          upcoming.map((i) => '<div class="site-row" data-item-date="' + esc(i.date || i.deadline) + '"><span class="dot t-' + esc(i.type) + '"></span><div style="min-width:0"><b>' + esc(i.title) + '</b><small>' + (i.deadline ? '⏳ deadline ' + A.fmtShort(i.deadline) : A.fmtLong(i.date)) + (i.time ? ' · ' + esc(i.time) : '') + (i.subject ? ' · ' + esc(i.subject) : '') + '</small></div></div>').join('') + '</div>' : '') +
        (recent.length ? '<div class="section-title">' + icon('clock') + '<span class="label">Recent</span></div><div class="site-row-grid">' + recent.map(siteRow).join('') + '</div>' : '') +
        (favs.length ? '<div class="section-title">' + icon('star') + '<span class="label">Favorieten</span></div><div class="site-row-grid">' + favs.map(siteRow).join('') + '</div>' : '') +
        '<div class="section-title">' + icon('trending') + '<span class="label">Meest gebruikt</span></div>' +
        (most.length ? '<div class="site-row-grid">' + most.map(siteRow).join('') + '</div>' : '<div class="empty">Nog geen websites. Voeg je eerste website toe.</div>') +
        '</div>';

      el.querySelectorAll('[data-site]').forEach((r) => (r.onclick = () => data.useWebsite(r.dataset.site)));
      el.querySelectorAll('[data-go]').forEach((r) => (r.onclick = () => A.go(r.dataset.go)));
      el.querySelectorAll('[data-item-date]').forEach((r) => (r.onclick = () => A.go('agenda', null, { date: r.dataset.itemDate })));
      el.querySelector('[data-add]').onclick = () => A.openWebsiteDialog();
      el.querySelector('[data-ask]').onclick = () => A.go('angel');
    }
  });
})();
