package com.alertguard.detection

/**
 * All tunable knobs for [DetectionEngine], collected in one place per the
 * task's "no magic numbers inline" requirement. Every default below is a
 * documented **placeholder** informed by the classic EAR/MAR drowsiness-
 * detection literature (Soukupová & Čech and similar), not yet calibrated
 * against AlertGuard's own data — AI/ML PRD Section 7 is explicit that real
 * thresholds must come from calibration against Section 6 data (NTHU-DDD/
 * YawDD baseline, then Lacoco pilot data) before shipping. See README
 * "Default threshold values and rationale" for the full explanation per
 * field.
 *
 * @param windowSize Rolling-window size in **frames/samples**, not seconds.
 *   AI/ML PRD Section 4 targets a 2-3 second window; at the Frontend PRD's
 *   target 10-15 fps capture rate, `windowSize = fps * seconds`. Default 30
 *   corresponds to 2s @ 15fps (or 3s @ 10fps) — the lower/faster end of the
 *   PRD's target range, chosen for a snappier response since Section 15's
 *   "2 vs 3 seconds" question is explicitly left open pending empirical
 *   tuning. Callers targeting a different frame rate should compute their
 *   own `windowSize` accordingly.
 * @param earVibrationThreshold Average-EAR level below which eyes are
 *   considered meaningfully more closed than a normal open-eye baseline.
 *   Classic EAR literature commonly cites ~0.2-0.25 as a closed/near-closed
 *   eye threshold; 0.20 is used as the placeholder "vibration"-tier trigger
 *   (AI/ML PRD Section 7: "10th percentile of alert EAR values" once
 *   calibration data exists).
 * @param earCriticalThreshold A deeper EAR drop than [earVibrationThreshold],
 *   for the `critical` tier (PRD: "deeper/longer than vibration"). 0.15 is
 *   comfortably below typical open-eye EAR and close to a fully-shut eye.
 * @param earSustainedRatio Fraction of the EAR rolling window that must sit
 *   below a given EAR threshold for that threshold to count as "sustained"
 *   rather than a single-frame blink — this is the module's direct
 *   implementation of the PRD's "rolling window, not single-frame" principle
 *   (Section 4/5). Default 0.7 (70% of the window).
 * @param marYawnThreshold MAR level above which the mouth is considered
 *   yawn-open. 0.6 is a commonly cited yawn-detection MAR threshold in the
 *   literature (well above normal speech/resting MAR).
 * @param marSustainedRatio Fraction of the MAR window that must sit above
 *   [marYawnThreshold] to count as a sustained yawn-like signal (PRD: "MAR
 *   spike sustained over ~1-2 seconds"). Default 0.4.
 * @param headPitchDropThreshold Degrees of downward head-pitch drift (this
 *   module's sign convention: positive = downward/forward, see
 *   [FeatureExtraction.computeHeadPitch]) above which the head is considered
 *   meaningfully drooped. 15.0 degrees as a moderate-nod placeholder.
 * @param pitchSustainedRatio Fraction of the pitch window that must sit
 *   above [headPitchDropThreshold] to count as sustained pitch drift.
 *   Default 0.6.
 */
data class DetectionThresholds(
    val windowSize: Int = 30,
    val earVibrationThreshold: Double = 0.20,
    val earCriticalThreshold: Double = 0.15,
    val earSustainedRatio: Double = 0.7,
    val marYawnThreshold: Double = 0.6,
    val marSustainedRatio: Double = 0.4,
    val headPitchDropThreshold: Double = 15.0,
    val pitchSustainedRatio: Double = 0.6
) {
    init {
        require(windowSize > 0) { "windowSize must be positive" }
        require(earCriticalThreshold <= earVibrationThreshold) {
            "earCriticalThreshold ($earCriticalThreshold) must be <= earVibrationThreshold " +
                "($earVibrationThreshold) — critical is a deeper EAR drop than vibration"
        }
        require(earSustainedRatio in 0.0..1.0) { "earSustainedRatio must be in [0,1]" }
        require(marSustainedRatio in 0.0..1.0) { "marSustainedRatio must be in [0,1]" }
        require(pitchSustainedRatio in 0.0..1.0) { "pitchSustainedRatio must be in [0,1]" }
    }
}
