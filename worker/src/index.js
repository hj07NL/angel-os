/* Angel OS – agenda-proxy (Cloudflare Worker)
   Doet drie dingen: bewaart je geheime iCal-adres versleuteld, haalt het op (zodat CORS niet blokkeert)
   en geeft de agenda-tekst terug aan je browser. Niets hiervan staat in de repo.
   Zie worker/README.md voor instellen. */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256Hex(text) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}
// Sleutel = HKDF(WORKER-geheim, zout = hash van jouw sleutel). Zonder allebei is de URL onleesbaar.
async function deriveKey(env, userKey) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.ENCRYPTION_SECRET), 'HKDF', false, ['deriveKey']);
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(userKey)));
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('angel-os-cal-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, userKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(env, userKey), enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
async function open(env, userKey, stored) {
  const o = JSON.parse(stored);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await deriveKey(env, userKey), unb64(o.ct));
  return JSON.parse(dec.decode(pt));
}

function allowedHosts(env) { return String(env.ALLOWED_HOSTS || 'calendar.google.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }
function checkUrl(env, raw) {
  let u; try { u = new URL(raw); } catch (e) { return 'Ongeldige URL'; }
  if (u.protocol !== 'https:') return 'Alleen https is toegestaan';
  if (u.username || u.password || (u.port && u.port !== '443')) return 'URL met inloggegevens of poort is niet toegestaan';
  if (!allowedHosts(env).includes(u.hostname.toLowerCase())) return 'Deze server is niet toegestaan (alleen ' + allowedHosts(env).join(', ') + ')';
  return null;
}

function corsHeaders(env, req) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors) });

async function fetchIcs(env, url) {
  let cur = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const bad = checkUrl(env, cur); if (bad) throw Object.assign(new Error(bad), { status: 400 });
    const res = await fetch(cur, { redirect: 'manual', headers: { Accept: 'text/calendar,*/*', 'User-Agent': 'AngelOS-agenda-proxy' }, signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) { cur = new URL(res.headers.get('Location'), cur).toString(); continue; }
    if (!res.ok) throw Object.assign(new Error('De agenda-server antwoordde met ' + res.status), { status: 502 });
    const len = Number(res.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) throw Object.assign(new Error('Agenda is te groot'), { status: 502 });
    const text = await res.text();
    if (text.length > MAX_BYTES) throw Object.assign(new Error('Agenda is te groot'), { status: 502 });
    if (!/BEGIN:VCALENDAR/.test(text)) throw Object.assign(new Error('Geen geldige iCal-agenda ontvangen (controleer het geheime adres)'), { status: 502 });
    return text;
  }
  throw Object.assign(new Error('Te veel doorverwijzingen'), { status: 502 });
}

export async function handle(req, env) {
  const cors = corsHeaders(env, req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.ENCRYPTION_SECRET || String(env.ENCRYPTION_SECRET).length < 24 || !env.CAL) return json({ error: 'Server is niet ingesteld (ENCRYPTION_SECRET of KV ontbreekt)' }, 500, cors);
  const origin = req.headers.get('Origin');
  if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'Origin niet toegestaan' }, 403, cors);

  const url = new URL(req.url);
  const m = url.pathname.match(/^\/v1\/calendars\/([A-Za-z0-9_-]{4,64})(\/ics)?$/);
  if (url.pathname === '/v1/health') return json({ ok: true }, 200, cors);
  if (!m) return json({ error: 'Niet gevonden' }, 404, cors);
  const userKey = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (userKey.length < 32 || userKey.length > 128) return json({ error: 'Sleutel ontbreekt of is ongeldig' }, 401, cors);
  const id = m[1], kvKey = 'cal:' + (await sha256Hex(userKey)) + ':' + id;

  try {
    if (!m[2] && req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      const bad = !body || typeof body.url !== 'string' ? 'url ontbreekt' : checkUrl(env, body.url);
      if (bad) return json({ error: bad }, 400, cors);
      const label = String(body.label || '').slice(0, 60);
      await fetchIcs(env, body.url); // meteen testen, zodat je nu al een foutmelding krijgt
      await env.CAL.put(kvKey, await seal(env, userKey, { url: body.url, label }));
      return json({ ok: true, id }, 200, cors);
    }
    if (!m[2] && req.method === 'DELETE') { await env.CAL.delete(kvKey); return json({ ok: true }, 200, cors); }
    if (m[2] && req.method === 'GET') {
      const stored = await env.CAL.get(kvKey);
      if (!stored) return json({ error: 'Agenda niet gevonden voor deze sleutel' }, 404, cors);
      let data; try { data = await open(env, userKey, stored); } catch (e) { return json({ error: 'Kan opgeslagen agenda niet ontsleutelen' }, 403, cors); }
      const text = await fetchIcs(env, data.url);
      return new Response(text, { status: 200, headers: Object.assign({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' }, cors) });
    }
    return json({ error: 'Methode niet toegestaan' }, 405, cors);
  } catch (e) {
    return json({ error: e.message || 'Onbekende fout' }, e.status || 500, cors); // nooit de URL zelf in een fout zetten
  }
}
export default { fetch: (req, env) => handle(req, env) };
