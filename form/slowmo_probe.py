"""Find the slow-motion section of an iPhone slo-mo export.

Decodes a tiny grayscale copy, computes per-frame motion energy and the local
dominant motion period (autocorrelation in sliding windows). In the slowed
section the gait period in file frames is ~4x longer than in the 1x ramps.
Usage: slowmo_probe.py <clip> [out.json]
"""
import json
import subprocess
import sys

import numpy as np

W, H = 192, 108

def frames(path):
    cmd = ["ffmpeg", "-v", "error", "-threads", "2", "-i", path, "-vf", f"scale={W}:{H},format=gray",
           "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).astype(np.float32)

def main():
    path = sys.argv[1]
    prev = None
    sig = []
    for f in frames(path):
        sig.append(0.0 if prev is None else float(np.mean(np.abs(f - prev))))
        prev = f
    sig = np.array(sig)
    fps = 30.0
    win = 90  # 3 s window
    res = []
    for c in range(win // 2, len(sig) - win // 2, 15):
        s = sig[c - win // 2:c + win // 2]
        s = s - s.mean()
        ac = np.correlate(s, s, "full")[len(s) - 1:]
        ac /= ac[0] + 1e-9
        # motion-energy period = half a stride (each step); search 4..70 frames
        lag = 4 + int(np.argmax(ac[4:70]))
        res.append((c / fps, lag, float(ac[lag]), float(np.median(sig[c - 15:c + 15]))))
    out = {"clip": path, "n": len(sig), "windows": res}
    if len(sys.argv) > 2:
        json.dump(out, open(sys.argv[2], "w"))
    for t, lag, a, e in res[::2]:
        print(f"{t:7.1f}s lag={lag:3d} ac={a:.2f} energy={e:.2f}")

if __name__ == "__main__":
    main()
