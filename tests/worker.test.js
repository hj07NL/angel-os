const assert = require('assert');
(async () => {
  const { handle } = await import('../worker/src/index.js');
  const kvStore = new Map();
  const CAL = { get: async (k) => kvStore.get(k) || null, put: async (k, v) => { kvStore.set(k, v); }, delete: async (k) => { kvStore.delete(k); } };
  const env = { CAL, ENCRYPTION_SECRET: 'x'.repeat(40), ALLOWED_ORIGIN: 'https://app.example', ALLOWED_HOSTS: 'calendar.google.com' };
  const SECRET_URL = 'https://calendar.google.com/calendar/ical/geheim%40gmail.com/private-ABCDEF123456/basic.ics';
  const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261027T080000Z\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push(String(u)); if (String(u).includes('redir')) return new Response(null, { status: 302, headers: { Location: 'https://evil.example/x.ics' } }); if (String(u).includes('nocal')) return new Response('hallo', { status: 200 }); if (String(u).includes('bad')) return new Response('', { status: 404 }); return new Response(ICS, { status: 200 }); };
  const KEY = 'k'.repeat(43), O = 'https://app.example';
  const req = (method, path, { key = KEY, body, origin = O } = {}) => new Request('https://w.example' + path, { method, headers: Object.assign({ Origin: origin, 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined });
  let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };

  await t('CORS preflight alleen voor toegestane origin', async () => {
    const a = await handle(new Request('https://w.example/v1/health', { method: 'OPTIONS', headers: { Origin: O } }), env);
    assert.strictEqual(a.headers.get('Access-Control-Allow-Origin'), O);
    const b = await handle(new Request('https://w.example/v1/health', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
    assert.strictEqual(b.headers.get('Access-Control-Allow-Origin'), null);
  });
  await t('vreemde origin geweigerd (403)', async () => assert.strictEqual((await handle(req('GET', '/v1/calendars/google1/ics', { origin: 'https://evil.example' }), env)).status, 403));
  await t('zonder sleutel 401', async () => assert.strictEqual((await handle(req('GET', '/v1/calendars/google1/ics', { key: '' }), env)).status, 401));
  await t('opslaan: URL staat versleuteld in KV, niet leesbaar', async () => {
    const r = await handle(req('PUT', '/v1/calendars/google1', { body: { url: SECRET_URL, label: 'Google' } }), env);
    assert.strictEqual(r.status, 200);
    const stored = [...kvStore.values()].join('');
    assert.ok(!stored.includes('private-ABCDEF') && !stored.includes('geheim'), 'URL zichtbaar in KV');
    assert.ok(![...kvStore.keys()].join('').includes(KEY), 'sleutel zichtbaar in KV-sleutel');
  });
  await t('ophalen geeft iCal terug', async () => {
    const r = await handle(req('GET', '/v1/calendars/google1/ics'), env);
    assert.strictEqual(r.status, 200); assert.strictEqual(await r.text(), ICS); assert.strictEqual(calls.at(-1), SECRET_URL);
  });
  await t('andere gebruikerssleutel krijgt niets (404)', async () => assert.strictEqual((await handle(req('GET', '/v1/calendars/google1/ics', { key: 'z'.repeat(43) }), env)).status, 404));
  await t('andere ENCRYPTION_SECRET kan niet ontsleutelen (403)', async () => assert.strictEqual((await handle(req('GET', '/v1/calendars/google1/ics'), Object.assign({}, env, { ENCRYPTION_SECRET: 'y'.repeat(40) }))).status, 403));
  await t('niet-toegestane host / http geweigerd (SSRF)', async () => {
    for (const u of ['https://evil.example/a.ics', 'http://calendar.google.com/a.ics', 'https://169.254.169.254/latest', 'https://calendar.google.com:8443/x', 'https://user:pw@calendar.google.com/x']) {
      assert.strictEqual((await handle(req('PUT', '/v1/calendars/x1234', { body: { url: u } }), env)).status, 400, u);
    }
  });
  await t('redirect naar vreemde host geblokkeerd', async () => {
    const r = await handle(req('PUT', '/v1/calendars/redir1', { body: { url: 'https://calendar.google.com/redir.ics' } }), env);
    assert.strictEqual(r.status, 400); assert.ok(!calls.includes('https://evil.example/x.ics'));
  });
  await t('geen iCal / fout van server geeft duidelijke melding zonder URL', async () => {
    const a = await handle(req('PUT', '/v1/calendars/nocal1', { body: { url: 'https://calendar.google.com/nocal.ics' } }), env);
    assert.strictEqual(a.status, 502); assert.ok(!(await a.text()).includes('calendar.google.com'));
    assert.strictEqual((await handle(req('PUT', '/v1/calendars/bad12', { body: { url: 'https://calendar.google.com/bad.ics' } }), env)).status, 502);
  });
  await t('verwijderen', async () => {
    assert.strictEqual((await handle(req('DELETE', '/v1/calendars/google1'), env)).status, 200);
    assert.strictEqual((await handle(req('GET', '/v1/calendars/google1/ics'), env)).status, 404);
  });
  await t('niet ingesteld = duidelijke fout', async () => assert.strictEqual((await handle(req('GET', '/v1/health'), { CAL })).status, 500));
  console.log(n + ' tests geslaagd');
})().catch((e) => { console.error(e); process.exit(1); });
