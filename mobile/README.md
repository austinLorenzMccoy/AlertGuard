# AlertGuard Detection Engine

The on-device, threshold-based drowsiness-detection **logic module** for
AlertGuard's Android driver app. This is the standalone, unit-testable
Kotlin module called for by:

- AI/ML PRD, Section 5 (detection state machine) and Section 7 (v1
  threshold-based architecture)
- Frontend PRD, Section 6 (detection loop → UI integration) and Section 13,
  Phase C item 9: *"Build the detection engine (EAR/yawn/head-pitch
  rolling-window logic) as a standalone, unit-testable Kotlin module —
  decoupled from UI."*

It takes facial-landmark coordinates as input and produces a
`DetectionState` as output. Nothing else.

## What this module IS

- A plain **Kotlin/JVM library** (`org.jetbrains.kotlin.jvm` Gradle plugin,
  not the Android Gradle Plugin) — builds and tests on any machine with a
  JDK, no Android SDK, emulator, or device required.
- **Dependency-free at runtime**: Kotlin stdlib only. No coroutines, no
  Android framework classes.
- Feature extraction (EAR, MAR, simplified head pitch) implementing the
  exact formulas from AI/ML PRD Section 4.
- A configurable circular-buffer rolling window (`RollingWindow`).
- The Section 5 detection state machine (`DetectionEngine`,
  `DetectionState`, `DetectionThresholds`).
- A comprehensive JUnit 5 test suite with **100% line and branch coverage**,
  enforced by a JaCoCo Gradle rule that fails the build under threshold.

## What this module is NOT (out of scope here, by design)

This environment has no Android SDK, no emulator, and no way to run
CameraX/MediaPipe/Compose/Room/WorkManager — so none of it was attempted
here. Specifically **not built**:

- CameraX camera capture / `ImageAnalysis` pipeline
- MediaPipe Face Mesh integration or any TFLite model files
- Jetpack Compose UI (status ring, alert overlays, "I'm OK" button, etc.)
- `StateFlow` wiring (kotlinx.coroutines is intentionally **not** a
  dependency of this module — see "Integration plan" below for where that
  wrapper goes)
- Room persistence, WorkManager sync, Supabase writes

These are real Android-app concerns that belong in the actual `app` module
of AlertGuard's mobile project, built and tested on real tooling/hardware —
not something that can be meaningfully verified in a sandboxed JVM-only
environment. They are documented as an integration seam, not stubbed out or
faked.

## Repository layout

```
mobile/
├── build.gradle.kts              # Kotlin/JVM plugin, JUnit5, JaCoCo (100% gate)
├── settings.gradle.kts
├── gradlew, gradlew.bat, gradle/wrapper/   # Gradle Wrapper (Gradle 8.7)
├── src/main/kotlin/com/alertguard/detection/
│   ├── geometry/Point3D.kt        # (x, y, z) landmark point
│   ├── FaceLandmarks.kt           # EyeLandmarks, MouthLandmarks, FaceLandmarks
│   ├── FeatureExtraction.kt       # computeEAR, computeMAR, computeHeadPitch
│   ├── RollingWindow.kt           # circular buffer + average/proportion/trend
│   ├── DetectionThresholds.kt     # all tunable thresholds, documented defaults
│   ├── DetectionState.kt          # Severity, EventType, DetectionState
│   └── DetectionEngine.kt         # the state machine: process(), acknowledge()
└── src/test/kotlin/com/alertguard/detection/
    ├── TestFixtures.kt            # hand-calculable landmark fixtures
    ├── geometry/Point3DTest.kt
    ├── FeatureExtractionTest.kt
    ├── RollingWindowTest.kt
    ├── DetectionThresholdsTest.kt
    ├── DetectionStateTest.kt
    └── DetectionEngineTest.kt
```

## Build & test

Requires a JDK (17 was used to build this). Java/Gradle tooling discovery
for this environment:

```
java -version      # no system JDK found
gradle -version     # no system Gradle found
kotlinc -version     # not found
```

