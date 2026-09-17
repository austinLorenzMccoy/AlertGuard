import pytest

from alertguard_ml.landmarks import (
    CHIN,
    LEFT_EYE_P1P6,
    MOUTH_P1P8,
    NOSE_TIP,
    REQUIRED_INDICES,
    RIGHT_EYE_P1P6,
    FaceLandmarks,
    MissingLandmarkError,
    Point3D,
)


def test_point3d_defaults_z_to_zero():
    p = Point3D(x=1.0, y=2.0)
    assert p.z == 0.0


def test_point3d_explicit_z():
    p = Point3D(x=1.0, y=2.0, z=3.0)
    assert p.z == 3.0


def test_face_landmarks_getitem_success():
    points = {NOSE_TIP: Point3D(0.5, 0.5)}
    fl = FaceLandmarks(points=points)
    assert fl[NOSE_TIP] == Point3D(0.5, 0.5)


def test_face_landmarks_getitem_missing_raises():
    fl = FaceLandmarks(points={})
    with pytest.raises(MissingLandmarkError):
        fl[NOSE_TIP]


def test_missing_landmark_error_is_key_error():
    fl = FaceLandmarks(points={})
    with pytest.raises(KeyError):
        fl[CHIN]


def test_face_landmarks_has():
    fl = FaceLandmarks(points={NOSE_TIP: Point3D(0.0, 0.0)})
    assert fl.has(NOSE_TIP) is True
    assert fl.has(CHIN) is False


def test_face_landmarks_eyes_visible_defaults_true():
    fl = FaceLandmarks(points={})
    assert fl.eyes_visible is True


def test_face_landmarks_eyes_visible_explicit_false():
    fl = FaceLandmarks(points={}, eyes_visible=False)
    assert fl.eyes_visible is False


def test_required_indices_covers_all_formula_inputs():
    expected = set(LEFT_EYE_P1P6) | set(RIGHT_EYE_P1P6) | set(MOUTH_P1P8) | {NOSE_TIP, CHIN}
    assert REQUIRED_INDICES == frozenset(expected)


def test_eye_and_mouth_index_tuples_have_expected_lengths():
    assert len(LEFT_EYE_P1P6) == 6
    assert len(RIGHT_EYE_P1P6) == 6
    assert len(MOUTH_P1P8) == 8
