"""Run MediaPipe Pose Landmarker (heavy) on every frame of a clip.

Reads the clip only (never modifies it). Decodes with ffmpeg at a reduced
resolution to keep CPU sensible, and stores landmarks in full-frame pixel
coordinates of the source (1920x1080).

Output: out/<clip>-landmarks.npz with
  lm    float32 [n_frames, 33, 5]  x_px, y_px, z (relative), visibility, presence
  world float32 [n_frames, 33, 3]  metric world landmarks (hip-centred, model estimate)
  ok    bool    [n_frames]        a pose was found
  fps_file, src_w, src_h

Usage: pose_extract.py <clip.mov> [--width 960] [--model heavy|full]
"""
import argparse
import os
import subprocess
import time

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

HERE = os.path.dirname(os.path.abspath(__file__))


def probe(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height,r_frame_rate,nb_frames", "-of", "csv=p=0", path]).decode().strip()
    w, h, r, n = out.strip(",").split(",")[:4]
    a, b = r.split("/")
    return int(w), int(h), float(a) / float(b), int(n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--model", default="heavy")
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    a = ap.parse_args()

    name = os.path.splitext(os.path.basename(a.clip))[0]
    os.makedirs(a.out, exist_ok=True)
    dst = os.path.join(a.out, f"{name}-landmarks.npz")
    W, H, fps, n_est = probe(a.clip)
    w = a.width
    h = int(round(H * w / W / 2) * 2)
    sx, sy = W / w, H / h

    opts = vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=os.path.join(HERE, "models", f"pose_landmarker_{a.model}.task")),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    det = vision.PoseLandmarker.create_from_options(opts)
    cmd = ["ffmpeg", "-v", "error", "-threads", "2", "-i", a.clip, "-vf", f"scale={w}:{h}",
           "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    lms, wlds, oks = [], [], []
    nb = w * h * 3
    i = 0
    t0 = time.time()
    while True:
        buf = p.stdout.read(nb)
        if len(buf) < nb:
            break
        img = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        res = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=img), int(i * 1000 / fps))
        arr = np.full((33, 5), np.nan, np.float32)
        wl = np.full((33, 3), np.nan, np.float32)
        ok = bool(res.pose_landmarks)
        if ok:
            for k, p in enumerate(res.pose_landmarks[0]):
                arr[k] = (p.x * w * sx, p.y * h * sy, p.z * w * sx, p.visibility or 0, p.presence or 0)
            for k, p in enumerate(res.pose_world_landmarks[0]):
                wl[k] = (p.x, p.y, p.z)
        lms.append(arr)
        wlds.append(wl)
        oks.append(ok)
        i += 1
        if i % 500 == 0:
            print(f"{name}: {i}/{n_est} frames, {i / (time.time() - t0):.1f} fps", flush=True)
    p.wait()
    np.savez_compressed(dst, lm=np.stack(lms), world=np.stack(wlds), ok=np.array(oks),
                        fps_file=fps, src_w=W, src_h=H, model=a.model, proc_width=w)
    print(f"saved {dst}: {i} frames, {np.mean(oks) * 100:.1f}% with pose, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
