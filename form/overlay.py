"""Skeleton overlay video (0.5x real speed) and labelled key-frame stills."""
import os

import cv2
import numpy as np

import gait as G
import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def smooth_all(xy, sigma=1.6):
    return G.gsmooth(xy.reshape(len(xy), -1), sigma).reshape(xy.shape)


def fade(i, a, b, fin=6, fout=10):
    """Alpha for frame i inside window [a, b] with soft in/out."""
    if i < a - fin or i > b + fout:
        return 0.0
    if i < a:
        return (i - (a - fin)) / fin
    if i > b:
        return 1 - (i - b) / fout
    return 1.0


def dashed(img, a, b, col, w, n=10):
    for t in np.linspace(0, 1, n * 2, endpoint=False)[::2]:
        R.line(img, a + (b - a) * t, a + (b - a) * (t + 0.5 / n), col, w)


def vertical_ref(img, origin, ref_dir, target, label, label_side, alpha=1.0):
    """Dashed true-vertical reference from origin (along ref_dir, a unit vector), a yellow arc
    from it to the segment origin->target, and a label beside it."""
    L = float(np.linalg.norm(target - origin))
    lay = img.copy()
    dashed(lay, origin, origin + ref_dir * L, R.SOFT, 2)
    r = L * 0.42
    a1 = np.degrees(np.arctan2(ref_dir[1], ref_dir[0]))
    v = target - origin
    a2 = np.degrees(np.arctan2(v[1], v[0]))
    d = (a2 - a1 + 540) % 360 - 180
    wedge = lay.copy()
    cv2.ellipse(wedge, R.P(origin), (int(r * 16), int(r * 16)), 0, a1, a1 + d, R.HI, -1, cv2.LINE_AA, R.SS)
    cv2.addWeighted(wedge, 0.28, lay, 0.72, 0, lay)
    cv2.ellipse(lay, R.P(origin), (int(r * 16), int(r * 16)), 0, a1, a1 + d, R.HI, 3, cv2.LINE_AA, R.SS)
    R.blend(img, lay, alpha)
    patch = R.text_patch(label, 34, pad=(13, 6))
    h, w = patch.shape[:2]
    p = origin + ref_dir * L * 0.62
    x = p[0] + label_side * (L * 0.16 + 18) - (w if label_side < 0 else 0)
    lay = img.copy()
    R.paste(lay, patch, x, p[1] - h / 2)
    R.blend(img, lay, alpha)


# ------------------------------------------------------------------ side
def side_frame(img, xy, i, near, dirn, strides_by_ic, trail_pts, show_labels=True):
    D = G.LEG[near]
    R.draw_trail(img, trail_pts)
    R.draw_skeleton(img, xy[i], near=near)
    if not show_labels:
        return
    for st in strides_by_ic:
        al = fade(i, st["ic"] - 2, st["ic"] + 12, fin=6, fout=8)  # only around touchdown
        if al > 0:
            R.draw_angle(img, xy[i, D["hip"]], xy[i, D["knee"]], xy[i, D["ank"]],
                         f"{st['knee_ic']:.0f}°", alpha=al, label_side=-dirn)
            break


def side_still(frame, xy, f, near, dirn, phase, st, metrics_line, roll=0.0, spot=None):
    img = R.grade(frame, spot)
    D = G.LEG[near]
    R.draw_skeleton(img, xy[f], near=near, scale=1.15)
    hip, knee, ank = xy[f, D["hip"]], xy[f, D["knee"]], xy[f, D["ank"]]
    if phase == "ic":
        R.draw_angle(img, hip, knee, ank, f"Knee {st['knee_ic']:.0f}°", scale=1.15, label_side=-dirn)
        up = np.array([np.sin(np.radians(roll)), -np.cos(np.radians(roll))])
        vertical_ref(img, ank, up, knee, f"Shin {st['shank_ic']:+.0f}°", dirn)
        title, sub = "Landing", metrics_line
    elif phase == "mid":
        R.draw_angle(img, hip, knee, ank, f"Knee {st['knee_mid']:.0f}°", scale=1.15, label_side=-dirn)
        title, sub = "Mid-stance", metrics_line
    else:
        hipm = (xy[f, G.L_HIP] + xy[f, G.R_HIP]) / 2
        shm = (xy[f, G.L_SH] + xy[f, G.R_SH]) / 2
        up = np.array([np.sin(np.radians(roll)), -np.cos(np.radians(roll))])
        v = shm - hipm
        # forward lean relative to true vertical
        ang = np.degrees(np.arctan2(up[0] * v[1] - up[1] * v[0], np.dot(up, v)))  # + = toward +x
        lean = ang * dirn
        vertical_ref(img, hipm, up, hipm + v * 0.9, f"Lean {lean:.0f}°", -dirn)
        title, sub = "Toe-off", metrics_line
    R.caption(img, title, sub, scale=1.1)
    return img


