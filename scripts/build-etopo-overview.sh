#!/usr/bin/env bash
set -euo pipefail

# Build the compact, offline world overview used by TERRA NOVA.
# Input: a complete global ETOPO 2022 60-arc-second GeoTIFF or VRT.
# Requires GDAL (gdalinfo + gdal_translate).
#
# Usage:
#   bash scripts/build-etopo-overview.sh /path/to/ETOPO_2022_global_60s.vrt
#
# Output:
#   data/terrain/etopo_global_10m_i16.bin
#   data/terrain/etopo_global_10m_i16.hdr
#   data/terrain/etopo_global_10m.json

INPUT="${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then
  echo "Usage: $0 <global ETOPO 2022 60-arc-second GeoTIFF or VRT>" >&2
  exit 2
fi
for command in gdalinfo gdal_translate; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing dependency: $command (install GDAL)." >&2
    exit 3
  }
done

mkdir -p data/terrain
OUTPUT="data/terrain/etopo_global_10m_i16.bin"
echo "Inspecting source raster: $INPUT"
gdalinfo "$INPUT" >/dev/null

echo "Resampling measured elevations to 2160 × 1080 (10 arc-minute overview)…"
gdal_translate \
  -q \
  -of ENVI \
  -ot Int16 \
  -outsize 2160 1080 \
  -r average \
  -co BYTE_ORDER=LSB \
  "$INPUT" "$OUTPUT"

cat > data/terrain/etopo_global_10m.json <<'EOF'
{
  "dataset": "ETOPO 2022",
  "source_resolution_arc_seconds": 60,
  "overview_resolution_arc_minutes": 10,
  "width": 2160,
  "height": 1080,
  "sample_type": "signed-int16",
  "byte_order": "little-endian",
  "unit": "metres",
  "longitude_extent": [-180, 180],
  "latitude_extent": [90, -90],
  "resampling": "average",
  "source_doi": "10.25921/fd45-gt74",
  "source_license": "CC0-1.0"
}
EOF

EXPECTED_BYTES=$((2160 * 1080 * 2))
ACTUAL_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
if [[ "$ACTUAL_BYTES" -ne "$EXPECTED_BYTES" ]]; then
  echo "Unexpected raster size: expected $EXPECTED_BYTES bytes, got $ACTUAL_BYTES" >&2
  exit 4
fi

echo "Done: $OUTPUT ($ACTUAL_BYTES bytes)"
echo "ENVI header: data/terrain/etopo_global_10m_i16.hdr"
echo "Metadata: data/terrain/etopo_global_10m.json"
echo "Verify the ENVI header reports byte order = 0 (little-endian) before committing."
