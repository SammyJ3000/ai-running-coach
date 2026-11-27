"""Estimate camera roll from long near-vertical lines in the background (door frames, walls).

Returns the median tilt of vertical structure in degrees (+ = verticals lean clockwise,
i.e. top of the line is to the right of its bottom). Uses a frame where the runner is
present; long lines on the runner are rare and rejected by the length filter.
"""
import subprocess
import sys

import cv2
import numpy as np

import gait as G


def roll_from_clip(clip, t=60.0):
    b = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", str(t), "-i", clip, "-frames:v", "1",
                                 "-pix_fmt", "gray", "-f", "rawvideo", "-"])
    g = np.frombuffer(b, np.uint8).reshape(G.SRC_H, G.SRC_W)
    e = cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 40, 120)
    lines = cv2.HoughLinesP(e, 1, np.pi / 720, 80, minLineLength=160, maxLineGap=4)
    angs, wts = [], []
    for x1, y1, x2, y2 in (lines.reshape(-1, 4).astype(float) if lines is not None else []):
        if y1 > y2:
            x1, y1, x2, y2 = x2, y2, x1, y1
        ang = np.degrees(np.arctan2(x1 - x2, y2 - y1))  # top relative to bottom
        if abs(ang) < 8:
            angs.append(ang)
            wts.append(np.hypot(x2 - x1, y2 - y1))
    if len(angs) < 3:
        return None, len(angs)
    order = np.argsort(angs)
    a, w = np.array(angs)[order], np.array(wts)[order]
    cw = np.cumsum(w) / w.sum()
    return float(a[np.searchsorted(cw, 0.5)]), len(angs)


if __name__ == "__main__":
    for c in sys.argv[1:]:
        print(c, roll_from_clip(c))
