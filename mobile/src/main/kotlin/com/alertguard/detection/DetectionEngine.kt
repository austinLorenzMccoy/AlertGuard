package com.alertguard.detection

/**
 * The detection state machine from AI/ML PRD Section 5:
 *
 * ```
 * NORMAL -> SOFT -> VIBRATION -> CRITICAL -> (back to NORMAL)
 * ```
 *
 * This class is the single integration point the Frontend PRD (Section 6)
 * describes as "Detection engine (Kotlin, background thread)... computes
 * EAR, mouth aspect ratio, head pitch - rolling window, not single-frame"
 * feeding a `StateFlow<DetectionState>`. See [DetectionState] for the exact
 * StateFlow wiring sketch and README "Integration plan" for the full
 * picture — this module itself has zero Android/coroutines dependencies.
 *
 * ## Transition design
 * Per call to [process], this engine:
 * 1. Extracts EAR/MAR/head-pitch for the frame (skipping degenerate/NaN
 *    features rather than corrupting the rolling windows with them — see
 *    [FeatureExtraction]).
 * 2. Pushes valid features into their respective [RollingWindow]s.
 * 3. Evaluates four boolean "sustained signal" flags from the windows'
 *    current contents (each requires its window to be [RollingWindow.isFull]
 *    — i.e. we never escalate on partial/insufficient history):
 *    - `earVibration`: EAR sustained below `earVibrationThreshold`
 *    - `earCritical`: EAR sustained below the deeper `earCriticalThreshold`
 *    - `yawnElevated`: MAR sustained above `marYawnThreshold`
 *    - `pitchElevated`: head pitch sustained above `headPitchDropThreshold`
 * 4. Computes the severity tier those signals *imply* on their own
 *    (`targetSeverity`), independent of the current state:
 *    - `earCritical` alone -> CRITICAL
 *    - `earVibration` + `pitchElevated` together -> CRITICAL (PRD: "head-pitch
 *      drop + EAR drop together")
 *    - `earVibration` alone -> VIBRATION
 *    - two or more of {earVibration, yawnElevated, pitchElevated} elevated
 *      together (without a deep-enough EAR drop to already be VIBRATION on
 *      its own) -> VIBRATION (PRD: "multiple signals elevated together")
 *    - `yawnElevated` alone -> SOFT (PRD's example of the one-signal SOFT
 *      trigger: "one signal mildly elevated (e.g., yawn rate rising)")
 *    - none of the above -> NORMAL
 * 5. **Escalation** happens immediately, in a single [process] call, if
 *    `targetSeverity` is more severe than the current tier — including
 *    jumping more than one tier at once (e.g. NORMAL straight to CRITICAL on
 *    a single very-bad window). This is a deliberate safety choice: AI/ML
 *    PRD Section 8 sets recall on `critical` events "as close to 100% as
 *    achievable" and a latency target "under 1 second from sustained-
 *    threshold-crossing" — forcing a multi-frame walk through SOFT and
 *    VIBRATION before a genuinely critical reading can raise an alert would
 *    directly work against both of those targets.
 * 6. **De-escalation** back to NORMAL only happens via a fully clean rolling
 *    window (all three windows full, none of the four signals elevated) or
 *    via [acknowledge] — never a partial step down one tier at a time. This
 *    matches the PRD state diagram literally: the only arrow leaving
 *    CRITICAL/any elevated tier goes straight back to NORMAL, gated on "a
 *    clean rolling window, or driver acknowledgment".
 * 7. If neither an escalation nor a de-escalation condition holds, the
 *    engine stays in its current tier (state persists, only the timestamp
 *    updates).
 *
 * All thresholds are configurable via [thresholds]; see [DetectionThresholds]
 * for documented defaults.
 */
class DetectionEngine(private val thresholds: DetectionThresholds = DetectionThresholds()) {

    private val earWindow = RollingWindow(thresholds.windowSize)
    private val marWindow = RollingWindow(thresholds.windowSize)
    private val pitchWindow = RollingWindow(thresholds.windowSize)

