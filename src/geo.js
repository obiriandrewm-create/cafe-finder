/**
 * Pure geometry and formatting helpers. No DOM, no network — so they can be
 * unit-tested in Node with zero dependencies.
 */

/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres.
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 * @returns {number} distance in metres
 */
export function haversine(a, b) {
  if (!isValidPoint(a) || !isValidPoint(b)) throw new TypeError('haversine: invalid point');
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @param {unknown} p
 * @returns {boolean} true when p looks like a usable {lat, lon}
 */
export function isValidPoint(p) {
  return (
    typeof p === 'object' && p !== null &&
    Number.isFinite(/** @type {any} */ (p).lat) &&
    Number.isFinite(/** @type {any} */ (p).lon) &&
    Math.abs(/** @type {any} */ (p).lat) <= 90 &&
    Math.abs(/** @type {any} */ (p).lon) <= 180
  );
}

/**
 * Human-friendly distance: "180 m", "1.4 km", "12 km".
 * @param {number} metres
 * @returns {string}
 */
export function formatDistance(metres) {
  if (!Number.isFinite(metres) || metres < 0) return '—';
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  const km = metres / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Sort a copy of items by ascending distance, then by name.
 * @template {{distanceM?: number, name?: string}} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function byDistance(items) {
  return [...items].sort((a, b) => {
    const da = Number.isFinite(a.distanceM) ? /** @type {number} */ (a.distanceM) : Infinity;
    const db = Number.isFinite(b.distanceM) ? /** @type {number} */ (b.distanceM) : Infinity;
    if (da !== db) return da - db;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}

/**
 * Convert a Photon GeoJSON feature into the flat shape the UI renders.
 * Defensive: every field is optional in OSM data.
 * @param {any} feature
 * @param {{lat: number, lon: number}} [origin]
 * @returns {{id: string, name: string, street: string, locality: string, distanceM: number|null, lat: number, lon: number, tags: Record<string, string>}}
 */
export function toPlace(feature, origin) {
  const props = (feature && feature.properties) || {};
  const coords = (feature && feature.geometry && feature.geometry.coordinates) || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
  const locality = [props.city || props.locality || props.district, props.postcode]
    .filter(Boolean)
    .join(' ');

  const place = {
    id: `${props.osm_type || 'x'}${props.osm_id || Math.random().toString(36).slice(2)}`,
    name: props.name || 'Unnamed café',
    street,
    locality,
    distanceM: null,
    lat,
    lon,
    tags: {
      cuisine: props.cuisine || '',
      hours: props.opening_hours || '',
      website: props.website || '',
      phone: props.phone || '',
      outdoor: props.outdoor_seating || '',
      wifi: props.internet_access || '',
    },
  };

  if (origin && isValidPoint(origin) && isValidPoint({ lat, lon })) {
    place.distanceM = haversine(origin, { lat, lon });
  }
  return place;
}
