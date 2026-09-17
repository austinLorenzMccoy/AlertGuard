"""State-machine tests. Every transition path/branch is exercised, plus
boundary values (at/just-under/just-over each threshold).

Per PRD Section 13 Phase C item 8 ("Unit-test the state machine logic in
isolation ... testable without a camera or device at all"), these feed
:class:`FeatureSample` directly rather than routing through
landmarks/features — the state machine's job is deterministic given a
feature sequence, and this tests exactly that contract.

For VIBRATION/CRITICAL-specific branch tests, we seed ``sm._state`` (and,
where relevant, ``sm._pitch_baseline``) directly rather than replaying a
full NORMAL->...->VIBRATION escalation each time. The escalation paths into
SOFT and VIBRATION are independently covered by the NORMAL/SOFT tests below,
and by the full end-to-end integration test at the bottom of this file.
"""

import pytest

from alertguard_ml.state_machine import DetectionState, DriverStateMachine, Thresholds
from alertguard_ml.window import FeatureSample


def mk(t, ear=0.30, mar=0.1, pitch=0.0, eyes_visible=True):
    return FeatureSample(timestamp=t, ear=ear, mar=mar, pitch=pitch, eyes_visible=eyes_visible)


def base_thresholds(**overrides) -> Thresholds:
    defaults = dict(
        ear_soft=0.23,
        ear_vibration=0.20,
        ear_critical=0.15,
        soft_sustain_s=0.15,
        vibration_sustain_s=0.25,
        critical_sustain_s=0.35,
        mar_yawn=0.6,
        yawn_sustain_s=0.15,
        pitch_soft=10.0,
        pitch_critical=20.0,
        pitch_baseline_alpha=0.0,
        combined_sustain_s=0.25,
        eyes_not_visible_pitch_critical_sustain_s=0.45,
        window_maxlen=10,
    )
    defaults.update(overrides)
    return Thresholds(**defaults)


# --- construction / basic properties ----------------------------------------


def test_initial_state_is_normal():
    sm = DriverStateMachine()
    assert sm.state == DetectionState.NORMAL


def test_default_thresholds_used_when_none_given():
    sm = DriverStateMachine()
    assert sm.thresholds.ear_soft == Thresholds().ear_soft


def test_window_property_exposes_rolling_window():
    sm = DriverStateMachine(base_thresholds())
    assert len(sm.window) == 0


def test_pitch_baseline_none_before_first_sample():
    sm = DriverStateMachine(base_thresholds())
    assert sm.pitch_baseline is None


# --- NORMAL -> SOFT ----------------------------------------------------------


def test_normal_to_soft_via_mild_sustained_ear():
    sm = DriverStateMachine(base_thresholds())
    states = [sm.update(mk(t, ear=0.20)) for t in (0.0, 0.1, 0.2)]
    assert states == [
        DetectionState.NORMAL,
        DetectionState.NORMAL,
        DetectionState.SOFT,
    ]


def test_normal_stays_normal_with_all_normal_signals():
    sm = DriverStateMachine(base_thresholds())
    for t in (0.0, 0.1, 0.2, 0.3, 0.4):
        state = sm.update(mk(t, ear=0.30, mar=0.1, pitch=0.0))
        assert state == DetectionState.NORMAL


def test_normal_ear_exactly_at_soft_threshold_does_not_trigger():
    # ear == ear_soft is not "< ear_soft" -> never mild
    sm = DriverStateMachine(base_thresholds())
    for t in (0.0, 0.1, 0.2, 0.3):
        state = sm.update(mk(t, ear=0.23))
    assert state == DetectionState.NORMAL


def test_normal_ear_just_under_soft_threshold_triggers_after_sustain():
    sm = DriverStateMachine(base_thresholds())
    states = [sm.update(mk(t, ear=0.229)) for t in (0.0, 0.1, 0.2)]
    assert states[-1] == DetectionState.SOFT


