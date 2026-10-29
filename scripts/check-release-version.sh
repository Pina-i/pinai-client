#!/bin/sh
# Fails when apps/web and apps/desktop disagree on the version, when the tag ($1, if any) names
# neither that version nor a release candidate of it, or when deploy/compose.yaml's default image
# isn't its minor.
set -eu
cd "$(dirname "$0")/.."

tag=${1:-}
version=$(jq -r .version apps/web/package.json)
desktop=$(jq -r .version apps/desktop/package.json)

if [ "$desktop" != "$version" ]; then
  echo "::error::apps/desktop is at $desktop, apps/web at $version: they ship as one version"
  exit 1
fi

case "$tag" in
  "" | "v$version" | "v$version"-*) ;;
  *)
    echo "::error::tag $tag, but apps/web is at $version"
    exit 1 ;;
esac

# The README shows deploy/compose.yaml, whose default image is the latest minor's: before the
# first release it already names the first one, and a release candidate runs its own version.
case "$tag" in
  *-*) exit 0 ;;
esac
[ "$version" = 0.0.0 ] && exit 0
minor=${version%.*}
grep -qF "\${PINAI_WEB_VERSION:-$minor}" deploy/compose.yaml || {
  echo "::error::set PINAI_WEB_VERSION's default to $minor in deploy/compose.yaml, and copy the file into README.md"
  exit 1
}
