#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${ROOT}/data"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "Dépendances manquantes : curl et Python 3 sont nécessaires." >&2
  exit 1
fi

BASE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
download() {
  local source="$1" destination="$2"
  echo "Téléchargement Natural Earth : ${source}"
  curl --fail --location --retry 3 --output "${TEMP_DIR}/${destination}" "${BASE}/${source}"
  python3 - "${TEMP_DIR}/${destination}" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
try:
    with path.open(encoding="utf-8") as stream:
        data = json.load(stream)
except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
    raise SystemExit(f"GeoJSON invalide ({path.name}) : {error}")
if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list) or not data["features"]:
    raise SystemExit(f"FeatureCollection vide ou invalide : {path.name}")
print(f"  {len(data['features'])} entités validées.")
PY
}

download ne_10m_land.geojson ne_10m_land.geojson
download ne_10m_lakes.geojson ne_10m_lakes.geojson
download ne_10m_rivers_lake_centerlines.geojson ne_10m_rivers_source.geojson
download ne_10m_populated_places_simple.geojson ne_10m_places_source.geojson

python3 - "${TEMP_DIR}" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
source = json.loads((root / "ne_10m_rivers_source.geojson").read_text(encoding="utf-8"))
(root / "ne_10m_rivers.geojson").write_text(json.dumps(source, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

places = json.loads((root / "ne_10m_places_source.geojson").read_text(encoding="utf-8"))
features = []
for feature in places["features"]:
    props = feature.get("properties") or {}
    geometry = feature.get("geometry")
    name = props.get("name") or props.get("NAME") or props.get("nameascii")
    if not name or not geometry or geometry.get("type") != "Point":
        continue
    try:
        rank = int(props.get("scalerank", props.get("SCALERANK", 99)))
        population = int(props.get("pop_max", props.get("POP_MAX", 0)) or 0)
    except (TypeError, ValueError):
        continue
    if rank > 8 and population < 100000:
        continue
    min_zoom = 4 if rank <= 4 or population >= 1000000 else 6 if rank <= 6 or population >= 250000 else 8
    features.append({
        "type": "Feature",
        "properties": {"name": str(name), "kind": "city", "minZoom": min_zoom, "population": population},
        "geometry": geometry
    })
if not features:
    raise SystemExit("Aucun label de ville exploitable dans la source Natural Earth.")
(root / "ne_10m_map_labels.geojson").write_text(
    json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"), ensure_ascii=False),
    encoding="utf-8"
)
print(f"Labels régionaux préparés : {len(features)} villes.")
PY

mkdir -p "${DATA}"
for file in ne_10m_land.geojson ne_10m_lakes.geojson ne_10m_rivers.geojson ne_10m_map_labels.geojson; do
  mv "${TEMP_DIR}/${file}" "${DATA}/${file}"
done
echo "Niveaux régionaux installés dans ${DATA}."