def test_normal_to_soft_via_multi_signal_mar_and_pitch():
    sm = DriverStateMachine(base_thresholds())
    s0 = sm.update(mk(0.0, ear=0.30, mar=0.1, pitch=0.0))
    assert s0 == DetectionState.NORMAL
    assert sm.pitch_baseline == 0.0
    states = [sm.update(mk(t, ear=0.30, mar=0.7, pitch=15.0)) for t in (0.1, 0.2, 0.3, 0.4)]
    assert states == [
        DetectionState.NORMAL,
        DetectionState.NORMAL,
        DetectionState.SOFT,
        DetectionState.VIBRATION,
    ]


# --- SOFT -> VIBRATION --------------------------------------------------------


def test_soft_to_vibration_via_sustained_ear_vibration_threshold():
    sm = DriverStateMachine(base_thresholds())
    for t in (0.0, 0.1, 0.2):
        sm.update(mk(t, ear=0.20))
    assert sm.state == DetectionState.SOFT
    states = [sm.update(mk(t, ear=0.15)) for t in (0.3, 0.4, 0.5, 0.6)]
    assert states == [
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.VIBRATION,
    ]


def test_soft_to_normal_deescalation_on_clean_window():
    t = base_thresholds(window_maxlen=3)
    sm = DriverStateMachine(t)
    sm._state = DetectionState.SOFT
    states = [sm.update(mk(x, ear=0.30, mar=0.1, pitch=0.0)) for x in (0.0, 0.1, 0.2)]
    assert states == [
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.NORMAL,
    ]


def test_soft_stays_soft_when_not_clean_and_not_escalating():
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.SOFT
    # mild ear signal (below ear_soft) but not sustained-below ear_vibration,
    # and only one signal elevated -> stays SOFT indefinitely
    for t in (0.0, 0.1, 0.2, 0.3):
        state = sm.update(mk(t, ear=0.22))
    assert state == DetectionState.SOFT


# --- VIBRATION -> CRITICAL -----------------------------------------------------


def test_vibration_to_critical_via_sustained_ear_critical_threshold():
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    states = [sm.update(mk(t, ear=0.10)) for t in (0.0, 0.1, 0.2, 0.3, 0.4)]
    assert states == [
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.CRITICAL,
    ]


def test_vibration_ear_critical_exactly_at_threshold_never_triggers_ear_alone():
    # ear == ear_critical is not "< ear_critical"
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    for t in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5):
        state = sm.update(mk(t, ear=0.15))
    assert state == DetectionState.VIBRATION


def test_vibration_to_critical_via_combined_pitch_and_ear():
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    states = [sm.update(mk(t, ear=0.18, pitch=25.0)) for t in (0.0, 0.1, 0.2, 0.3)]
    assert states == [
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.CRITICAL,
    ]


def test_vibration_to_critical_eyes_not_visible_pitch_fallback():
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    states = [
        sm.update(mk(t, ear=None, mar=0.1, pitch=25.0, eyes_visible=False))
        for t in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)
    ]
    assert states == [
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.CRITICAL,
    ]


def test_vibration_eyes_not_visible_never_uses_ear_path():
    # Even with an extremely "low" nominal ear value, ear=None must never
    # contribute to ear_critical/ear_vibration predicates.
    sm = DriverStateMachine(base_thresholds())
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    for t in (0.0, 0.1, 0.2, 0.3, 0.4):
        state = sm.update(mk(t, ear=None, mar=0.1, pitch=0.0, eyes_visible=False))
    # no pitch drift, no EAR usable -> never escalates, never cleans (eyes
    # not visible doesn't violate the clean-window check either) -> VIBRATION
    assert state == DetectionState.VIBRATION


def test_vibration_to_soft_deescalation_on_clean_window():
    t = base_thresholds(window_maxlen=3)
    sm = DriverStateMachine(t)
    sm._state = DetectionState.VIBRATION
    sm._pitch_baseline = 0.0
    states = [sm.update(mk(x, ear=0.30, mar=0.1, pitch=0.0)) for x in (0.0, 0.1, 0.2)]
    assert states == [
        DetectionState.VIBRATION,
        DetectionState.VIBRATION,
        DetectionState.SOFT,
    ]


# --- CRITICAL -> NORMAL --------------------------------------------------------


