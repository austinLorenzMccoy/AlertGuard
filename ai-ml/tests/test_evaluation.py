"""Evaluation-harness tests: verifies recall/precision/FP-rate/latency math
against small, hand-constructed labeled sequences with known-by-hand
correct answers (see inline derivation).

Hand-constructed main scenario (dt=1s, t=0..19), single condition "baseline":

ground truth runs:  normal(0-2) critical(3-6)[A] normal(7-9) vibration(10)
                     critical(11-13)[B] normal(14-19)
predicted runs:      normal(0-3) critical(4-7) normal(8-9) vibration(10)
                     normal(11-13) vibration(14) normal(15) critical(16-17)
                     normal(18-19)

Event A: predicted critical run starts at t=4, inside gt window [3,6] -> TP,
         latency = 4-3 = 1.0
Event B: no predicted critical run starts inside gt window [11,13] -> FN
Predicted critical run (16,17): matches no gt critical run -> FP

critical_recall    = TP/(TP+FN) = 1/2 = 0.5
critical_precision = TP/(TP+FP) = 1/2 = 0.5
latencies = [1.0]

Elevated (vibration|critical) episodes (predicted): (10,10) (14,14) (16,17)
gt elevated runs: (3,6) (10,10) (11,13)
  (10,10) overlaps gt (10,10)   -> not a false alarm
  (14,14) overlaps nothing      -> false alarm
  (16,17) overlaps nothing      -> false alarm
false_positive_episodes = 2

driving_hours = 19s / 3600 = 19/3600
false_positive_rate_per_hour = 2 / (19/3600) = 7200/19
"""

import pytest

from alertguard_ml.evaluation import (
    EvalSample,
    EvaluationResult,
    evaluate,
    evaluate_by_condition,
)
from alertguard_ml.state_machine import DetectionState

GT = [
    "normal", "normal", "normal", "critical", "critical", "critical", "critical",
    "normal", "normal", "normal", "vibration", "critical", "critical", "critical",
    "normal", "normal", "normal", "normal", "normal", "normal",
]
PRED = [
    "normal", "normal", "normal", "normal", "critical", "critical", "critical", "critical",
    "normal", "normal", "vibration", "normal", "normal", "normal",
    "vibration", "normal", "critical", "critical", "normal", "normal",
]


def _main_scenario():
    assert len(GT) == 20 and len(PRED) == 20
    return [
        EvalSample(predicted_state=PRED[i], ground_truth_label=GT[i], timestamp=float(i), condition="baseline")
        for i in range(20)
    ]


def test_main_scenario_critical_recall_and_precision():
    result = evaluate(_main_scenario())
    assert result.critical_true_positives == 1
    assert result.critical_false_negatives == 1
    assert result.critical_false_positives == 1
    assert result.critical_recall == pytest.approx(0.5)
    assert result.critical_precision == pytest.approx(0.5)


def test_main_scenario_latency():
    result = evaluate(_main_scenario())
    assert result.latencies_s == pytest.approx([1.0])
    assert result.latency_mean_s == pytest.approx(1.0)
    assert result.latency_median_s == pytest.approx(1.0)
    assert result.latency_max_s == pytest.approx(1.0)


def test_main_scenario_false_positive_rate_per_hour():
    result = evaluate(_main_scenario())
    assert result.false_positive_episodes == 2
    assert result.driving_hours == pytest.approx(19 / 3600)
    assert result.false_positive_rate_per_hour == pytest.approx(7200 / 19)


def test_main_scenario_n_samples():
    result = evaluate(_main_scenario())
    assert result.n_samples == 20


# --- degenerate / edge cases -------------------------------------------------


def test_empty_sequence_returns_all_none_or_zero():
    result = evaluate([])
    assert result.n_samples == 0
    assert result.driving_hours is None
    assert result.critical_recall is None
    assert result.critical_precision is None
    assert result.false_positive_rate_per_hour is None
    assert result.latencies_s == []
    assert result.latency_mean_s is None
    assert result.latency_median_s is None
    assert result.latency_max_s is None


def test_zero_span_multi_sample_sequence_has_no_driving_hours():
    # >= 2 samples, but all at the same timestamp -> span == 0
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=5.0),
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=5.0),
    ]
    result = evaluate(samples)
    assert result.driving_hours is None
    assert result.false_positive_rate_per_hour is None


def test_single_sample_sequence_has_no_driving_hours():
    samples = [EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0)]
    result = evaluate(samples)
    assert result.driving_hours is None
    assert result.false_positive_rate_per_hour is None


def test_no_ground_truth_critical_events_recall_is_none():
    samples = [
        EvalSample(predicted_state="critical", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="critical", ground_truth_label="normal", timestamp=1.0),
    ]
    result = evaluate(samples)
    assert result.critical_recall is None
    # both predicted-critical samples form one contiguous run -> 1 FP, not matched
    assert result.critical_false_positives == 1
    assert result.critical_precision == pytest.approx(0.0)


