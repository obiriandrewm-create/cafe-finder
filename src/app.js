/**
 * Cafe Finder — UI layer.
 *
 * One state object, one render function, explicit states. Every network
 * failure resolves to something visible: loading, empty, error-with-retry,
 * or the bundled demo. There is no path where the user stares at nothing.
 */

import { geocode, findCafes, loadDemo } from './api.js';
import { toPlace, byDistance, formatDistance, isValidPoint } from './geo.js';

/** @typedef {{id:string,name:string,street:string,locality:string,distanceM:number|null,lat:number,lon:number,tags:Record<string,string>}} Place */

const el = {
  form: document.querySelector('[data-form]'),
  place: document.querySelector('[data-place]'),
  submit: document.querySelector('[data-submit]'),
  geolocate: document.querySelector('[data-geolocate]'),
  list: document.querySelector('[data-list]'),
  meta: document.querySelector('[data-meta]'),
  notice: document.querySelector('[data-notice]'),
  state: document.querySelector('[data-state]'),
  stateTitle: document.querySelector('[data-state-title]'),
  stateBody: document.querySelector('[data-state-body]'),
  demo: document.querySelector('[data-demo]'),
  srStatus: document.querySelector('[data-sr-status]'),
  radius: document.querySelector('[data-radius]'),
  sortBtns: [...document.querySelectorAll('[data-sort]')],
  unnamedBtn: document.querySelector('[data-unnamed]'),
  themeToggle: document.querySelector('[data-theme-toggle]'),
};

const state = {
  /** @type {'idle'|'loading'|'ready'|'empty'|'error'} */
  status: 'idle',
  /** @type {Place[]} */
  places: [],
  origin: /** @type {{lat:number,lon:number,label:string}|null} */ (null),
  sort: /** @type {'nearest'|'name'} */ ('nearest'),
  hideUnnamed: false,
  radiusM: 2000,
  isDemo: false,
  message: '',
  /** @type {AbortController|null} */
  inflight: null,
};

/* ------------------------------------------------------------------ theme */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  el.themeToggle.setAttribute('aria-pressed', String(dark));
  el.themeToggle.setAttribute(
    'aria-label',
    dark ? 'Switch to light mode' : 'Switch to dark mode'
  );
  el.themeToggle.querySelector('.icon-btn__glyph').textContent = dark ? '☾' : '☀';
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('cafefinder:theme');
  } catch {
    /* private mode */
  }
  const prefersLight =
    globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}

el.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('cafefinder:theme', next);
  } catch {
    /* ignore */
  }
});

/* ------------------------------------------------------------------- views */

/** Escape text before it touches innerHTML. Names come from OSM: untrusted. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/** @param {Place} p */
function cardHTML(p) {
  const meta = [p.street, p.locality].filter(Boolean).map(esc).join(' · ');
  const dist = p.distanceM == null ? '' : formatDistance(p.distanceM);
  const osm = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=19/${p.lat}/${p.lon}`;
  const dir = `https://www.openstreetmap.org/directions?from=&to=${p.lat}%2C${p.lon}`;
  return `
    <li class="card">
      <div class="card__main">
        <h3 class="card__name">${esc(p.name)}</h3>
        <p class="card__meta">${meta || '<span class="card__meta--faint">No address recorded in OSM</span>'}</p>
      </div>
      <div class="card__side">
        ${dist ? `<span class="card__dist" title="Straight-line distance">${esc(dist)}</span>` : ''}
        <div class="card__actions">
          <a class="link" href="${osm}" target="_blank" rel="noopener">Map</a>
          <a class="link" href="${dir}" target="_blank" rel="noopener">Route</a>
        </div>
      </div>
    </li>`;
}

function visiblePlaces() {
  let out = state.places.slice();
  if (state.hideUnnamed) {
    out = out.filter((p) => p.name && !/^(unnamed )?caf[eé]s?$/i.test(p.name.trim()));
  }
  if (state.radiusM > 0) {
    out = out.filter((p) => p.distanceM == null || p.distanceM <= state.radiusM);
  }
  return state.sort === 'nearest' ? byDistance(out) : out.sort((a, b) => a.name.localeCompare(b.name));
}

function showState(kind, title, body, withDemoButton = false) {
  el.state.hidden = false;
  el.state.dataset.state = kind;
  el.stateTitle.textContent = title;
  el.stateBody.textContent = body;
  el.demo.hidden = !withDemoButton;
}

