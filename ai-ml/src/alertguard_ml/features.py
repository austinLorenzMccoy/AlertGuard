"""EAR / MAR / head-pitch feature extraction from a single frame of landmarks.

Implements the exact formulas from PRD Section 4:

    EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)     -- averaged left/right eye
    MAR = (|p2-p8| + |p3-p7| + |p4-p6|) / (2 * |p1-p5|)

and a documented head-pitch estimate (see ``compute_head_pitch``).

Degenerate-input policy
------------------------
All three formulas divide by a distance between two landmark points. If those
two points coincide (or nearly do — duplicate/degenerate landmark data,
which can happen with corrupted fixtures or a failed mesh fit), the
denominator is ~0 and the formula is mathematically undefined. This module
never raises or returns NaN/inf for that case; it returns a documented
sentinel instead, chosen per-feature to be the *safe* default given how that
feature is used downstream:

- ``compute_ear``: degenerate eye geometry -> ``0.0`` (reads as "fully
  closed"). EAR is inversely related to danger (low EAR = closed eyes), so a
  degenerate reading defaults toward the *cautious* extreme rather than
  silently reporting "wide open" — consistent with the PRD's recall-first
  priority on missed eye-closure events (Section 2, Section 8).
- ``compute_mar``: degenerate mouth geometry -> ``0.0`` (reads as "closed
  mouth / no yawn"). MAR only ever feeds the SOFT-tier yawn signal, never a
  CRITICAL determination on its own, so there is no safety-critical
  direction to bias toward; a neutral "no signal" default avoids inventing a
  fake yawn out of corrupted geometry. Any single degenerate frame is also
  smoothed away by the rolling window (window.py) regardless.
- ``compute_head_pitch``: degenerate face-height geometry -> ``0.0`` (reads
  as "neutral pitch, no drift"), for the same "no fabricated signal" reason
  as MAR. The eye-closure (EAR) channel remains the primary safety-critical
  detector; pitch is corroborating evidence (Section 5), so defaulting it to
  neutral on bad geometry does not suppress a genuine critical detection.

A single degenerate frame therefore never fabricates an alert by itself, and
because every state-machine transition requires a *sustained* signal across
a rolling window, occasional degenerate frames are self-correcting.
"""

from __future__ import annotations

import math
from typing import Optional

from .landmarks import (
    CHIN,
    LEFT_EYE_OUTER_CORNER,
    LEFT_EYE_P1P6,
    MOUTH_P1P8,
    NOSE_TIP,
    RIGHT_EYE_OUTER_CORNER,
    RIGHT_EYE_P1P6,
    FaceLandmarks,
    Point3D,
)

#: Distances below this are treated as "degenerate" (duplicate/near-duplicate
#: points) rather than as a legitimately tiny-but-real distance.
DEGENERATE_EPSILON = 1e-6

#: Scale factor turning the dimensionless pitch ratio (see
#: ``compute_head_pitch``) into an approximate-degrees number, chosen purely
#: so threshold configuration values are in a familiar, human-readable
#: 0-90-ish range. See ``compute_head_pitch`` docstring for why this is an
#: approximation, not a calibrated angle.
PITCH_SCALE_DEGREES = 90.0


def euclidean_distance(a: Point3D, b: Point3D) -> float:
    """2D (x, y) Euclidean distance between two landmark points.

    Only x/y are used, matching the classic 2D EAR/MAR formulas (z is
    MediaPipe's relative-depth estimate, which the source literature for
    these formulas does not use).
    """
    return math.hypot(a.x - b.x, a.y - b.y)


def _eye_aspect_ratio(landmarks: FaceLandmarks, indices: tuple) -> float:
    p1, p2, p3, p4, p5, p6 = (landmarks[i] for i in indices)
    horizontal = euclidean_distance(p1, p4)
    if horizontal < DEGENERATE_EPSILON:
        return 0.0
    vertical = euclidean_distance(p2, p6) + euclidean_distance(p3, p5)
    return vertical / (2.0 * horizontal)


