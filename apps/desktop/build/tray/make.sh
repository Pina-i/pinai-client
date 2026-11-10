#!/bin/sh
# The tray's icons, from the app's (../icon.svg), plain and with the attention dot: a .ico of
# Windows' sizes, and a 48px PNG for Linux, whose panel scales it. Needs ImageMagick 7 with librsvg.
set -eu
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

magick -background none -density 96 ../icon.svg -resize 1024x1024 "$tmp/tray.png"
# The Windows overlay's red (apps/web's badge-image.ts), cut out of the icon so it reads on any panel.
magick "$tmp/tray.png" \( -size 1024x1024 xc:none -fill black -draw "circle 800,224 800,-64" \) \
    -compose DstOut -composite -fill "#d93036" -draw "circle 800,224 800,0" "$tmp/tray-dot.png"

for name in tray tray-dot; do
    for size in 16 20 24 32 40 48; do
        magick "$tmp/$name.png" -filter Lanczos -resize "${size}x${size}" -depth 8 -strip \
            -define png:exclude-chunks=date,time "$tmp/$name-$size.png"
    done
    # TrueColorAlpha: IM would palettise the small sizes, their edges losing all but a 1-bit mask.
    magick "$tmp/$name-16.png" "$tmp/$name-20.png" "$tmp/$name-24.png" "$tmp/$name-32.png" \
        "$tmp/$name-40.png" "$tmp/$name-48.png" -type TrueColorAlpha "$name.ico"
    cp "$tmp/$name-48.png" "$name.png"
done
