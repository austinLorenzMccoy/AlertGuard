import math

import pytest

from alertguard_ml.features import (
    compute_ear,
    compute_head_pitch,
    compute_mar,
    euclidean_distance,
)
from alertguard_ml.landmarks import (
    CHIN,
    LEFT_EYE_OUTER_CORNER,
    LEFT_EYE_P1P6,
    NOSE_TIP,
    RIGHT_EYE_OUTER_CORNER,
    RIGHT_EYE_P1P6,
    FaceLandmarks,
    Point3D,
)

from .fixtures.landmark_builders import (
    build_face,
    degenerate_eye_dict,
    degenerate_mouth_dict,
    eye_dict,
    mouth_dict,
)


def test_euclidean_distance_basic_3_4_5_triangle():
    a = Point3D(0.0, 0.0)
    b = Point3D(3.0, 4.0)
    assert euclidean_distance(a, b) == pytest.approx(5.0)


def test_euclidean_distance_ignores_z():
    a = Point3D(0.0, 0.0, z=100.0)
    b = Point3D(0.0, 0.0, z=-100.0)
    assert euclidean_distance(a, b) == pytest.approx(0.0)


def test_euclidean_distance_zero_for_identical_points():
    a = Point3D(1.0, 1.0)
    assert euclidean_distance(a, a) == 0.0


# --- EAR -------------------------------------------------------------------


def test_compute_ear_symmetric_eyes():
    face = build_face(ear=0.30)
    assert compute_ear(face) == pytest.approx(0.30)


def test_compute_ear_averages_asymmetric_eyes():
    face = build_face(left_ear=0.20, right_ear=0.40)
    assert compute_ear(face) == pytest.approx(0.30)


def test_compute_ear_hand_calculated_single_eye():
    # p1=(0,0), p4=(1,0) -> horizontal=1.0
    # p2=(.33,-.1), p6=(.33,.1) -> vertical dist .2
    # p3=(.66,-.15), p5=(.66,.15) -> vertical dist .3
    # EAR = (.2+.3)/(2*1.0) = 0.25
    points = {
        LEFT_EYE_P1P6[0]: Point3D(0.0, 0.0),
        LEFT_EYE_P1P6[1]: Point3D(0.33, -0.1),
        LEFT_EYE_P1P6[2]: Point3D(0.66, -0.15),
        LEFT_EYE_P1P6[3]: Point3D(1.0, 0.0),
        LEFT_EYE_P1P6[4]: Point3D(0.66, 0.15),
        LEFT_EYE_P1P6[5]: Point3D(0.33, 0.1),
    }
    points.update(eye_dict(RIGHT_EYE_P1P6, ear=0.25, x0=5.0, y0=0.0))
    fl = FaceLandmarks(points=points)
    assert compute_ear(fl) == pytest.approx(0.25)


def test_compute_ear_returns_none_when_eyes_not_visible():
    face = build_face(ear=0.30, eyes_visible=False)
    assert compute_ear(face) is None


def test_compute_ear_degenerate_left_eye_returns_zero_for_that_eye():
    points = degenerate_eye_dict(LEFT_EYE_P1P6, x0=0.0, y0=0.0)
    points.update(eye_dict(RIGHT_EYE_P1P6, ear=0.40, x0=5.0, y0=0.0))
    fl = FaceLandmarks(points=points)
    # left eye degenerate -> 0.0, right eye 0.40 -> average 0.20
    assert compute_ear(fl) == pytest.approx(0.20)


def test_compute_ear_both_eyes_degenerate_returns_zero():
    points = degenerate_eye_dict(LEFT_EYE_P1P6, x0=0.0, y0=0.0)
    points.update(degenerate_eye_dict(RIGHT_EYE_P1P6, x0=5.0, y0=0.0))
    fl = FaceLandmarks(points=points)
    assert compute_ear(fl) == 0.0


def test_compute_ear_does_not_raise_or_return_nan_on_degenerate_input():
    points = degenerate_eye_dict(LEFT_EYE_P1P6, x0=0.0, y0=0.0)
    points.update(degenerate_eye_dict(RIGHT_EYE_P1P6, x0=5.0, y0=0.0))
    fl = FaceLandmarks(points=points)
    result = compute_ear(fl)
    assert result is not None
    assert not math.isnan(result)


# --- MAR -------------------------------------------------------------------


def test_compute_mar_matches_target_value():
    face = build_face(mar=0.45)
    assert compute_mar(face) == pytest.approx(0.45)


def test_compute_mar_hand_calculated():
    # width=2.0, all three vertical gaps = 0.6
    # MAR = (0.6*3)/(2*2.0) = 1.8/4.0 = 0.45
    points = mouth_dict(mar=0.45, x0=0.0, y0=0.0, width=2.0)
    fl = FaceLandmarks(points=points)
    assert compute_mar(fl) == pytest.approx(0.45)


def test_compute_mar_degenerate_returns_zero():
    points = degenerate_mouth_dict(x0=0.0, y0=0.0)
    fl = FaceLandmarks(points=points)
    assert compute_mar(fl) == 0.0


def test_compute_mar_ignores_eyes_visible_flag():
    face_visible = build_face(mar=0.5, eyes_visible=True)
    face_hidden = build_face(mar=0.5, eyes_visible=False)
    assert compute_mar(face_visible) == pytest.approx(compute_mar(face_hidden))


# --- head pitch --------------------------------------------------------------


def test_compute_head_pitch_matches_hand_calculation():
    # eye_line_y=0.0, chin_y=1.0, nose_tip_y=0.5 -> ratio=0.5 -> 45.0 degrees
    face = build_face(eye_line_y=0.0, chin_y=1.0, nose_tip_y=0.5)
    assert compute_head_pitch(face) == pytest.approx(45.0)


def test_compute_head_pitch_zero_when_nose_level_with_eyes():
    face = build_face(eye_line_y=0.0, chin_y=1.0, nose_tip_y=0.0)
    assert compute_head_pitch(face) == pytest.approx(0.0)


def test_compute_head_pitch_negative_for_upward_tilt():
    # nose tip above the eye line (upward tilt) -> negative ratio
    face = build_face(eye_line_y=0.5, chin_y=1.0, nose_tip_y=0.0)
    # ratio = (0.0 - 0.5) / (1.0 - 0.5) = -1.0 -> -90.0
    assert compute_head_pitch(face) == pytest.approx(-90.0)


def test_compute_head_pitch_degenerate_zero_face_height_returns_zero():
    points = {
        LEFT_EYE_OUTER_CORNER: Point3D(0.0, 0.5),
        RIGHT_EYE_OUTER_CORNER: Point3D(1.0, 0.5),
        CHIN: Point3D(0.5, 0.5),  # same y as eye line -> face_height == 0
        NOSE_TIP: Point3D(0.5, 0.7),
    }
    fl = FaceLandmarks(points=points)
    assert compute_head_pitch(fl) == 0.0


def test_compute_head_pitch_does_not_raise_on_degenerate_input():
    points = {
        LEFT_EYE_OUTER_CORNER: Point3D(0.3, 0.5),
        RIGHT_EYE_OUTER_CORNER: Point3D(0.3, 0.5),
        CHIN: Point3D(0.3, 0.5),
        NOSE_TIP: Point3D(0.3, 0.5),
    }
    fl = FaceLandmarks(points=points)
    result = compute_head_pitch(fl)
    assert result == 0.0
    assert not math.isnan(result)