# --------------------------------------------------------------- frontal
def pelvis_overlay(img, xy, i, label=None, alpha=1.0):
    lh, rh = xy[i, G.L_HIP], xy[i, G.R_HIP]
    c = (lh + rh) / 2
    v = rh - lh
    lay = img.copy()
    R.line(lay, c - v * 0.95, c + v * 0.95, R.HI, 3)
    hw = np.linalg.norm(v) * 0.95
    dashed(lay, c - np.array([hw, 0]), c + np.array([hw, 0]), R.SOFT, 2, n=8)
    R.blend(img, lay, alpha)
    if label:
        patch = R.text_patch(label, 34, pad=(13, 6))
        h, w = patch.shape[:2]
        x = max(lh[0], rh[0]) + hw * 0.55
        lay = img.copy()
        R.paste(lay, patch, x, c[1] - h / 2)
        R.blend(img, lay, alpha)


def knee_frontal_label(img, xy, i, side, val, alpha=1.0, left_dir=-1):
    D = G.LEG[side]
    k = xy[i, D["knee"]]
    lay = img.copy()
    dashed(lay, xy[i, D["hip"]], xy[i, D["ank"]], R.SOFT, 2, n=12)
    R.dot(lay, k, 9, R.HI, filled=False, w=3)
    R.blend(img, lay, alpha)
    patch = R.text_patch(f"{val:.0f}°", 34, pad=(13, 6))
    h, w = patch.shape[:2]
    out = left_dir if side == "L" else -left_dir  # push the label to the outside of that knee
    x = k[0] + out * 34 - (w if out < 0 else 0)
    lay = img.copy()
    R.paste(lay, patch, x, k[1] - h / 2)
    R.blend(img, lay, alpha)


def frontal_frame(img, xy, i, steps, trails, left_dir, show_labels=True):
    for t in trails:
        R.draw_trail(img, t)
    R.draw_skeleton(img, xy[i], near=None)
    if not show_labels:
        return
    for st in steps:
        al = fade(i, st["a"], st["b"], 4, 6)
        if al > 0:
            pelvis_overlay(img, xy, i, None, alpha=al)  # line only: 2D hip landmarks under-read pelvic drop
            break


# ------------------------------------------------------------------ web
def runner_centre(xy, f0, f1):
    """Where the runner stands in the frame (they stay put on the walking pad): chest height, mid hips."""
    hips = (xy[f0:f1, G.L_HIP] + xy[f0:f1, G.R_HIP]) / 2
    sh = (xy[f0:f1, G.L_SH] + xy[f0:f1, G.R_SH]) / 2
    return np.median((hips + sh) / 2, axis=0)


def web_clip(clip, xy_raw, f0, f1, fps_file, res, events, strides_n=13, out_w=720):
    """The clip the app shows on the Form tab: a 4:5 portrait crop around the runner, no caption baked in
    (the app sets its own type over it), starting and ending on a landing so the loop has no jump."""
    xy = smooth_all(xy_raw)
    near = res["info"]["near_leg"]
    dirn = 1 if res["info"]["running_direction"] == "frame-right" else -1
    strides = events["strides"]
    D = G.LEG[near]
    spot = runner_centre(xy, f0, f1)
    ch = G.SRC_H
    cw = ch * 4 // 5  # 4:5 portrait crop
    x0 = int(np.clip(spot[0] - cw / 2 - dirn * 40, 0, G.SRC_W - cw))  # a little more room in front of the runner
    clean = set(events["clean_ics"])
    k = next(i for i, s in enumerate(strides) if s["ic"] in clean and i + strides_n < len(strides) and s["ic"] - f0 > 60)
    a, b = strides[k]["ic"], strides[k + strides_n]["ic"]
    a, b = a - 4, b - 4  # start just before touchdown so the first frame already shows the angle fading in
    web = os.path.join(OUT, "web")
    os.makedirs(web, exist_ok=True)
    out_h = int(round(out_w * ch / cw / 2)) * 2
    fr = R.FrameReader(clip, a, b - a, fps_file)
    wr = R.writer(os.path.join(web, "side.mp4"), 30, out_w, out_h, crf=24)
    trail_len = int(0.35 * fps_file * 4)
    poster_at = strides[k]["ic"] + 6
    for j in range(b - a):
        frame = fr.read()
        if frame is None:
            break
        i = a + j
        if j % 2 and i != poster_at:
            continue
        img = R.grade(frame, spot)
        tp = [xy[q, D["ank"]] for q in range(max(f0, i - trail_len), i + 1, 2)]
        side_frame(img, xy, i, near, dirn, strides, tp)
        small = cv2.resize(img[:, x0:x0 + cw], (out_w, out_h), interpolation=cv2.INTER_AREA)
        if i == poster_at:
            cv2.imwrite(os.path.join(web, "side-still.jpg"), small, [cv2.IMWRITE_JPEG_QUALITY, 86])
        if j % 2 == 0:
            wr.stdin.write(small.tobytes())
    fr.close()
    wr.stdin.close()
    wr.wait()
    return dict(strides=strides_n, seconds=round((b - a) / 2 / 30, 2), crop_x=x0)


