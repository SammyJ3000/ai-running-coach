"""Merge out/<clip>-metrics.json files into out/metrics.json and print a markdown table."""
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def fmt(m, unit=""):
    if not m or m.get("median") is None:
        return "n/a"
    return f"{m['median']}{unit} ({m['min']}–{m['max']}, n={m['n']})"


def main():
    clips = {}
    for p in sorted(glob.glob(os.path.join(OUT, "*-metrics.json"))):
        d = json.load(open(p))
        clips[d["clip"]] = d
    json.dump({"clips": clips}, open(os.path.join(OUT, "metrics.json"), "w"), indent=2)

    side = [d for d in clips.values() if d["view"].startswith("side")]
    if side:
        rows = [("Cadence (steps/min)", "cadence_spm", ""), ("Ground contact (ms)", "ground_contact_ms", ""),
                ("Duty factor (% of stride on ground)", "duty_factor_pct", ""),
                ("Knee flexion at landing (°)", "knee_flexion_initial_contact_deg", ""),
                ("Peak knee flexion, mid-stance (°)", "knee_flexion_midstance_peak_deg", ""),
                ("Heel ahead of hip at landing (% leg length)", "overstride_heel_ahead_of_hip_pct_leg", ""),
                ("Shin angle at landing (°, + = foot ahead of knee)", "shank_angle_initial_contact_deg", ""),
                ("Foot angle at landing (°, + = toes up)", "foot_angle_initial_contact_deg", ""),
                ("Trunk forward lean (°)", "trunk_forward_lean_deg", ""),
                ("Trunk vertical oscillation (% leg length)", "vertical_oscillation_trunk_pct_leg", "")]
        hdr = "| Metric | " + " | ".join(f"{d['metrics']['leg'].title()} leg ({d['clip']})" for d in side) + " |"
        print(hdr)
        print("|---" * (len(side) + 1) + "|")
        for label, key, u in rows:
            print(f"| {label} | " + " | ".join(fmt(d["metrics"].get(key), u) for d in side) + " |")
        print("| Rough belt speed (km/h, assumed scale) | " + " | ".join(
            str(d["metrics"]["belt_speed_kmh_rough"]["value"]) for d in side) + " |")
    front = [d for d in clips.values() if not d["view"].startswith("side")]
    if front:
        print()
        rows = [("Contralateral pelvic drop (°)", "pelvic_drop_contralateral_deg"),
                ("Pelvic drop, uncorrected for camera tilt (°)", "pelvic_drop_uncorrected_deg"),
                ("Knee frontal angle (°, + = inward/valgus)", "knee_frontal_angle_valgus_deg"),
                ("Foot from body midline (% hip width, + = outside)", "foot_from_midline_pct_hip_width"),
                ("Wrist past midline (% shoulder width, + = crosses)", "wrist_past_midline_pct_shoulder_width")]
        cols = []
        for d in front:
            for leg in ("left", "right"):
                cols.append((d, leg))
        print("| Metric | " + " | ".join(f"{leg.title()} ({d['view']})" for d, leg in cols) + " |")
        print("|---" * (len(cols) + 1) + "|")
        for label, key in rows:
            print(f"| {label} | " + " | ".join(fmt(d["metrics"][leg].get(key)) for d, leg in cols) + " |")
        print("| Step width (% hip width) | " + " | ".join(
            fmt(d["metrics"]["step_width_pct_hip_width"]) if leg == "left" else "" for d, leg in cols) + " |")


if __name__ == "__main__":
    main()
