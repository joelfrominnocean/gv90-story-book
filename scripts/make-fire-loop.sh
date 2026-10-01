#!/bin/zsh
# Cuts the fire loop the library fireplace plays, from the Pexels clip kept in assets-src/fire (not in the repo).
#   zsh scripts/make-fire-loop.sh   ->  public/assets/room/fire.mp4 (12 s, seamless, silent) and fire-poster.jpg
# Source: "Burning Logs in a Fireplace" by Brixiv, https://www.pexels.com/video/burning-logs-in-a-fireplace-7091442/ (Pexels licence).
# The loop is cropped, re-timed and composited into the scene, not redistributed as it was.
cd "$(dirname "$0")/.."
F=node_modules/ffmpeg-static/ffmpeg
SRC=assets-src/fire/pexels-7091442-burning-logs-hd.mp4
T0=${T0:-14}; L=12; X=1.5
CROP="crop=1110:640:450:215,scale=704:406:flags=lanczos,fps=24,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p"
mkdir -p public/assets/room
$F -y -loglevel error -ss $(python3 -c "print($T0-$X)") -t $X -i $SRC -an -vf "$CROP" -c:v libx264 -crf 12 -preset fast /tmp/_pre.mp4 || exit 1
$F -y -loglevel error -ss $T0 -t $L -i $SRC -an -vf "$CROP" -c:v libx264 -crf 12 -preset fast /tmp/_body.mp4 || exit 1
# the last 1.5 s fades into the 1.5 s that came before the first frame, so the loop has no seam
$F -y -loglevel error -i /tmp/_body.mp4 -i /tmp/_pre.mp4 -filter_complex "[0:v]fps=24,settb=AVTB,setpts=PTS-STARTPTS[a];[1:v]fps=24,settb=AVTB,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=$X:offset=$(python3 -c "print($L-$X)"),format=yuv420p[v]" -map "[v]" -c:v libx264 -crf ${CRF:-27} -preset medium -movflags +faststart -an public/assets/room/fire.mp4 || exit 1
$F -y -loglevel error -ss 4 -i public/assets/room/fire.mp4 -frames:v 1 -q:v 3 public/assets/room/fire-poster.jpg
rm -f /tmp/_pre.mp4 /tmp/_body.mp4
ls -la public/assets/room/fire*
