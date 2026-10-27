#!/usr/bin/env node
/* Angel OS — maandelijkse websitecontrole (draait in GitHub Actions, Node 20, geen afhankelijkheden).
 *
 * Controleert per website: DNS, serverantwoord, doorverwijzingen (elke stap opnieuw gevalideerd), HTTPS en
 * certificaat-vervaldatum, verlopen domein (RDAP, waar mogelijk), geparkeerde domeinen, verdachte doorverwijzingen
 * en grote wijzigingen van de pagina. Schrijft data/health/latest.json, data/health/history/JJJJ-MM.json en data/health/index.json.
 *
 * Beveiliging: URL's zijn onbetrouwbare invoer. Alleen http/https, geen inloggegevens in de URL, alleen poort 80/443,
 * en elk IP-adres wordt vóór het verbinden gecontroleerd (geen localhost, privé-netwerken, link-local/metadata, multicast).
 * De verbinding wordt vastgezet op het gecontroleerde IP (geen DNS-rebinding). Redirects worden handmatig gevolgd (max. 6).
 * Er wordt NIET op malware gescand en er wordt geen reputatie-database geraadpleegd; het rapport zegt dat ook.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'data', 'health');
const TIMEOUT = 12000, MAX_BYTES = 400 * 1024, MAX_REDIRECTS = 6, CONCURRENCY = 4;
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_FOR_TEST === '1'; // alleen voor lokale tests
const UA = 'Mozilla/5.0 (compatible; AngelOS-HealthCheck/1.0; +https://github.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- IP-validatie (SSRF-bescherming) ----------
function ipv4ToInt(ip) { return ip.split('.').reduce((n, o) => (n << 8) + (+o), 0) >>> 0; }
function inCidr4(ip, cidr) { const [base, bits] = cidr.split('/'); const mask = bits === '0' ? 0 : (~0 << (32 - +bits)) >>> 0; return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask); }
const BLOCK4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4', '255.255.255.255/32'];
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return BLOCK4.some((c) => inCidr4(ip, c));
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return isBlockedIp(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(l.replace(/^0+/, '')) || l.startsWith('64:ff9b:') || l.startsWith('2001:db8');
  }
  return true;
}
async function resolveSafe(host) {
  if (net.isIP(host)) { if (!ALLOW_PRIVATE && isBlockedIp(host)) throw Object.assign(new Error('privé of intern IP-adres geweigerd'), { code: 'BLOCKED' }); return [host]; }
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host) && !ALLOW_PRIVATE) throw Object.assign(new Error('interne hostnaam geweigerd'), { code: 'BLOCKED' });
  const addrs = await dns.lookup(host, { all: true, verbatim: true });
  if (!addrs.length) throw Object.assign(new Error('geen DNS-records'), { code: 'ENOTFOUND' });
  const bad = addrs.find((a) => isBlockedIp(a.address));
  if (bad && !ALLOW_PRIVATE) throw Object.assign(new Error('domein wijst naar een privé-adres (' + bad.address + ') — geweigerd'), { code: 'BLOCKED' });
  // IPv4 eerst (veel runners hebben geen IPv6); alle adressen zijn hierboven al gecontroleerd
  return addrs.sort((a, b) => a.family - b.family).map((a) => a.address).slice(0, 3);
}
function validateUrl(u) {
  let url; try { url = new URL(u); } catch { throw Object.assign(new Error('ongeldige URL'), { code: 'BADURL' }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('alleen http/https toegestaan'), { code: 'BADURL' });
  if (url.username || url.password) throw Object.assign(new Error('inloggegevens in URL geweigerd'), { code: 'BADURL' });
  if (url.port && !['80', '443'].includes(url.port) && !ALLOW_PRIVATE) throw Object.assign(new Error('afwijkende poort geweigerd'), { code: 'BADURL' });
  return url;
}

// ---------- Eén HTTP-verzoek, vastgezet op een gecontroleerd IP ----------
function request(url, ip) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    const req = lib.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, method: 'GET',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'nl,en;q=0.8' },
      servername: net.isIP(url.hostname) ? undefined : url.hostname, rejectUnauthorized: true, timeout: TIMEOUT,
      lookup: (_h, opts, cb) => { if (opts && opts.all) cb(null, [{ address: ip, family: net.isIPv6(ip) ? 6 : 4 }]); else cb(null, ip, net.isIPv6(ip) ? 6 : 4); }
    }, (res) => {
      let cert = null;
      if (res.socket && res.socket.getPeerCertificate) { const c = res.socket.getPeerCertificate(); if (c && c.valid_to) cert = { valid_to: new Date(c.valid_to).toISOString(), issuer: c.issuer && (c.issuer.O || c.issuer.CN) || null }; }
      const chunks = []; let size = 0;
      res.on('data', (d) => { size += d.length; if (size <= MAX_BYTES) chunks.push(d); else res.destroy(); });
      const done = () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), cert, ms: Date.now() - t0 });
      res.on('end', done); res.on('close', done); res.on('error', done);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('time-out na ' + TIMEOUT / 1000 + ' s'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

// ---------- Hulpfuncties ----------
const MULTI_TLD = /\.(co|com|org|net|ac|gov|edu)\.(uk|au|nz|za|jp|br|tr|in)$/i;
const regDomain = (host) => { const h = host.replace(/^www\./, '').toLowerCase(); const parts = h.split('.'); return MULTI_TLD.test(h) ? parts.slice(-3).join('.') : parts.slice(-2).join('.'); };
const PARKING_HOSTS = /(sedoparking|sedo\.com|bodis\.com|parkingcrew|hugedomains|dan\.com|afternic|above\.com|parklogic|domainmarket|undeveloped\.com|porkbun\.com\/parked|namecheap\.com\/domains\/registration|godaddy\.com\/forsale|uniregistry)/i;
const PARKING_TEXT = /(this domain (?:name )?(?:is|may be) for sale|buy this domain|domain is for sale|deze domeinnaam is te koop|parked free|domain parking|the domain .{0,40} is for sale|inquire about this domain|hugedomains\.com|related searches)/i;
const BOT_TEXT = /(just a moment\.\.\.|cf-chl|attention required|captcha|verify you are human|ddos-guard|access denied)/i;
function extract(body) {
  const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const desc = (body.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || body.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1];
  const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const clean = (s) => s ? s.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim().slice(0, 200) : null;
  return { title: clean(title), meta_description: clean(desc), textLen: text.length, hash: crypto.createHash('sha1').update(text.slice(0, 4000)).digest('hex').slice(0, 16) };
}
async function rdapExpiry(domain) {
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://rdap.org/domain/' + encodeURIComponent(domain), { signal: ctrl.signal, headers: { accept: 'application/rdap+json' }, redirect: 'follow' }); clearTimeout(tm);
    if (!r.ok) return null;
    const j = await r.json(); const ev = (j.events || []).find((e) => /expiration/i.test(e.eventAction));
    return ev ? ev.eventDate : null;
  } catch { return null; }
}

// ---------- Eén website controleren ----------
async function checkSite(site, prev) {
  const out = { url: site.url, checked_at: new Date().toISOString(), status: 'inconclusive', security: 'Beveiliging niet geverifieerd', detail: '', http: null, ms: null, final_url: null, redirects: 0, cert_expires: null, cert_issuer: null, domain_expires: null, title: null, meta_description: null, changed: false, hash: null, recheck: false };
  let url;
  try { url = validateUrl(site.url); } catch (e) { out.status = 'inconclusive'; out.detail = e.message; return out; }
  const startDomain = regDomain(url.hostname); const startedHttps = url.protocol === 'https:';
  let res = null, lastErr = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let ips;
    try { ips = await resolveSafe(url.hostname.replace(/^\[|\]$/g, '')); }
    catch (e) {
      if (e.code === 'BLOCKED') { out.status = 'suspicious'; out.detail = e.message; out.security = 'Verdacht: wijst naar een intern adres'; return out; }
      out.status = 'offline'; out.detail = (e.code === 'ENOTFOUND' || e.code === 'ENODATA') ? 'Domein bestaat niet of heeft geen DNS (' + url.hostname + ')' : 'DNS-fout: ' + (e.code || e.message); out.recheck = e.code === 'EAI_AGAIN'; return out;
    }
    res = null;
    // probeer elk gecontroleerd adres; per adres maximaal 2 pogingen
    for (const ip of ips) {
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try { res = await request(url, ip); } catch (e) { lastErr = e; if (/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO|TLS/i.test(e.code || '')) break; if (attempt === 0) await sleep(1500); }
      }
      if (res || /CERT|SELF_SIGNED|ALTNAME|UNABLE_TO|TLS/i.test((lastErr && lastErr.code) || '')) break;
    }
    if (!res) {
      const c = lastErr && lastErr.code || '';
      if (c === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || c === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') { out.status = 'inconclusive'; out.security = 'Certificaatketen onvolledig'; out.detail = 'De server stuurt een onvolledige certificaatketen. Browsers lossen dit meestal zelf op; de site werkt waarschijnlijk, maar is niet volledig geverifieerd.'; return out; }
      if (/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY|TLS/i.test(c) || /certificate/i.test(lastErr && lastErr.message || '')) { out.status = 'cert_problem'; out.security = 'Certificaatprobleem: ' + c; out.detail = 'De HTTPS-verbinding is niet geldig (' + (lastErr.message || c) + ')'; return out; }
      out.status = 'offline'; out.detail = c === 'ETIMEDOUT' ? 'Server reageert niet (time-out, 2 pogingen)' : c === 'ECONNREFUSED' ? 'Verbinding geweigerd' : c === 'ECONNRESET' ? 'Verbinding verbroken' : 'Niet bereikbaar: ' + (lastErr && lastErr.message || c); out.recheck = c === 'ETIMEDOUT' || c === 'ECONNRESET'; return out;
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      let next; try { next = validateUrl(new URL(res.headers.location, url).href); } catch (e) { out.status = 'suspicious'; out.detail = 'Doorverwijzing naar ongeldige of geweigerde URL: ' + e.message; return out; }
      if (url.protocol === 'https:' && next.protocol === 'http:') { out.status = 'suspicious'; out.detail = 'Doorverwijzing van HTTPS naar onbeveiligd HTTP'; out.final_url = next.href; out.security = 'Verdacht: downgrade naar HTTP'; return out; }
      (out.chain = out.chain || [url.href]).push(next.href); url = next; out.redirects++; continue;
    }
    break;
  }
  if (res && res.status >= 300 && res.status < 400) { out.status = 'inconclusive'; out.detail = 'Te veel doorverwijzingen'; out.recheck = true; return out; }
  out.http = res.status; out.ms = res.ms; out.final_url = url.href;
  if (res.cert) { out.cert_expires = res.cert.valid_to; out.cert_issuer = res.cert.issuer; }
  const info = extract(res.body || ''); Object.assign(out, { title: info.title, meta_description: info.meta_description, hash: info.hash });
  if (prev && prev.hash && info.hash !== prev.hash && prev.textLen && Math.abs(info.textLen - prev.textLen) / Math.max(info.textLen, prev.textLen) > 0.35) out.changed = true;
  out.textLen = info.textLen;
  // beveiligingsheaders (informatief; ontbreken is geen bewijs van een probleem)
  { const hh = res.headers; const csp = String(hh['content-security-policy'] || '');
    out.sec_headers = { hsts: !!hh['strict-transport-security'], csp: !!csp, nosniff: /nosniff/i.test(String(hh['x-content-type-options'] || '')), frame: !!hh['x-frame-options'] || /frame-ancestors/i.test(csp), referrer: !!hh['referrer-policy'] };
    out.sec_score = Object.values(out.sec_headers).filter(Boolean).length; }
  const finalDomain = regDomain(url.hostname);
  const crossDomain = finalDomain !== startDomain;

  // geparkeerd / verdacht
  if (PARKING_HOSTS.test(url.href) || (res.status < 400 && PARKING_TEXT.test(res.body || '') && info.textLen < 6000)) { out.status = 'parked'; out.detail = 'Lijkt een geparkeerd of te koop staand domein' + (crossDomain ? ' (doorverwezen naar ' + url.hostname + ')' : ''); out.security = 'Niet meer de oorspronkelijke website'; return out; }
  if (crossDomain && (net.isIP(url.hostname) || /xn--/.test(url.hostname))) { out.status = 'suspicious'; out.detail = 'Doorverwezen naar een onverwacht adres: ' + url.hostname; out.security = 'Mogelijk verdacht: onverwachte bestemming'; return out; }

  // serverantwoord
  if (res.status >= 200 && res.status < 300) {
    if (crossDomain) { out.status = 'redirected'; out.detail = 'Doorverwezen naar ' + url.hostname; }
    else if (url.protocol === 'https:') { out.status = 'https_valid'; out.detail = 'Online · ' + res.status + (out.redirects ? ' na ' + out.redirects + ' doorverwijzing(en)' : ''); }
    else { out.status = 'online'; out.detail = 'Online zonder HTTPS'; }
  } else if (res.status === 404 || res.status === 410) { out.status = 'offline'; out.detail = 'Pagina niet gevonden (' + res.status + ') — mogelijk permanent verwijderd'; }
  else if ([401, 403, 429, 503].includes(res.status) && (BOT_TEXT.test(res.body || '') || res.headers['cf-ray'] || res.headers['server'] === 'cloudflare')) { out.status = 'inconclusive'; out.detail = 'Botbescherming (' + res.status + ') — de site blokkeert automatische controles; waarschijnlijk wel online'; out.recheck = true; }
  else if (res.status >= 500) { out.status = 'offline'; out.detail = 'Serverfout (' + res.status + ')'; out.recheck = true; }
  else { out.status = 'inconclusive'; out.detail = 'Onverwacht antwoord (' + res.status + ')'; out.recheck = true; }

  // beveiliging (eerlijk)
  if (url.protocol === 'https:') {
    const days = out.cert_expires ? Math.round((new Date(out.cert_expires) - Date.now()) / 86400000) : null;
    if (days != null && days < 0) { out.status = 'cert_problem'; out.security = 'Certificaat verlopen'; }
    else out.security = 'HTTPS geldig' + (days != null ? ' (certificaat nog ' + days + ' dagen)' : '') + ' · reputatie niet geverifieerd';
    if (days != null && days >= 0 && days < 14 && out.status === 'https_valid') out.detail += ' · certificaat verloopt binnenkort';
  } else out.security = startedHttps ? 'Verdacht: geen HTTPS meer' : 'Geen HTTPS — verbinding niet versleuteld';
  return out;
}

// ---------- Hoofdprogramma ----------
async function loadSites() {
  const src = await fs.readFile(path.join(ROOT, 'data', 'websites.js'), 'utf8');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx, { timeout: 2000 });
  let list = (ctx.window.ANGEL_SEED_WEBSITES || []).map((s) => ({ name: s.name, url: s.url }));
  try { const extra = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'check-list.json'), 'utf8')); if (Array.isArray(extra)) list = list.concat(extra.filter((x) => x && typeof x.url === 'string').map((x) => ({ name: String(x.name || x.url).slice(0, 120), url: x.url.slice(0, 2000) }))); } catch { /* optioneel */ }
  const seen = new Set(); return list.filter((s) => { const k = s.url.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Optionele reputatiecheck via Google Safe Browsing (gratis API-sleutel als GitHub-secret SAFE_BROWSING_API_KEY).
// Zonder sleutel wordt dit overgeslagen en staat dat eerlijk in het rapport.
async function safeBrowsing(urls) {
  const key = process.env.SAFE_BROWSING_API_KEY; if (!key) return null;
  const hits = {};
  for (let i = 0; i < urls.length; i += 400) {
    const batch = urls.slice(i, i + 400);
    try {
      const r = await fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ client: { clientId: 'angel-os', clientVersion: '1.0' }, threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: batch.map((u) => ({ url: u })) } }) });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      const j = await r.json(); (j.matches || []).forEach((m) => { hits[m.threat.url] = m.threatType; });
    } catch (e) { return { error: e.message }; }
  }
  return { hits };
}

