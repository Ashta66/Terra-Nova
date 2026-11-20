#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${ROOT}/data/ne_10m_land.geojson"
TEMP="${OUTPUT}.download"

mkdir -p "${ROOT}/data"
trap 'rm -f "${TEMP}"' EXIT

if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "Dépendances manquantes : curl et Python 3 sont nécessaires." >&2
  exit 1
fi

URL="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson"
echo "Téléchargement du fond terrestre Natural Earth 1:10m (environ 10 Mo)…"
curl --fail --location --retry 3 --output "${TEMP}" "${URL}"

python3 - "${TEMP}" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
try:
    with path.open(encoding="utf-8") as stream:
        data = json.load(stream)
except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
    raise SystemExit(f"GeoJSON invalide : {error}")

if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
    raise SystemExit("Le fichier téléchargé n'est pas une FeatureCollection GeoJSON.")
if not data["features"]:
    raise SystemExit("Le fichier GeoJSON ne contient aucune entité.")

print(f"Validation réussie : {len(data['features'])} entités.")
PY

mv "${TEMP}" "${OUTPUT}"
echo "Fond régional installé : ${OUTPUT}"
