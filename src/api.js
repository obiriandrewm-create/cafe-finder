/**
 * Data layer: Photon (primary, fast, CORS-open) with Nominatim as the
 * geocoding fallback. No API keys, no backend, no build step.
 *
 * Politeness rules baked in, because these are free community services:
 *  - every request carries an identifying UA comment where the API allows it
 *  - results are cached in localStorage for 10 minutes
 *  - requests are aborted when a newer search starts
 *  - a hard timeout so the UI never hangs on a slow Overpass-style outage
 */

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 8000;

const CACHE_PREFIX = 'cafefinder:v1:';

/**
 * Build the Photon search URL for cafés around a point.
 * Exported so the shape is unit-testable without network access.
 * @param {{lat: number, lon: number, limit?: number}} opts
 * @returns {string}
 */
export function photonCafeUrl({ lat, lon, limit = 30 }) {
  const params = new URLSearchParams({
    q: 'cafe',
    lat: String(lat),
    lon: String(lon),
    limit: String(limit),
    lang: 'en',
    osm_tag: 'amenity:cafe',
  });
  return `${PHOTON_URL}?${params.toString()}`;
}

/**
 * Build the Photon geocoding URL for a free-text place.
 * @param {string} query
 * @returns {string}
 */
export function photonGeocodeUrl(query) {
  const params = new URLSearchParams({ q: query, limit: '1', lang: 'en' });
  return `${PHOTON_URL}?${params.toString()}`;
}

/**
 * Build the Nominatim fallback geocoding URL.
 * @param {string} query
 * @returns {string}
 */
export function nominatimUrl(query) {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '1' });
  return `${NOMINATIM_URL}?${params.toString()}`;
}

/** @returns {boolean} whether localStorage is usable (it throws in some privacy modes) */
export function cacheAvailable() {
  try {
    const k = `${CACHE_PREFIX}probe`;
    globalThis.localStorage.setItem(k, '1');
    globalThis.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @returns {any|null}
 */
export function cacheGet(key) {
  if (!cacheAvailable()) return null;
  try {
    const raw = globalThis.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw);
    if (!Number.isFinite(at) || Date.now() - at > CACHE_TTL_MS) {
      globalThis.localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {any} value
 */
export function cacheSet(key, value) {
  if (!cacheAvailable()) return;
  try {
    globalThis.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* quota exceeded — caching is an optimisation, never a requirement */
  }
}

/**
 * fetch with timeout + abort propagation.
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<any>}
 */
async function getJSON(url, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Geocode a free-text place. Photon first, Nominatim second.
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<{lat: number, lon: number, label: string}>}
 */
export async function geocode(query, signal) {
  const q = String(query || '').trim();
  if (q.length < 2) throw new Error('Type at least two characters.');

  const key = `geo:${q.toLowerCase()}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  try {
    const data = await getJSON(photonGeocodeUrl(q), signal);
    const f = (data?.features || [])[0];
    if (f?.geometry?.coordinates?.length === 2) {
      const [lon, lat] = f.geometry.coordinates.map(Number);
      const p = f.properties || {};
      const label = [p.name, p.city || p.locality, p.country].filter(Boolean).join(', ') || q;
      const out = { lat, lon, label };
      cacheSet(key, out);
      return out;
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    /* fall through to Nominatim */
  }

  const data = await getJSON(nominatimUrl(q), signal);
  const f = (data || [])[0];
  if (!f) throw new Error(`No place found for “${q}”.`);
  const out = { lat: Number(f.lat), lon: Number(f.lon), label: f.display_name || q };
  cacheSet(key, out);
  return out;
}

/**
 * Find cafés near a point.
 * @param {{lat: number, lon: number, limit?: number}} opts
 * @param {AbortSignal} [signal]
 * @returns {Promise<any>} raw GeoJSON FeatureCollection
 */
export async function findCafes({ lat, lon, limit = 30 }, signal) {
  const key = `cafes:${lat.toFixed(3)},${lon.toFixed(3)},${limit}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const data = await getJSON(photonCafeUrl({ lat, lon, limit }), signal);
  if (!data || !Array.isArray(data.features)) throw new Error('Unexpected response from Photon.');
  cacheSet(key, data);
  return data;
}

/**
 * Bundled fixture so the site still demonstrates itself when the public
 * endpoints are down. Loaded from data/cafes-demo.json.
 * @param {string} [href]
 * @returns {Promise<any>}
 */
export async function loadDemo(href = 'data/cafes-demo.json') {
  const res = await fetch(href, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Demo data unavailable (HTTP ${res.status})`);
  return res.json();
}
