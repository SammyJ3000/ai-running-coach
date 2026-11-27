"""Gait maths for 2D pose landmarks: smoothing, slow-mo detection, events, metrics.

All angles in degrees. Image coordinates: x right, y down (pixels of the source).
"""
import numpy as np

# Source clip size: the pipeline was built for 1920 x 1080 iPhone slow motion clips.
SRC_W, SRC_H = 1920, 1080

# MediaPipe BlazePose indices
NOSE = 0
L_SH, R_SH = 11, 12
L_EL, R_EL = 13, 14
L_WR, R_WR = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANK, R_ANK = 27, 28
L_HEEL, R_HEEL = 29, 30
L_TOE, R_TOE = 31, 32
LEG = {"L": dict(hip=L_HIP, knee=L_KNEE, ank=L_ANK, heel=L_HEEL, toe=L_TOE, sh=L_SH, wr=L_WR),
       "R": dict(hip=R_HIP, knee=R_KNEE, ank=R_ANK, heel=R_HEEL, toe=R_TOE, sh=R_SH, wr=R_WR)}


# ---------------------------------------------------------------- smoothing
def fill_nan(a):
    """Linear interpolation over NaNs along axis 0 (any trailing dims)."""
    a = np.array(a, dtype=np.float64)
    flat = a.reshape(len(a), -1)
    idx = np.arange(len(a))
    for j in range(flat.shape[1]):
        col = flat[:, j]
        good = np.isfinite(col)
        if good.sum() >= 2 and not good.all():
            col[~good] = np.interp(idx[~good], idx[good], col[good])
    return flat.reshape(a.shape)


def gsmooth(a, sigma):
    """Zero-phase Gaussian smoothing along axis 0 (edge-padded)."""
    if sigma <= 0:
        return np.array(a, dtype=np.float64)
    a = fill_nan(a)
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    flat = a.reshape(len(a), -1)
    pad = np.pad(flat, ((r, r), (0, 0)), mode="edge")
    out = np.empty_like(flat)
    for j in range(flat.shape[1]):
        out[:, j] = np.convolve(pad[:, j], k, mode="valid")
    return out.reshape(a.shape)


# ---------------------------------------------------------------- geometry
def angle3(a, b, c):
    """Interior angle ABC (degrees) for arrays of 2D points [..., 2]."""
    v1, v2 = a - b, c - b
    cos = np.sum(v1 * v2, -1) / (np.linalg.norm(v1, axis=-1) * np.linalg.norm(v2, axis=-1) + 1e-9)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def flexion(hip, knee, ank):
    """Knee flexion = 180 - interior angle (0 = straight)."""
    return 180.0 - angle3(hip, knee, ank)


# ---------------------------------------------------------------- slow-mo
def crossings(sig, min_gap, hyst=0.3):
    """Step events: zero crossings of sig with hysteresis.

    The sign only counts as changed once |sig| exceeds hyst * median(|sig|), so jitter
    around zero does not create extra steps. Returns the index of the zero crossing.
    """
    h = hyst * np.nanmedian(np.abs(sig))
    state = 0
    last_zero = None
    out = []
    for i in range(1, len(sig)):
        if sig[i - 1] * sig[i] <= 0:
            last_zero = i
        if state <= 0 and sig[i] > h or state >= 0 and sig[i] < -h:
            new = 1 if sig[i] > h else -1
            if state != 0 and last_zero is not None and (not out or last_zero - out[-1] >= min_gap):
                out.append(last_zero)
            state = new
    return np.array(out)


