#!/bin/sh
# Identity providers fetch $PUBLIC_ORIGIN/oauth-client.json and check that it names
# itself exactly, as browsers write an origin: a wrong origin fails every sign-in, so
# the container refuses to start with one.
set -eu

origin=${PUBLIC_ORIGIN:-}
if ! printf '%s\n' "$origin" | grep -Eqx 'https?://[a-z0-9.-]+(:[0-9]+)?'; then
  echo "PUBLIC_ORIGIN must be the origin this app is served from, in lower case and without a path: https://app.example.org" >&2
  exit 1
fi
case "$origin" in
  https://*:443 | http://*:80)
    echo "PUBLIC_ORIGIN must not name its scheme's default port: ${origin%:*}" >&2
    exit 1 ;;
esac

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
