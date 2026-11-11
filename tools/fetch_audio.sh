#!/usr/bin/env bash
# Download the source recording (MP3, as originally released on the Free
# Music Archive) from the Internet Archive and verify checksums.
#
# "The Four Seasons" – John Harrison with the Wichita State University
# Chamber Players, licensed CC BY-SA 3.0.
# https://archive.org/details/The_Four_Seasons_Vivaldi-10361
set -euo pipefail
DEST=${1:-build/src}
ID=The_Four_Seasons_Vivaldi-10361
mkdir -p "$DEST"
curl -sL "https://archive.org/metadata/$ID" -o "$DEST/meta.json"
python3 - "$DEST/meta.json" > "$DEST/list.txt" <<'EOF'
import json, sys
for f in json.load(open(sys.argv[1]))['files']:
    if f['name'].endswith('.mp3'):
        print(f['md5'], f['name'])
EOF
while read -r md5 name; do
  [ -f "$DEST/$name" ] || curl -sL -o "$DEST/$name" "https://archive.org/download/$ID/$name"
  echo "$md5  $DEST/$name" | md5sum -c --quiet
done < "$DEST/list.txt"
echo "ok: $(wc -l < "$DEST/list.txt") files in $DEST"
