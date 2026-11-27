"""Running-form analysis for one clip.

Usage:
  analyse.py <clip.mov> --view side-right|side-left|back|front [--render] [--stills]

Steps
 1. Pose landmarks for every frame (MediaPipe Pose Landmarker heavy), cached in
    out/<clip>-landmarks.npz and exported as out/<clip>-landmarks.csv.
 2. Find the slow-motion section and the real-time factor from the gait rhythm.
 3. Gait events and metrics on the slowed section only, converted to real time.
 4. Writes out/<clip>-metrics.json (merge all clips with merge_metrics.py).
 5. Optional skeleton overlay video (0.5x real speed) and labelled stills.

The source clip is only read, never modified.
"""
import argparse
import csv
import json
import os
import subprocess
import sys

import numpy as np

import camera_roll
import gait as G

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
ASSUMED_LEG_M = 0.88  # hip joint to ankle for ~1.80 m (Winter anthropometrics: 0.245H + 0.246H)
NOMINAL_FACTOR = 4.0  # 120 fps capture / 30 fps playback; checked against the measured ratio
BELT_FRAC = 0.75  # fraction of belt speed that counts as "moving with the belt"


def load(clip):
    name = os.path.splitext(os.path.basename(clip))[0]
    npz = os.path.join(OUT, f"{name}-landmarks.npz")
    if not os.path.exists(npz):
        subprocess.check_call([sys.executable, os.path.join(HERE, "pose_extract.py"), clip])
    d = np.load(npz)
    return name, d


def export_csv(name, lm, ok, f0, f1, fps_real, fps_file):
    path = os.path.join(OUT, f"{name}-landmarks.csv")
    names = ["nose", "l_eye_in", "l_eye", "l_eye_out", "r_eye_in", "r_eye", "r_eye_out", "l_ear", "r_ear",
             "mouth_l", "mouth_r", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist",
             "l_pinky", "r_pinky", "l_index", "r_index", "l_thumb", "r_thumb", "l_hip", "r_hip", "l_knee",
             "r_knee", "l_ankle", "r_ankle", "l_heel", "r_heel", "l_toe", "r_toe"]
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        hdr = ["frame", "t_file_s", "in_slowmo", "t_real_s", "pose_found"]
        for n in names:
            hdr += [f"{n}_x", f"{n}_y", f"{n}_vis"]
        w.writerow(hdr)
        for i in range(len(lm)):
            slow = f0 <= i < f1
            row = [i, round(i / fps_file, 4), int(slow), round((i - f0) / fps_real, 4) if slow else "", int(ok[i])]
            for k in range(33):
                x, y, v = lm[i, k, 0], lm[i, k, 1], lm[i, k, 3]
                row += ["" if not np.isfinite(x) else round(float(x), 1), "" if not np.isfinite(y) else round(float(y), 1),
                        "" if not np.isfinite(v) else round(float(v), 3)]
            w.writerow(row)
    return path


