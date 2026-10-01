#!/usr/bin/env bash
# Re-run whenever a new version of the creative brief lands in the project root.
#   npm run extract:brief
# Produces the plain-text source that `npm run verify:copy` checks content.json against,
# and pulls the three DBA hero frames out of the docx.
set -euo pipefail
cd "$(dirname "$0")/.."

DOCX=$(ls -1 104632*Creative*Brief*.docx 2>/dev/null | sort | tail -1)
[ -n "$DOCX" ] || { echo "No creative brief .docx found in project root"; exit 1; }
echo "Source: $DOCX"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$DOCX" "$TMP/brief.docx"
unzip -q "$TMP/brief.docx" -d "$TMP/x"

mkdir -p docs/source public/assets/stills
textutil -convert txt -output docs/source/creative-brief-v1.txt "$TMP/brief.docx"

python3 - "$TMP/x/word" docs/source/creative-brief-v1.comments.txt <<'PY'
import sys, re, xml.etree.ElementTree as ET
word, out = sys.argv[1], sys.argv[2]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
rels = open(f'{word}/_rels/document.xml.rels', encoding='utf8').read()
rows = []
for c in ET.parse(f'{word}/comments.xml').getroot().findall(f'{W}comment'):
    txt = ''.join(t.text or '' for t in c.iter(f'{W}t'))
    rows.append(f"[{c.get(W+'author')} {c.get(W+'date','')[:10]}] {txt}")
links = re.findall(r'Target="(https?://[^"]+)"', rels)
open(out, 'w', encoding='utf8').write('\n'.join(rows) + '\n\nLINKS IN DOCUMENT\n' + '\n'.join(links) + '\n')
PY

# The three DBA hero frames, in document order: Module 1 lamps, Module 2 silhouette, Module 3 sunset.
# Converted to JPEG (the docx PNGs are 200-600KB each; these are YouTube captures, so JPEG loses nothing visible).
# Two captures carry black letterbox bars baked in: frame 1 (top 68px of 529) and frame 3 (bottom 14px of 506); trimmed here.
FF=node_modules/ffmpeg-static/ffmpeg
[ -x "$FF" ] || { echo "Run npm install first (ffmpeg-static is used for the stills)"; exit 1; }
rm -f public/assets/stills/*
still() { # <docx image> <output name> <crop filter or "null">
  "$FF" -y -loglevel error -i "$TMP/x/word/media/$1.png" -vf "$3" -q:v 3 "public/assets/stills/$2.jpg"
}
still image1 dba-1-lamps      "crop=1013:461:0:68"
still image2 dba-2-silhouette "null"
still image5 dba-3-sunset     "crop=1165:492:0:0"
echo "Wrote docs/source/*.txt and public/assets/stills/*.jpg"