# ------------------------------------------------------------------ run
def run(clip, name, view, xy_raw, f0, f1, fps_file, fps_real, res, events, video=True, stills=True):
    xy = smooth_all(xy_raw)
    side = view.startswith("side")
    spot = runner_centre(xy, f0, f1)
    M = res["metrics"]
    if side:
        near = res["info"]["near_leg"]
        dirn = 1 if res["info"]["running_direction"] == "frame-right" else -1
        strides = events["strides"]
        clean_ics = set(events["clean_ics"])
        clean = [s for s in strides if s["ic"] in clean_ics]
        leg = "Left" if near == "L" else "Right"
        line = f"{leg} leg  ·  {M['cadence_spm']['median']:.0f} steps/min  ·  {M['ground_contact_ms']['median']:.0f} ms on the ground"
    else:
        steps = events["steps"]
        left_dir = -1 if view == "back" else 1
        line = "From behind" if view == "back" else "From the front"

    if stills:
        if side:
            # the stride closest to the medians
            keys = ["knee_ic", "knee_mid", "shank_ic", "gct_ms"]
            med = {k: np.median([s[k] for s in clean]) for k in keys}
            sd = {k: np.std([s[k] for s in clean]) + 1e-6 for k in keys}
            best = min(clean, key=lambda s: sum(abs(s[k] - med[k]) / sd[k] for k in keys))
            for phase, f in (("ic", best["ic"]), ("mid", best["midstance"]), ("to", best["to"])):
                fr = R.FrameReader(clip, f, 1, fps_file)
                frame = fr.read()
                fr.close()
                img = side_still(frame, xy, f, near, dirn, phase, best, line, roll=res.get("camera_roll_deg", 0.0), spot=spot)
                cv2.imwrite(os.path.join(OUT, f"{name}-still-{phase}.png"), img)
        else:
            for sd_ in ("L", "R"):
                ss = [s for s in steps if s["side"] == sd_]
                med = np.median([s["pelvic_drop_deg"] for s in ss])
                st = min(ss, key=lambda s: abs(s["pelvic_drop_deg"] - med))
                i0, i1 = st["a"], st["b"]
                tilt = [abs(xy[i, G.R_HIP, 1] - xy[i, G.L_HIP, 1]) for i in range(i0, i1)]
                f = i0 + int(np.argmax(tilt))
                fr = R.FrameReader(clip, f, 1, fps_file)
                frame = fr.read()
                fr.close()
                img = R.grade(frame, spot)
                R.draw_skeleton(img, xy[f], near=None, scale=1.15)
                pelvis_overlay(img, xy, f, f"Hip drop ≈{max(st['pelvic_drop_deg'], 0):.0f}°")
                knee_frontal_label(img, xy, f, sd_, st["knee_fppa_deg"], left_dir=left_dir)
                leg = "left" if sd_ == "L" else "right"
                R.caption(img, f"Landing on the {leg}", f"{line}  ·  knee angle {st['knee_fppa_deg']:.0f}° (+ = inward)", scale=1.1)
                cv2.imwrite(os.path.join(OUT, f"{name}-still-{leg}-stance.png"), img)

    if video:
        step = 2  # 120 fps real shown at 30 fps, every 2nd frame => 0.5x real speed
        n = f1 - f0
        fr = R.FrameReader(clip, f0, n, fps_file)
        wr = R.writer(os.path.join(OUT, f"{name}-skeleton.mp4"), 30)
        trail_len = int(0.35 * fps_real)
        for j in range(n):
            frame = fr.read()
            if frame is None:
                break
            i = f0 + j
            if j % step:
                continue
            img = R.grade(frame, spot)
            if side:
                D = G.LEG[near]
                tp = [xy[k, D["ank"]] for k in range(max(f0, i - trail_len), i + 1, 2)]
                side_frame(img, xy, i, near, dirn, strides, tp)
                R.caption(img, "Knee bend at landing", line)
            else:
                trails = [[xy[k, a] for k in range(max(f0, i - trail_len), i + 1, 2)] for a in (G.L_ANK, G.R_ANK)]
                frontal_frame(img, xy, i, steps, trails, left_dir)
                R.caption(img, "Hip line on each landing", line)
            wr.stdin.write(img.tobytes())
        fr.close()
        wr.stdin.close()
        wr.wait()