There was no cached Gradle wrapper jar or local JDK on `PATH`, but two
usable JVMs already existed under SDKMAN (`~/.sdkman/candidates/java/`:
`11.0.27-tem`, `17.0.10-tem`), and outbound network access was available.
`brew install gradle` was attempted first but aborted — this machine has no
prebuilt ("bottled") Homebrew packages for its OS/arch tier, so Homebrew
started compiling Gradle's dependency chain (cmake, LLVM, Rust, ...) from
source, which is impractical. Instead, the Gradle 8.7 binary distribution
was downloaded directly from `services.gradle.org`/GitHub releases,
unzipped, and used once to run `gradle wrapper --gradle-version 8.7`,
generating a real Gradle Wrapper (`gradlew`, `gradle-wrapper.jar`) checked
into this module. From that point on, only the wrapper is needed:

```bash
export JAVA_HOME=~/.sdkman/candidates/java/17.0.10-tem   # or any JDK 17+
cd mobile
./gradlew test jacocoTestReport jacocoTestCoverageVerification
```

`jacocoTestCoverageVerification` is wired into `check`, so `./gradlew check`
(or `./gradlew build`) also enforces the 100% coverage gate.

Coverage reports land at:
- `build/reports/jacoco/test/html/index.html` (browsable)
- `build/reports/jacoco/test/jacocoTestReport.xml` (CI-consumable)

## Feature formulas (AI/ML PRD Section 4)

Implemented exactly as specified, in `FeatureExtraction.kt`:

```
EAR = (‖p2-p6‖ + ‖p3-p5‖) / (2 × ‖p1-p4‖)      # averaged over left/right eye
MAR = (‖p2-p8‖ + ‖p3-p7‖ + ‖p4-p6‖) / (2 × ‖p1-p5‖)
```

**Degenerate-input handling**: both formulas divide by a corner-to-corner
distance. If that distance is closer to zero than `EPSILON` (1e-9) — e.g.
duplicate/collapsed landmark points from a bad upstream frame — the function
returns `Double.NaN` rather than throwing or silently producing `Infinity`.
`NaN` is a deliberate, testable sentinel: `DetectionEngine.process()` checks
`value.isNaN()` and simply **skips pushing that feature's sample** into its
rolling window for that frame, rather than corrupting the window's
average/proportion math with a bad value. If a frame's EAR is degenerate for
only one eye (e.g. glare), `computeEAR` falls back to the other eye's EAR
rather than propagating NaN — a deliberate nod toward AI/ML PRD Section 11's
partial-occlusion concerns, without attempting the actual sunglasses
detection that's explicitly out of scope for v1.

### Head-pitch formula design decision

