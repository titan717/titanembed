#!/usr/bin/env bash
# Generates Titan's own test media into public/media/test/ (docs/ASSETS.md). Everything here is synthetic
# (ffmpeg test patterns and tones), so it is free to use, redistribute and ship. Re-run after changing it.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/media/test
DUR=60
rm -rf "$OUT" && mkdir -p "$OUT"

FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || true)
DT=""
if [ -n "$FONT" ] && [ -f "$FONT" ]; then
  # chapter labels so intro / credits markers are visible in the picture
  DT=",drawtext=fontfile=${FONT}:text='Titan Embed test clip':x=(w-tw)/2:y=h*0.12:fontsize=h/16:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12"
  DT="$DT,drawtext=fontfile=${FONT}:text='%{pts\\:hms}':x=(w-tw)/2:y=h*0.78:fontsize=h/12:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12"
  DT="$DT,drawtext=fontfile=${FONT}:text='INTRO':enable='between(t,4,14)':x=(w-tw)/2:y=h*0.45:fontsize=h/8:fontcolor=white"
  DT="$DT,drawtext=fontfile=${FONT}:text='CREDITS':enable='between(t,50,60)':x=(w-tw)/2:y=h*0.45:fontsize=h/8:fontcolor=white"
fi

# master picture + two audio languages (English: low tone, Spanish: higher tone)
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=25:duration=${DUR}${DT}" \
  -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=${DUR},volume=0.08" \
  -f lavfi -i "sine=frequency=523:sample_rate=48000:duration=${DUR},volume=0.08" \
  -map 0:v -map 0:v -map 1:a -map 2:a \
  -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p -g 50 -keyint_min 50 -sc_threshold 0 \
  -filter:v:0 scale=854:480 -b:v:0 450k -maxrate:v:0 500k -bufsize:v:0 900k \
  -filter:v:1 scale=1280:720 -b:v:1 900k -maxrate:v:1 1000k -bufsize:v:1 1800k \
  -c:a aac -b:a 64k -ac 2 \
  -metadata:s:a:0 language=eng -metadata:s:a:1 language=spa \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "$OUT/%v/seg%03d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "a:0,agroup:aud,language:en,name:audio_en,default:yes a:1,agroup:aud,language:es,name:audio_es v:0,agroup:aud,name:480p v:1,agroup:aud,name:720p" \
  "$OUT/%v/index.m3u8"
sed -i 's/NAME="audio_0"/NAME="English"/; s/NAME="audio_1"/NAME="Español"/' "$OUT/master.m3u8"

# progressive fallbacks
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=25:duration=${DUR}${DT}" \
  -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=${DUR},volume=0.08" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v 280k -maxrate 320k -bufsize 600k -c:a aac -b:a 64k -movflags +faststart "$OUT/clip-360p.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=25:duration=20" \
  -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=20,volume=0.08" \
  -c:v libvpx-vp9 -b:v 250k -deadline realtime -cpu-used 8 -c:a libopus -b:a 48k "$OUT/clip-short.webm"

# poster and seek-preview sprite (one frame every 2 s, 160x90, 10 per row)
ffmpeg -hide_banner -loglevel error -y -ss 20 -i "$OUT/720p/index.m3u8" -frames:v 1 -q:v 4 "$OUT/poster.jpg"
ffmpeg -hide_banner -loglevel error -y -i "$OUT/clip-360p.mp4" -vf "fps=1/2,scale=160:90,tile=10x3" -frames:v 1 -q:v 6 "$OUT/thumbs.jpg"
{
  echo "WEBVTT"
  echo
  for i in $(seq 0 29); do
    s=$((i * 2)); e=$((s + 2)); x=$(((i % 10) * 160)); y=$(((i / 10) * 90))
    printf '%02d:%02d:%02d.000 --> %02d:%02d:%02d.000\nthumbs.jpg#xywh=%d,%d,160,90\n\n' $((s/3600)) $((s%3600/60)) $((s%60)) $((e/3600)) $((e%3600/60)) $((e%60)) $x $y
  done
} > "$OUT/thumbs.vtt"

cp scripts/media/en.vtt scripts/media/es.srt "$OUT/"
echo "media written to $OUT"; du -sh "$OUT"
