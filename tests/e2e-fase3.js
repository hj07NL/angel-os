const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(8767, r));
  const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1280, height: 900 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error' && !/fonts|favicon|net::|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await pg.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const backup = JSON.parse(fs.readFileSync(root + '/backups/2026-10-27-fase0/localstorage-backup-geredigeerd.json', 'utf8'));
  await pg.goto('http://localhost:8767/index.html'); await pg.waitForTimeout(600);
  await pg.evaluate((j) => { const A = window.AOS; A.BACKUP_KEYS.forEach((k) => { if (k in j.data) A.store.set(k, j.data[k]); }); A.store.set('schema', j.schema); }, backup);
  const oldSites = backup.data.websites.map((s) => s.id + '|' + s.url + '|' + s.folder_id).sort().join('\n'); const oldFolders = backup.data.folders;
  await pg.reload(); await pg.waitForTimeout(1500);
  const A = (f, a) => pg.evaluate(f, a); let n = 0; const ok = (m) => { n++; console.log('ok', m); };

  const st = await A(() => ({ f: AOS.data.folders(), s: AOS.data.websites().map((s) => s.id + '|' + s.url + '|' + s.folder_id).sort().join('\n'), nb: AOS.store.get('backups', []).length, hist: AOS.store.get('folderHistory', []).map((h) => h.label) }));
  const roots = st.f.filter((f) => f.root); assert.strictEqual(roots.length, 1); assert.strictEqual(roots[0].name, 'Algemene mappen');
  assert.strictEqual(st.f.length, oldFolders.length + 1); assert.ok(oldFolders.every((o) => st.f.some((f) => f.id === o.id)));
  assert.ok(st.f.filter((f) => !f.root && !f.parent_id).length === 0); ok('hoofdmap "Algemene mappen" aangemaakt; alle ' + oldFolders.length + ' mappen bewaard en eronder gehangen');
  assert.strictEqual(st.s, oldSites); ok('alle 71 websites: zelfde id, url en map (byte-voor-byte vergelijking)');
  assert.ok(st.nb >= 1 && st.nb <= 3); assert.ok(st.hist.some((l) => /Hoofdmap/.test(l))); ok('back-up gemaakt (' + st.nb + ' in app) en herstelpunt aanwezig: ' + st.hist[0]);
  const before = JSON.stringify(st.f); await pg.reload(); await pg.waitForTimeout(1200);
  assert.strictEqual(JSON.stringify(await A(() => AOS.data.folders())), before); ok('migratie is idempotent (tweede start verandert niets)');

  await pg.goto('http://localhost:8767/index.html#/library'); await pg.waitForTimeout(900);
  assert.ok((await pg.locator('.tree').innerText()).includes('Algemene mappen')); ok('bibliotheek toont hoofdmap in de boomstructuur');
  await pg.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/bibliotheek.png' });

  // two-step add
  await pg.click('[data-add]'); await pg.fill('.modal [name="url"]', 'https://www.khanacademy.org/math'); await pg.click('.modal [data-analyze]'); await pg.waitForSelector('.modal [data-add]');
  const txt = await pg.locator('.modal').innerText(); assert.ok(/Stap 2 van 2/.test(txt) && /veiligheid/i.test(txt)); assert.strictEqual(await A(() => AOS.data.websites().length), 71);
  ok('stap 1 Analyseren slaat nog niets op (71 websites), stap 2 toont voorstel + veiligheid');
  await pg.click('.modal [data-add]'); await pg.waitForTimeout(300); assert.strictEqual(await A(() => AOS.data.websites().length), 72); ok('Toevoegen voegt pas dan toe (72)');
  const folderOK = await A(() => { const w = AOS.data.websites().find((x) => /khanacademy/.test(x.url)); const p = AOS.folders.pathOf(AOS.data.folders(), w.folder_id).map((f) => f.name); return p; }); assert.strictEqual(folderOK[0], 'Algemene mappen'); ok('nieuwe site staat onder Algemene mappen: ' + folderOK.join(' › '));

  // veiligheid basis
  const sf = await A(() => ({ a: AOS.folders.safetyBasics('http://192.168.1.5/login').level, b: AOS.folders.safetyBasics('https://bit.ly/x').level, c: AOS.folders.safetyBasics('https://www.wikipedia.org').level, d: AOS.folders.safetyBasics('https://user@evil.example/').level }));
  assert.deepStrictEqual(sf, { a: 'risico', b: 'let_op', c: 'ok', d: 'risico' }); ok('basis-veiligheidscheck: IP/@ = risico, verkorte link = let op, normale https = geen waarschuwing');
  await pg.click('[data-add]'); await pg.fill('.modal [name="url"]', 'http://192.168.1.5/login'); await pg.click('.modal [data-analyze]'); await pg.waitForSelector('.modal [data-add]'); assert.ok(/Risico/.test(await pg.locator('.modal').innerText())); await pg.keyboard.press('Escape'); ok('risicosite toont waarschuwing in stap 2');

  // dubbel
  await pg.goto('http://localhost:8767/index.html#/library'); await pg.waitForTimeout(500);
  await pg.click('[data-add]'); await pg.fill('.modal [name="url"]', 'khanacademy.org/math'); await pg.click('.modal [data-analyze]'); await pg.waitForSelector('.modal [data-add]'); assert.ok(await pg.locator('.modal [data-add]').isDisabled()); await pg.keyboard.press('Escape'); ok('dubbele site: Toevoegen geblokkeerd');

  // opnieuw indelen: nieuwe mappen komen onder de hoofdmap
  const plan = await A(async () => { const p = await AOS.folders.proposeReorganization({}); const rid = AOS.folders.rootId(); return { nf: p.newFolders.map((x) => [x.path.join('/'), x.parentId === rid || !!x.parentKey]), n: p.changes.length }; });
  assert.ok(plan.nf.every((x) => x[1])); ok('Opnieuw indelen: voorstel met ' + plan.n + ' sites, nieuwe mappen komen onder de hoofdmap');
  // toepassen + ongedaan maken
  const r = await A(() => { const p = AOS.folders; return null; });
  const res = await A(async () => { const plan = await AOS.folders.proposeReorganization({}); plan.changes.forEach((c) => { c.approve = true; }); const b4 = AOS.data.websites().map((s) => s.id + '|' + s.folder_id).sort().join(); const app = AOS.folders.applyReorganization(plan); const mid = AOS.data.websites().length; AOS.folders.undoLast(); const af = AOS.data.websites().map((s) => s.id + '|' + s.folder_id).sort().join(); return { same: b4 === af, mid, app }; });
  assert.ok(res.same && res.mid === 72); ok('alles opnieuw indelen + ongedaan maken: indeling exact teruggezet, 72 websites');
  // verwijderen/hernoemen van de hoofdmap geblokkeerd
  const guard = await A(() => { const id = AOS.folders.rootId(); let e1 = null; try { AOS.folders.deleteFolder(id); } catch (e) { e1 = e.message; } AOS.folders.renameFolder(id, 'X'); return { e1, name: AOS.folders.rootOf().name }; });
  assert.ok(guard.e1 && guard.name === 'Algemene mappen'); ok('hoofdmap kan niet worden verwijderd of hernoemd');
  console.log(n + ' controles geslaagd; console-fouten:', JSON.stringify(errs)); assert.strictEqual(errs.length, 0);
  await b.close(); srv.close();
})().catch((e) => { console.error('MISLUKT:', e.message); process.exit(1); });