# ====================================================================== side
def side_metrics(xy, vis, z, f0, f1, fps_real, view):
    seg = slice(f0, f1)
    # running direction from the feet themselves (toe ahead of heel), checked against the label
    fwd = np.nanmedian(np.concatenate([xy[seg, G.L_TOE, 0] - xy[seg, G.L_HEEL, 0],
                                       xy[seg, G.R_TOE, 0] - xy[seg, G.R_HEEL, 0]]))
    dirn = 1 if fwd > 0 else -1
    label_dir = 1 if view == "side-right" else -1
    # which leg is near the camera? (lower mean z = closer; also higher visibility)
    zL = np.nanmedian(z[seg, [G.L_KNEE, G.L_ANK, G.L_HEEL]])
    zR = np.nanmedian(z[seg, [G.R_KNEE, G.R_ANK, G.R_HEEL]])
    near_mp = "L" if zL < zR else "R"
    near_geom = "R" if dirn == 1 else "L"  # facing frame-right => right side faces the camera
    near = near_geom
    D = G.LEG[near]
    s = 2.0  # smoothing sigma in frames at 120 fps real
    P = {k: G.gsmooth(xy[:, D[k]], s) for k in ("hip", "knee", "ank", "heel", "toe", "sh")}
    hipm = G.gsmooth((xy[:, G.L_HIP] + xy[:, G.R_HIP]) / 2, s)
    shm = G.gsmooth((xy[:, G.L_SH] + xy[:, G.R_SH]) / 2, s)
    thigh = np.linalg.norm(P["hip"] - P["knee"], axis=1)
    shank = np.linalg.norm(P["knee"] - P["ank"], axis=1)
    leg_len = float(np.nanmedian((thigh + shank)[seg]))

    # ---- contact detection: lowest point of the foot near the belt
    # heel and toe each get their own ground level (the heel landmark sits higher than the
    # toe landmark when the foot is flat, and thick soles exaggerate that)
    heel_y, toe_y = P["heel"][:, 1], P["toe"][:, 1]
    vx = np.gradient(P["ank"][:, 0]) * dirn * fps_real  # forward velocity, px per real s
    n = len(heel_y)
    win = int(1.2 * fps_real)
    g_heel = np.full(n, np.nan)
    g_toe = np.full(n, np.nan)
    for i in range(f0, f1, 4):
        a, b = max(f0, i - win // 2), min(f1, i + win // 2)
        g_heel[i:i + 4] = np.nanpercentile(heel_y[a:b], 95)
        g_toe[i:i + 4] = np.nanpercentile(toe_y[a:b], 95)
    tol = 0.035 * leg_len
    contact = np.zeros(n, bool)
    contact[f0:f1] = (heel_y[f0:f1] >= g_heel[f0:f1] - tol) | (toe_y[f0:f1] >= g_toe[f0:f1] - tol)
    # clean tiny gaps / blips (< 25 ms)
    mingap = int(0.025 * fps_real)
    for a, b in G.runs(~contact[f0:f1]):
        if b - a < mingap and a > 0:
            contact[f0 + a:f0 + b] = True
    for a, b in G.runs(contact[f0:f1]):
        if b - a < int(0.08 * fps_real):
            contact[f0 + a:f0 + b] = False
    coarse = [(f0 + a, f0 + b) for a, b in G.runs(contact[f0:f1]) if a > 0 and f0 + b < f1]
    # refine with horizontal velocity: on a treadmill a planted heel/toe moves backward at belt
    # speed, so contact starts when the heel reaches ~belt speed and ends when the toe leaves it.
    vh = G.gsmooth(np.gradient(P["heel"][:, 0]) * dirn * fps_real, 1.5)
    vt = G.gsmooth(np.gradient(P["toe"][:, 0]) * dirn * fps_real, 1.5)
    w = int(0.1 * fps_real)
    stances = []
    for a, b in coarse:
        mid = slice(a + (b - a) // 4, b - (b - a) // 4)
        belt = -np.median(vh[mid])
        if not np.isfinite(belt) or belt <= 0:
            continue
        thr = -BELT_FRAC * belt
        lo, hi = max(f0, a - w), min(f1 - 1, a + w)
        ic_c = [i for i in range(lo, hi) if vh[i] <= thr]
        lo2, hi2 = max(f0, b - w), min(f1 - 1, b + w)
        to_c = [i for i in range(lo2, hi2) if vt[i] <= thr]
        ic = ic_c[0] if ic_c else a
        to = to_c[-1] + 1 if to_c else b
        if to - ic > 0.1 * fps_real and (not stances or ic > stances[-1][1]):
            stances.append((ic, to))

    knee_flex = G.flexion(P["hip"], P["knee"], P["ank"])
    strides = []
    for k in range(len(stances) - 1):
        ic, to = stances[k]
        ic2 = stances[k + 1][0]
        if ic2 - ic < 0.4 * fps_real or ic2 - ic > 1.2 * fps_real:
            continue  # missed or split contact: not a single clean stride
        st = dict(ic=int(ic), to=int(to), ic_next=int(ic2))
        st["stride_s"] = (ic2 - ic) / fps_real
        st["gct_ms"] = (to - ic) / fps_real * 1000
        st["knee_ic"] = float(knee_flex[ic])
        ms = ic + int(np.argmax(knee_flex[ic:to]))
        st["midstance"] = int(ms)
        st["knee_mid"] = float(knee_flex[ms])
        st["overstride"] = float(dirn * (P["heel"][ic, 0] - hipm[ic, 0]) / leg_len)
        dv = P["ank"][ic] - P["knee"][ic]
        st["shank_ic"] = float(np.degrees(np.arctan2(dirn * dv[0], dv[1])))
        fv = P["toe"][ic] - P["heel"][ic]
        st["foot_angle_ic"] = float(np.degrees(np.arctan2(-fv[1], dirn * fv[0])))  # + = toes up (heel strike)
        tr = shm[ic:ic2] - hipm[ic:ic2]
        st["trunk"] = float(np.median(np.degrees(np.arctan2(dirn * tr[:, 0], -tr[:, 1]))))
        hy = ((hipm + shm) / 2)[ic:ic2, 1]  # trunk centre: steadier than the hip landmark alone
        st["vo_pct"] = float((hy.max() - hy.min()) / leg_len * 100)
        st["vis"] = float(np.nanmean(vis[ic:to, [D["knee"], D["ank"], D["heel"], D["toe"]]]))
        st["belt_px_s"] = float(-np.median(vx[ic + 2:to - 2])) if to - ic > 6 else float("nan")
        strides.append(st)

    # ---- clean strides
    if strides:
        med_stride = np.median([s_["stride_s"] for s_ in strides])
        med_gct = np.median([s_["gct_ms"] for s_ in strides])
    clean = [s_ for s_ in strides
             if abs(s_["stride_s"] - med_stride) < 0.15 * med_stride
             and abs(s_["gct_ms"] - med_gct) < 0.30 * med_gct
             and s_["vis"] > 0.5 and np.isfinite(s_["knee_ic"])]
    side = "right" if near == "R" else "left"
    M = {
        "leg": side,
        "cadence_spm": G.summarise([120.0 / s_["stride_s"] for s_ in clean]),
        "ground_contact_ms": G.summarise([s_["gct_ms"] for s_ in clean], 0),
        "knee_flexion_initial_contact_deg": G.summarise([s_["knee_ic"] for s_ in clean]),
        "knee_flexion_midstance_peak_deg": G.summarise([s_["knee_mid"] for s_ in clean]),
        "overstride_heel_ahead_of_hip_pct_leg": G.summarise([100 * s_["overstride"] for s_ in clean]),
        "shank_angle_initial_contact_deg": G.summarise([s_["shank_ic"] for s_ in clean]),
        "foot_angle_initial_contact_deg": G.summarise([s_["foot_angle_ic"] for s_ in clean]),
        "trunk_forward_lean_deg": G.summarise([s_["trunk"] for s_ in clean]),
        "vertical_oscillation_trunk_pct_leg": G.summarise([s_["vo_pct"] for s_ in clean]),
        "duty_factor_pct": G.summarise([100 * s_["gct_ms"] / 1000 / s_["stride_s"] for s_ in clean]),
        "strides_used": len(clean), "strides_detected": len(strides),
    }
    # rough belt speed: ankle backward speed in stance, scaled by an ASSUMED hip-to-ankle length
    belt = np.median([s_["belt_px_s"] for s_ in clean])
    M["belt_speed_kmh_rough"] = {"value": round(float(belt / leg_len * ASSUMED_LEG_M * 3.6), 1),
                                  "assumes_hip_to_ankle_m": ASSUMED_LEG_M,
                                  "note": "scale from an assumed leg length (about 1.80 m tall); +/-15% or worse"}
    info = dict(near_leg=near, near_leg_mediapipe_z=near_mp, leg_len_px=round(leg_len, 1),
                contact_tolerance_px=round(tol, 1),
                running_direction="frame-right" if dirn == 1 else "frame-left",
                direction_matches_label=bool(dirn == label_dir))
    return M, info, strides, clean


# ================================================================ front/back
def frontal_metrics(xy, vis, f0, f1, fps_real, view):
    s = 2.0
    S = {j: G.gsmooth(xy[:, j], s) for j in range(33)}
    seg = slice(f0, f1)
    # anatomical left is image-left from behind, image-right from the front.
    # MediaPipe can mislabel from behind, so assign by image position.
    hipx_L, hipx_R = np.nanmedian(S[G.L_HIP][seg, 0]), np.nanmedian(S[G.R_HIP][seg, 0])
    mp_left_is_image_left = hipx_L < hipx_R
    want_left_image_left = view == "back"
    swapped = mp_left_is_image_left != want_left_image_left
    if swapped:
        pairs = [(11, 12), (13, 14), (15, 16), (17, 18), (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]
        for a, b in pairs:
            S[a], S[b] = S[b], S[a]
    # image-x sign of the person's left side relative to the midline: smaller x from behind (-1), larger x from the front (+1)
    lat = -1 if view == "back" else 1
    hipm = (S[G.L_HIP] + S[G.R_HIP]) / 2
    shm = (S[G.L_SH] + S[G.R_SH]) / 2
    hipw = np.linalg.norm(S[G.L_HIP] - S[G.R_HIP], axis=1)
    shw = np.linalg.norm(S[G.L_SH] - S[G.R_SH], axis=1)
    legL = np.linalg.norm(S[G.L_HIP] - S[G.L_KNEE], axis=1) + np.linalg.norm(S[G.L_KNEE] - S[G.L_ANK], axis=1)
    legR = np.linalg.norm(S[G.R_HIP] - S[G.R_KNEE], axis=1) + np.linalg.norm(S[G.R_KNEE] - S[G.R_ANK], axis=1)
    leg_len = float(np.nanmedian(((legL + legR) / 2)[seg]))
    hip_w = float(np.nanmedian(hipw[seg]))

    # pelvis tilt: positive = right hip lower in the image
    tilt = np.degrees(np.arctan2(S[G.R_HIP][:, 1] - S[G.L_HIP][:, 1], np.abs(S[G.R_HIP][:, 0] - S[G.L_HIP][:, 0])))
    tilt_ref = float(np.nanmedian(tilt[seg]))

    # stance timing: the stance foot is the lower one; s>0 => left foot lower
    footL = np.maximum(S[G.L_HEEL][:, 1], S[G.L_TOE][:, 1])
    footR = np.maximum(S[G.R_HEEL][:, 1], S[G.R_TOE][:, 1])
    sig = G.gsmooth(footL - footR, 3)
    sig = sig - G.gsmooth(sig, 120)
    cr = G.crossings(sig[f0:f1], int(0.12 * fps_real)) + f0
    steps = []
    for a, b in zip(cr[:-1], cr[1:]):
        if b - a < 0.15 * fps_real or b - a > 0.6 * fps_real:
            continue
        seg_s = sig[a:b]
        side = "L" if np.median(seg_s) > 0 else "R"
        pk = a + int(np.argmax(np.abs(seg_s)))  # swing foot highest ~ mid-stance of the stance leg
        steps.append(dict(side=side, a=int(a), b=int(b), mid=int(pk)))

    def medial_sign(side):
        # image-x direction pointing from this leg toward the midline
        left_dir = lat  # direction (image x) of the person's left
        return -left_dir if side == "L" else left_dir

    out_steps = []
    for st in steps:
        side = st["side"]
        D = G.LEG[side]
        a, b, mid = st["a"], st["b"], st["mid"]
        # contralateral pelvic drop during this stance (relative to the clip's median pelvis line)
        rel = tilt[a:b] - tilt_ref
        drop = rel if side == "L" else -rel  # left stance: right (swing) hip lower => +
        st["pelvic_drop_deg"] = float(np.max(drop))
        st["pelvic_drop_raw_deg"] = float(np.max(tilt[a:b] if side == "L" else -tilt[a:b]))
        # knee frontal plane projection angle; + = knee medial of hip-ankle line (valgus)
        ms = medial_sign(side)
        best = -1e9
        for i in range(a, b):
            h, k, an = S[D["hip"]][i], S[D["knee"]][i], S[D["ank"]][i]
            ang = 180 - float(G.angle3(h, k, an))
            # knee offset relative to the hip-ankle line, along image x
            t = (k[1] - h[1]) / (an[1] - h[1] + 1e-9)
            xline = h[0] + t * (an[0] - h[0])
            sgn = 1 if (k[0] - xline) * ms > 0 else -1
            best = max(best, sgn * ang)
        st["knee_fppa_deg"] = best
        # foot placement at mid-stance relative to pelvis midline (+ = lateral), % hip width
        fx = (S[D["heel"]][mid, 0] + S[D["toe"]][mid, 0] + S[D["ank"]][mid, 0]) / 3
        st["foot_from_midline_pct_hipw"] = float(-(fx - hipm[mid, 0]) * ms / hipw[mid] * 100)
        st["foot_x"] = float(fx)
        out_steps.append(st)

    # step width: lateral distance between consecutive opposite foot placements
    widths = []
    for p, q in zip(out_steps[:-1], out_steps[1:]):
        if p["side"] != q["side"]:
            widths.append(abs(p["foot_x"] - q["foot_x"]) / ((hipw[p["mid"]] + hipw[q["mid"]]) / 2) * 100)

    # arm crossover per arm: max excursion of the wrist past the body midline per step, % shoulder width
    arm = {"L": [], "R": []}
    for st in out_steps:
        a, b = st["a"], st["b"]
        for side in "LR":
            ms = medial_sign(side)
            wx = S[G.LEG[side]["wr"]][a:b, 0]
            mx = shm[a:b, 0]
            arm[side].append(float(np.max((wx - mx) * ms / shw[a:b] * 100)))

    def pick(side, key):
        return [s_[key] for s_ in out_steps if s_["side"] == side]

    M = {}
    for side, nm in (("L", "left"), ("R", "right")):
        M[nm] = {
            "pelvic_drop_contralateral_deg": G.summarise(pick(side, "pelvic_drop_deg")),
            "pelvic_drop_uncorrected_deg": G.summarise(pick(side, "pelvic_drop_raw_deg")),
            "knee_frontal_angle_valgus_deg": G.summarise(pick(side, "knee_fppa_deg")),
            "foot_from_midline_pct_hip_width": G.summarise(pick(side, "foot_from_midline_pct_hipw"), 0),
            "wrist_past_midline_pct_shoulder_width": G.summarise(arm[side], 0),
            "steps_used": len(pick(side, "pelvic_drop_deg")),
        }
    M["step_width_pct_hip_width"] = G.summarise(widths, 0)
    M["cadence_spm_from_steps"] = G.summarise(
        [60.0 / ((q["mid"] - p["mid"]) / fps_real) for p, q in zip(out_steps[:-1], out_steps[1:])
         if p["side"] != q["side"] and 0.2 < (q["mid"] - p["mid"]) / fps_real < 0.55])
    info = dict(mediapipe_lr_swapped=bool(swapped), pelvis_tilt_reference_deg=round(tilt_ref, 2),
                leg_len_px=round(leg_len, 1), hip_width_px=round(hip_w, 1))
    return M, info, out_steps


# ====================================================================== main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--view", required=True, choices=["side-right", "side-left", "back", "front"])
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--stills", action="store_true")
    a = ap.parse_args()

    name, d = load(a.clip)
    lm = d["lm"]
    ok = d["ok"]
    fps_file = float(d["fps_file"])
    xy_raw, z, vis = lm[..., :2].astype(float), lm[..., 2].astype(float), lm[..., 3].astype(float)
    # camera roll from background verticals (door frames); metrics use roll-corrected points
    rolls = [camera_roll.roll_from_clip(a.clip, t)[0] for t in (30, 60, 90, 120, 150)]
    rolls = [r for r in rolls if r is not None]
    roll = float(np.median(rolls)) if rolls else 0.0
    xy = G.rotate_points(xy_raw, roll, (float(d["src_w"]) / 2, float(d["src_h"]) / 2))

    sm = G.detect_slowmo(xy, vis, a.view, fps_file)
    margin = int(0.5 * fps_file)  # stay clear of the speed ramps
    f0, f1 = sm["steady_start"] + margin, sm["steady_end"] - margin
    factor_used = NOMINAL_FACTOR
    fps_real = fps_file * factor_used
    slow = dict(file_start_s=round(sm["start"] / fps_file, 2), file_end_s=round(sm["end"] / fps_file, 2),
                steady_start_s=round(sm["steady_start"] / fps_file, 2), steady_end_s=round(sm["steady_end"] / fps_file, 2),
                fast_span_s=[round(x / fps_file, 2) for x in sm["fast_span"]] if sm["fast_span"] else None,
                analysed_start_s=round(f0 / fps_file, 2), analysed_end_s=round(f1 / fps_file, 2),
                real_seconds_analysed=round((f1 - f0) / fps_real, 2),
                factor_measured=round(sm["factor_measured"], 2), factor_used=factor_used,
                step_interval_slow_frames=sm["step_interval_slow"], step_interval_1x_frames=sm["step_interval_fast"],
                n_1x_steps=sm["n_fast_steps"], effective_real_fps=fps_real)
    csv_path = export_csv(name, lm, ok, f0, f1, fps_real, fps_file)

    res = dict(clip=name, view=a.view, slowmo=slow,
               camera_roll_deg=round(roll, 2), camera_roll_samples=[round(r, 2) for r in rolls],
               pose_found_pct=round(float(ok[f0:f1].mean() * 100), 1))
    if a.view.startswith("side"):
        M, info, strides, clean = side_metrics(xy, vis, z, f0, f1, fps_real, a.view)
        res.update(metrics=M, info=info)
        events = dict(strides=strides, clean_ics=[s_["ic"] for s_ in clean])
    else:
        M, info, steps = frontal_metrics(xy, vis, f0, f1, fps_real, a.view)
        res.update(metrics=M, info=info)
        events = dict(steps=steps)
    res["landmarks_csv"] = os.path.relpath(csv_path, HERE)
    json.dump(res, open(os.path.join(OUT, f"{name}-metrics.json"), "w"), indent=2)
    json.dump(events, open(os.path.join(OUT, f"{name}-events.json"), "w"))
    print(json.dumps(res, indent=2))

    if a.render or a.stills:
        import overlay
        overlay.run(a.clip, name, a.view, xy_raw, f0, f1, fps_file, fps_real, res, events, video=a.render, stills=a.stills)


if __name__ == "__main__":
    main()
