#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${ROOT}/data/ne_10m_land.geojson"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

for command in curl unzip ogr2ogr; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Dépendance manquante : ${command}" >&2
    exit 1
  fi
done

URL="https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"
echo "Téléchargement du fond terrestre Natural Earth 1:10m…"
curl --fail --location --retry 3 --output "${WORK}/land.zip" "${URL}"
unzip -q "${WORK}/land.zip" -d "${WORK}/land"

SOURCE="$(find "${WORK}/land" -maxdepth 2 -name 'ne_10m_land.shp' -print -quit)"
if [[ -z "${SOURCE}" ]]; then
  echo "Le paquet téléchargé ne contient pas ne_10m_land.shp." >&2
  exit 1
fi

mkdir -p "${ROOT}/data"
ogr2ogr -f GeoJSON -lco RFC7946=YES -lco COORDINATE_PRECISION=5 "${OUTPUT}" "${SOURCE}"
echo "Fond régional créé : ${OUTPUT}"
echo "Vérifier la taille et les tests avant de versionner ce fichier."
