#!/usr/bin/env bash
# Static 16 KB page-size check of every native library in an APK (Android 15+ requirement).
# Usage: scripts/ci/check-16kb.sh path/to/app.apk  (needs ANDROID_HOME with build-tools)
set -euo pipefail
APK="$1"
ZIPALIGN=$(ls -d "${ANDROID_HOME}"/build-tools/*/ | sort -V | tail -1)zipalign
"$ZIPALIGN" -c -P 16 -v 4 "$APK" | grep -E '\.so|Verification'
TMP=$(mktemp -d)
unzip -q -o "$APK" 'lib/*' -d "$TMP" || { echo "no native libraries"; exit 0; }
python3 - "$TMP" <<'PY'
import glob, struct, sys
bad = 0
for f in sorted(glob.glob(sys.argv[1] + '/lib/*/*.so')):
    d = open(f, 'rb').read()
    is64 = d[4] == 2
    phoff = struct.unpack_from('<Q' if is64 else '<I', d, 0x20 if is64 else 0x1c)[0]
    phsz, phnum = struct.unpack_from('<HH', d, 0x36 if is64 else 0x2a)
    aligns = []
    for i in range(phnum):
        base = phoff + i * phsz
        if struct.unpack_from('<I', d, base)[0] == 1:  # PT_LOAD
            aligns.append(struct.unpack_from('<Q' if is64 else '<I', d, base + (48 if is64 else 28))[0])
    ok = min(aligns) >= 16384
    bad += not ok
    print(f"{f.split('/lib/')[1]}: p_align={min(aligns)} {'OK' if ok else 'NOT 16KB-ALIGNED'}")
sys.exit(1 if bad else 0)
PY
