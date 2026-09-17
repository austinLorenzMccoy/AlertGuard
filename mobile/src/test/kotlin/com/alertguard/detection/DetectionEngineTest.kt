package com.alertguard.detection

import com.alertguard.detection.geometry.Point3D
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Covers every transition arrow in AI/ML PRD Section 5's state diagram, plus
 * the "stay" (non-transition) case and EAR threshold boundary values.
 *
 * All tests use a small, explicit [testThresholds] (window = 4 samples,
 * sustained-ratio = 0.75, i.e. >=3 of 4 samples) so each scenario can be
 * built from an exact, hand-countable sequence of frames rather than
 * hundreds of frames at production-scale window sizes.
 */
class DetectionEngineTest {

    private val testThresholds = DetectionThresholds(
        windowSize = 4,
        earVibrationThreshold = 0.20,
        earCriticalThreshold = 0.10,
        earSustainedRatio = 0.75,
        marYawnThreshold = 0.5,
        marSustainedRatio = 0.75,
        headPitchDropThreshold = 15.0,
        pitchSustainedRatio = 0.75
    )

    /** Feeds [face] into [engine] [times] times, returning the final state. */
    private fun feed(engine: DetectionEngine, face: FaceLandmarks, times: Int, startMs: Long = 0L): DetectionState {
        var last = engine.state
        for (i in 0 until times) {
            last = engine.process(face, startMs + i * 100L)
        }
        return last
    }

    // --- Construction ---------------------------------------------------------

    @Test
    fun `engine can be constructed with default thresholds`() {
        val engine = DetectionEngine()
        val state = engine.process(TestFixtures.neutralFace(), 0L)
        assertEquals(Severity.NORMAL, state.severity)
    }

    // --- Warm-up / insufficient-data behavior -----------------------------

