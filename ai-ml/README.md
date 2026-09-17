# AlertGuard AI/ML — Python Prototype

Fast-iteration Python prototype of the AlertGuard drowsy-driving detection
pipeline described in `../docs/AlertGuard-AIML-PRD.md`: MediaPipe-Face-Mesh
-shaped landmark input → EAR/MAR/head-pitch feature extraction → rolling
window → threshold-based detection state machine, plus a reusable evaluation
harness (PRD Section 8 / Section 13 Phase A item 3).

This is explicitly the fast-iteration prototype (PRD Section 13 Phase A
item 1: "Python prototype first, for fast iteration — before porting to
Kotlin"). A separate team ports the validated formulas/logic to Kotlin in
`../mobile`; this package does not depend on or try to match that port's API.

**No real camera, MediaPipe runtime, or video datasets (NTHU-DDD/YawDD) are
used here.** Everything runs against synthetic/fixture landmark and feature
data, built against an interface shaped exactly like MediaPipe's landmark
output (`alertguard_ml.landmarks.FaceLandmarks`), so a later integration can
swap in real MediaPipe results without changing `features.py`,
`window.py`, or `state_machine.py`.

## Setup

```bash
cd ai-ml
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Requires Python >= 3.10 (developed/tested against 3.12).

## Running tests and coverage

```bash
source .venv/bin/activate
pytest
```

`pytest` alone runs the full suite *and* enforces coverage — this is
configured in `pyproject.toml`:

```
addopts = "--cov=src/alertguard_ml --cov-branch --cov-report=term-missing --cov-fail-under=100"
```

**Current status: 113 tests passing, 100% line and 100% branch coverage** on
all production code in `src/alertguard_ml/` (evaluated with
`--cov-branch`, so every `if`/`elif`/boolean-expression branch is exercised,
not just every line).

## Package layout

```
src/alertguard_ml/
  landmarks.py       Point3D / FaceLandmarks data types (MediaPipe-shaped),
                      canonical landmark index constants
  features.py         EAR / MAR / head-pitch formulas (PRD Section 4)
  window.py            RollingWindow circular buffer + generic query helpers
  state_machine.py    NORMAL/SOFT/VIBRATION/CRITICAL state machine (PRD
                      Section 5), Thresholds config, acknowledge()
  evaluation.py       Reusable evaluation harness (PRD Section 8)

tests/
  test_*.py           One test module per production module
  fixtures/
    landmark_builders.py  Hand-calculable synthetic FaceLandmarks builders
    bias_fairness.py      Named Section 11 / Phase D fixture sequences
```

## Design decisions

### Head-pitch formula (PRD Section 4 / Section 15's open question)

PRD Section 4 leaves the exact head-pitch method open ("simplified 3D
head-pose estimation ... or MediaPipe's built-in pose transform matrix");
Section 15 explicitly flags "whether head-pitch estimation needs a proper 3D
solvePnP approach" as something to resolve during Phase A prototyping.

**Chosen method**: a 2D geometric proxy — the nose tip's vertical position
relative to the eye-corner line, normalized by face height (eye-corner line
to chin):

```
eye_line_y   = mean(left_eye_outer_corner.y, right_eye_outer_corner.y)
face_height  = |chin.y - eye_line_y|
ratio        = (nose_tip.y - eye_line_y) / face_height
pitch_score  = ratio * 90.0   # PITCH_SCALE_DEGREES, a readability constant
```

**Documented limitation** (see `features.compute_head_pitch` docstring for
the full version): this is a monocular, single-axis, 2D approximation, *not*
a calibrated Euler angle. It conflates pitch with roll/yaw to a degree, has
no camera-intrinsics/distance model, and the `PITCH_SCALE_DEGREES` constant
is a human-readability convenience, not a physically calibrated mapping. A
future iteration should replace it with MediaPipe's built-in pose transform
matrix or a proper solvePnP fit, per Section 15.

**Drift, not absolute angle**: PRD Section 4 requires pitch be "tracked as a
rolling trend — a slow downward drift, not just an absolute angle."
`state_machine.py` never thresholds the raw pitch score; `DriverStateMachine`
maintains a slowly-updating EMA baseline (`Thresholds.pitch_baseline_alpha`,
default 0.05) representing the driver's current neutral pitch, updated only
while the driver is in `NORMAL`, and thresholds *drift* (`pitch - baseline`)
instead. This also gives free per-driver/per-session personalization of the
resting pitch, without the explicit calibration flow Section 15 defers to
v1.1.

### Degenerate-input handling (EAR / MAR / head-pitch)

All three formulas divide by a landmark-pair distance. If that distance is
~0 (duplicate/degenerate points — `DEGENERATE_EPSILON = 1e-6` in
`features.py`), the module never raises or returns NaN/inf:

- `compute_ear`: degenerate eye geometry → `0.0` ("fully closed"). EAR is
  inversely related to danger, so this defaults toward the *cautious*
  extreme rather than silently reporting "wide open" — consistent with the
  PRD's recall-first priority (Section 2, Section 8) on missed eye-closure
  events.
- `compute_mar` / `compute_head_pitch`: degenerate geometry → `0.0` (neutral
  "no signal"). Neither feeds a CRITICAL determination on its own (Section
  5), so there's no safety-critical direction to bias toward; a neutral
  default avoids fabricating a signal out of corrupted geometry.

A single degenerate frame never fabricates an alert by itself: every
state-machine transition requires a *sustained* signal across the rolling
window (Section 5), so occasional degenerate frames are self-correcting.

### Eyes-not-visible / sunglasses fallback (PRD Section 11)

Section 11: sunglasses "can block EAR-based eye-closure detection entirely
— v1 needs an explicit fallback: detect when eyes are not visible (rather
than silently reporting a false 'eyes open' state) and rely more heavily on
head-pitch and yawn signals in that case."

Implementation:

- `FaceLandmarks.eyes_visible: bool` is explicit, out-of-band metadata — it
  is **not** derived from the landmark coordinates themselves (MediaPipe's
  classic Face Mesh will happily emit plausible-looking eye landmarks even
  when eyes are physically occluded; it has no built-in "I can't see the
  eyes" signal). In production this would come from an occlusion/visibility
  heuristic sitting in front of this data type.
- `features.compute_ear` returns `None` — not a number — when
  `eyes_visible` is `False`. `None` must never be treated as "high EAR /
  eyes open."
- `state_machine.py`'s EAR-gated predicates all use
  `ear is not None and ear < threshold`, so a missing EAR reading
  contributes to neither an "open" nor a "closed" signal.
- With EAR unusable, `SOFT → VIBRATION` still fires via the "multiple
  signals elevated together" path (yawn + pitch), and
  `VIBRATION → CRITICAL` falls back to a **pitch-alone** trigger — but
  requires a *longer* sustained duration
  (`eyes_not_visible_pitch_critical_sustain_s`, default 2.5s, vs.
  `combined_sustain_s`, default 1.0s) precisely because pitch alone, without
  EAR corroboration, is weaker evidence. This is the "reduced confidence"
  fallback Section 11 calls for.

Tested explicitly in `tests/test_features.py`
(`test_compute_ear_returns_none_when_eyes_not_visible`) and
`tests/test_bias_fairness.py` (`test_sunglasses_*`), including an end-to-end
case where a synthetically drowsy, sunglasses-occluded driver is still
escalated to `CRITICAL` purely via the fallback path, and the harness
confirms `critical_recall == 1.0` for that condition.

### State-machine de-escalation (an extension the PRD's diagram leaves silent)

PRD Section 5's diagram draws exactly one "back to NORMAL" arrow, out of
`CRITICAL`. It's silent on whether `SOFT`/`VIBRATION` ever step back down on
their own — a literal reading would leave a driver stuck in `SOFT` forever
after one early yawn. This implementation applies the same "clean rolling
window" rule used for `CRITICAL → NORMAL` uniformly to `SOFT → NORMAL` and
`VIBRATION → SOFT`: whenever the *entire* current window (which must be
full) shows no elevated signal, the state relaxes down exactly one level.
This is the most direct generalization of the one de-escalation rule the
PRD does specify — documented as a deliberate extension in
`state_machine.py`'s module docstring, not something stated verbatim in the
PRD.

## Default thresholds and rationale

All thresholds live in `state_machine.Thresholds`, a fully
constructor-configurable dataclass — nothing in `state_machine.py` is a
magic number. Defaults (documented in full in the class docstring) are
placeholder-but-reasonable v1 starting points in the spirit of PRD Section 7
("Initial thresholds ... to be calibrated against Section 6 data before
pilot, not shipped as guesses") — i.e. they are Phase B calibration starting
points, **not** values validated against real driver data yet:

| Field | Default | Rationale |
|---|---|---|
| `ear_soft` | 0.23 | Typical open-eye EAR ~0.30–0.35; below ~0.23 is a mild "eyes getting heavy" signal |
| `ear_vibration` (threshold₁) | 0.20 | Clearly-closing eyes, sustained |
| `ear_critical` (threshold₂) | 0.15 | Deeper closure than `ear_vibration`, per Section 5's "deeper/longer" |
| `soft_sustain_s` | 0.5s | Brief mild dip is enough for a low-cost soft chime |
| `vibration_sustain_s` | 0.8s | Longer than a normal blink (~0.1–0.4s), fits Section 8's <1s latency target |
| `critical_sustain_s` | 1.5s | Deliberately longer than `vibration_sustain_s` |
| `mar_yawn` | 0.6 | Mouth open wide enough to be yawn- rather than talk-like |
| `yawn_sustain_s` | 1.0s | Matches Section 4's "~1–2 seconds" sustained yawn |
| `pitch_soft` / `pitch_critical` | 12.0 / 25.0 | Mild vs. pronounced downward *drift from baseline* (not absolute angle) |
| `pitch_baseline_alpha` | 0.05 | Slow EMA so a real drift event isn't absorbed into "the new normal" while happening |
| `combined_sustain_s` | 1.0s | Sustain for "multiple signals together" / "pitch + EAR together" paths |
| `eyes_not_visible_pitch_critical_sustain_s` | 2.5s | Longer fallback sustain — pitch alone is weaker evidence than pitch+EAR |
| `window_maxlen` | 45 samples | ~3s at an assumed 15fps capture rate (Section 7's "10–15 fps"; Section 15's 2s-vs-3s open question) |

## Evaluation harness reuse (against future NTHU-DDD/YawDD/pilot data)

`evaluation.py` is deliberately side-effect-free: `evaluate()` and
`evaluate_by_condition()` take a plain `Sequence[EvalSample]` — 
`(predicted_state, ground_truth_label, timestamp, condition)` — and return
structured `EvaluationResult` dataclasses. No printing, no file I/O, no
notebook-only logic.

To reuse this against real data (PRD Section 13 Phase A item 2 / B item 4,
once NTHU-DDD/YawDD or pilot recordings are available):

1. Run real MediaPipe Face Mesh over the dataset's video, producing
   `FaceLandmarks` per frame (populate `landmarks.REQUIRED_INDICES`; set
   `eyes_visible` from whatever occlusion heuristic is available).
2. Feed each frame through `features.compute_ear/mar/head_pitch` →
   `window.FeatureSample` → `state_machine.DriverStateMachine.update()` to
   get a predicted-state sequence.
3. Pair each predicted state with the dataset's ground-truth label and
   timestamp (and a `condition` tag — dataset split, lighting, sunglasses,
   skin tone, etc.) into `EvalSample`s.
4. Call `evaluate(all_samples)` for the blended numbers and
   `evaluate_by_condition(all_samples)` for the Section 8-mandated
   per-condition breakdown (the same call used for the Section 11 / Phase D
   bias/fairness pass — see `tests/test_bias_fairness.py` for a worked
   example wiring fixtures → state machine → `EvalSample` →
   `evaluate_by_condition`).
5. Iterate `Thresholds` and re-run — this is exactly Section 12's
   "Periodic threshold recalibration" loop, and Section 13 Phase B's
   "Tune thresholds against the held-out portion of public datasets."

No part of this workflow requires modifying `evaluation.py` itself — that's
the point of building it as reusable code (Section 13 Phase A item 3)
instead of a one-off analysis script.

## Coverage achieved

**100% line coverage, 100% branch coverage** (`--cov-branch`), enforced by
`pytest`'s configured `--cov-fail-under=100`. 113 tests across 5 test
modules (`test_landmarks.py`, `test_features.py`, `test_window.py`,
`test_state_machine.py`, `test_evaluation.py`, `test_bias_fairness.py`),
covering: formula correctness against hand-calculable geometric fixtures,
degenerate-input handling for all three formulas, rolling-window
empty/partial/full/overflow behavior, every state-machine transition path
and boundary threshold value (at/just-under threshold), the eyes-not-visible
fallback path (including an end-to-end sunglasses-drowsiness-detection
case), and the evaluation harness's recall/precision/false-positive-rate/
latency math verified against a hand-constructed labeled sequence with
known-by-hand correct answers.
