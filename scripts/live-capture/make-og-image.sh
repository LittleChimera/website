#!/bin/bash
# Crop a dashboard screenshot to 1.91:1 for link previews (LinkedIn, X, Slack).
# Usage: make-og-image.sh <source.png> <out.png>   e.g. home.png og-v0.9.0.png
# Then add to the post front matter:
#   images:
#     - /screenshots/dashboard/<out.png>
# layouts/_partials/custom/head-end.html adds width/height/type from the file.
set -euo pipefail
src="$1"; out="$2"
w=$(identify -format %w "$src"); h=$(( w * 1000 / 1910 ))
convert "$src" -gravity North -crop "${w}x${h}+0+0" +repage -resize 2400x "$out"
identify "$out"
