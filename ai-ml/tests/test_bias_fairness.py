"""Bias/fairness test pass (PRD Section 11, Section 13 Phase D item 9-10).

Runs the named synthetic fixtures in tests/fixtures/bias_fairness.py through
the real state machine and asserts each condition is handled sensibly:

- sunglasses: eyes never visible -> EAR must never be fabricated, yet a
  genuinely drowsy driver must still be caught via the head-pitch/yawn
  fallback (the explicit requirement from Section 11).
- low light: noisier-but-real EAR signal must still be detected.
- head covering / varied skin tone: a clean baseline sequence must behave
  exactly like any other clean baseline -- a regression guard, using the
  module's *default* thresholds (no per-test tuning), proving these
  conditions introduce no bias in this prototype's geometry-only formulas.
- facial hair (beard): a boundary-level, attenuated MAR yawn reading must
  still cross the yawn threshold and register as a signal.

Also demonstrates the evaluation harness (evaluation.py) consuming
per-condition state-machine output directly, closing the loop Section 13
Phase D item 10 calls for ("Run the evaluation harness against this set
specifically").
"""

from alertguard_ml.evaluation import EvalSample, evaluate_by_condition
from alertguard_ml.state_machine import DetectionState, DriverStateMachine, Thresholds

from .fixtures.bias_fairness import (
    beard_yawn_sequence,
    head_covering_normal_sequence,
    low_light_drowsy_sequence,
    sunglasses_sequence,
    varied_skin_tone_baseline_sequence,
)


def run_states(sequence, thresholds):
    sm = DriverStateMachine(thresholds)
    return [sm.update(sample) for sample in sequence]


# --- sunglasses: the headline v1 fallback case --------------------------------


def test_sunglasses_ear_is_never_fabricated():
    """The explicit eyes_visible=False / ear=None contract must hold for
    every sample -- this is the "don't silently report eyes open" guard
    from Section 11.
    """
    sequence = sunglasses_sequence()
    assert all(sample.eyes_visible is False for sample in sequence)
    assert all(sample.ear is None for sample in sequence)


def test_sunglasses_drowsy_driver_still_detected_via_fallback():
    thresholds = Thresholds(
        soft_sustain_s=0.15,
        mar_yawn=0.6,
        yawn_sustain_s=0.15,
        pitch_soft=10.0,
        pitch_critical=20.0,
        pitch_baseline_alpha=0.0,
        combined_sustain_s=0.15,
        eyes_not_visible_pitch_critical_sustain_s=0.35,
        window_maxlen=10,
    )
    states = run_states(sunglasses_sequence(), thresholds)
    # never silently stays NORMAL for the whole trip -- must escalate
    assert DetectionState.NORMAL != states[-1]
    assert states[-1] == DetectionState.CRITICAL
    # escalation happened without ever touching an EAR-based path
    assert DetectionState.SOFT in states
    assert DetectionState.VIBRATION in states


# --- low light: noisy-but-real EAR signal must still be caught ---------------


def test_low_light_noisy_ear_still_escalates():
    thresholds = Thresholds(
        ear_soft=0.23,
        ear_vibration=0.20,
        ear_critical=0.15,
        soft_sustain_s=0.1,
        vibration_sustain_s=0.2,
        critical_sustain_s=0.3,
        window_maxlen=10,
    )
    states = run_states(low_light_drowsy_sequence(), thresholds)
    assert states[-1] in (DetectionState.VIBRATION, DetectionState.CRITICAL)


# --- head covering: clean baseline, default thresholds ------------------------


def test_head_covering_behaves_like_clean_baseline():
    states = run_states(head_covering_normal_sequence(), Thresholds())
    assert all(state == DetectionState.NORMAL for state in states)


# --- varied skin tone: clean baseline, default thresholds ---------------------


def test_varied_skin_tone_behaves_like_clean_baseline():
    states = run_states(varied_skin_tone_baseline_sequence(), Thresholds())
    assert all(state == DetectionState.NORMAL for state in states)


def test_head_covering_and_skin_tone_baselines_are_equivalent():
    """Regression guard: two differently-named clean-baseline conditions
    must produce identical state trajectories under identical thresholds,
    since this prototype's formulas are pure geometry and carry no notion
    of skin tone or head covering at all.
    """
    a = run_states(head_covering_normal_sequence(), Thresholds())
    b = run_states(varied_skin_tone_baseline_sequence(), Thresholds())
    assert a == b


# --- facial hair (beard): attenuated MAR must still cross the yawn threshold --


def test_beard_attenuated_yawn_still_registers():
    thresholds = Thresholds(mar_yawn=0.6, yawn_sustain_s=0.3, soft_sustain_s=0.3, window_maxlen=10)
    states = run_states(beard_yawn_sequence(), thresholds)
    assert DetectionState.SOFT in states
    assert states[-1] == DetectionState.SOFT


# --- evaluation harness against the named condition set (Phase D item 10) ----


def test_evaluation_harness_runs_against_named_bias_conditions():
    """Feeds each named fixture's real state-machine output into the
    evaluation harness as a per-condition tagged sequence, exactly the
    Section 8 / Phase D workflow: run the harness against the bias/fairness
    set and get a per-condition breakdown.
    """
    fixtures = {
        "sunglasses": (
            sunglasses_sequence(),
            Thresholds(
                soft_sustain_s=0.15,
                mar_yawn=0.6,
                yawn_sustain_s=0.15,
                pitch_soft=10.0,
                pitch_critical=20.0,
                pitch_baseline_alpha=0.0,
                combined_sustain_s=0.15,
                eyes_not_visible_pitch_critical_sustain_s=0.35,
                window_maxlen=10,
            ),
            "critical",  # ground truth: this driver is genuinely drowsy
        ),
        "low_light": (
            low_light_drowsy_sequence(),
            Thresholds(
                ear_soft=0.23,
                ear_vibration=0.20,
                ear_critical=0.15,
                soft_sustain_s=0.1,
                vibration_sustain_s=0.2,
                critical_sustain_s=0.3,
                window_maxlen=10,
            ),
            "vibration",
        ),
        "head_covering": (head_covering_normal_sequence(), Thresholds(), "normal"),
        "skin_tone": (varied_skin_tone_baseline_sequence(), Thresholds(), "normal"),
    }

    eval_samples = []
    for condition, (sequence, thresholds, gt_label) in fixtures.items():
        sm = DriverStateMachine(thresholds)
        for sample in sequence:
            predicted = sm.update(sample)
            eval_samples.append(
                EvalSample(
                    predicted_state=predicted,
                    ground_truth_label=gt_label,
                    timestamp=sample.timestamp,
                    condition=condition,
                )
            )

    breakdown = evaluate_by_condition(eval_samples)
    assert set(breakdown.keys()) == {"sunglasses", "low_light", "head_covering", "skin_tone"}
    # the genuinely-drowsy, sunglasses-occluded driver's critical event was caught
    assert breakdown["sunglasses"].critical_recall == 1.0
    # the clean-baseline conditions raised zero false elevated episodes
    assert breakdown["head_covering"].false_positive_episodes == 0
    assert breakdown["skin_tone"].false_positive_episodes == 0
