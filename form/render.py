"""Drawing helpers for the skeleton overlay video and the labelled stills.

Style: the app's own look (Floodlit, see index.html). Frame graded dark and muted with a
soft spotlight on the runner, cream bones with an ink shadow, ringed joints, and hi-vis
yellow (#E1FF45) only for what is being measured: the near knee and ankle, the knee-angle
arc on landing frames and the ankle trail. Type: Big Shoulders Display 800 / Archivo 600.
No personal branding goes on these frames.
"""
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import gait as G

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_H = os.path.join(HERE, "fonts", "big-shoulders-display-800.ttf")
FONT_B = os.path.join(HERE, "fonts", "archivo-600.ttf")

# BGR
WHITE = (232, 241, 242)     # #F2F1E8 ink (cream)
INK = (12, 14, 13)          # #0D0E0C bg
HI = (69, 255, 225)         # #E1FF45 hi-vis yellow
SOFT = (148, 163, 163)      # #A3A394 mute
FG_RGB, BG_RGB, HI_RGB, ON_HI_RGB = (242, 241, 232), (13, 14, 12), (225, 255, 69), (17, 19, 10)

BONES_BODY = [(G.L_SH, G.R_SH), (G.L_HIP, G.R_HIP), (G.L_SH, G.L_HIP), (G.R_SH, G.R_HIP)]
BONES_ARM = {"L": [(G.L_SH, G.L_EL), (G.L_EL, G.L_WR)], "R": [(G.R_SH, G.R_EL), (G.R_EL, G.R_WR)]}
BONES_LEG = {s: [(d["hip"], d["knee"]), (d["knee"], d["ank"]), (d["ank"], d["heel"]), (d["heel"], d["toe"]),
                 (d["ank"], d["toe"])] for s, d in G.LEG.items()}
JOINTS = {"L": [G.L_SH, G.L_EL, G.L_WR, G.L_HIP, G.L_KNEE, G.L_ANK], "R": [G.R_SH, G.R_EL, G.R_WR, G.R_HIP, G.R_KNEE, G.R_ANK]}

SS = 4  # sub-pixel shift bits for cv2 anti-aliased drawing
_fonts = {}


def font(path, size):
    k = (path, size)
    if k not in _fonts:
        # The fonts (Google Fonts, OFL) are not in the repo: put the .ttf files in form/fonts/, or Pillow's default is used.
        _fonts[k] = ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default(size)
    return _fonts[k]


def P(p):
    return (int(round(p[0] * (1 << SS))), int(round(p[1] * (1 << SS))))


def blend(dst, layer, alpha):
    cv2.addWeighted(layer, alpha, dst, 1 - alpha, 0, dst)


_spots = {}


def spot_mask(shape, centre, lo=0.38):
    """Soft spotlight: 1.0 on the runner, falling to `lo` at the far corners."""
    k = (shape[:2], tuple(int(c) for c in centre), lo)
    if k not in _spots:
        h, w = shape[:2]
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx - centre[0]) / (0.62 * h)) ** 2 + ((yy - centre[1]) / (0.95 * h)) ** 2)
        m = lo + (1 - lo) * np.clip(1.25 - d, 0, 1) ** 1.4
        _spots[k] = np.clip(m, lo, 1)[..., None]
    return _spots[k]


def grade(frame, spot=None):
    """Darken and mute the room so the skeleton reads; `spot` (x, y) keeps the runner lit."""
    f = frame.astype(np.float32)
    grey = f.mean(axis=2, keepdims=True)
    f = grey + (f - grey) * 0.6
    f *= 0.7
    if spot is not None:
        f *= spot_mask(frame.shape, spot)
    return np.clip(f, 0, 255).astype(np.uint8)


def line(img, a, b, col, w):
    cv2.line(img, P(a), P(b), col, w, cv2.LINE_AA, SS)


def dot(img, p, r, col, filled=True, w=1):
    cv2.circle(img, P(p), int(r * (1 << SS)), col, -1 if filled else w, cv2.LINE_AA, SS)


def text_patch(txt, size, path=FONT_H, fg=FG_RGB, bg=BG_RGB, pad=(14, 7), radius=None):
    """Rounded pill with text, returned as BGRA numpy."""
    f = font(path, size)
    left, top, right, bottom = f.getbbox(txt)
    w, h = right - left + 2 * pad[0], (bottom - top) + 2 * pad[1]
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius if radius is not None else h // 2, fill=bg + (230,))
    d.text((pad[0] - left, pad[1] - top), txt, font=f, fill=fg + (255,))
    a = np.array(im)
    return cv2.cvtColor(a, cv2.COLOR_RGBA2BGRA)


