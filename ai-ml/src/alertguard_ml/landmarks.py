"""Facial landmark data types shaped like MediaPipe Face Mesh's output.

Real MediaPipe Face Mesh emits 468 (x, y, z) points per detected face, indexed
0-467 in a fixed topology. This prototype never runs the real MediaPipe
runtime (see the package README), so :class:`FaceLandmarks` models only the
*shape* of that output: a mapping from canonical landmark index to a 3D point,
plus one field MediaPipe itself does not provide — ``eyes_visible`` — which a
later integration layer (or, here, synthetic fixtures / eye-region visibility
heuristics) must supply explicitly.

Why ``eyes_visible`` is an explicit field and not inferred from geometry:
MediaPipe's classic Face Mesh model happily emits plausible-looking eye
landmarks even when eyes are physically occluded (sunglasses, extreme
low light) — the mesh is a learned prior, it will "hallucinate" a
plausible eye shape rather than report "I don't know". Section 11 of the
PRD explicitly calls out that v1 needs a fallback that *detects* when eyes
aren't visible rather than silently trusting a fabricated "eyes open"
reading. We therefore model eye visibility as a first-class, explicitly-set
boolean rather than something derived from the landmark coordinates
themselves — in production this would come from an occlusion/visibility
heuristic (or a MediaPipe model variant that exposes per-landmark
visibility/presence scores) sitting in front of this data type.

Only the landmark indices actually consumed by ``features.py`` are required.
A real MediaPipe result has all 468; synthetic fixtures here only need to
populate the indices declared below.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Point3D:
    """A single 3D landmark point, matching MediaPipe's (x, y, z) per-point output.

    x, y are image-normalized coordinates ([0, 1] in real MediaPipe output);
    z is a relative depth. Our formulas only ever use x/y (2D geometry in the
    image plane), consistent with the classic EAR/MAR literature, but z is
    kept for shape-fidelity with MediaPipe and possible future use.
    """

    x: float
    y: float
    z: float = 0.0


# --- Canonical MediaPipe Face Mesh landmark indices used by this package ---
#
# These indices follow MediaPipe Face Mesh's published canonical topology.
# They are chosen to match the classic 6-point EAR / 8-point MAR formulas
# used in the drowsiness-detection literature (originally defined against
# dlib's 68-point model) as closely as a 468-point mesh allows. If a later
# integration finds MediaPipe's actual output disagrees slightly with a
# specific index choice here (e.g. a refined vs. non-refined mesh variant),
# these constants are the single place to correct it.

# Right eye (subject's right / camera-left), ordered p1..p6 to match
# EAR = (|p2-p6| + |p3-p5|) / (2*|p1-p4|):
#   p1, p4 = outer/inner corners (horizontal reference)
#   p2, p3 = upper eyelid
#   p5, p6 = lower eyelid
RIGHT_EYE_P1P6 = (33, 160, 158, 133, 153, 144)

# Left eye (subject's left / camera-right), same p1..p6 ordering.
LEFT_EYE_P1P6 = (362, 385, 387, 263, 373, 380)

# Mouth, ordered p1..p8 to match
# MAR = (|p2-p8| + |p3-p7| + |p4-p6|) / (2*|p1-p5|):
#   p1, p5 = left/right mouth corners (horizontal reference / mouth width)
#   p2, p3, p4 = upper lip (left-of-center, center, right-of-center)
#   p6, p7, p8 = lower lip (right-of-center, center, left-of-center)
MOUTH_P1P8 = (61, 39, 0, 269, 291, 405, 17, 181)

# Head-pitch geometry: nose tip, chin, and the same outer eye corners used
# above (reused rather than duplicated indices).
NOSE_TIP = 1
CHIN = 152
LEFT_EYE_OUTER_CORNER = LEFT_EYE_P1P6[0]
RIGHT_EYE_OUTER_CORNER = RIGHT_EYE_P1P6[0]

#: All indices required by the current feature set. Useful for fixture
#: construction and validation.
REQUIRED_INDICES = frozenset(
    {*RIGHT_EYE_P1P6, *LEFT_EYE_P1P6, *MOUTH_P1P8, NOSE_TIP, CHIN}
)


class MissingLandmarkError(KeyError):
    """Raised when a required landmark index is absent from a FaceLandmarks."""


@dataclass(frozen=True)
class FaceLandmarks:
    """A single frame's facial landmarks, MediaPipe-Face-Mesh-shaped.

    ``points`` maps canonical landmark index -> :class:`Point3D`. A real
    MediaPipe result would populate all 468 indices; fixtures here only need
    to populate what ``features.py`` reads (see ``REQUIRED_INDICES``).

    ``eyes_visible`` is explicit, out-of-band metadata (see module
    docstring) — it is NOT derived from the points themselves.
    """

    points: Mapping[int, Point3D]
    eyes_visible: bool = True

    def __getitem__(self, index: int) -> Point3D:
        try:
            return self.points[index]
        except KeyError as exc:
            raise MissingLandmarkError(
                f"landmark index {index} not present in this FaceLandmarks"
            ) from exc

    def has(self, index: int) -> bool:
        return index in self.points
