"""Re-draw the overlay videos and stills from the saved analysis, without re-running the analysis.

Reads out/<clip>-metrics.json, -events.json and -landmarks.npz exactly as analyse.py left them and
writes only pictures, so no number changes. Usage:
  rerender.py <clip.mov> [--web] [--render] [--stills]
--web writes out/web/side.mp4 and side-still.jpg (the clip the app's Form tab plays; side views only).
"""
import argparse
import json
import os

import numpy as np

import overlay

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

ap = argparse.ArgumentParser()
ap.add_argument("clip")
ap.add_argument("--web", action="store_true")
ap.add_argument("--render", action="store_true")
ap.add_argument("--stills", action="store_true")
a = ap.parse_args()

name = os.path.splitext(os.path.basename(a.clip))[0]
d = np.load(os.path.join(OUT, f"{name}-landmarks.npz"))
res = json.load(open(os.path.join(OUT, f"{name}-metrics.json")))
events = json.load(open(os.path.join(OUT, f"{name}-events.json")))
fps_file = float(d["fps_file"])
fps_real = res["slowmo"]["effective_real_fps"]
f0, f1 = round(res["slowmo"]["analysed_start_s"] * fps_file), round(res["slowmo"]["analysed_end_s"] * fps_file)
xy_raw = d["lm"][..., :2].astype(float)
if a.web:
    print("web", overlay.web_clip(a.clip, xy_raw, f0, f1, fps_file, res, events))
if a.render or a.stills:
    overlay.run(a.clip, name, res["view"], xy_raw, f0, f1, fps_file, fps_real, res, events, video=a.render, stills=a.stills)
    print("done", name)
