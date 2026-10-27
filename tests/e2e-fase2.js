// Draaien: node tests/e2e-fase2.js  (vereist playwright; laadt de echte back-up uit /backups in een schone browser)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)); });
const ics = (uid, start, sum) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${start.replace(/T(\d\d)/, (m, h) => 'T' + String(+h + 1).padStart(2, '0'))}\r\nSUMMARY:${sum}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
(async () => {
  await new Promise((r) => srv.listen(8766, r));
  const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1280, height: 900 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error' && !/fonts|favicon|net::|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  const hits = { school: 0, proxyIcs: 0, put: [] }; let failProxy = false;
  const today = await pg.evaluate(() => 1).then(() => new Date()); const ymd = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  await pg.route(/^https?:\/\/(?!localhost)/, (r) => {
    const u = r.request().url(); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.startsWith('https://school.test/')) { hits.school++; return r.fulfill({ status: 200, headers: h, contentType: 'text/calendar', body: ics('s1', ymd(today) + 'T080000Z', 'Les wiskunde') }); }
    if (u.startsWith('https://proxy.test/v1/calendars/') && r.request().method() === 'PUT') { hits.put.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, headers: h, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.startsWith('https://proxy.test/') && u.endsWith('/ics')) { hits.proxyIcs++; if (failProxy) return r.fulfill({ status: 502, headers: h, contentType: 'application/json', body: '{"error":"De agenda-server antwoordde met 500"}' }); return r.fulfill({ status: 200, headers: h, contentType: 'text/calendar', body: ics('g1', ymd(today) + 'T090000Z', 'Tandarts') }); }
    return r.abort();
  });
  const backup = JSON.parse(fs.readFileSync(root + '/backups/2026-10-27-fase0/localstorage-backup-geredigeerd.json', 'utf8'));
  await pg.goto('http://localhost:8766/index.html'); await pg.waitForTimeout(600);
  await pg.evaluate((j) => { const A = window.AOS; A.BACKUP_KEYS.forEach((k) => { if (k in j.data) A.store.set(k, j.data[k]); }); A.store.set('schema', j.schema); }, backup);
  await pg.reload(); await pg.waitForTimeout(1200);
  let n = 0; const ok = (m) => { n++; console.log('ok', m); };
  const A = (f, arg) => pg.evaluate(f, arg);

  // 0. echte data intact
  let c = await A(() => ({ w: AOS.data.websites().length, r: AOS.store.get('rooster', []).length, it: AOS.data.items().length, roll: AOS.data.settings().tasks.rollover }));
  assert.strictEqual(c.w, 71); assert.strictEqual(c.r, 166); ok('echte back-up geladen: 71 websites, 166 rooster-items; doorschuiven = ' + c.roll);
  assert.strictEqual(c.roll, 'auto'); ok('doorschuiven staat standaard op automatisch');

  // 1. Somtoday-bron zonder url wordt niet aangeraakt door refreshAll
  const r0 = await A(() => AOS.cal.refreshAll({ manual: true })); assert.deepStrictEqual(r0, []);
  assert.strictEqual(await A(() => AOS.store.get('rooster', []).length), 166); ok('refreshAll raakt de 166 Somtoday-items niet aan (bron zonder link)');

  // 2. directe bron verversen + foutgeval behoudt bestaande data
  await A(() => AOS.cal.writeSource({ label: '🏫 Test' }, { url: 'https://school.test/a.ics', count: 0 }, []));
  let res = await A(() => AOS.cal.refreshAll({ manual: true })); assert.ok(res[0].ok && res[0].count === 1, JSON.stringify(res));
  assert.strictEqual(await A(() => AOS.store.get('rooster', []).length), 167); ok('directe iCal-bron ververst (167 items totaal)');

  // 3. Google via proxy: koppelen via instellingen-API, versleuteld bewaren gebeurt server-side; url niet lokaal
  await A(() => AOS.cal.proxy.set({ base: 'https://proxy.test', key: AOS.cal.proxy.genKey() }));
  const r1 = await A(() => AOS.cal.addProxyCalendar('📆 Google Agenda', 'https://calendar.google.com/calendar/ical/x/private-GEHEIM/basic.ics'));
  assert.ok(r1.ok); assert.strictEqual(hits.put.length, 1);
  const calStore = await A(() => JSON.stringify(AOS.store.get('calendars')) + JSON.stringify(AOS.snapshot()));
  assert.ok(!calStore.includes('private-GEHEIM'), 'geheime URL lokaal opgeslagen');
  const snap = await A(() => JSON.stringify(AOS.snapshot())); assert.ok(!snap.includes(await A(() => AOS.cal.proxy.get().key)), 'proxy-sleutel zit in back-up');
  ok('Google gekoppeld via proxy; geheime URL en sleutel staan niet in opgeslagen agenda-data of back-up');

  // 4. fout per bron: oude data blijft, foutmelding zichtbaar
  failProxy = true; res = await A(() => AOS.cal.refreshAll({ manual: true }));
  assert.ok(res.find((x) => x.label.includes('Google') && !x.ok)); assert.ok(res.find((x) => x.label.includes('Test') && x.ok));
  const st = await A(() => ({ cals: AOS.store.get('calendars').map((x) => [x.label, x.error, !!x.updated]), n: AOS.store.get('rooster', []).filter((e) => e.cal.includes('Google')).length }));
  assert.strictEqual(st.n, 1); ok('bij fout in Google blijft het oude afspraak staan, andere bron gaat gewoon door: ' + JSON.stringify(st.cals.map((x) => x[1])));
  failProxy = false;

  // 5. onlyDue respecteert het interval
  const before = hits.school; await A(() => AOS.cal.refreshAll({ onlyDue: true })); assert.strictEqual(hits.school, before); ok('automatisch verversen slaat bronnen over die net zijn bijgewerkt');
  await A(() => { const l = AOS.store.get('calendars'); l.forEach((x) => { x.lastTry = new Date(Date.now() - 4 * 3600e3).toISOString(); }); AOS.store.set('calendars', l); });
  await A(() => AOS.cal.refreshAll({ onlyDue: true })); assert.strictEqual(hits.school, before + 1); ok('bronnen ouder dan het interval worden automatisch ververst');

  // 6. doorschuiven + teller + uitzetten
  const d3 = await A(() => AOS.ymd(AOS.addDays(AOS.now(), -3)));
  const ids = await A(({ d3 }) => [AOS.tasks.addItem({ title: 'Oud huiswerk', type: 'homework', date: d3 }).id, AOS.tasks.addItem({ title: 'Oude toets', type: 'test', date: d3 }).id, AOS.tasks.addItem({ title: 'Oude afspraak', type: 'event', date: d3 }).id], { d3 });
  await A(() => { document.querySelector('#dock'); });
  await pg.evaluate(() => { const s = AOS.data.settings(); s.tasks.rollover = 'auto'; AOS.data.saveSettings(s); });
  await pg.waitForTimeout(100); await A(() => { AOS.store.set('lastDay', '1999-01-01'); });
  await pg.reload(); await pg.waitForTimeout(2600);
  const it = await A((ids) => ids.map((id) => { const i = AOS.data.items().find((x) => x.id === id); return [i.date, i.originalDate || null, AOS.tasks.postponedDays(i)]; }), ids);
  const today2 = await A(() => AOS.today());
  assert.strictEqual(it[0][0], today2); assert.strictEqual(it[0][2], 3); assert.notStrictEqual(it[1][0], today2); assert.notStrictEqual(it[2][0], today2);
  ok('huiswerk 3 dagen oud schuift naar vandaag (teller 3); toets en afspraak blijven staan');
  await pg.goto('http://localhost:8766/index.html#/agenda/today'); await pg.waitForTimeout(800);
   const chip = await pg.locator('.chip.postponed').first().innerText(); assert.ok(/3 dagen uitgesteld/.test(chip), chip); ok('zichtbaar in de lijst: "' + chip.trim() + '"');
  await A(() => { const s = AOS.data.settings(); s.tasks.rollover = 'overdue'; AOS.data.saveSettings(s); const i = AOS.tasks.addItem({ title: 'Blijft liggen', type: 'task', date: AOS.ymd(AOS.addDays(AOS.now(), -2)) }); window.__stay = i.id; });
  await A(() => { AOS.store.set('lastDay', '1999-01-01'); });
  await pg.reload(); await pg.waitForTimeout(2600);
  assert.notStrictEqual(await A(() => AOS.data.items().find((x) => x.id === window.__stay) && 0), 1);
  const stay = await A(() => { const i = AOS.data.items().find((x) => x.title === 'Blijft liggen'); return i.date !== AOS.today(); }); assert.ok(stay); ok('met doorschuiven uit blijft een oude taak op zijn datum');

  // 7. gedeelde lijst + afvinken van externe afspraak + FAB
  await pg.goto('http://localhost:8766/index.html#/agenda/today'); await pg.waitForTimeout(900);
  const rows = await pg.locator('[data-unified] .task').count(); assert.ok(rows >= 2, 'rows ' + rows);
  const tand = pg.locator('[data-ext]:has-text("Tandarts")'); await tand.locator('[data-ext-check]').click(); await pg.waitForTimeout(200);
  assert.ok(await pg.locator('[data-ext]:has-text("Tandarts") .task.done').count() === 1); assert.ok(Object.keys(await A(() => AOS.store.get('extDone'))).length === 1);
  ok('dagoverzicht toont agenda-items + taken samen (' + rows + ' regels) en een agenda-afspraak is af te vinken');
  await pg.reload(); await pg.waitForTimeout(900); assert.ok(await pg.locator('[data-ext]:has-text("Tandarts") .task.done').count() === 1); ok('afvinkstatus blijft na herladen');
  await pg.click('#fab'); await pg.fill('.modal [name="title"]', 'morgen 16:00 economie leren'); await pg.click('.modal [data-cat="homework"]');
  assert.ok((await pg.inputValue('.modal [name="time"]')) === '16:00'); await pg.click('.modal [data-save]'); await pg.waitForTimeout(300);
  const qa = await A(() => AOS.data.items().find((x) => /economie/i.test(x.title))); assert.strictEqual(qa.type, 'homework'); assert.strictEqual(qa.time, '16:00'); assert.strictEqual(qa.date, await A(() => AOS.ymd(AOS.addDays(AOS.now(), 1))));
  ok('snel-toevoegknop: "morgen 16:00 economie leren" als Huiswerk op morgen 16:00');
  // FAB ook buiten de agenda
  await pg.goto('http://localhost:8766/index.html#/settings'); await pg.waitForTimeout(500); assert.ok(await pg.locator('#fab').isVisible()); ok('knop is ook in Instellingen zichtbaar');

  // 8. instellingen + refresh-knop in agenda
  await pg.goto('http://localhost:8766/index.html#/settings?section=agendas'); await pg.waitForTimeout(800);
  const txt = await pg.locator('#agendas').innerText(); assert.ok(/Google Agenda/.test(txt) && /bijgewerkt/.test(txt)); ok('instellingen tonen Google-koppeling en status per bron');
  await pg.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/instellingen.png' : '/tmp/instellingen.png' });
  await pg.goto('http://localhost:8766/index.html#/agenda/today'); await pg.waitForTimeout(800); failProxy = true;
  await pg.click('[data-cal-all]'); await pg.waitForTimeout(900);
  const strip = await pg.locator('.cal-strip').innerText(); assert.ok(/Google Agenda: De agenda-server antwoordde met 500/.test(strip), strip); ok('refresh-knop in agenda: foutmelding per bron zichtbaar');
  await pg.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/agenda.png' : '/tmp/agenda.png' });
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300); await pg.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/agenda-mobiel.png' : '/tmp/agenda-mobiel.png' });
  console.log(n + ' controles geslaagd; console-fouten:', JSON.stringify(errs));
  assert.strictEqual(errs.length, 0);
  await b.close(); srv.close();
})().catch((e) => { console.error('MISLUKT:', e.message); process.exit(1); });