def test_critical_to_normal_on_clean_window():
    t = base_thresholds(window_maxlen=3)
    sm = DriverStateMachine(t)
    sm._state = DetectionState.CRITICAL
    sm._pitch_baseline = 0.0
    states = [sm.update(mk(x, ear=0.30, mar=0.1, pitch=0.0)) for x in (0.0, 0.1, 0.2)]
    assert states == [
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.NORMAL,
    ]


def test_critical_stays_critical_when_window_not_clean():
    t = base_thresholds(window_maxlen=3)
    sm = DriverStateMachine(t)
    sm._state = DetectionState.CRITICAL
    sm._pitch_baseline = 0.0
    states = [sm.update(mk(x, ear=0.10)) for x in (0.0, 0.1, 0.2)]
    assert states == [
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
    ]


# --- acknowledge() -------------------------------------------------------------


@pytest.mark.parametrize(
    "seed_state",
    [DetectionState.NORMAL, DetectionState.SOFT, DetectionState.VIBRATION, DetectionState.CRITICAL],
)
def test_acknowledge_resets_to_normal_from_any_state(seed_state):
    sm = DriverStateMachine(base_thresholds())
    sm.update(mk(0.0, ear=0.10))
    sm._state = seed_state
    result = sm.acknowledge()
    assert result == DetectionState.NORMAL
    assert sm.state == DetectionState.NORMAL


def test_acknowledge_clears_window():
    sm = DriverStateMachine(base_thresholds())
    sm.update(mk(0.0, ear=0.10))
    sm.update(mk(0.1, ear=0.10))
    sm.acknowledge()
    assert len(sm.window) == 0


def test_acknowledge_clears_pitch_baseline():
    sm = DriverStateMachine(base_thresholds())
    sm.update(mk(0.0, pitch=42.0))
    assert sm.pitch_baseline == 42.0
    sm.acknowledge()
    assert sm.pitch_baseline is None
    sm.update(mk(1.0, pitch=7.0))
    assert sm.pitch_baseline == 7.0


# --- pitch baseline adaptation -------------------------------------------------


def test_pitch_baseline_initializes_from_first_sample():
    sm = DriverStateMachine(base_thresholds(pitch_baseline_alpha=0.5))
    sm.update(mk(0.0, pitch=10.0))
    assert sm.pitch_baseline == 10.0


def test_pitch_baseline_updates_while_normal():
    sm = DriverStateMachine(base_thresholds(pitch_baseline_alpha=0.5))
    sm.update(mk(0.0, pitch=0.0))
    sm.update(mk(0.1, pitch=10.0))  # still NORMAL prior to this update
    # baseline = 0 + 0.5*(10-0) = 5.0
    assert sm.pitch_baseline == pytest.approx(5.0)


def test_pitch_baseline_frozen_while_not_normal():
    sm = DriverStateMachine(base_thresholds(pitch_baseline_alpha=0.5))
    sm.update(mk(0.0, pitch=0.0))
    sm._state = DetectionState.SOFT
    sm.update(mk(0.1, pitch=100.0))
    assert sm.pitch_baseline == 0.0
    sm._state = DetectionState.NORMAL
    sm.update(mk(0.2, pitch=10.0))
    assert sm.pitch_baseline == pytest.approx(5.0)


# --- full end-to-end integration ----------------------------------------------


def test_full_escalation_and_recovery_integration():
    """NORMAL -> SOFT -> VIBRATION -> CRITICAL -> NORMAL via update() only,
    no seeding: demonstrates the complete Section 5 pipeline end-to-end.
    """
    t = base_thresholds(window_maxlen=5)
    sm = DriverStateMachine(t)

    states = []
    for x in (0.0, 0.1, 0.2):
        states.append(sm.update(mk(x, ear=0.20)))
    for x in (0.3, 0.4, 0.5, 0.6, 0.7):
        states.append(sm.update(mk(x, ear=0.10)))
    for x in (0.8, 0.9, 1.0, 1.1, 1.2):
        states.append(sm.update(mk(x, ear=0.30, mar=0.1, pitch=0.0)))

    assert states == [
        DetectionState.NORMAL,
        DetectionState.NORMAL,
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.SOFT,
        DetectionState.VIBRATION,
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.CRITICAL,
        DetectionState.NORMAL,
    ]
