# Cafe Finder

Find cafés near any place — no API key, no account, no backend, no build step.

Type a neighbourhood, city or postcode (or allow location access) and get real
cafés from OpenStreetMap, sorted by walking distance, with map and route links.

**Run it:** `node scripts/serve.js` → <http://localhost:5173> · `?demo=1` renders offline from a bundled fixture.

To publish it: **Settings → Pages → Source: `main` / root**. No build step, so the
repository root *is* the deployable artifact.

---

## Why this exists

Most "find places nearby" demos need a paid Places API and a backend to hide
the key. This one doesn't need either:

| Concern | Choice | Why |
|---|---|---|
| Place search | [Photon](https://photon.komoot.io/) | Free, no key, CORS-open (`Access-Control-Allow-Origin: *`) |
| Geocoding fallback | [Nominatim](https://nominatim.openstreetmap.org/) | Free, no key, also CORS-open |
| Backend | **none** | Static files only — it deploys to GitHub Pages unchanged |
| Map library | **none** | Deep links to OSM instead of shipping 150 KB of tiles JS |
| Build step | **none** | ES modules straight from the browser |

Total shipped weight: ~30 KB of first-party code plus one optional 23 KB
JSON fixture.

## Quickstart

```bash
git clone https://github.com/obiriandrewm-create/cafe-finder.git
cd cafe-finder
node scripts/serve.js          # → http://localhost:5173
```

Any static server works (`python -m http.server` is fine). Opening
`index.html` over `file://` will not work — browsers block `fetch()` on that
scheme, and the app says so rather than failing silently.

Run the tests:

```bash
node --test test/              # 11 tests, zero dependencies
```

## How it works

```
index.html ──src/app.js──┬── src/api.js   Photon + Nominatim, cache, timeout, abort
                         └── src/geo.js   haversine, formatting, feature → place
```

- **`src/api.js`** — URL builders (unit-tested), a 10-minute `localStorage`
  cache, an 8-second timeout per request, and `AbortController` so a new search
  cancels the previous one. Photon is tried first; Nominatim is the fallback.
- **`src/geo.js`** — pure functions only. `haversine()` (IUGG mean radius),
  `formatDistance()`, `byDistance()`, and `toPlace()` which flattens a Photon
  GeoJSON feature and defends against every field OSM might omit.
- **`src/app.js`** — one state object and one `render()`. Every network path
  lands in an explicit state: `idle`, `loading` (skeleton), `ready`, `empty`,
  `error` (with a retry affordance). There is no path where the user watches a
  spinner that never resolves.

### Distance filtering is client-side, on purpose

Photon biases results toward a point but does not guarantee a radius — a
search around central Paris can return a café 30 km away. So results are
sorted and filtered in the browser by haversine distance, with a radius
control (500 m → any). Server-side assumptions about "nearby" would be wrong.

## Accessibility

- Semantic landmarks (`header`/`main`/`footer`), a skip link, and a single `h1`.
- Result counts are announced through `aria-live="polite"`; sort and filter
  state is exposed via `aria-pressed`, not just colour.
- Contrast is measured, not eyeballed: body text 16.4:1, secondary text 5.9:1,
  card metadata 6.3:1 in light mode; the same tokens clear AA in dark. The
  original `--text-faint` token failed AA at 13.8 px (3.4:1), so this app uses
  `--text-muted` for anything that carries information.
- `prefers-reduced-motion` is honoured by `tokens.css`.
- All place names are escaped before rendering — they come from a public wiki.

## Known limitations

- **OSM data is community-maintained.** A café may be closed, renamed or
  missing. There is no opening-hours data in the Photon response, so there is
  no "open now" filter — offering one would be a lie.
- **Public endpoints are best-effort.** Photon and Nominatim are free services
  with no SLA; Overpass-era outages happen. The `?demo=1` fixture and the
  bundled `data/cafes-demo.json` exist so a review never lands on a dead page.
- **No map view.** Deliberate: a map means a tile provider and a 150 KB
  dependency. Each card deep-links into OSM instead.
- Distance is straight-line, not walking distance. "Route" opens OSM routing.

## Refreshing the demo fixture

The fixture is **real OSM data** captured from Photon, not invented places:

```bash
python scripts/refresh-demo.py --lat 48.8566 --lon 2.3522 --limit 40
```

Please don't run this in CI — it's a free community service with a
one-request-per-second courtesy limit.

## Licence

MIT for the code (see `LICENSE`). Place data ©
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
ODbL 1.0 — attribution is retained in the UI footer and in the fixture itself.

Built by [Andrew Obiri](https://github.com/obiriandrewm-create).
