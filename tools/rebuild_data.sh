#!/usr/bin/env bash
# Rebuilds src/data/route280.json and src/data/world.pack.b64 from open data.
#   requires: python3 with pyarrow, shapely, numpy, pillow
#   sources : Overture Maps (OSM-derived, ODbL) on AWS S3, AWS Terrain Tiles
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${WORK:-.cache/data}
mkdir -p "$WORK"
BBOX="23.322 42.636 23.380 42.700"
python3 tools/overture_extract.py base infrastructure "$WORK/infra.parquet" 23.318 42.635 23.385 42.705
python3 tools/overture_extract.py transportation segment "$WORK/seg.parquet" $BBOX
python3 tools/overture_extract.py buildings building "$WORK/bld.parquet" $BBOX
python3 tools/overture_extract.py buildings building_part "$WORK/bpart.parquet" $BBOX
python3 tools/overture_extract.py base land_use "$WORK/landuse.parquet" $BBOX
python3 tools/overture_extract.py base land "$WORK/land.parquet" $BBOX
python3 tools/overture_extract.py base water "$WORK/water.parquet" $BBOX
python3 tools/build_route.py "$WORK" src/data/route280.json
python3 tools/build_dem.py "$WORK/dem_cache" "$WORK/dem.npz"
python3 tools/build_world.py "$WORK" src/data/route280.json "$WORK/dem.npz" src/data