function render() {
  const places = visiblePlaces();

  el.list.innerHTML = state.status === 'ready' ? places.map(cardHTML).join('') : '';
  el.list.hidden = state.status !== 'ready' || places.length === 0;

  if (state.status === 'loading') {
    el.state.hidden = true;
    el.meta.textContent = 'Searching…';
    el.list.innerHTML = skeleton();
    el.list.hidden = false;
    return;
  }

  if (state.status === 'error') {
    showState('error', 'That search failed', state.message, true);
    el.meta.textContent = 'No results.';
    return;
  }

  if (state.status === 'empty') {
    showState(
      'empty',
      'No cafés found there',
      state.radiusM > 0 ? 'Try a wider radius, or a different place.' : 'Try a different place.',
      false
    );
    el.meta.textContent = '0 places.';
    return;
  }

  if (state.status === 'ready') {
    const total = state.places.length;
    const shown = places.length;
    el.state.hidden = shown > 0;
    if (shown === 0) {
      showState('empty', 'Nothing matches those filters', 'Loosen the radius or unhide unnamed places.', false);
    }
    el.meta.textContent = state.isDemo
      ? `Demo data — ${shown} of ${total} cafes (real-time endpoints unreachable).`
      : `${shown} of ${total} cafes${state.origin?.label ? ` near ${state.origin.label}` : ''}.`;
    return;
  }

  // idle
  showState(
    'idle',
    'Try a place',
    'Search a neighbourhood, city or postcode — or let the browser locate you.',
    false
  );
  el.meta.textContent = 'Nothing searched yet.';
}

function skeleton() {
  return Array.from({ length: 4 }, () => `
    <li class="card card--skeleton" aria-hidden="true">
      <div class="sk sk--title"></div>
      <div class="sk sk--line"></div>
    </li>`).join('');
}

/* ------------------------------------------------------------------ search */

function setNotice(text) {
  el.notice.hidden = !text;
  el.notice.textContent = text || '';
}

/** @param {{lat:number,lon:number,label:string}} origin @param {boolean} isDemo */
async function runSearch(origin, isDemo = false) {
  state.inflight?.abort();
  const ctrl = new AbortController();
  state.inflight = ctrl;

  state.status = 'loading';
  state.isDemo = isDemo;
  state.origin = origin;
  el.submit.disabled = true;
  setNotice('');
  render();

  try {
    const data = await findCafes({ lat: origin.lat, lon: origin.lon, limit: 50 }, ctrl.signal);
    state.places = (data.features || []).map((f) => toPlace(f, origin));
    state.status = state.places.length ? 'ready' : 'empty';
    el.srStatus.textContent = `${state.places.length} cafes found.`;
  } catch (err) {
    if (err?.name === 'AbortError') return;
    state.status = 'error';
    state.message = `Could not reach OpenStreetMap (${err.message}). The free public endpoint may be busy — retry, or load the bundled demo.`;
    el.srStatus.textContent = 'Search failed.';
  } finally {
    el.submit.disabled = false;
    render();
  }
}

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = el.place.value.trim();
  if (!query) {
    el.place.focus();
    setNotice('Type a place first — or press “Near me”.');
    return;
  }
  state.status = 'loading';
  state.places = [];
  render();
  try {
    const origin = await geocode(query);
    await runSearch(origin);
  } catch (err) {
    state.status = 'error';
    state.message = err.message || 'Could not find that place.';
    render();
  }
});

el.geolocate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setNotice('This browser does not expose location. Type a place instead.');
    return;
  }
  el.geolocate.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      el.geolocate.disabled = false;
      runSearch({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: 'your location',
      });
    },
    (err) => {
      el.geolocate.disabled = false;
      setNotice(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Type a place instead.'
          : 'Could not get your location. Type a place instead.'
      );
    },
    { timeout: 10000, maximumAge: 60000 }
  );
});

/* ------------------------------------------------------------------ demo */

el.demo.addEventListener('click', async () => {
  state.status = 'loading';
  render();
  try {
    const data = await loadDemo();
    const origin = data.origin || { lat: 48.8566, lon: 2.3522, label: data.label || 'demo area' };
    state.places = (data.features || []).map((f) => toPlace(f, origin));
    state.origin = isValidPoint(origin) ? origin : null;
    state.isDemo = true;
    state.status = state.places.length ? 'ready' : 'empty';
    render();
  } catch (err) {
    state.status = 'error';
    state.message = `Demo data could not load (${err.message}). Serve the folder over HTTP — file:// blocks fetch.`;
    render();
  }
});

/* --------------------------------------------------------------- controls */

el.sortBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.sort = /** @type {'nearest'|'name'} */ (btn.dataset.sort);
    el.sortBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    if (state.status === 'ready') render();
  });
});

el.unnamedBtn.addEventListener('click', () => {
  state.hideUnnamed = !state.hideUnnamed;
  el.unnamedBtn.setAttribute('aria-pressed', String(state.hideUnnamed));
  if (state.status === 'ready') render();
});

el.radius.addEventListener('change', () => {
  state.radiusM = Number(el.radius.value) || 0;
  if (state.status === 'ready' || state.status === 'empty') render();
});

/* ------------------------------------------------------------------ boot */

initTheme();
render();

// ?demo=1 renders the fixture immediately, for screenshots and offline review.
if (new URLSearchParams(location.search).get('demo') === '1') {
  el.demo.click();
}
