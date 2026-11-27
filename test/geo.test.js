import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haversine,
  isValidPoint,
  formatDistance,
  byDistance,
  toPlace,
  EARTH_RADIUS_M,
} from '../src/geo.js';
import { photonCafeUrl, photonGeocodeUrl, nominatimUrl } from '../src/api.js';

test('haversine: identical points are zero apart', () => {
  const p = { lat: 48.8566, lon: 2.3522 };
  assert.equal(haversine(p, p), 0);
});

test('haversine: one degree of latitude is ~111.2 km', () => {
  const d = haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  const expected = (EARTH_RADIUS_M * Math.PI) / 180;
  assert.ok(Math.abs(d - expected) < 1, `got ${d}, expected ~${expected}`);
});

test('haversine: Paris to London is ~343 km', () => {
  const d = haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
  assert.ok(d > 340_000 && d < 348_000, `got ${d}`);
});

test('haversine: rejects invalid input rather than returning NaN', () => {
  assert.throws(() => haversine({ lat: 'x', lon: 0 }, { lat: 0, lon: 0 }), TypeError);
  assert.throws(() => haversine(null, { lat: 0, lon: 0 }), TypeError);
});

test('isValidPoint: bounds and types', () => {
  assert.equal(isValidPoint({ lat: 0, lon: 0 }), true);
  assert.equal(isValidPoint({ lat: 90, lon: 180 }), true);
  assert.equal(isValidPoint({ lat: 91, lon: 0 }), false);
  assert.equal(isValidPoint({ lat: 0, lon: 181 }), false);
  assert.equal(isValidPoint({ lat: NaN, lon: 0 }), false);
  assert.equal(isValidPoint(undefined), false);
});

test('formatDistance: metric bands', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(184), '180 m');
  assert.equal(formatDistance(999), '1000 m');
  assert.equal(formatDistance(1400), '1.4 km');
  assert.equal(formatDistance(12_400), '12 km');
  assert.equal(formatDistance(-1), '—');
  assert.equal(formatDistance(NaN), '—');
});

test('byDistance: sorts ascending and tolerates nulls', () => {
  const items = [
    { name: 'b', distanceM: 900 },
    { name: 'a', distanceM: 100 },
    { name: 'z', distanceM: null },
    { name: 'c', distanceM: 100 },
  ];
  assert.deepEqual(
    byDistance(items).map((i) => i.name),
    ['a', 'c', 'b', 'z']
  );
});

test('toPlace: flattens a Photon feature and computes distance', () => {
  const feature = {
    type: 'Feature',
    properties: {
      osm_type: 'N',
      osm_id: 251699776,
      name: 'Café de Flore',
      housenumber: '172',
      street: 'Boulevard Saint-Germain',
      city: 'Paris',
      postcode: '75006',
    },
    geometry: { type: 'Point', coordinates: [2.3323, 48.8541] },
  };
  const place = toPlace(feature, { lat: 48.8534, lon: 2.3488 });
  assert.equal(place.name, 'Café de Flore');
  assert.equal(place.street, '172 Boulevard Saint-Germain');
  assert.equal(place.locality, 'Paris 75006');
  assert.equal(place.id, 'N251699776');
  assert.ok(place.distanceM > 1000 && place.distanceM < 2000, `got ${place.distanceM}`);
});

test('toPlace: survives missing properties without throwing', () => {
  const place = toPlace({ properties: {}, geometry: { coordinates: [0, 0] } });
  assert.equal(place.name, 'Unnamed café');
  assert.equal(place.distanceM, null);
});

test('photonCafeUrl: filters to amenity=cafe and carries the point', () => {
  const url = new URL(photonCafeUrl({ lat: 48.8566, lon: 2.3522, limit: 20 }));
  assert.equal(url.origin + url.pathname, 'https://photon.komoot.io/api/');
  assert.equal(url.searchParams.get('q'), 'cafe');
  assert.equal(url.searchParams.get('lat'), '48.8566');
  assert.equal(url.searchParams.get('lon'), '2.3522');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.get('osm_tag'), 'amenity:cafe');
});

test('photonGeocodeUrl and nominatimUrl encode awkward queries', () => {
  const q = 'Rue de l’Église, Zürich & co';
  assert.equal(
    new URL(photonGeocodeUrl(q)).searchParams.get('q'),
    q
  );
  const n = new URL(nominatimUrl(q));
  assert.equal(n.searchParams.get('format'), 'jsonv2');
  assert.equal(n.searchParams.get('q'), q);
});
