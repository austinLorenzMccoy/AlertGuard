"""Reusable evaluation harness (PRD Section 8 / Section 13 Phase A item 3).

"Establish the evaluation harness (Section 8 metrics) as reusable code, not
one-off analysis — this gets reused every time thresholds change."

This module computes, from a plain sequence of labeled samples:

- Recall and precision on `critical`-severity events specifically (Section
  8's recall-first-on-critical priority).
- False-positive rate per driving hour, for `vibration`/`critical` combined.
- Detection latency: event onset to alert.
- A per-condition breakdown (daylight/night, sunglasses, skin tone, etc. —
  Section 8's "split by condition" requirement, Section 11's named bias
  cases), by grouping on an arbitrary ``condition`` string tag per sample.

Input shape
-----------
A sequence of :class:`EvalSample` — ``(predicted_state, ground_truth_label,
timestamp, condition)``. ``predicted_state`` is normally a
``state_machine.DetectionState`` (or the equivalent string) produced by
feeding a session's features through :class:`state_machine.DriverStateMachine`;
``ground_truth_label`` is a human/dataset-provided label using the same
vocabulary (``"normal"``, ``"soft"``, ``"vibration"``, ``"critical"``).
Both accept either a ``DetectionState`` or a plain string so this harness has
no import-time dependency on how predictions were produced (real pilot data,
public-dataset labels, or synthetic fixtures can all feed it directly).

This module is intentionally side-effect-free: every function takes
structured input and returns a structured, dataclass result — no printing,
no file I/O — so it composes into notebooks, CI checks, or a future
threshold-recalibration script (Section 12) without modification.

Event-matching semantics (used by recall/precision/latency)
-------------------------------------------------------------
Both the ground-truth label sequence and the predicted-state sequence are
converted into maximal contiguous runs ("episodes") of equal
label/state, ordered by timestamp. For `critical` recall/precision:

- A ground-truth `critical` run is a **detected** (true positive) event if
  some predicted `critical` run starts at or after the ground-truth run's
  start and at or before its end (i.e. the alert fires sometime during the
  true event window). Its **latency** is
  ``predicted_run.start - ground_truth_run.start`` (>= 0 by construction).
  A ground-truth run with no such matching predicted run is a false
  negative (missed event).
- A predicted `critical` run that does not match any ground-truth `critical`
  run this way is a false positive (false alarm). A predicted run matching a
  ground-truth run that another predicted run already matched is treated as
  a redundant re-alert on the same ongoing event, not a second false
  positive.

For the combined `vibration`/`critical` false-positive rate, predicted
`vibration` and `critical` states are merged into single "elevated episodes"
(a driver experiences a state-machine excursion from NORMAL up through
VIBRATION/CRITICAL and back as one continuous alarm), and an elevated
episode is a false alarm if it has **no time overlap at all** with any
ground-truth run whose label is `vibration` or `critical`.

These are deliberately simple, deterministic, hand-verifiable matching
rules — documented here so a reader can hand-check the metrics against a
small fixture sequence (see ``tests/test_evaluation.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean, median
from typing import Dict, List, Optional, Sequence, Union

from .state_machine import DetectionState

StateLike = Union[DetectionState, str]

CRITICAL = "critical"
VIBRATION = "vibration"
_ELEVATED = frozenset({VIBRATION, CRITICAL})


def _normalize(state: StateLike) -> str:
    return state.value if isinstance(state, DetectionState) else str(state)


@dataclass(frozen=True)
class EvalSample:
    """One labeled sample for evaluation.

    predicted_state: the system's output at this timestamp (DetectionState or str).
    ground_truth_label: the true severity at this timestamp (same vocabulary).
    timestamp: seconds, monotonically non-decreasing within a condition/session.
    condition: a free-form tag (e.g. "night", "sunglasses", "baseline") used
        for the per-condition breakdown. Defaults to "unspecified".
    """

    predicted_state: StateLike
    ground_truth_label: StateLike
    timestamp: float
    condition: str = "unspecified"

    @property
    def predicted(self) -> str:
        return _normalize(self.predicted_state)

    @property
    def ground_truth(self) -> str:
        return _normalize(self.ground_truth_label)


@dataclass(frozen=True)
class _Run:
    label: str
    start: float
    end: float


def _extract_runs(
    samples: Sequence[EvalSample], key: str
) -> List[_Run]:
    """Maximal contiguous runs of equal ``getattr(sample, key)``, in order."""
    runs: List[_Run] = []
    current_label: Optional[str] = None
    current_start: Optional[float] = None
    current_end: Optional[float] = None
    for s in samples:
        value = getattr(s, key)
        if value != current_label:
            if current_label is not None:
                runs.append(_Run(current_label, current_start, current_end))
            current_label = value
            current_start = s.timestamp
        current_end = s.timestamp
    if current_label is not None:
        runs.append(_Run(current_label, current_start, current_end))
    return runs


def _extract_elevated_runs(samples: Sequence[EvalSample]) -> List[_Run]:
    """Maximal contiguous runs where predicted state is vibration OR critical."""
    runs: List[_Run] = []
    in_run = False
    start: Optional[float] = None
    end: Optional[float] = None
    for s in samples:
        elevated = s.predicted in _ELEVATED
        if elevated and not in_run:
            in_run = True
            start = s.timestamp
            end = s.timestamp
        elif elevated and in_run:
            end = s.timestamp
        elif not elevated and in_run:
            runs.append(_Run("elevated", start, end))
            in_run = False
    if in_run:
        runs.append(_Run("elevated", start, end))
    return runs


def _overlaps(a: _Run, b: _Run) -> bool:
    return a.start <= b.end and b.start <= a.end


@dataclass(frozen=True)
class EvaluationResult:
    """Structured evaluation metrics for one sample sequence (Section 8)."""

    n_samples: int
    driving_hours: Optional[float]

    critical_true_positives: int
    critical_false_negatives: int
    critical_false_positives: int
    critical_recall: Optional[float]
    critical_precision: Optional[float]

    false_positive_episodes: int
    false_positive_rate_per_hour: Optional[float]

    latencies_s: List[float] = field(default_factory=list)

    @property
    def latency_mean_s(self) -> Optional[float]:
        return mean(self.latencies_s) if self.latencies_s else None

    @property
    def latency_median_s(self) -> Optional[float]:
        return median(self.latencies_s) if self.latencies_s else None

    @property
    def latency_max_s(self) -> Optional[float]:
        return max(self.latencies_s) if self.latencies_s else None


def _driving_hours(samples: Sequence[EvalSample]) -> Optional[float]:
    if len(samples) < 2:
        return None
    span = samples[-1].timestamp - samples[0].timestamp
    if span <= 0:
        return None
    return span / 3600.0


def evaluate(samples: Sequence[EvalSample]) -> EvaluationResult:
    """Compute Section 8 metrics for a single sequence of labeled samples.

    ``samples`` must be ordered by timestamp (per session/condition). Not
    required to be evenly spaced.
    """
    ordered = sorted(samples, key=lambda s: s.timestamp)

    gt_critical_runs = [r for r in _extract_runs(ordered, "ground_truth") if r.label == CRITICAL]
    predicted_critical_runs = [r for r in _extract_runs(ordered, "predicted") if r.label == CRITICAL]

    matched_predicted_ids = set()
    true_positives = 0
    false_negatives = 0
    latencies: List[float] = []

    for gt_run in gt_critical_runs:
        match = None
        for idx, pred_run in enumerate(predicted_critical_runs):
            if idx in matched_predicted_ids:
                continue
            if gt_run.start <= pred_run.start <= gt_run.end:
                match = (idx, pred_run)
                break
        if match is None:
            false_negatives += 1
        else:
            idx, pred_run = match
            matched_predicted_ids.add(idx)
            true_positives += 1
            latencies.append(pred_run.start - gt_run.start)

    false_positives = len(predicted_critical_runs) - len(matched_predicted_ids)

    recall: Optional[float]
    if gt_critical_runs:
        recall = true_positives / len(gt_critical_runs)
    else:
        recall = None

    precision: Optional[float]
    denom = true_positives + false_positives
    if denom > 0:
        precision = true_positives / denom
    else:
        precision = None

    gt_elevated_runs = [r for r in _extract_runs(ordered, "ground_truth") if r.label in _ELEVATED]
    elevated_episodes = _extract_elevated_runs(ordered)
    fp_episodes = 0
    for ep in elevated_episodes:
        if not any(_overlaps(ep, gt) for gt in gt_elevated_runs):
            fp_episodes += 1

    hours = _driving_hours(ordered)
    fp_rate: Optional[float]
    if hours is not None:
        fp_rate = fp_episodes / hours
    else:
        fp_rate = None

    return EvaluationResult(
        n_samples=len(ordered),
        driving_hours=hours,
        critical_true_positives=true_positives,
        critical_false_negatives=false_negatives,
        critical_false_positives=false_positives,
        critical_recall=recall,
        critical_precision=precision,
        false_positive_episodes=fp_episodes,
        false_positive_rate_per_hour=fp_rate,
        latencies_s=latencies,
    )


def evaluate_by_condition(
    samples: Sequence[EvalSample],
) -> Dict[str, EvaluationResult]:
    """Group ``samples`` by ``condition`` and evaluate each group independently.

    Per PRD Section 8: "Report metrics split by condition (daylight/night,
    with/without sunglasses, different skin tones) — a single blended
    accuracy number hides exactly the failure modes that matter most here."
    Also directly supports Section 11 / Phase D's named bias/fairness test
    conditions (see tests/fixtures/bias_fairness.py).
    """
    grouped: Dict[str, List[EvalSample]] = {}
    for s in samples:
        grouped.setdefault(s.condition, []).append(s)
    return {condition: evaluate(group) for condition, group in grouped.items()}
