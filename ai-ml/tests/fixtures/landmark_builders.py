"""Reusable synthetic-landmark builders with hand-calculable geometry.

These construct :class:`~alertguard_ml.landmarks.FaceLandmarks` fixtures
where the resulting EAR/MAR/head-pitch values are exactly derivable by hand
from the input parameters, so feature-formula tests can assert exact
expected numbers rather than "looks about right."
"""

from __future__ import annotations

from alertguard_ml.landmarks import (
    CHIN,
    LEFT_EYE_P1P6,
    MOUTH_P1P8,
    NOSE_TIP,
    RIGHT_EYE_P1P6,
    FaceLandmarks,
    Point3D,
)


def eye_dict(indices, ear: float, x0: float, y0: float, corner_dist: float = 1.0) -> dict:
    """Six landmark points (p1..p6, matching ``indices`` order) whose EAR is
    exactly ``ear``.

    Construction: horizontal corner distance = ``corner_dist``; both
    vertical eyelid gaps set equal to ``ear * corner_dist`` so that
    EAR = (v + v) / (2 * corner_dist) = ear exactly.
    """
    v = ear * corner_dist
    p1 = Point3D(x0, y0)
    p4 = Point3D(x0 + corner_dist, y0)
    xm1 = x0 + corner_dist * 0.33
    xm2 = x0 + corner_dist * 0.66
    p2 = Point3D(xm1, y0 - v / 2)
    p6 = Point3D(xm1, y0 + v / 2)
    p3 = Point3D(xm2, y0 - v / 2)
    p5 = Point3D(xm2, y0 + v / 2)
    return dict(zip(indices, [p1, p2, p3, p4, p5, p6]))


def degenerate_eye_dict(indices, x0: float, y0: float) -> dict:
    """All six eye points collapsed to a single point (corner distance 0)."""
    p = Point3D(x0, y0)
    return {i: p for i in indices}


def mouth_dict(mar: float, x0: float, y0: float, width: float = 1.0) -> dict:
    """Eight mouth landmark points (p1..p8) whose MAR is exactly ``mar``.

    Construction: horizontal mouth width = ``width``; all three vertical lip
    gaps set equal to ``mar * width * 2 / 3`` so that
    MAR = (v + v + v) / (2 * width) = mar exactly.
    """
    v = mar * width * 2.0 / 3.0
    p1 = Point3D(x0, y0)
    p5 = Point3D(x0 + width, y0)
    x2 = x0 + width * 0.2
    x3 = x0 + width * 0.5
    x4 = x0 + width * 0.8
    p2 = Point3D(x2, y0 - v / 2)
    p8 = Point3D(x2, y0 + v / 2)
    p3 = Point3D(x3, y0 - v / 2)
    p7 = Point3D(x3, y0 + v / 2)
    p4 = Point3D(x4, y0 - v / 2)
    p6 = Point3D(x4, y0 + v / 2)
    return dict(zip(MOUTH_P1P8, [p1, p2, p3, p4, p5, p6, p7, p8]))


def degenerate_mouth_dict(x0: float, y0: float) -> dict:
    """All eight mouth points collapsed to a single point (width 0)."""
    p = Point3D(x0, y0)
    return {i: p for i in MOUTH_P1P8}


def build_face(
    *,
    ear: float = 0.30,
    left_ear: float | None = None,
    right_ear: float | None = None,
    mar: float = 0.30,
    eye_line_y: float = 0.0,
    chin_y: float = 0.6,
    nose_tip_y: float = 0.3,
    eyes_visible: bool = True,
) -> FaceLandmarks:
    """A full synthetic face with independently controllable EAR, MAR, and
    head-pitch geometry.

    ``nose_tip_y``/``eye_line_y``/``chin_y`` control
    ``compute_head_pitch``'s ratio = (nose_tip_y - eye_line_y) / (chin_y - eye_line_y),
    scaled to approximate degrees by ``PITCH_SCALE_DEGREES`` (90.0), so e.g.
    eye_line_y=0.0, chin_y=1.0, nose_tip_y=0.5 -> ratio 0.5 -> pitch 45.0.
    """
    le = ear if left_ear is None else left_ear
    re = ear if right_ear is None else right_ear
    points: dict = {}
    points.update(eye_dict(LEFT_EYE_P1P6, le, x0=1.2, y0=eye_line_y))
    points.update(eye_dict(RIGHT_EYE_P1P6, re, x0=0.0, y0=eye_line_y))
    points.update(mouth_dict(mar, x0=0.1, y0=chin_y * 0.5))
    points[CHIN] = Point3D(0.6, chin_y)
    points[NOSE_TIP] = Point3D(0.6, nose_tip_y)
    return FaceLandmarks(points=points, eyes_visible=eyes_visible)