def test_gt_critical_events_but_no_predicted_critical_precision_is_none():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="critical", timestamp=0.0),
        EvalSample(predicted_state="normal", ground_truth_label="critical", timestamp=1.0),
    ]
    result = evaluate(samples)
    assert result.critical_recall == pytest.approx(0.0)
    assert result.critical_precision is None


def test_no_critical_anywhere_recall_and_precision_both_none():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=1.0),
    ]
    result = evaluate(samples)
    assert result.critical_recall is None
    assert result.critical_precision is None
    assert result.false_positive_episodes == 0
    assert result.false_positive_rate_per_hour == pytest.approx(0.0)


def test_perfect_detection_recall_and_precision_are_one():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=1.0),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=2.0),
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=3.0),
    ]
    result = evaluate(samples)
    assert result.critical_recall == pytest.approx(1.0)
    assert result.critical_precision == pytest.approx(1.0)
    assert result.latencies_s == pytest.approx([0.0])


def test_evaluate_sorts_unordered_input_by_timestamp():
    ordered = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=1.0),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=2.0),
    ]
    shuffled = [ordered[2], ordered[0], ordered[1]]
    result_ordered = evaluate(ordered)
    result_shuffled = evaluate(shuffled)
    assert result_ordered.critical_recall == result_shuffled.critical_recall
    assert result_ordered.latencies_s == pytest.approx(result_shuffled.latencies_s)


def test_eval_sample_accepts_detection_state_enum():
    samples = [
        EvalSample(predicted_state=DetectionState.NORMAL, ground_truth_label=DetectionState.NORMAL, timestamp=0.0),
        EvalSample(predicted_state=DetectionState.CRITICAL, ground_truth_label=DetectionState.CRITICAL, timestamp=1.0),
    ]
    assert samples[0].predicted == "normal"
    assert samples[1].ground_truth == "critical"
    result = evaluate(samples)
    assert result.critical_recall == pytest.approx(1.0)


def test_eval_sample_accepts_plain_strings():
    s = EvalSample(predicted_state="soft", ground_truth_label="vibration", timestamp=0.0)
    assert s.predicted == "soft"
    assert s.ground_truth == "vibration"


def test_condition_defaults_to_unspecified():
    s = EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0)
    assert s.condition == "unspecified"


# --- elevated-episode merging / boundary behavior ----------------------------


def test_elevated_episode_merges_across_vibration_and_critical():
    # One continuous elevated stretch (vibration -> critical -> vibration)
    # with no gap must count as a single episode, not three.
    samples = [
        EvalSample(predicted_state="vibration", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="critical", ground_truth_label="normal", timestamp=1.0),
        EvalSample(predicted_state="vibration", ground_truth_label="normal", timestamp=2.0),
    ]
    result = evaluate(samples)
    assert result.false_positive_episodes == 1


def test_elevated_episode_still_open_at_sequence_end_is_captured():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="critical", ground_truth_label="normal", timestamp=1.0),
        EvalSample(predicted_state="critical", ground_truth_label="normal", timestamp=2.0),
    ]
    result = evaluate(samples)
    assert result.false_positive_episodes == 1


def test_no_elevated_predicted_states_gives_zero_episodes():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=0.0),
        EvalSample(predicted_state="normal", ground_truth_label="normal", timestamp=1.0),
    ]
    result = evaluate(samples)
    assert result.false_positive_episodes == 0


# --- per-condition breakdown --------------------------------------------------


def test_evaluate_by_condition_groups_and_evaluates_independently():
    samples = [
        EvalSample(predicted_state="normal", ground_truth_label="critical", timestamp=0.0, condition="night"),
        EvalSample(predicted_state="normal", ground_truth_label="critical", timestamp=1.0, condition="night"),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=0.0, condition="day"),
        EvalSample(predicted_state="critical", ground_truth_label="critical", timestamp=1.0, condition="day"),
    ]
    grouped = evaluate_by_condition(samples)
    assert set(grouped.keys()) == {"night", "day"}
    assert grouped["night"].critical_recall == pytest.approx(0.0)
    assert grouped["day"].critical_recall == pytest.approx(1.0)


def test_evaluate_by_condition_empty_input_returns_empty_dict():
    assert evaluate_by_condition([]) == {}


def test_evaluation_result_is_a_plain_dataclass_with_defaults():
    result = EvaluationResult(
        n_samples=0,
        driving_hours=None,
        critical_true_positives=0,
        critical_false_negatives=0,
        critical_false_positives=0,
        critical_recall=None,
        critical_precision=None,
        false_positive_episodes=0,
        false_positive_rate_per_hour=None,
    )
    assert result.latencies_s == []