async function main() {
  const sites = await loadSites();
  let prev = {}; try { prev = JSON.parse(await fs.readFile(path.join(OUT, 'latest.json'), 'utf8')).results || {}; } catch {}
  console.log('Websitecontrole: ' + sites.length + ' websites, ' + CONCURRENCY + ' tegelijk');
  const results = {}; let i = 0;
  const domainsDone = new Map();
  async function worker() {
    while (i < sites.length) {
      const s = sites[i++];
      let r;
      try { r = await checkSite(s, prev[s.url]); } catch (e) { r = { url: s.url, checked_at: new Date().toISOString(), status: 'inconclusive', security: 'Beveiliging niet geverifieerd', detail: 'Controle mislukt: ' + e.message, recheck: true }; }
      // domein-vervaldatum (RDAP), alleen als de site offline/onduidelijk is of het domein nog niet bekeken is
      try {
        const d = regDomain(new URL(s.url).hostname);
        if (!domainsDone.has(d) && ['offline', 'parked', 'inconclusive'].includes(r.status)) domainsDone.set(d, await rdapExpiry(d));
        const exp = domainsDone.get(d);
        if (exp) { r.domain_expires = exp; if (new Date(exp) < new Date()) { r.status = r.status === 'parked' ? 'parked' : 'offline'; r.detail = 'Domeinregistratie verlopen op ' + exp.slice(0, 10) + '. ' + (r.detail || ''); } }
      } catch {}
      results[s.url] = r;
      console.log(String(Object.keys(results).length).padStart(3) + '/' + sites.length + '  ' + r.status.padEnd(13) + ' ' + s.url + (r.detail ? '  — ' + r.detail : ''));
      await sleep(400);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // onduidelijke resultaten één keer opnieuw proberen (na een pauze)
  const again = Object.values(results).filter((r) => r.recheck && r.status === 'inconclusive');
  if (again.length) { await sleep(5000); for (const r of again) { const s = sites.find((x) => x.url === r.url); try { const r2 = await checkSite(s, prev[s.url]); if (r2.status !== 'inconclusive') results[s.url] = r2; } catch {} } }

  const sbr = await safeBrowsing(Object.keys(results));
  if (sbr && sbr.hits) Object.values(results).forEach((r) => { const t = sbr.hits[r.url]; r.safe_browsing = t ? 'threat:' + t : 'clean'; if (t) { r.status = 'suspicious'; r.security = 'Google Safe Browsing meldt: ' + t; r.detail = 'Gemarkeerd door Google Safe Browsing (' + t + ')'; } });
  const counts = {}; Object.values(results).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const problems = Object.values(results).filter((r) => !['online', 'https_valid'].includes(r.status)).length;
  const changes = Object.values(results).filter((r) => prev[r.url] && prev[r.url].status !== r.status).map((r) => ({ url: r.url, from: prev[r.url].status, to: r.status }));
  const report = { version: 1, checked_at: new Date().toISOString(), runner: 'GitHub Actions', note: 'HTTPS bewijst niet dat een website betrouwbaar is. ' + (sbr && sbr.hits ? 'Reputatiecheck via Google Safe Browsing is uitgevoerd; dat is geen garantie.' : 'Er is geen reputatiecheck uitgevoerd' + (sbr && sbr.error ? ' (Safe Browsing-fout: ' + sbr.error + ')' : ' (geen SAFE_BROWSING_API_KEY ingesteld)') + '.'), summary: { total: sites.length, problems, counts, changes }, results };
  await fs.mkdir(path.join(OUT, 'history'), { recursive: true });
  await fs.writeFile(path.join(OUT, 'latest.json'), JSON.stringify(report, null, 1));
  const month = report.checked_at.slice(0, 7);
  await fs.writeFile(path.join(OUT, 'history', month + '.json'), JSON.stringify(report, null, 1));
  let index = []; try { index = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')); } catch {}
  index = index.filter((x) => x.month !== month); index.unshift({ month, checked_at: report.checked_at, total: sites.length, problems, counts });
  await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index.slice(0, 36), null, 1));
  console.log('\nKlaar: ' + sites.length + ' gecontroleerd, ' + problems + ' met aandacht nodig. ' + JSON.stringify(counts));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });
export { checkSite, validateUrl, regDomain };
