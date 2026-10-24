/* Weer via Open-Meteo (gratis, geen sleutel). Locatie alleen na toestemming of via handmatig gekozen stad.
   Coördinaten worden afgerond op 2 decimalen (±1 km) en er wordt geen locatiegeschiedenis bewaard. */
(function () {
  'use strict';
  const A = window.AOS;
  const { store, data } = A;
  const TTL = 20 * 60000;

  const WMO = (code) => {
    if (code === 0) return 'clear'; if (code <= 2) return 'partly'; if (code === 3) return 'cloudy'; if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle'; if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'; if (code >= 95) return 'storm'; return 'cloudy';
  };
  const ICON = { clear: 'sun', partly: 'cloud', cloudy: 'cloud', fog: 'cloud', drizzle: 'rain', rain: 'rain', snow: 'snow', storm: 'bolt' };
  const EMOJI = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', storm: '⛈️' };

  function location() {
    const s = data.settings();
    if (s.weatherCity && s.weatherCity.lat != null) return s.weatherCity;
    const gps = store.get('weatherGps', null);
    if (s.privacy.location === 'gps' && gps) return gps;
    return null;
  }

  function requestGps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Locatie wordt niet ondersteund door deze browser'));
      navigator.geolocation.getCurrentPosition((p) => {
        const loc = { name: 'Huidige locatie', lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
        store.set('weatherGps', loc); A.data.patchSettings({ privacy: { location: 'gps' }, weatherCity: null }); store.remove('weatherCache');
        resolve(loc);
      }, (e) => reject(new Error(e.code === 1 ? 'Toestemming voor locatie geweigerd. Kies een stad.' : 'Locatie niet beschikbaar')), { timeout: 10000, maximumAge: 600000 });
    });
  }

  async function searchCity(q) {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=nl&format=json&name=' + encodeURIComponent(q));
    if (!r.ok) throw new Error(A.t('err.network'));
    const j = await r.json();
    return (j.results || []).map((x) => ({ name: x.name + (x.admin1 ? ', ' + x.admin1 : '') + (x.country_code ? ' (' + x.country_code + ')' : ''), lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100 }));
  }
  function setCity(c) { A.data.patchSettings({ weatherCity: c, privacy: { location: 'manual' } }); store.remove('weatherCache'); A.bus.emit('weather'); }

  async function get(force) {
    const loc = location();
    if (!loc) return { status: 'nolocation' };
    const cache = store.get('weatherCache', null);
    if (!force && cache && cache.lat === loc.lat && cache.lon === loc.lon && Date.now() - cache.at < TTL) return cache.data;
    try {
      const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=3';
      const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const cond = WMO(j.current.weather_code);
      const nowMs = Date.now();
      const sunset = new Date(j.daily.sunset[0]).getTime(), sunrise = new Date(j.daily.sunrise[0]).getTime();
      const golden = Math.abs(nowMs - sunset) < 50 * 60000 || Math.abs(nowMs - sunrise) < 40 * 60000;
      const scene = cond === 'storm' ? 'storm' : (cond === 'rain' || cond === 'drizzle') ? 'rain' : cond === 'snow' ? 'snow' : golden && (cond === 'clear' || cond === 'partly') ? 'sunset' : !j.current.is_day ? 'night' : (cond === 'clear' || cond === 'partly') ? 'sunny' : 'cloudy';
      const out = {
        status: 'ok', place: loc.name, temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature), wind: Math.round(j.current.wind_speed_10m),
        cond, label: A.t('weather.' + cond), emoji: EMOJI[cond], icon: ICON[cond], scene, isDay: !!j.current.is_day,
        days: j.daily.time.map((d, i) => ({ date: d, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), cond: WMO(j.daily.weather_code[i]), rain: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : null })),
        source: 'Open-Meteo', fetched_at: new Date().toISOString()
      };
      store.set('weatherCache', { lat: loc.lat, lon: loc.lon, at: Date.now(), data: out });
      maybeNotify(out);
      return out;
    } catch (e) {
      if (cache && cache.lat === loc.lat) return Object.assign({}, cache.data, { stale: true });
      return { status: 'error', message: A.t('weather.unavailable') };
    }
  }
  function maybeNotify(w) {
    const d = w.days && w.days[0]; if (!d) return;
    if ((d.rain || 0) >= 70) A.notify('weather', 'weather-rain-' + d.date, 'Regen verwacht vandaag', 'Kans op neerslag ' + d.rain + '% in ' + w.place + '.');
    if (w.cond === 'storm') A.notify('weather', 'weather-storm-' + d.date, 'Onweer in ' + w.place, 'Er is onweer gemeld. Let op als je naar buiten gaat.');
  }
  // achtergrond toepassen (alleen als ingeschakeld en er echte data is)
  async function applyBackground() {
    const s = data.settings();
    const root = document.documentElement;
    if (!s.weatherBg) { root.removeAttribute('data-weather'); return; }
    const w = await get();
    if (w.status === 'ok') root.setAttribute('data-weather', w.scene); else root.removeAttribute('data-weather');
  }
  A.weather = { get, requestGps, searchCity, setCity, location, applyBackground, EMOJI };
})();
