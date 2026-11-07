#!/bin/sh
# Renders an SVG mark into build/icon.icns using sharp from the web app's deps.
# Usage: scripts/make-icon.sh [path/to/icon.svg]
set -eu
mac_dir="$(cd "$(dirname "$0")/.." && pwd)"
svg="${1:-$HOME/Documents/GitHub/OpenCut/brand/marks/icon.svg}"
work="$(mktemp -d)"
set="$work/icon.iconset"
mkdir -p "$set"

# macOS icon grid: the artwork sits at 824/1024 with transparent margins.
NODE_PATH="$mac_dir/../apps/web/node_modules" node -e '
const sharp = require("sharp");
const [svg, out] = process.argv.slice(1);
sharp(svg, { density: 400 }).resize(824, 824)
  .extend({ top: 100, bottom: 100, left: 100, right: 100, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile(out).catch((e) => { console.error(e); process.exit(1); });
' "$svg" "$work/1024.png"

for s in 16 32 128 256 512; do
  sips -z $s $s "$work/1024.png" --out "$set/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$work/1024.png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$set" -o "$mac_dir/build/icon.icns"
rm -rf "$work"
echo "Wrote $mac_dir/build/icon.icns"
