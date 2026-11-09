#!/usr/bin/env bash
# Sew every model spec (3 Blender processes at a time). Usage: bash models/sew_all.sh [model ...]
cd "$(dirname "$0")/.."
B="${BLENDER:-../tools/blender/blender-5.2.2-windows-x64/blender.exe}"
models=("$@"); [ ${#models[@]} -eq 0 ] && models=($(ls models/specs | sed 's/\.json$//'))
for m in "${models[@]}"; do
  ( "$B" --background --python models/sew_garment.py -- "models/specs/$m.json" "models/sewn/$m" --frames 90 --res 0.7 > "models/sewn/$m.log" 2>&1
    grep -E "STRETCH|DONE|Error|Traceback" "models/sewn/$m.log" | sed "s/^/[$m] /" ) &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 2; done
done
wait
