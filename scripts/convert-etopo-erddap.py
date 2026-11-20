#!/usr/bin/env python3
"""Convert a decimated NOAA ETOPO ERDDAP NetCDF extract to TERRA NOVA's raw Int16 grid.

Dependencies: Python 3, NumPy, xarray, and an xarray NetCDF backend (scipy or netCDF4).
Usage: python scripts/convert-etopo-erddap.py input.nc [output-directory]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import xarray as xr

WIDTH, HEIGHT = 2160, 1080
EXPECTED_STEP = 1.0 / 6.0


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: python scripts/convert-etopo-erddap.py input.nc [output-directory]", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) == 3 else Path("data/terrain")
    if not source.is_file():
        print(f"Input file not found: {source}", file=sys.stderr)
        return 2

    with xr.open_dataset(source) as dataset:
        for name in ("latitude", "longitude", "z"):
            if name not in dataset:
                raise ValueError(f"Missing required NetCDF variable/coordinate: {name}")
        latitude = np.asarray(dataset["latitude"].values, dtype=np.float64)
        longitude = np.asarray(dataset["longitude"].values, dtype=np.float64)
        values = np.asarray(dataset["z"].values, dtype=np.float64)
        vertical_reference = dataset["z"].attrs.get("vert_crs_name", "unspecified")
        units = dataset["z"].attrs.get("units", "")

    if values.shape != (HEIGHT, WIDTH):
        raise ValueError(f"Expected z shape {(HEIGHT, WIDTH)}, received {values.shape}")
    if latitude.shape != (HEIGHT,) or longitude.shape != (WIDTH,):
        raise ValueError("Unexpected coordinate array dimensions")
    if units.lower() not in ("m", "meter", "meters", "metre", "metres"):
        raise ValueError(f"Expected elevation units in metres, received {units!r}")
    if not np.isfinite(values).all():
        raise ValueError("The extract contains missing or non-finite elevation values")
    if not (np.all(np.diff(latitude) > 0) and np.all(np.diff(longitude) > 0)):
        raise ValueError("Expected strictly ascending latitude and longitude coordinates")
    if not np.allclose(np.diff(latitude), EXPECTED_STEP, atol=1e-8):
        raise ValueError("Latitude spacing is not the expected 10-arc-minute stride")
    if not np.allclose(np.diff(longitude), EXPECTED_STEP, atol=1e-8):
        raise ValueError("Longitude spacing is not the expected 10-arc-minute stride")
    if not (0 <= longitude[0] < 1 and 359 < longitude[-1] < 360):
        raise ValueError("Expected NOAA ERDDAP longitudes on a 0–360 degree grid")
    if values.min() < -32768 or values.max() > 32767:
        raise ValueError("Elevation values exceed signed Int16 range")

    # ENVI/raw raster convention: north-to-south rows, west-to-east columns.
    # NOAA ERDDAP returns ascending latitudes and longitudes on [0, 360).
    ordered = np.roll(values[::-1, :], shift=-(WIDTH // 2), axis=1)
    elevations = np.rint(ordered).astype("<i2")

    output_dir.mkdir(parents=True, exist_ok=True)
    binary_path = output_dir / "etopo_global_10m_i16.bin"
    elevations.tofile(binary_path)

    (output_dir / "etopo_global_10m_i16.hdr").write_text(
        "ENVI\n"
        "description = {ETOPO 2022 Ice Surface, NOAA ERDDAP decimated extraction}\n"
        f"samples = {WIDTH}\nlines = {HEIGHT}\nbands = 1\n"
        "header offset = 0\nfile type = ENVI Standard\n"
        "data type = 2\ninterleave = bsq\nbyte order = 0\n",
        encoding="ascii",
    )

    metadata = {
        "dataset": "ETOPO 2022 v1 60s (Ice Surface)",
        "source": "NOAA NCEI ERDDAP griddap ETOPO_2022_v1_60s",
        "source_url": "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.html",
        "source_doi": "10.25921/fd45-gt74",
        "source_license": "CC0-1.0",
        "width": WIDTH,
        "height": HEIGHT,
        "output_resolution_arc_minutes": 10,
        "sample_type": "signed-int16",
        "byte_order": "little-endian",
        "unit": "metres",
        "vertical_reference": vertical_reference,
        "longitude_extent_degrees": [-180, 180],
        "latitude_extent_degrees": [-90, 90],
        "sample_centers": {
            "longitude_first": float(longitude[WIDTH // 2] - 360),
            "longitude_last": float(longitude[WIDTH // 2 - 1]),
            "latitude_first": float(latitude[-1]),
            "latitude_last": float(latitude[0]),
            "spacing_degrees": EXPECTED_STEP,
        },
        "resampling": "stride sampling (every 10th source cell); not area-averaged",
        "conversion": "latitude rows reversed north-to-south; longitude columns rotated 180 degrees from 0–360 to -180–180; elevations rounded to nearest metre",
        "nodata": "none in validated input",
        "raw_size_bytes": binary_path.stat().st_size,
    }
    (output_dir / "etopo_global_10m.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )

    expected_bytes = WIDTH * HEIGHT * 2
    if binary_path.stat().st_size != expected_bytes:
        raise RuntimeError(f"Unexpected binary size: {binary_path.stat().st_size} != {expected_bytes}")
    print(f"Created {binary_path} ({expected_bytes:,} bytes)")
    print(f"Elevation range: {int(elevations.min())} to {int(elevations.max())} metres")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
