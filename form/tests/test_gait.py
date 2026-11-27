"""Tests for the gait maths in gait.py, which analyse.py builds every metric on.

No video and no MediaPipe: the landmarks are a small synthetic track built below, with known answers.
Run from the form folder: python -m unittest discover tests
"""
import unittest

import numpy as np

import gait as G

FPS_FILE = 30


def synthetic_clip(fast=10.5, slow=42.0, ramp=150, body=2520):
    """Ankle landmarks for a clip that runs at 1x, then 4x slow motion, then 1x again.

    The left and right ankles swap places once per step (a sine wave in x, 180 degrees apart), with a step
    every `fast` file frames at 1x and every `slow` file frames in slow motion. Returns (xy, vis, slow section).
    """
    step = np.concatenate([np.full(ramp, np.pi / fast), np.full(body, np.pi / slow), np.full(ramp, np.pi / fast)])
    phase = np.cumsum(step)
    xy = np.zeros((len(phase), 33, 2))
    xy[:, G.L_ANK, 0] = 960 + 80 * np.sin(phase)
    xy[:, G.R_ANK, 0] = 960 - 80 * np.sin(phase)
    return xy, np.ones((len(phase), 33)), (ramp, ramp + body)


class SlowMotion(unittest.TestCase):
    def test_finds_the_slowed_section_and_the_factor(self):
        xy, vis, (f0, f1) = synthetic_clip()
        r = G.detect_slowmo(xy, vis, "side-right", FPS_FILE)
        # Within about one slowed step of the true edges, and a factor close to the true 42 / 10.5 = 4.
        self.assertLess(abs(r["start"] - f0), 45)
        self.assertLess(abs(r["end"] - f1), 45)
        self.assertAlmostEqual(r["factor_measured"], 4.0, delta=0.2)
        self.assertAlmostEqual(r["step_interval_slow"], 42.0, delta=1.0)
        self.assertGreaterEqual(r["n_fast_steps"], 6)


class Geometry(unittest.TestCase):
    def test_angle3_and_knee_flexion(self):
        hip, knee = np.array([0.0, 0.0]), np.array([0.0, 1.0])
        self.assertAlmostEqual(float(G.angle3(hip, knee, np.array([1.0, 1.0]))), 90.0, places=4)
        # A straight leg. arccos is coarse near 180 degrees, so two places.
        self.assertAlmostEqual(float(G.flexion(hip, knee, np.array([0.0, 2.0]))), 0.0, places=2)
        self.assertAlmostEqual(float(G.flexion(hip, knee, np.array([1.0, 1.0]))), 90.0, places=4)

    def test_rotate_points_makes_a_tilted_vertical_line_vertical(self):
        roll, centre = 3.0, (960.0, 540.0)
        th = np.radians(roll)
        # A background vertical leaning with its top to the right by `roll` degrees (image y points down).
        line = np.array([[centre[0] + 300 * np.sin(th) * k, centre[1] - 300 * np.cos(th) * k] for k in (-1, 0, 1)])
        out = G.rotate_points(line, roll, centre)
        np.testing.assert_allclose(out[:, 0], centre[0], atol=1e-6)


class Helpers(unittest.TestCase):
    def test_crossings_counts_steps_and_ignores_jitter(self):
        t = np.arange(400)
        sig = np.sin(np.pi * t / 20) + 0.02 * np.sin(np.pi * t / 1.5)   # a step every 20 frames, plus jitter
        cr = G.crossings(sig, 3)
        np.testing.assert_allclose(np.diff(cr), 20, atol=1)
        self.assertEqual(len(cr), 19)

    def test_runs_and_summarise(self):
        self.assertEqual(G.runs(np.array([0, 1, 1, 0, 1], bool)), [(1, 3), (4, 5)])
        self.assertEqual(G.summarise([1.0, None, float("nan"), 3.0, 2.0]), dict(median=2.0, min=1.0, max=3.0, n=3))
        self.assertEqual(G.summarise([]), dict(median=None, min=None, max=None, n=0))

    def test_fill_nan_and_gsmooth(self):
        np.testing.assert_allclose(G.fill_nan([1.0, np.nan, 3.0]), [1.0, 2.0, 3.0])
        np.testing.assert_allclose(G.gsmooth(np.full(50, 7.0), 2.0), 7.0)   # smoothing keeps a constant


if __name__ == "__main__":
    unittest.main()
