"""Detection state machine: NORMAL -> SOFT -> VIBRATION -> CRITICAL.

Implements PRD Section 5's diagram:

    NORMAL
      |  EAR/MAR/pitch within normal range
      v
    SOFT (early signal)
      |  one signal mildly elevated (e.g., yawn rate rising) - soft chime
      v
    VIBRATION (rising confidence)
      |  EAR drop sustained > threshold_1, or multiple signals elevated together
      v
    CRITICAL (imminent risk)
      |  EAR drop sustained > threshold_2 (longer/deeper),
      |  or head-pitch drop + EAR drop together
      v
    back to NORMAL after a clean rolling window, or driver acknowledgment

All thresholds/durations are constructor-configurable via :class:`Thresholds`
(a dataclass with documented defaults) — see the class docstring for the
rationale behind each default. Nothing below is a magic number: every
comparison references a named ``Thresholds`` field.

De-escalation design decision
------------------------------
The PRD's diagram draws exactly one "back to NORMAL" arrow, out of CRITICAL.
It is silent on whether SOFT/VIBRATION ever step back down on their own. A
literal reading would leave a driver permanently stuck in SOFT after one
early yawn, with no way back except by first escalating all the way to
CRITICAL and clearing/acknowledging it — clearly not the intended behavior,
and it would contradict Section 5's own stated principle that escalation
(and, by symmetry, its reverse) should track *sustained* signal rather than
a one-off blip.

This implementation therefore applies the same "clean rolling window" rule
used for CRITICAL -> NORMAL uniformly to SOFT -> NORMAL and
VIBRATION -> SOFT: whenever the entire current window is clean (no sample
shows any elevated signal), the state relaxes down exactly one level per
evaluation. This is a documented extension of the literal spec, not
something stated verbatim in the PRD; it is the most direct generalization
of the one de-escalation rule the PRD does specify.

Head-pitch: drift from a rolling baseline, not an absolute angle
--------------------------------------------------------------------
``features.compute_head_pitch`` documents that its output is not a
calibrated Euler angle and that a driver's neutral resting pitch is not
zero. PRD Section 4 is explicit that pitch should be "tracked as a rolling
trend — a slow downward drift, not just an absolute angle." This module
therefore never compares a raw ``sample.pitch`` value against
``pitch_soft``/``pitch_critical`` directly; it maintains a slowly-updating
EMA baseline (``pitch_baseline_alpha``) representing the driver's current
neutral pitch, and compares *drift* (``sample.pitch - baseline``) against
the thresholds instead. The baseline is only updated while the driver is in
NORMAL (i.e., while nothing suggests they're already drifting) — updating it
unconditionally would let a genuine, slow head-nod get silently absorbed
into "the new normal" and never trigger. This also gives natural
per-driver/per-session personalization of the resting pitch for free,
without the explicit calibration flow Section 15 defers to v1.1.

Eyes-not-visible fallback (PRD Section 11)
--------------------------------------------
When ``FeatureSample.ear is None`` (eyes not visible — sunglasses, extreme
occlusion), EAR-based comparisons are simply unusable for that sample: this
module never substitutes a number for a missing EAR reading (in particular,
never treats "None" as "high EAR / eyes open"). All EAR-gated predicates
below use ``ear is not None and ear < threshold``, so a missing EAR reading
is neither "open" nor "closed" — it simply cannot contribute a positive
EAR-based signal. Concretely, when eyes are consistently not visible across
the trailing window:

- SOFT -> VIBRATION can still fire via the "multiple signals elevated
  together" path (yawn + pitch), just never via the EAR-sustained path.
- VIBRATION -> CRITICAL falls back to a pitch-alone trigger (no EAR
  corroboration available), but requires a *longer* sustained duration
  (``eyes_not_visible_pitch_critical_sustain_s`` > ``combined_sustain_s``)
  precisely because pitch alone, without EAR corroboration, is weaker
  evidence — this is the documented, more-conservative fallback called for
  by Section 11 ("rely more heavily on head-pitch and yawn signals ... with
  the driver informed detection confidence is reduced").
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .window import FeatureSample, RollingWindow


class DetectionState(str, Enum):
    """Severity states, per PRD Section 5. String-valued for easy logging
    and for direct use as the ``predicted_state`` in evaluation.py samples.
    """

    NORMAL = "normal"
    SOFT = "soft"
    VIBRATION = "vibration"
    CRITICAL = "critical"


@dataclass
class Thresholds:
    """All state-machine thresholds. Every field is constructor-configurable.

    Defaults are placeholder-but-reasonable v1 starting points in the spirit
    of PRD Section 7 ("Initial thresholds ... to be calibrated against
    Section 6 data before pilot, not shipped as guesses") — i.e. these are
    documented starting points for Phase B calibration (Section 13), not
    values validated against real driver data yet.

    EAR (Eye Aspect Ratio) — lower values mean more-closed eyes:
        ear_soft:      0.23  Typical open-eye EAR is ~0.30-0.35; values
                              drifting below ~0.23 are a mild "eyes getting
                              heavy" signal (SOFT-tier).
        ear_vibration: 0.20  ("threshold_1") A clearly-closing/closed eye
                              reading, sustained, is the VIBRATION trigger.
        ear_critical:  0.15  ("threshold_2") Deeper closure than
                              ear_vibration, per Section 5's "deeper/longer".

    Sustain durations (seconds) — how long a condition must hold, measured
    via RollingWindow.trailing_run_duration, before it counts as
    "sustained" rather than a blink/single bad frame:
        soft_sustain_s:      0.5   A brief mild dip is enough to nudge to
                                    SOFT (low cost: soft chime only).
        vibration_sustain_s: 0.8   Longer than a normal blink (~0.1-0.4s)
                                    but still fast, matching Section 8's
                                    <1s alert-latency target.
        critical_sustain_s:  1.5   Deliberately longer than
                                    vibration_sustain_s, per Section 5's
                                    "longer/deeper" for CRITICAL.

    MAR (Mouth Aspect Ratio) / yawn:
        mar_yawn:      0.6   Above this, the mouth is open wide enough to be
                              yawn-like rather than talking/normal motion.
        yawn_sustain_s: 1.0  Matches Section 4's "~1-2 seconds" sustained
                              mouth-open duration for a yawn.

    Head pitch drift (approximate-degrees units, measured as
    sample.pitch - rolling_baseline; see module docstring):
        pitch_soft:     12.0  A mild downward drift from baseline.
        pitch_critical: 25.0  A pronounced downward drift from baseline,
                               only meaningful combined with an EAR drop
                               (or, in the eyes-not-visible fallback, alone).
        pitch_baseline_alpha: 0.05  EMA smoothing factor for the rolling
                               neutral-pitch baseline, updated only while
                               the driver is in NORMAL. Small (slow-moving)
                               so a real drift event isn't absorbed into
                               "the new normal" while it's happening.
        (both threshold fields gated by combined_sustain_s /
        eyes_not_visible_pitch_critical_sustain_s)

    Combined / fallback sustain durations:
        combined_sustain_s: 1.0  Sustain duration for "multiple signals
                                  together" (SOFT->VIBRATION) and for the
                                  "pitch + EAR together" (VIBRATION->CRITICAL)
                                  paths.
        eyes_not_visible_pitch_critical_sustain_s: 2.5
            Sustain duration required for the pitch-alone CRITICAL fallback
            when eyes are not visible. Deliberately longer than
            combined_sustain_s: without EAR corroboration, pitch alone is
            weaker evidence, so we demand a longer sustained drift before
            treating it as CRITICAL (Section 11's "reduced confidence").

    window_maxlen: circular-buffer capacity, in samples. Size this for the
        target 2-3 second rolling window (Section 4) at your capture frame
        rate, e.g. 15 fps * 3s = 45 (the default, assuming a 15fps capture
        rate — see Section 7's "10-15 fps" camera spec and Section 15's open
        question on 2s vs 3s).
    """

    ear_soft: float = 0.23
    ear_vibration: float = 0.20
    ear_critical: float = 0.15

    soft_sustain_s: float = 0.5
    vibration_sustain_s: float = 0.8
    critical_sustain_s: float = 1.5

    mar_yawn: float = 0.6
    yawn_sustain_s: float = 1.0

    pitch_soft: float = 12.0
    pitch_critical: float = 25.0
    pitch_baseline_alpha: float = 0.05

    combined_sustain_s: float = 1.0
    eyes_not_visible_pitch_critical_sustain_s: float = 2.5

    window_maxlen: int = 45


def _ear_below(sample: FeatureSample, threshold: float) -> bool:
    return sample.ear is not None and sample.ear < threshold


def _mar_above(sample: FeatureSample, threshold: float) -> bool:
    return sample.mar > threshold


def _eyes_not_visible(sample: FeatureSample) -> bool:
    return not sample.eyes_visible


class DriverStateMachine:
    """Stateful drowsiness detection state machine over a stream of samples.

    Usage::

        sm = DriverStateMachine(Thresholds())
        for sample in stream_of_feature_samples:
            state = sm.update(sample)
        sm.acknowledge()  # driver taps "I'm OK" (Frontend PRD, Active Trip)
    """

    def __init__(self, thresholds: Thresholds | None = None):
        self.thresholds = thresholds or Thresholds()
        self._window = RollingWindow(maxlen=self.thresholds.window_maxlen)
        self._state = DetectionState.NORMAL
        self._pitch_baseline: float | None = None

    @property
    def state(self) -> DetectionState:
        return self._state

    @property
    def window(self) -> RollingWindow:
        """Exposed read-only for diagnostics/tests; not mutated externally."""
        return self._window

    @property
    def pitch_baseline(self) -> float | None:
        """Current rolling neutral-pitch baseline (see module docstring).
        ``None`` before the first sample has ever been seen.
        """
        return self._pitch_baseline

    def update(self, sample: FeatureSample) -> DetectionState:
        """Feed one new frame's features in; returns the (possibly new) state."""
        self._update_pitch_baseline(sample)
        self._window.add(sample)
        self._state = self._evaluate()
        return self._state

    def acknowledge(self) -> DetectionState:
        """Driver-initiated reset ("I'm OK" button, Frontend PRD Active Trip
        screen). Always returns to NORMAL immediately, from any state, and
        clears the rolling window so stale pre-acknowledgment samples cannot
        immediately re-trigger an escalation. Also clears the pitch baseline
        so it re-establishes fresh from the next sample onward, treating the
        moment of acknowledgment as a new neutral reference point.
        """
        self._state = DetectionState.NORMAL
        self._window.clear()
        self._pitch_baseline = None
        return self._state

    # -- internal evaluation -------------------------------------------------

    def _update_pitch_baseline(self, sample: FeatureSample) -> None:
        if self._pitch_baseline is None:
            self._pitch_baseline = sample.pitch
        elif self._state is DetectionState.NORMAL:
            alpha = self.thresholds.pitch_baseline_alpha
            self._pitch_baseline += alpha * (sample.pitch - self._pitch_baseline)

    def _pitch_drift(self, sample: FeatureSample) -> float:
        baseline = self._pitch_baseline if self._pitch_baseline is not None else sample.pitch
        return sample.pitch - baseline

    def _is_window_clean(self) -> bool:
        """A full window with no sample showing any elevated signal."""
        t = self.thresholds
        if not self._window.is_full:
            return False

        def clean(s: FeatureSample) -> bool:
            if _ear_below(s, t.ear_soft):
                return False
            if _mar_above(s, t.mar_yawn):
                return False
            if self._pitch_drift(s) > t.pitch_soft:
                return False
            return True

        return self._window.all_match(clean)

    def _mild_signal_count(self) -> int:
        t = self.thresholds
        w = self._window
        ear_mild = w.trailing_run_duration(lambda s: _ear_below(s, t.ear_soft)) >= t.soft_sustain_s
        # Yawn uses its own sustain duration (yawn_sustain_s), not
        # soft_sustain_s: PRD Section 4 specifies "~1-2 seconds" sustained
        # mouth-open for a yawn specifically, distinct from the shorter
        # mild-elevation window used for EAR/pitch.
        yawn_mild = w.trailing_run_duration(lambda s: _mar_above(s, t.mar_yawn)) >= t.yawn_sustain_s
        pitch_mild = (
            w.trailing_run_duration(lambda s: self._pitch_drift(s) > t.pitch_soft)
            >= t.soft_sustain_s
        )
        return int(ear_mild) + int(yawn_mild) + int(pitch_mild)

    def _evaluate(self) -> DetectionState:
        current = self._state
        if current is DetectionState.NORMAL:
            return self._evaluate_normal()
        if current is DetectionState.SOFT:
            return self._evaluate_soft()
        if current is DetectionState.VIBRATION:
            return self._evaluate_vibration()
        return self._evaluate_critical()

    def _evaluate_normal(self) -> DetectionState:
        if self._mild_signal_count() >= 1:
            return DetectionState.SOFT
        return DetectionState.NORMAL

    def _evaluate_soft(self) -> DetectionState:
        t = self.thresholds
        w = self._window
        ear_vibration_run = w.trailing_run_duration(lambda s: _ear_below(s, t.ear_vibration))
        ear_vibration_trigger = ear_vibration_run >= t.vibration_sustain_s
        multi_signal_trigger = self._mild_signal_count() >= 2
        if ear_vibration_trigger or multi_signal_trigger:
            return DetectionState.VIBRATION
        if self._is_window_clean():
            return DetectionState.NORMAL
        return DetectionState.SOFT

    def _evaluate_vibration(self) -> DetectionState:
        t = self.thresholds
        w = self._window

        ear_critical_run = w.trailing_run_duration(lambda s: _ear_below(s, t.ear_critical))
        ear_critical_trigger = ear_critical_run >= t.critical_sustain_s

        ear_vibration_run = w.trailing_run_duration(lambda s: _ear_below(s, t.ear_vibration))
        pitch_critical_run = w.trailing_run_duration(
            lambda s: self._pitch_drift(s) > t.pitch_critical
        )
        combined_trigger = (
            pitch_critical_run >= t.combined_sustain_s
            and ear_vibration_run >= t.combined_sustain_s
        )

        eyes_not_visible_run = w.trailing_run_duration(_eyes_not_visible)
        fallback_trigger = (
            eyes_not_visible_run >= t.combined_sustain_s
            and pitch_critical_run >= t.eyes_not_visible_pitch_critical_sustain_s
        )

        if ear_critical_trigger or combined_trigger or fallback_trigger:
            return DetectionState.CRITICAL
        if self._is_window_clean():
            return DetectionState.SOFT
        return DetectionState.VIBRATION

    def _evaluate_critical(self) -> DetectionState:
        if self._is_window_clean():
            return DetectionState.NORMAL
        return DetectionState.CRITICAL
