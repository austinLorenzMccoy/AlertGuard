package com.alertguard.detection

/**
 * The four detection-state-machine tiers from AI/ML PRD Section 5, in
 * escalation order (each ordinal is strictly more severe than the last —
 * [DetectionEngine] relies on this ordering to decide "is this an
 * escalation?").
 */
enum class Severity {
    NORMAL,
    SOFT,
    VIBRATION,
    CRITICAL
}

/**
 * What most recently drove a state transition (or non-transition) — useful
 * for UI/analytics to explain *why* the ring turned amber/red, and for
 * [DetectionEngine.acknowledge] to leave an explicit audit trail.
 */
enum class EventType {
    /** No transition has happened yet (initial state). */
    NONE,
    /** A mildly elevated yawn signal moved NORMAL -> SOFT. */
    YAWN_ELEVATED,
    /** A sustained EAR drop past `earVibrationThreshold` drove the tier. */
    EAR_VIBRATION,
    /** Two or more signals elevated together (without a deep EAR drop) drove the tier. */
    MULTI_SIGNAL_ELEVATED,
    /** A sustained, deeper EAR drop past `earCriticalThreshold` drove CRITICAL. */
    EAR_CRITICAL,
    /** Sustained EAR drop + sustained head-pitch drop together drove CRITICAL. */
    EAR_HEAD_PITCH_COMBINED,
    /** A fully clean rolling window returned the engine to NORMAL. */
    CLEAN_WINDOW,
    /** The driver's "I'm OK" acknowledgment returned the engine to NORMAL. */
    ACKNOWLEDGED
}

/**
 * The detection engine's output snapshot.
 *
 * This is the exact seam the Frontend PRD (Section 6) wires into
 * `StateFlow<DetectionState>`: this module intentionally does NOT depend on
 * kotlinx.coroutines (stdlib-only, per the task constraint), so the real
 * Android app wraps [DetectionEngine.process]'s return value with something
 * like:
 * ```
 * private val _state = MutableStateFlow(DetectionState.initial())
 * val state: StateFlow<DetectionState> = _state.asStateFlow()
 * // on each CameraX/MediaPipe frame:
 * _state.value = engine.process(landmarks, timestampMs)
 * ```
 * See README "Integration plan" for the full wiring sketch.
 *
 * @param severity Current state-machine tier.
 * @param confidenceLevel A coarse `0.0..1.0` proxy for how confident the
 *   engine is that this severity reading is real, derived deterministically
 *   from [severity] (`severity.ordinal / (Severity.entries.size - 1)`) — NOT
 *   a calibrated probability. A v1.1 learned classifier (AI/ML PRD Section
 *   9) would replace this with a real model confidence; until then this is
 *   just a monotonic proxy a Compose UI can use directly for e.g. ring
 *   opacity.
 * @param lastEventType What most recently drove the state (see [EventType]).
 * @param timestampMs The timestamp (caller-supplied, e.g. frame capture
 *   time in epoch millis) this state reflects.
 */
data class DetectionState(
    val severity: Severity,
    val confidenceLevel: Double,
    val lastEventType: EventType,
    val timestampMs: Long
) {
    companion object {
        /** The engine's state before any frames have been processed. */
        fun initial(timestampMs: Long = 0L): DetectionState =
            DetectionState(
                severity = Severity.NORMAL,
                confidenceLevel = confidenceFor(Severity.NORMAL),
                lastEventType = EventType.NONE,
                timestampMs = timestampMs
            )

        /** Deterministic severity -> confidence mapping (see class doc). */
        fun confidenceFor(severity: Severity): Double =
            severity.ordinal.toDouble() / (Severity.entries.size - 1)
    }
}
