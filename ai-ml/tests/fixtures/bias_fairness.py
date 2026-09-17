"""Named synthetic bias/fairness fixture sequences (PRD Section 11 / Section
13 Phase D item 9): "Build a small internal test set covering Section 11's
named cases: low light, sunglasses, head coverings, facial hair, varied
skin tones."

This prototype has no real camera/MediaPipe/video data (see README), so
these fixtures model each named condition's *effect on the feature
pipeline* rather than simulating pixels:

- ``low_light``: landmark jitter/noise is more likely under low light, but
  the geometry itself is unaffected once MediaPipe has located landmarks at
  all — modeled as a normal-looking but noisier EAR/MAR signal. Skin tone
  and low light are named as a combined risk in Section 11 (landmark
  *detection* accuracy degrading), which is a MediaPipe-runtime concern
  outside this prototype's scope (no real MediaPipe here) — flagged, not
  silently ignored, via the ``condition`` tag so a real evaluation run
  against pilot data can report it separately, per Section 8's per-condition
  breakdown.
- ``sunglasses``: the headline v1 fallback case — ``eyes_visible=False``
  throughout. Eyes are physically unreadable; detection must lean on yawn
  and head-pitch signals only (Section 11).
- ``head_covering``: should not degrade the *visible* facial region's
  landmark quality (Section 11) — modeled as normal-quality EAR/MAR/pitch
  (the visible eyes/mouth/nose/chin are unaffected by e.g. a hijab or
  turban), included here as a named regression guard: a future change must
  not cause head-covering samples to behave differently from a clean
  baseline for the same underlying signal.
- ``beard``: Section 11 flags beards as a MAR-relevant risk (facial hair can
  obscure the lower-lip/chin contour MediaPipe fits). Modeled as a
  mouth-open (yawn) event with an attenuated/noisier MAR reading rather
  than a crisp one, to verify the yawn signal still crosses threshold when
  the underlying MAR estimate is degraded, not eliminated, by a beard.

Each fixture is a list of ``(FeatureSample-constructor kwargs)``-shaped
plain dicts, timestamped at 10 Hz (dt=0.1s), meant to be fed through
:class:`~alertguard_ml.state_machine.DriverStateMachine` (see
``tests/test_bias_fairness.py``).
"""

from __future__ import annotations

from alertguard_ml.window import FeatureSample


def _series(rows):
    return [FeatureSample(**row) for row in rows]


def low_light_drowsy_sequence() -> list[FeatureSample]:
    """Low light: noisier but still genuinely-drowsy EAR readings (eyes
    visible, values jitter around a closing trend) sustained long enough
    that noise should not prevent detection.
    """
    ears = [0.24, 0.19, 0.22, 0.14, 0.17, 0.12, 0.16, 0.11, 0.13, 0.10]
    return _series(
        {
            "timestamp": round(i * 0.1, 2),
            "ear": ear,
            "mar": 0.1,
            "pitch": 0.0,
            "eyes_visible": True,
        }
        for i, ear in enumerate(ears)
    )


def sunglasses_sequence() -> list[FeatureSample]:
    """Sunglasses: eyes not visible throughout; driver is actually nodding
    off, evidenced only by sustained downward head-pitch drift plus a yawn.
    EAR must never be fabricated here.
    """
    rows = []
    for i in range(10):
        t = round(i * 0.1, 2)
        rows.append(
            {
                "timestamp": t,
                "ear": None,
                "mar": 0.75 if 3 <= i <= 6 else 0.1,
                "pitch": 30.0 if i >= 2 else 0.0,
                "eyes_visible": False,
            }
        )
    return _series(rows)


def head_covering_normal_sequence() -> list[FeatureSample]:
    """Head covering: visible region (eyes/mouth/nose/chin) reads normally;
    the covering itself does not appear in our feature set (we never model
    hair/forehead landmarks), so this should behave exactly like a clean
    baseline driver.
    """
    return _series(
        {
            "timestamp": round(i * 0.1, 2),
            "ear": 0.31,
            "mar": 0.15,
            "pitch": 0.0,
            "eyes_visible": True,
        }
        for i in range(10)
    )


def beard_yawn_sequence() -> list[FeatureSample]:
    """Facial hair: a real yawn, but with an attenuated/noisier MAR estimate
    (beard partially obscures the lower-lip contour) instead of a clean
    signal — still above the yawn threshold, just closer to the boundary.
    """
    return _series(
        {
            "timestamp": round(i * 0.1, 2),
            "ear": 0.30,
            "mar": 0.62 if 2 <= i <= 8 else 0.15,
            "pitch": 0.0,
            "eyes_visible": True,
        }
        for i in range(10)
    )


def varied_skin_tone_baseline_sequence() -> list[FeatureSample]:
    """Varied skin tone: Section 11 flags that landmark *detection* accuracy
    (a MediaPipe-runtime property, out of scope for this landmark-in/
    feature-out prototype) can vary by skin tone under poor lighting. Once
    landmarks ARE correctly located, this prototype's formulas are
    skin-tone-agnostic (pure geometry) by construction. This fixture is a
    named regression guard asserting exactly that: a normal, alert baseline
    sequence tagged for this condition should classify identically to any
    other baseline condition, so per-condition evaluation (Section 8) has a
    stable reference point to compare degraded conditions against.
    """
    return _series(
        {
            "timestamp": round(i * 0.1, 2),
            "ear": 0.32,
            "mar": 0.12,
            "pitch": 0.0,
            "eyes_visible": True,
        }
        for i in range(10)
    )
