"""Refresh data/cafes-demo.json from the live Photon API.

Why a script and not a committed constant: the demo fixture must be real
OpenStreetMap data (so a reviewer can check it), and it must be refreshable
without hand-editing a 40-entry JSON file.

Usage:
    python scripts/refresh-demo.py [--lat 48.8566] [--lon 2.3522] [--limit 40]

© OpenStreetMap contributors, ODbL 1.0. Photon is a free community service —
run this rarely, and never as part of CI.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

PHOTON = "https://photon.komoot.io/api/"
USER_AGENT = "cafe-finder-demo/1.0 (+https://github.com/obiriandrewm-create/cafe-finder)"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cafes-demo.json"


def fetch(lat: float, lon: float, limit: int) -> dict:
    """Query Photon for cafés around a point."""
    params = urllib.parse.urlencode(
        {"q": "cafe", "lat": lat, "lon": lon, "limit": 50, "lang": "en", "osm_tag": "amenity:cafe"}
    )
    req = urllib.request.Request(f"{PHOTON}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:  # noqa: S310 - fixed https endpoint
        return json.load(res)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lat", type=float, default=48.8566)
    ap.add_argument("--lon", type=float, default=2.3522)
    ap.add_argument("--label", default="central Paris (demo)")
    ap.add_argument("--limit", type=int, default=40)
    args = ap.parse_args()

    raw = fetch(args.lat, args.lon, args.limit)
    seen: set[tuple[str, int]] = set()
    features = []
    for feature in raw.get("features", []):
        props = feature.get("properties", {})
        name = (props.get("name") or "").strip()
        if not name:
            continue  # unnamed cafés are noise in a demo
        key = (name.lower(), int(props.get("osm_id") or 0))
        if key in seen:
            continue
        seen.add(key)
        features.append(feature)

    payload = {
        "note": (
            "Real OpenStreetMap place data, fetched from Photon for offline demo use. "
            "© OpenStreetMap contributors, ODbL 1.0."
        ),
        "fetched": date.today().isoformat(),
        "origin": {"lat": args.lat, "lon": args.lon, "label": args.label},
        "label": args.label,
        "features": features[: args.limit],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT} with {len(payload['features'])} places")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