AI/ML PRD Section 4 explicitly leaves the exact head-pitch method open
("simplified 3D head-pose estimation... or MediaPipe's built-in pose
transform matrix where available") and Section 15's open questions defer a
full solvePnP approach to Phase A prototyping. A full solvePnP
implementation needs a camera intrinsics model and a canonical 3D face
model — out of scope for a dependency-free JVM module with only a handful
of landmark points. Instead, this module implements a concrete, testable
angle estimate:

1. `eyeMid` = midpoint of the two eye-outer-corner landmarks — a stable
   point roughly at eye level.
2. `R` = vector from `eyeMid` to the chin (the neutral, "straight down the
   face" reference direction).
3. `N` = vector from `eyeMid` to the nose tip.
4. Project both onto the **sagittal (y, z) plane** — vertical (image) and
   depth axes — since pitch (nodding) is a rotation about the horizontal
   axis and shows up as a y/z relationship change, not an x change.
5. `headPitchDegrees = atan2(N.z, N.y) − atan2(R.z, R.y)`, normalized to
   `(-180°, 180°]`.

In a neutral, camera-facing pose the nose tip lies roughly along the
eyeMid→chin line, so this is ≈0°. As the head pitches forward/down (nodding
off), the nose tip swings toward the camera relative to that reference
line, producing a **positive** angle — this module's sign convention:
**positive = downward/forward head pitch** (the direction relevant to
drowsy head-nod detection). This is hand-verifiable: e.g. with
`R = (y=-2, z=0)` (chin straight down) and `N = (y=-1, z=-1)` (nose tipped
forward by as much as it's offset downward), the formula gives exactly
**45°** — see `FeatureExtractionTest` for this and several other
hand-derived cases, including the `(-180°, 180°]` wraparound.

This is a simplified 2D-projection heuristic, not a calibrated 3D pose
estimate — it is directional and monotonic in the pitch-down direction,
which is what the state machine needs (a sustained *drift*, not an absolute
calibrated angle), but it has not been validated against real MediaPipe
output or ground truth. That validation is exactly Phase A/D work
(AI/ML PRD Section 13) once this is wired into a real camera pipeline.

## Rolling window (AI/ML PRD Section 4, "2-3 seconds, not frame-by-frame")

`RollingWindow` is a fixed-capacity circular buffer of `Double` samples with
`push`, `isFull`, `average`, `min`, `max`, `proportionBelow`/
`proportionAbove` (fraction of samples past a threshold — the "sustained,
not single-frame" signal), and `trend` (second-half average minus first-half
average, for "rising yawn rate" / "slow downward pitch drift" language in
the PRD). Capacity is expressed in **frames/samples**, not seconds — the
caller computes `capacity = targetSeconds * fps` for whatever frame rate the
real CameraX pipeline is actually sustaining.

## Default threshold values and rationale

All defaults live in `DetectionThresholds`, fully documented at each field.
Every one of these is an explicit **placeholder informed by the classic
EAR/MAR drowsiness-detection literature** (e.g. Soukupová & Čech), not yet
calibrated against AlertGuard's own data. AI/ML PRD Section 7 is explicit
that real thresholds must come from Section 6 calibration data (NTHU-DDD /
YawDD baseline first, then Lacoco pilot data) before shipping — this module
makes every threshold a constructor parameter specifically so that
recalibration is a data change, not a code change.

| Parameter | Default | Rationale |
|---|---|---|
| `windowSize` | 30 | 2s @ 15fps (or 3s @ 10fps) — the faster/lower end of the PRD's 2-3s target range, for a snappier response; Section 15 leaves "2 vs 3 seconds" explicitly open pending empirical tuning. |
| `earVibrationThreshold` | 0.20 | Classic EAR literature cites ~0.20-0.25 as a closed/near-closed eye threshold. Placeholder for Section 7's "10th percentile of alert EAR values" (needs calibration data). |
| `earCriticalThreshold` | 0.15 | A deeper EAR drop than vibration ("deeper/longer" per PRD Section 5), close to a fully-shut eye. |
| `earSustainedRatio` | 0.7 | 70% of the rolling window must sit below the EAR threshold — this is the direct implementation of "rolling window, not single-frame" (a single-frame dip is just a blink). |
| `marYawnThreshold` | 0.6 | A commonly cited yawn-detection MAR threshold, well above resting/speech MAR. |
| `marSustainedRatio` | 0.4 | Matches PRD's "MAR spike sustained over ~1-2 seconds" — a smaller fraction than EAR's, since a yawn is a brief spike within the window, not a sustained-for-the-whole-window state. |
| `headPitchDropThreshold` | 15.0° | A moderate downward-nod placeholder, in this module's own pitch-angle convention (see above) — not directly comparable to a real solvePnP pitch angle without recalibration once MediaPipe is wired in. |
| `pitchSustainedRatio` | 0.6 | Sustained downward drift, not a single-frame glance down. |

## The detection state machine (AI/ML PRD Section 5)

`DetectionEngine.process(landmarks, timestampMs)` implements:

```
NORMAL -> SOFT -> VIBRATION -> CRITICAL -> (back to NORMAL)
```

- **NORMAL → SOFT**: sustained yawn signal alone (PRD's stated example:
  "one signal mildly elevated, e.g. yawn rate rising").
- **SOFT → VIBRATION**: sustained EAR drop past `earVibrationThreshold`, OR
  two-or-more of {EAR, yawn, pitch} sustained-elevated together ("multiple
  signals elevated together") even if EAR alone hasn't crossed its
  threshold.
- **VIBRATION → CRITICAL**: sustained EAR drop past the deeper
  `earCriticalThreshold`, OR sustained EAR-vibration-level drop *together
  with* sustained head-pitch drop ("head-pitch drop + EAR drop together").
- **Any elevated tier → NORMAL**: only via a fully clean rolling window (all
  three windows full, nothing elevated) or `acknowledge()` — never a
  gradual one-tier-at-a-time step down, matching the PRD diagram's single
  "back to NORMAL" arrow.
- **Staying put**: if neither an escalation nor the full clean-window
  de-escalation condition holds, the state is unchanged (only the
  timestamp advances).

**Deliberate safety choice — direct multi-tier escalation.** Signals are
evaluated for the severity tier they *imply on their own* each call, and if
that's more severe than the current tier, the engine jumps there directly
in a single `process()` call — it does not force a walk through SOFT then
VIBRATION before a genuinely critical reading (e.g. eyes closed for a whole
window from a standing start) can raise CRITICAL. AI/ML PRD Section 8 sets
`critical`-event recall "as close to 100% as achievable" and a latency
target "under 1 second from sustained-threshold-crossing" — forcing
multi-frame tier-walking would work directly against both.

`acknowledge(timestampMs)` models the driver's "I'm OK" button (Frontend
PRD Section 5.4): it returns the engine to NORMAL immediately and **clears
all rolling windows**, so the same sustained-bad signal that just triggered
the alert can't instantly re-trigger it before fresh history accumulates.

Every transition path, the "stay" case, multiple threshold-boundary values
(exactly-at / just-under / just-over), and several window-composition edge
cases (e.g. a signal that can never accumulate enough history to
de-escalate) are covered in `DetectionEngineTest`.

## Integration plan (for the real Android app, later)

This module is designed to be dropped in as a Gradle module dependency:

1. **As a Gradle module**: in the real multi-module Android project, this
   directory becomes e.g. `:detection-engine` (add
   `include(":detection-engine")` to the app's root `settings.gradle.kts`,
   and `implementation(project(":detection-engine"))` in the `app` module's
   `build.gradle.kts`). No changes needed to this module's own build file
   for that — a plain Kotlin/JVM library is a valid dependency of an Android
   module.
2. **MediaPipe adapter**: a small adapter class in the `app` module (NOT in
   this module) converts MediaPipe's `NormalizedLandmarkList` (468 points)
   into this module's `FaceLandmarks` by picking out the specific ~20
   landmark indices needed (6 per eye, 8 for the mouth, nose tip, chin, 2
   eye-outer-corners) and wrapping each in `Point3D(x, y, z)`. This keeps
   all MediaPipe-specific index knowledge in the app layer, out of the
   pure-logic module.
3. **StateFlow wrapper**: also in the `app` module (this module stays
   coroutines-free on purpose), something like:
   ```kotlin
   class DetectionRepository(
       private val engine: DetectionEngine = DetectionEngine()
   ) {
       private val _state = MutableStateFlow(DetectionState.initial())
       val state: StateFlow<DetectionState> = _state.asStateFlow()

       // called from the CameraX ImageAnalysis callback, off the UI thread
       fun onFrame(landmarks: FaceLandmarks, timestampMs: Long) {
           _state.value = engine.process(landmarks, timestampMs)
       }

       fun onAcknowledge(timestampMs: Long) {
           _state.value = engine.acknowledge(timestampMs)
       }
   }
   ```
   `ActiveTripViewModel` (Frontend PRD Section 6) collects `state`, drives
   Room writes / haptics / audio / the Compose status ring, and calls
   `onAcknowledge` from the "I'm OK" button.
4. **Threshold recalibration**: once Section 6 calibration data exists,
   only `DetectionThresholds`'s constructor arguments need to change (e.g.
   loaded from a remote-config/versioned-threshold source per AI/ML PRD
   Section 7's "should be versioned, evaluated, and updated" guidance) — no
   state-machine logic changes required.

## Coverage achieved

```
./gradlew clean test jacocoTestReport jacocoTestCoverageVerification
```

- **69 tests, all passing**
- **100% line coverage** (0 of 184 lines missed)
- **100% branch coverage** (0 of 124 branches missed)
- `jacocoTestCoverageVerification`'s 100%-line / 100%-branch rule (wired
  into `check`) passes — the build fails if coverage regresses below 100%.