def paste(img, patch, x, y):
    h, w = patch.shape[:2]
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, img.shape[1]), min(y + h, img.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    p = patch[y0 - y:y1 - y, x0 - x:x1 - x]
    a = p[..., 3:4].astype(np.float32) / 255
    roi = img[y0:y1, x0:x1].astype(np.float32)
    img[y0:y1, x0:x1] = (roi * (1 - a) + p[..., :3] * a).astype(np.uint8)


def draw_skeleton(img, xy, near=None, scale=1.0):
    """near: 'L'/'R' for side views (far limbs dimmed), None for front/back."""
    s = scale
    shadow = img.copy()
    far = {"L": "R", "R": "L"}.get(near)
    segs = [(a, b, 1.0) for a, b in BONES_BODY]
    for side in "LR":
        k = 0.38 if side == far else 1.0
        segs += [(a, b, k) for a, b in BONES_ARM[side] + BONES_LEG[side]]
    # neck: shoulder mid to nose-ish (stop short of the face)
    shm = (xy[G.L_SH] + xy[G.R_SH]) / 2
    head = xy[G.NOSE]
    neck_top = shm + (head - shm) * 0.55
    for a, b, k in segs:
        line(shadow, xy[a], xy[b], INK, int(round(6 * s)))
    line(shadow, shm, neck_top, INK, int(round(6 * s)))
    blend(img, shadow, 0.45)
    dim = img.copy()
    full = img.copy()
    for a, b, k in segs:
        line(full if k == 1.0 else dim, xy[a], xy[b], WHITE, max(2, int(round(3.0 * s))))
    line(full, shm, neck_top, WHITE, max(2, int(round(3.0 * s))))
    blend(img, dim, 0.45)
    mask = np.any(full != img, axis=2)
    img[mask] = full[mask]
    lay = img.copy()
    for side in "LR":
        tgt = lay if side == far else img
        hot = (G.LEG[side]["knee"], G.LEG[side]["ank"]) if side == near else ()
        for j in JOINTS[side]:
            dot(tgt, xy[j], 9.0 * s, INK)
            if j in hot:
                dot(tgt, xy[j], 6.6 * s, HI)
            else:
                dot(tgt, xy[j], 6.6 * s, WHITE)
                dot(tgt, xy[j], 3.6 * s, INK)
    if far:
        blend(img, lay, 0.4)


def draw_trail(img, pts, scale=1.0):
    """Fading yellow trail through recent ankle positions (oldest first), blended in a small ROI."""
    n = len(pts)
    if n < 2:
        return
    P_ = np.array(pts)
    pad = 12
    x0, y0 = np.floor(P_.min(0) - pad).astype(int)
    x1, y1 = np.ceil(P_.max(0) + pad).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, img.shape[1]), min(y1, img.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    roi = img[y0:y1, x0:x1]
    off = np.array([x0, y0])
    for i in range(1, n):
        a = (i / n) ** 1.6 * 0.55
        lay = roi.copy()
        line(lay, P_[i - 1] - off, P_[i] - off, HI, max(1, int(round(2.4 * scale))))
        cv2.addWeighted(lay, a, roi, 1 - a, 0, roi)


def draw_angle(img, hip, knee, ank, label, scale=1.0, alpha=1.0, label_side=None):
    """Knee flexion: dashed thigh extension, filled yellow wedge to the shank, number beside the knee.

    label_side: image-x direction (+1/-1) to put the number; default = behind the bend.
    """
    lay = img.copy()
    v_th = knee - hip
    v_sh = ank - knee
    a1 = np.degrees(np.arctan2(v_th[1], v_th[0]))
    a2 = np.degrees(np.arctan2(v_sh[1], v_sh[0]))
    d = (a2 - a1 + 540) % 360 - 180
    r = 74 * scale
    u = v_th / (np.linalg.norm(v_th) + 1e-9)
    dash_end = knee + u * r * 1.45
    for t0 in np.arange(0, 1, 0.25):
        line(lay, knee + (dash_end - knee) * t0, knee + (dash_end - knee) * (t0 + 0.14), SOFT, max(2, int(round(2 * scale))))
    wedge = lay.copy()
    cv2.ellipse(wedge, P(knee), (int(r * (1 << SS)), int(r * (1 << SS))), 0, a1, a1 + d, HI, -1, cv2.LINE_AA, SS)
    cv2.addWeighted(wedge, 0.28, lay, 0.72, 0, lay)
    cv2.ellipse(lay, P(knee), (int(r * (1 << SS)), int(r * (1 << SS))), 0, a1, a1 + d, HI,
                max(2, int(round(3.5 * scale))), cv2.LINE_AA, SS)
    blend(img, lay, alpha)
    patch = text_patch(label, int(40 * scale), pad=(13, 6))
    h, w = patch.shape[:2]
    if label_side is None:
        label_side = -np.sign(v_sh[0] - v_th[0]) or 1
    x = knee[0] + label_side * (r + 16 * scale) - (w if label_side < 0 else 0)
    y = knee[1] - h / 2
    lay = img.copy()
    paste(lay, patch, x, y)
    blend(img, lay, alpha)


def caption(img, title, sub=None, scale=1.0):
    """Bottom-left caption: yellow pill title + small muted sub-line."""
    x, y = int(64 * scale), img.shape[0] - int(80 * scale)
    p = text_patch(title, int(26 * scale), path=FONT_B, fg=ON_HI_RGB, bg=HI_RGB, pad=(18, 11))
    paste(img, p, x, y - p.shape[0])
    if sub:
        q = text_patch(sub, int(22 * scale), path=FONT_B, fg=FG_RGB, bg=BG_RGB, pad=(14, 8))
        paste(img, q, x, y + int(12 * scale))


class FrameReader:
    """Sequential RGB->BGR frames from the source (read-only), starting at a frame index."""

    def __init__(self, clip, start, count, fps, w=G.SRC_W, h=G.SRC_H):
        self.w, self.h = w, h
        cmd = ["ffmpeg", "-v", "error", "-threads", "2", "-ss", f"{start / fps:.6f}", "-i", clip,
               "-frames:v", str(count), "-vf", f"scale={w}:{h}", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        self.nb = w * h * 3

    def read(self):
        b = self.p.stdout.read(self.nb)
        if len(b) < self.nb:
            return None
        return np.frombuffer(b, np.uint8).reshape(self.h, self.w, 3).copy()

    def close(self):
        self.p.stdout.close()
        self.p.wait()


def writer(path, fps, w=G.SRC_W, h=G.SRC_H, crf=18):
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
           "-threads", "3", "-movflags", "+faststart", path]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)