    /** The engine's current output; also returned by [process]/[acknowledge]. */
    var state: DetectionState = DetectionState.initial()
        private set

    /**
     * Process one frame's worth of landmarks and advance the state machine.
     * Safe to call from a dedicated background thread per Frontend PRD
     * Section 6 / AI/ML PRD Section 10 ("Background thread isolation").
     */
    fun process(landmarks: FaceLandmarks, timestampMs: Long): DetectionState {
        val ear = FeatureExtraction.computeEAR(landmarks)
        val mar = FeatureExtraction.computeMAR(landmarks)
        val pitch = FeatureExtraction.computeHeadPitch(landmarks)

        if (!ear.isNaN()) earWindow.push(ear)
        if (!mar.isNaN()) marWindow.push(mar)
        if (!pitch.isNaN()) pitchWindow.push(pitch)

        val earVibration = earWindow.isFull &&
            earWindow.proportionBelow(thresholds.earVibrationThreshold) >= thresholds.earSustainedRatio
        val earCritical = earWindow.isFull &&
            earWindow.proportionBelow(thresholds.earCriticalThreshold) >= thresholds.earSustainedRatio
        val yawnElevated = marWindow.isFull &&
            marWindow.proportionAbove(thresholds.marYawnThreshold) >= thresholds.marSustainedRatio
        val pitchElevated = pitchWindow.isFull &&
            pitchWindow.proportionAbove(thresholds.headPitchDropThreshold) >= thresholds.pitchSustainedRatio

        val elevatedCount = listOf(earVibration, yawnElevated, pitchElevated).count { it }

        val (targetSeverity, targetEvent) = when {
            earCritical -> Severity.CRITICAL to EventType.EAR_CRITICAL
            earVibration && pitchElevated -> Severity.CRITICAL to EventType.EAR_HEAD_PITCH_COMBINED
            earVibration -> Severity.VIBRATION to EventType.EAR_VIBRATION
            elevatedCount >= 2 -> Severity.VIBRATION to EventType.MULTI_SIGNAL_ELEVATED
            yawnElevated -> Severity.SOFT to EventType.YAWN_ELEVATED
            else -> Severity.NORMAL to EventType.NONE
        }

        val cleanWindow = earWindow.isFull && marWindow.isFull && pitchWindow.isFull &&
            !earVibration && !yawnElevated && !pitchElevated

        val newState = when {
            state.severity != Severity.NORMAL && cleanWindow ->
                DetectionState(Severity.NORMAL, DetectionState.confidenceFor(Severity.NORMAL), EventType.CLEAN_WINDOW, timestampMs)
            targetSeverity.ordinal > state.severity.ordinal ->
                DetectionState(targetSeverity, DetectionState.confidenceFor(targetSeverity), targetEvent, timestampMs)
            else ->
                state.copy(timestampMs = timestampMs)
        }

        state = newState
        return state
    }

    /**
     * Models the driver's "I'm OK" acknowledgment (Frontend PRD Section 5.4:
     * the Active-trip screen's button on a `critical`-severity alert).
     * Immediately returns the engine to NORMAL and clears all rolling
     * windows — a deliberate choice so that the same sustained-bad signal
     * that just triggered the alert doesn't instantly re-trigger it on the
     * very next frame before fresh history accumulates.
     *
     * If the engine is already NORMAL, this is a no-op aside from the
     * timestamp (there is nothing to acknowledge).
     */
    fun acknowledge(timestampMs: Long): DetectionState {
        state = if (state.severity != Severity.NORMAL) {
            earWindow.clear()
            marWindow.clear()
            pitchWindow.clear()
            DetectionState(Severity.NORMAL, DetectionState.confidenceFor(Severity.NORMAL), EventType.ACKNOWLEDGED, timestampMs)
        } else {
            state.copy(timestampMs = timestampMs)
        }
        return state
    }
}
