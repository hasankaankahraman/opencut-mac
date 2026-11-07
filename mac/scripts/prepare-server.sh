#!/bin/sh
# Builds the Next.js web app and lays out its standalone server so it can run
# on its own: Next leaves static assets and public/ out of the standalone dir.
set -eu

mac_dir="$(cd "$(dirname "$0")/.." && pwd)"
web_dir="$mac_dir/../apps/web"
standalone="$web_dir/.next/standalone"

if [ ! -f "$web_dir/.env.local" ]; then
  echo "Missing apps/web/.env.local (see mac/README.md)." >&2
  exit 1
fi

(cd "$web_dir" && NEXT_TELEMETRY_DISABLED=1 bun run build)

rm -rf "$standalone/apps/web/.next/static" "$standalone/apps/web/public"
cp -R "$web_dir/.next/static" "$standalone/apps/web/.next/static"
cp -R "$web_dir/public" "$standalone/apps/web/public"
# Secrets come from the Electron main process at runtime, never from the bundle.
rm -f "$standalone"/apps/web/.env* "$standalone"/.env*
# Dangling links from the bun store break copying and code signing.
find "$standalone" -type l | while IFS= read -r link; do
  [ -e "$link" ] || rm "$link"
done

echo "Server ready at $standalone/apps/web/server.js"
