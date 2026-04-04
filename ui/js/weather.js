// 2026/03/23 edited by Zhecheng Xu
// Changes:
//  - Replace hardcoded weather temperature with live IP-based weather.
//  - Use Open-Meteo current weather without API key.
//  - Add multi-source geo fallback + cached weather fallback + click-to-retry.

const GEO_URL = 'https://ipwho.is/';
const GEO_FALLBACK_URL = 'https://ipapi.co/json/';
const GEO_FALLBACK_URL_2 = 'https://ipinfo.io/json';
const REFRESH_MS = 20 * 60 * 1000;
const WEATHER_CACHE_KEY = 'growin.weather.cache.v1';
const GEO_CACHE_KEY = 'growin.weather.geo.v1';
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_GEO = { latitude: 40.7128, longitude: -74.0060, city: 'Default', countryCode: '' };

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore cache write failures
  }
}

async function fetchJson(url, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function emojiByCode(code) {
  const n = Number(code);
  if (n === 0) return '☀️';
  if (n === 1 || n === 2) return '⛅';
  if (n === 3) return '☁️';
  if ([45, 48].includes(n)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(n)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(n)) return '🌨️';
  if ([95, 96, 99].includes(n)) return '⛈️';
  return '☁️';
}

function labelByCode(code) {
  const n = Number(code);
  if (n === 0) return 'Clear';
  if (n === 1) return 'Mainly Clear';
  if (n === 2) return 'Partly Cloudy';
  if (n === 3) return 'Cloudy';
  if ([45, 48].includes(n)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(n)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(n)) return 'Snow';
  if ([95, 96, 99].includes(n)) return 'Thunderstorm';
  return 'Cloudy';
}

function setWeatherUI(els, { tempText, icon, title }) {
  if (els?.weatherTemp && tempText) els.weatherTemp.textContent = tempText;
  if (els?.weatherIcon && icon) els.weatherIcon.textContent = icon;
  if (els?.weatherChip && title) els.weatherChip.title = title;
}

async function fetchGeo() {
  try {
    const body = await fetchJson(GEO_URL);
    if (!body?.success || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      throw new Error('Geo missing latitude/longitude');
    }
    return {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      city: String(body.city || ''),
      countryCode: String(body.country_code || '').toUpperCase(),
    };
  } catch (_) {
    try {
      const body = await fetchJson(GEO_FALLBACK_URL);
      if (!Number.isFinite(body?.latitude) || !Number.isFinite(body?.longitude)) {
        throw new Error('Geo fallback missing latitude/longitude');
      }
      return {
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        city: String(body.city || ''),
        countryCode: String(body.country_code || body.country || '').toUpperCase(),
      };
    } catch (_) {
      const body = await fetchJson(GEO_FALLBACK_URL_2);
      const loc = String(body?.loc || '').split(',');
      const lat = Number(loc[0]);
      const lon = Number(loc[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Geo fallback #2 missing latitude/longitude');
      }
      return {
        latitude: lat,
        longitude: lon,
        city: String(body?.city || ''),
        countryCode: String(body?.country || '').toUpperCase(),
      };
    }
  }
}

async function fetchGeoByBrowser() {
  if (!navigator?.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos?.coords?.latitude);
        const longitude = Number(pos?.coords?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve(null);
          return;
        }
        resolve({ latitude, longitude, city: '', countryCode: '' });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function fetchCurrentWeather(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'auto');

  const body = await fetchJson(url.toString());
  const temp = Number(body?.current?.temperature_2m);
  const code = Number(body?.current?.weather_code);
  if (!Number.isFinite(temp)) throw new Error('Weather temperature missing');
  return { temp, code };
}

async function refreshWeather(els) {
  try {
    let geo = null;
    let fromBrowserGeo = false;

    try {
      // Prefer device geolocation first (more accurate and avoids IP provider blocking).
      geo = await fetchGeoByBrowser();
      fromBrowserGeo = !!geo;
    } catch (_) {
      geo = null;
    }

    if (!geo) {
      geo = readJson(GEO_CACHE_KEY, null);
    }

    if (!geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) {
      geo = DEFAULT_GEO;
    }

    writeJson(GEO_CACHE_KEY, geo);

    const current = await fetchCurrentWeather(geo.latitude, geo.longitude);

    const rounded = Math.round(current.temp);
    const icon = emojiByCode(current.code);
    const label = labelByCode(current.code);
    const place = fromBrowserGeo ? 'Current location' : '';
    const summary = `${label}, ${rounded}°C`;

    setWeatherUI(els, {
      tempText: `${rounded}°C`,
      icon,
      title: place ? `${place} · ${summary}` : summary,
    });

    writeJson(WEATHER_CACHE_KEY, {
      tempText: `${rounded}°C`,
      icon,
      title: place ? `${place} · ${summary}` : summary,
      ts: Date.now(),
    });
  } catch (err) {
    console.warn('[Weather] Failed to fetch live weather:', err);

    const cached = readJson(WEATHER_CACHE_KEY, null);
    if (cached && Date.now() - Number(cached.ts || 0) <= CACHE_MAX_AGE_MS) {
      setWeatherUI(els, {
        tempText: cached.tempText || 'N/A',
        icon: cached.icon || '☁️',
        title: `Weather cached: ${cached.tempText || 'N/A'}`,
      });
      return;
    }

    setWeatherUI(els, {
      tempText: 'N/A',
      icon: '☁️',
      title: 'Weather unavailable',
    });
  }
}

export function mountWeather(els) {
  if (!els?.weatherChip || !els?.weatherTemp || !els?.weatherIcon) return;

  refreshWeather(els);
  setInterval(() => {
    refreshWeather(els);
  }, REFRESH_MS);

  els.weatherChip.addEventListener('click', () => {
    setWeatherUI(els, { tempText: '--°C', icon: '☁️', title: 'Refreshing weather...' });
    refreshWeather(els);
  });
}
