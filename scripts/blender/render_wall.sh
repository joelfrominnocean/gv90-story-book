#!/bin/zsh
# Renders the library wall plate and the six "empty slot" patches the take-down needs.
#   zsh scripts/blender/render_wall.sh            -> renders/wall/{base,patch_0..5}.png + base_layout.json
# Then: node scripts/make-wall-assets.mjs         -> public/assets/room/*.webp + layout.json
cd "$(dirname "$0")/../.."
B=/Applications/Blender.app/Contents/MacOS/Blender
COMMON=(WALL=1 FIRE=0 GRADE=0 KEY=70 WINDOW=500 FIRE_LIGHT=10 WALL_PX=${WALL_PX:-3000} RES=1.0 SAMPLES=${SAMPLES:-128})
env $COMMON OUT=renders/wall/base.png $B -b -noaudio --python scripts/blender/library_hero.py 2>&1 | grep -E "SECONDS|Error|Traceback"
for n in 0 1 2 3 4 5; do
  # the slot's rectangle from the layout the first render wrote, with a little margin for the shading the book gave its neighbours
  BORDER=$(python3 - <<PY
import json
l=json.load(open("renders/wall/base_layout.json"))["books"][$n]
mx,my=0.0030,0.006
print(f'{l["u0"]-mx},{l["v0"]-my},{l["u1"]+mx},{l["v1"]+my}')
PY
)
  env $COMMON HIDE_BOOK=$n BORDER=$BORDER OUT=renders/wall/patch_$n.png $B -b -noaudio --python scripts/blender/library_hero.py 2>&1 | grep -E "SECONDS|Error|Traceback"
  echo "$BORDER" > renders/wall/patch_$n.border
done
echo ALL DONE
