"""AlertGuard AI/ML prototyping layer.

Fast-iteration Python prototype of the drowsiness-detection feature
pipeline described in docs/AlertGuard-AIML-PRD.md: MediaPipe-shaped
landmark input -> EAR/MAR/head-pitch feature extraction -> rolling window
-> threshold-based detection state machine, plus a reusable evaluation
harness. See README.md for setup, design decisions, and default thresholds.
"""

from .evaluation import EvalSample, EvaluationResult, evaluate, evaluate_by_condition
from .features import compute_ear, compute_head_pitch, compute_mar, euclidean_distance
from .landmarks import FaceLandmarks, Point3D
from .state_machine import DetectionState, DriverStateMachine, Thresholds
from .window import FeatureSample, RollingWindow

__all__ = [
    "EvalSample",
    "EvaluationResult",
    "evaluate",
    "evaluate_by_condition",
    "compute_ear",
    "compute_head_pitch",
    "compute_mar",
    "euclidean_distance",
    "FaceLandmarks",
    "Point3D",
    "DetectionState",
    "DriverStateMachine",
    "Thresholds",
    "FeatureSample",
    "RollingWindow",
]