def compute_ear(landmarks: FaceLandmarks) -> Optional[float]:
    """Eye Aspect Ratio, averaged across both eyes.

    Returns ``None`` when ``landmarks.eyes_visible`` is ``False`` (sunglasses,
    extreme occlusion, etc.) rather than computing a number from
    landmark points that may not correspond to a real, visible eye. This is
    the explicit "eyes not visible" signal called for in PRD Section 11: a
    caller MUST NOT treat ``None`` as "eyes open" (a high/normal EAR) — see
    ``state_machine.py`` for the fallback logic that consumes this.
    """
    if not landmarks.eyes_visible:
        return None
    left = _eye_aspect_ratio(landmarks, LEFT_EYE_P1P6)
    right = _eye_aspect_ratio(landmarks, RIGHT_EYE_P1P6)
    return (left + right) / 2.0


def compute_mar(landmarks: FaceLandmarks) -> float:
    """Mouth Aspect Ratio, per PRD Section 4's 8-point formula."""
    p1, p2, p3, p4, p5, p6, p7, p8 = (landmarks[i] for i in MOUTH_P1P8)
    horizontal = euclidean_distance(p1, p5)
    if horizontal < DEGENERATE_EPSILON:
        return 0.0
    vertical = (
        euclidean_distance(p2, p8)
        + euclidean_distance(p3, p7)
        + euclidean_distance(p4, p6)
    )
    return vertical / (2.0 * horizontal)


def compute_head_pitch(landmarks: FaceLandmarks) -> float:
    """Estimated downward head-pitch, in approximate degrees.

    Design decision (PRD Section 4 leaves the exact method open; Section 15
    flags it as an open question):

    We use a simplified 2D geometric proxy rather than a full 3D solvePnP
    pose estimate: the nose tip's vertical position relative to the
    eye-corner line, normalized by face height (eye-corner line to chin).

        eye_line_y = mean(left_eye_outer_corner.y, right_eye_outer_corner.y)
        face_height = |chin.y - eye_line_y|
        ratio = (nose_tip.y - eye_line_y) / face_height
        pitch_degrees ~= ratio * PITCH_SCALE_DEGREES

    Intuition: as the head pitches down (chin drops toward the chest), the
    nose tip moves down within the eye-line-to-chin span in the 2D image: for
    a fixed camera pointed roughly at a driver's face, ratio grows as pitch
    increases. At a neutral, forward-facing pose the ratio sits at some
    baseline fraction (not zero) — the state machine (Section 5) tracks this
    as a rolling *trend*/drift, not an absolute angle, exactly as the PRD
    specifies, so the exact neutral baseline does not need to be zero or
    per-driver-calibrated for v1.

    Documented limitation vs. a full solvePnP approach (Section 15's open
    question): this is a monocular, single-axis, 2D approximation. It is NOT
    a calibrated Euler angle:
    - It conflates pitch with roll/yaw to a degree — a head roll (tilt
      sideways) or yaw (turn) will perturb the eye-corner line and nose
      position in ways a true 3D pose estimate would disentangle.
    - "PITCH_SCALE_DEGREES" is a readability convenience, not a calibrated
      camera-intrinsics-based degree mapping; thresholds tuned against this
      function's output (Section 7) are only meaningful relative to each
      other and to this same function, not portable to a different pitch
      estimator.
    - It has no notion of camera focal length/distance, so the same physical
      head pitch produces different ratios at different distances from the
      camera (partially, though not fully, mitigated by normalizing by
      face height instead of using raw pixel displacement).
    A future iteration should replace this with MediaPipe's built-in pose
    transform matrix (where available) or a proper solvePnP fit against a
    canonical 3D face model, per Section 15.

    Degenerate input: see module docstring — near-zero face height (e.g.
    duplicate chin/eye landmarks) returns ``0.0`` (neutral pitch).
    """
    nose_tip = landmarks[NOSE_TIP]
    chin = landmarks[CHIN]
    left_corner = landmarks[LEFT_EYE_OUTER_CORNER]
    right_corner = landmarks[RIGHT_EYE_OUTER_CORNER]

    eye_line_y = (left_corner.y + right_corner.y) / 2.0
    face_height = abs(chin.y - eye_line_y)
    if face_height < DEGENERATE_EPSILON:
        return 0.0
    ratio = (nose_tip.y - eye_line_y) / face_height
    return ratio * PITCH_SCALE_DEGREES