    @Test
    fun `engine does not escalate while the rolling window is not yet full`() {
        val engine = DetectionEngine(testThresholds)
        // Only 3 of the 4 required yawning frames.
        val state = feed(engine, TestFixtures.faceWithMar(0.6), times = 3)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.NONE, state.lastEventType)
    }

    // --- NORMAL -> SOFT -----------------------------------------------------

    @Test
    fun `NORMAL to SOFT on a sustained rising yawn signal alone`() {
        val engine = DetectionEngine(testThresholds)
        val state = feed(engine, TestFixtures.faceWithMar(0.6), times = 4)
        assertEquals(Severity.SOFT, state.severity)
        assertEquals(EventType.YAWN_ELEVATED, state.lastEventType)
    }

    @Test
    fun `signal present but not sustained enough (below ratio) does not cross into SOFT`() {
        val engine = DetectionEngine(testThresholds)
        // 2 of 4 yawning, 2 of 4 normal mouth -> only 50% elevated, ratio needs 75%.
        engine.process(TestFixtures.faceWithMar(0.6), 0L)
        engine.process(TestFixtures.neutralFace(), 100L)
        engine.process(TestFixtures.faceWithMar(0.6), 200L)
        val state = engine.process(TestFixtures.neutralFace(), 300L)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.NONE, state.lastEventType)
    }

    // --- SOFT -> VIBRATION ---------------------------------------------------

    @Test
    fun `SOFT to VIBRATION on a sustained EAR drop past threshold_1`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4) // -> SOFT
        assertEquals(Severity.SOFT, engine.state.severity)

        // EAR 0.18 is below earVibrationThreshold (0.20) but above earCriticalThreshold (0.10).
        val state = feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L)
        assertEquals(Severity.VIBRATION, state.severity)
        assertEquals(EventType.EAR_VIBRATION, state.lastEventType)
    }

    @Test
    fun `SOFT to VIBRATION via multiple signals elevated together (yawn plus head pitch, EAR normal)`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4) // -> SOFT
        assertEquals(Severity.SOFT, engine.state.severity)

        // Still yawning AND now pitched down, but EAR stays fully normal (0.3, never below 0.20).
        val combined = TestFixtures.neutralFace().copy(
            mouth = TestFixtures.yawnMouth(),
            noseTip = TestFixtures.headDownFace().noseTip
        )
        val state = feed(engine, combined, times = 4, startMs = 400L)
        assertEquals(Severity.VIBRATION, state.severity)
        assertEquals(EventType.MULTI_SIGNAL_ELEVATED, state.lastEventType)
    }

    // --- VIBRATION -> CRITICAL -----------------------------------------------

    @Test
    fun `VIBRATION to CRITICAL on a deeper sustained EAR drop past threshold_2`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)              // -> SOFT
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L) // -> VIBRATION
        assertEquals(Severity.VIBRATION, engine.state.severity)

        // EAR 0.05 is below both earVibrationThreshold and earCriticalThreshold.
        val state = feed(engine, TestFixtures.faceWithEar(0.05), times = 4, startMs = 800L)
        assertEquals(Severity.CRITICAL, state.severity)
        assertEquals(EventType.EAR_CRITICAL, state.lastEventType)
    }

    @Test
    fun `VIBRATION to CRITICAL via head-pitch drop plus EAR drop together`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)              // -> SOFT
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L) // -> VIBRATION
        assertEquals(Severity.VIBRATION, engine.state.severity)

        // EAR only crosses threshold_1 (0.18, not deep enough for earCritical alone),
        // but head pitch is also sustained-elevated -> combined critical path.
        val state = feed(engine, TestFixtures.faceWithEarAndHeadDown(0.18), times = 4, startMs = 800L)
        assertEquals(Severity.CRITICAL, state.severity)
        assertEquals(EventType.EAR_HEAD_PITCH_COMBINED, state.lastEventType)
    }

    @Test
    fun `NORMAL can jump directly to CRITICAL on a single very-bad window (safety, low latency)`() {
        // Deliberate design choice documented on DetectionEngine: escalation
        // is not forced to walk through every intermediate tier one frame at
        // a time, since that would cost latency on a genuinely critical event.
        val engine = DetectionEngine(testThresholds)
        val state = feed(engine, TestFixtures.faceWithEar(0.05), times = 4)
        assertEquals(Severity.CRITICAL, state.severity)
        assertEquals(EventType.EAR_CRITICAL, state.lastEventType)
    }

    // --- CRITICAL -> NORMAL ---------------------------------------------------

    @Test
    fun `CRITICAL to NORMAL after a clean rolling window`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L)
        feed(engine, TestFixtures.faceWithEar(0.05), times = 4, startMs = 800L)
        assertEquals(Severity.CRITICAL, engine.state.severity)

        val state = feed(engine, TestFixtures.neutralFace(), times = 4, startMs = 1200L)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.CLEAN_WINDOW, state.lastEventType)
    }

    @Test
    fun `CRITICAL to NORMAL via explicit driver acknowledgment`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L)
        feed(engine, TestFixtures.faceWithEar(0.05), times = 4, startMs = 800L)
        assertEquals(Severity.CRITICAL, engine.state.severity)

        val state = engine.acknowledge(1300L)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.ACKNOWLEDGED, state.lastEventType)
        assertEquals(1300L, state.timestampMs)
        assertEquals(0.0, state.confidenceLevel, 1e-9)
    }

    @Test
    fun `acknowledge clears the rolling windows so the same bad signal does not instantly re-trigger`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L)
        feed(engine, TestFixtures.faceWithEar(0.05), times = 4, startMs = 800L)
        assertEquals(Severity.CRITICAL, engine.state.severity)

        engine.acknowledge(1300L)

        // Only 3 more critical-EAR frames post-acknowledge: window was cleared,
        // so it isn't full yet and must not immediately escalate again.
        val state = feed(engine, TestFixtures.faceWithEar(0.05), times = 3, startMs = 1400L)
        assertEquals(Severity.NORMAL, state.severity)
    }

    @Test
    fun `acknowledge while already NORMAL is a no-op aside from the timestamp`() {
        val engine = DetectionEngine(testThresholds)
        val state = engine.acknowledge(999L)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.NONE, state.lastEventType)
        assertEquals(999L, state.timestampMs)
    }

    // --- Staying in a state ---------------------------------------------------

    @Test
    fun `stays in VIBRATION when a brief critical-level dip is not sustained enough to escalate`() {
        val engine = DetectionEngine(testThresholds)
        feed(engine, TestFixtures.faceWithMar(0.6), times = 4)
        feed(engine, TestFixtures.faceWithEar(0.18), times = 4, startMs = 400L)
        assertEquals(Severity.VIBRATION, engine.state.severity)
        assertEquals(EventType.EAR_VIBRATION, engine.state.lastEventType)

        // 1 of 4 frames critical-deep (0.05), 3 of 4 only vibration-deep (0.18):
        // earCritical ratio = 0.25 < 0.75 required, so it must NOT escalate to CRITICAL.
        // earVibration ratio = 1.0 (all four are still below 0.20) so it also must NOT
        // fall back to NORMAL (not a clean window) -> stays VIBRATION.
        engine.process(TestFixtures.faceWithEar(0.05), 800L)
        engine.process(TestFixtures.faceWithEar(0.18), 900L)
        engine.process(TestFixtures.faceWithEar(0.18), 1000L)
        val state = engine.process(TestFixtures.faceWithEar(0.18), 1100L)

        assertEquals(Severity.VIBRATION, state.severity)
        assertEquals(EventType.EAR_VIBRATION, state.lastEventType)
        assertEquals(1100L, state.timestampMs)
    }

    @Test
    fun `sustained head-pitch drift alone (no yawn, no EAR drop) does not escalate past NORMAL`() {
        // Per this engine's documented design, PITCH is only ever a combining
        // signal (paired with EAR for CRITICAL, or with another signal for the
        // "multiple signals elevated" VIBRATION path) or a "multiple signals"
        // contributor -- it never triggers SOFT/VIBRATION on its own, unlike
        // yawn (PRD's stated SOFT example).
        val engine = DetectionEngine(testThresholds)
        val pitchOnly = TestFixtures.headDownFace() // EAR normal, MAR normal, pitch 45 degrees
        val state = feed(engine, pitchOnly, times = 4)
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.NONE, state.lastEventType)
    }

    @Test
    fun `cleanWindow requires the MAR window to be full too, not just the EAR window`() {
        // Frame 1 has a degenerate (NaN) mouth reading, which is skipped rather
        // than pushed -- so after 4 frames the EAR window is full but the MAR
        // window (which only received 3 valid pushes) is not, and no
        // NORMAL-state decision should depend on an incomplete MAR history.
        val engine = DetectionEngine(testThresholds)
        engine.process(TestFixtures.neutralFace().copy(mouth = TestFixtures.degenerateMouth()), 0L)
        engine.process(TestFixtures.neutralFace(), 100L)
        engine.process(TestFixtures.neutralFace(), 200L)
        val state = engine.process(TestFixtures.neutralFace(), 300L)

        assertEquals(Severity.NORMAL, state.severity)
    }

    @Test
    fun `an elevated state cannot clean-window de-escalate while the pitch window never fills`() {
        // If head-pitch data never becomes available (e.g. a persistently
        // degenerate/NaN pitch reading), the pitch window never reaches
        // isFull, so the "clean rolling window" de-escalation path -- which
        // requires ALL THREE windows to be full -- can never fire, even once
        // EAR and MAR both look perfectly normal. The engine stays at its
        // last escalated tier until acknowledge() is called.
        val degenerateChin = Point3D(5.0, 0.0, 0.0) // same y,z as eyeMid -> NaN pitch, always

        val engine = DetectionEngine(testThresholds)
        val vibrationFace = TestFixtures.faceWithEar(0.18).copy(chin = degenerateChin)
        feed(engine, vibrationFace, times = 4) // -> VIBRATION via EAR alone; pitch window stays empty
        assertEquals(Severity.VIBRATION, engine.state.severity)

        val normalFace = TestFixtures.neutralFace().copy(chin = degenerateChin)
        val state = feed(engine, normalFace, times = 4, startMs = 400L)

        assertEquals(Severity.VIBRATION, state.severity) // did NOT clean-window de-escalate
    }

    // --- EAR threshold boundary values (exactly at / just under / just over) --

    @Test
    fun `EAR exactly at earVibrationThreshold does not count as sustained-below (strict comparison)`() {
        val engine = DetectionEngine(testThresholds)
        val state = feed(engine, TestFixtures.faceWithEar(0.20), times = 4)
        assertEquals(Severity.NORMAL, state.severity)
    }

    @Test
    fun `EAR just under earVibrationThreshold does trigger sustained-below escalation`() {
        val engine = DetectionEngine(testThresholds)
        val state = feed(engine, TestFixtures.faceWithEar(0.20 - 1e-6), times = 4)
        assertEquals(Severity.VIBRATION, state.severity)
        assertEquals(EventType.EAR_VIBRATION, state.lastEventType)
    }

    @Test
    fun `EAR just over earVibrationThreshold stays NORMAL`() {
        val engine = DetectionEngine(testThresholds)
        val state = feed(engine, TestFixtures.faceWithEar(0.20 + 1e-6), times = 4)
        assertEquals(Severity.NORMAL, state.severity)
    }

    // --- Degenerate-input robustness ------------------------------------------

    @Test
    fun `degenerate (NaN) EAR frames are skipped and never fill the EAR window, but other signals still work`() {
        val engine = DetectionEngine(testThresholds)
        val degenerateEyesButYawning = TestFixtures.neutralFace().copy(
            leftEye = TestFixtures.degenerateEye(),
            rightEye = TestFixtures.degenerateEye(),
            mouth = TestFixtures.yawnMouth()
        )
        // Feed well beyond the window capacity; EAR should never accumulate.
        val state = feed(engine, degenerateEyesButYawning, times = 10)
        assertEquals(Severity.SOFT, state.severity)
        assertEquals(EventType.YAWN_ELEVATED, state.lastEventType)
    }

    @Test
    fun `process never throws on fully degenerate landmarks`() {
        val engine = DetectionEngine(testThresholds)
        val allDegenerate = FaceLandmarks(
            leftEye = TestFixtures.degenerateEye(),
            rightEye = TestFixtures.degenerateEye(),
            mouth = TestFixtures.degenerateMouth(),
            noseTip = TestFixtures.neutralFace().leftEyeOuterCorner,
            chin = TestFixtures.neutralFace().leftEyeOuterCorner,
            leftEyeOuterCorner = TestFixtures.neutralFace().leftEyeOuterCorner,
            rightEyeOuterCorner = TestFixtures.neutralFace().rightEyeOuterCorner
        )
        val state = engine.process(allDegenerate, 0L)
        assertEquals(Severity.NORMAL, state.severity)
        assertTrue(true) // reaching here means no exception was thrown
    }
}