def detect_slowmo(xy, vis, view, fps_file):
    """Find the slowed section from the leg-alternation rhythm.

    Signal: left-right ankle difference (x for side views, y for front/back).
    Each zero crossing is one step. Step intervals in file frames are ~4x longer
    inside the slow-motion section than in the 1x ramps at the start/end.
    Returns dict with start/end frame, factor estimate and the evidence.
    """
    k = 0 if view.startswith("side") else 1
    sig = xy[:, L_ANK, k] - xy[:, R_ANK, k]
    sig = gsmooth(sig, 1.0)
    sig = sig - gsmooth(sig, 60)  # remove slow drift
    cr = list(crossings(sig, 3))
    # merge split steps (a brief left/right label swap adds a spurious crossing)
    med0 = np.median(np.diff(cr))
    j = 1
    while j < len(cr) - 1:
        a, b = cr[j] - cr[j - 1], cr[j + 1] - cr[j]
        if min(a, b) < 0.6 * med0 and 0.8 * med0 < a + b < 1.25 * med0:
            del cr[j]
        else:
            j += 1
    cr = np.array(cr)
    iv = np.diff(cr)
    med = np.median(iv)
    slow = iv > 0.55 * med
    # longest run of slow intervals
    best, cur, start = (0, 0, 0), 0, 0
    for i, s in enumerate(slow):
        if s:
            if cur == 0:
                start = i
            cur += 1
            if cur > best[0]:
                best = (cur, start, i)
        else:
            cur = 0
    _, i0, i1 = best
    f0, f1 = int(cr[i0]), int(cr[i1 + 1])
    slow_iv = iv[i0:i1 + 1]
    # steady running inside the slowed section (the belt may still be speeding up at the start)
    steady_med = float(np.median(slow_iv[len(slow_iv) // 2:]))
    good = np.abs(slow_iv - steady_med) < 0.08 * steady_med
    run_best, cur, st = (0, 0, 0), 0, 0
    for j, g in enumerate(good):
        if g:
            if cur == 0:
                st = j
            cur += 1
            if cur > run_best[0]:
                run_best = (cur, st, j)
        else:
            cur = 0
    _, j0, j1 = run_best
    s0, s1 = int(cr[i0 + j0]), int(cr[i0 + j1 + 1])
    slow_mean = (s1 - s0) / (j1 - j0 + 1)
    # 1x running steps in the ramps: longest run of intervals near a quarter of the slow interval
    fastmask = (iv > 0.17 * steady_med) & (iv < 0.36 * steady_med)
    fb, cur, st = (0, 0, 0), 0, 0
    for j, g in enumerate(fastmask):
        if g and (j < i0 or j > i1):
            if cur == 0:
                st = j
            cur += 1
            if cur > fb[0]:
                fb = (cur, st, j)
        else:
            cur = 0
    nf, k0, k1 = fb
    if nf >= 6:
        fast_mean = (cr[k1 + 1] - cr[k0]) / nf
        factor = float(slow_mean / fast_mean)
        fast_span = (int(cr[k0]), int(cr[k1 + 1]))
    else:
        fast_mean, factor, fast_span = None, float("nan"), None
    return dict(start=f0, end=f1, steady_start=s0, steady_end=s1, step_interval_slow=float(slow_mean),
                step_interval_fast=float(fast_mean) if fast_mean else None, n_fast_steps=int(nf),
                fast_span=fast_span, factor_measured=factor, crossings=cr.tolist(), intervals=iv.tolist())


# ---------------------------------------------------------------- helpers
def runs(mask):
    """(start, end_exclusive) for each True run."""
    m = np.concatenate([[False], mask, [False]]).astype(int)
    d = np.diff(m)
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def summarise(vals, nd=1):
    v = np.array([x for x in vals if x is not None and np.isfinite(x)], dtype=float)
    if len(v) == 0:
        return dict(median=None, min=None, max=None, n=0)
    return dict(median=round(float(np.median(v)), nd), min=round(float(np.min(v)), nd),
                max=round(float(np.max(v)), nd), n=int(len(v)))


def rotate_points(xy, roll_deg, centre):
    """Rotate image points so background verticals (tilted by roll_deg, + = top to the right)
    become truly vertical."""
    th = np.radians(-roll_deg)  # tested: maps a line tilted by roll_deg back to vertical
    c, s = np.cos(th), np.sin(th)
    out = np.array(xy, dtype=float).copy()
    x = out[..., 0] - centre[0]
    y = out[..., 1] - centre[1]
    out[..., 0] = c * x - s * y + centre[0]
    out[..., 1] = s * x + c * y + centre[1]
    return out
