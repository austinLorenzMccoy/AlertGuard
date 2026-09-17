package com.alertguard.detection

import com.alertguard.detection.geometry.Point3D
import kotlin.math.atan2

/**
 * Per-frame feature extraction from [FaceLandmarks], implementing the exact
 * formulas from AI/ML PRD Section 4.
 *
 * ## Degenerate-input policy
 * All three functions can be handed degenerate landmark sets (e.g. two
 * landmarks collapsed onto the same point, which happens if an upstream
 * MediaPipe adapter bug or an occluded/low-confidence frame produces
 * duplicate coordinates). Rather than throwing `ArithmeticException` or
 * silently returning a misleading `Infinity`/division artifact, every
 * function here returns [Double.NaN] when its formula's denominator is too
 * close to zero to be meaningful ([EPSILON]). `NaN` is a deliberate, testable
 * sentinel: it is never a value a valid geometric ratio can produce, so
 * downstream code (see [RollingWindow] / [DetectionEngine]) can reliably
 * detect "this frame's measurement is invalid" via `value.isNaN()` and skip
 * it, rather than accidentally treating a corrupted 0.0 or Infinity as a real
 * reading.
 */
object FeatureExtraction {

    /** Distances below this are treated as "the same point" (degenerate). */
    const val EPSILON: Double = 1e-9

    /**
     * Eye Aspect Ratio for a single eye:
     * `EAR = (‖p2-p6‖ + ‖p3-p5‖) / (2 × ‖p1-p4‖)`
     *
     * Returns [Double.NaN] if `‖p1-p4‖` (the horizontal eye-corner distance)
     * is degenerate (< [EPSILON]) — this formula is undefined when the eye
     * has zero measured width.
     */
    fun eyeAspectRatio(eye: EyeLandmarks): Double {
        val horizontal = eye.p1.distanceTo(eye.p4)
        if (horizontal < EPSILON) return Double.NaN
        val vertical = eye.p2.distanceTo(eye.p6) + eye.p3.distanceTo(eye.p5)
        return vertical / (2.0 * horizontal)
    }

    /**
     * Eye Aspect Ratio averaged over both eyes, per AI/ML PRD Section 4
     * ("using the 6 landmarks around each eye (average of left/right)").
     *
     * Degenerate-eye fallback: if exactly one eye's EAR is degenerate (NaN)
     * — e.g. one eye occluded by glare or a partial view angle — this
     * returns the other eye's EAR rather than propagating NaN, so a single
     * bad eye reading doesn't blind the whole-frame signal. If both eyes are
     * degenerate, returns [Double.NaN].
     */
    fun computeEAR(landmarks: FaceLandmarks): Double {
        val left = eyeAspectRatio(landmarks.leftEye)
        val right = eyeAspectRatio(landmarks.rightEye)
        return when {
            !left.isNaN() && !right.isNaN() -> (left + right) / 2.0
            !left.isNaN() -> left
            !right.isNaN() -> right
            else -> Double.NaN
        }
    }

    /**
     * Mouth Aspect Ratio:
     * `MAR = (‖p2-p8‖ + ‖p3-p7‖ + ‖p4-p6‖) / (2 × ‖p1-p5‖)`
     *
     * Returns [Double.NaN] if `‖p1-p5‖` (mouth corner-to-corner width) is
     * degenerate (< [EPSILON]).
     */
    fun computeMAR(landmarks: FaceLandmarks): Double {
        val mouth = landmarks.mouth
        val horizontal = mouth.p1.distanceTo(mouth.p5)
        if (horizontal < EPSILON) return Double.NaN
        val vertical = mouth.p2.distanceTo(mouth.p8) +
            mouth.p3.distanceTo(mouth.p7) +
            mouth.p4.distanceTo(mouth.p6)
        return vertical / (2.0 * horizontal)
    }

    /**
     * Simplified head-pitch estimate, in degrees, from nose tip / eye
     * corners / chin — AI/ML PRD Section 4 explicitly leaves the exact
     * method open ("simplified 3D head-pose estimation... or MediaPipe's
     * built-in pose transform matrix where available"), so this is a
     * deliberate, documented design choice rather than an attempt at a full
     * solvePnP implementation (out of scope for a dependency-free JVM
     * module — see README "Head-pitch formula design decision").
     *
     * ### Method
     * 1. Take `eyeMid`, the midpoint of the two eye-outer-corner landmarks,
     *    as a stable reference point roughly at eye level.
     * 2. Build two vectors from `eyeMid`: the "reference" vector `R` to the
     *    chin (the neutral, camera-facing downward direction of the face),
     *    and the "nose" vector `N` to the nose tip.
     * 3. Project both vectors onto the sagittal (y, z) plane — vertical
     *    (image-plane) and depth axes — since pitch (nodding down/up) is a
     *    rotation about the horizontal (x) axis and shows up as a change in
     *    the y/z relationship between the nose tip and the eye→chin
     *    reference line, not in x.
     * 4. The head-pitch angle is the signed angle between `N` and `R` in
     *    that plane: `atan2(N.z, N.y) - atan2(R.z, R.y)`, normalized to
     *    `(-180, 180]` degrees.
     *
     * In a neutral, camera-facing pose the nose tip lies roughly along the
     * eyeMid→chin line, so this angle is ~0°. As the head pitches forward/
     * down (nodding off), the nose tip swings toward the camera relative to
     * that reference line, producing a **positive** angle — that's this
     * module's sign convention: **positive = downward/forward head pitch**
     * (the direction relevant to drowsy head-nod detection), negative = the
     * head tilting back/up.
     *
     * Returns [Double.NaN] if either `R` or `N` is degenerate — i.e. its
     * projection onto the (y, z) plane has near-zero magnitude
     * (`eyeMid` coincides with the chin, or with the nose tip, in y/z) —
     * since the angle is undefined without a direction to measure from/to.
     */
    fun computeHeadPitch(landmarks: FaceLandmarks): Double {
        val eyeMid = Point3D.midpoint(landmarks.leftEyeOuterCorner, landmarks.rightEyeOuterCorner)
        val reference = landmarks.chin - eyeMid
        val nose = landmarks.noseTip - eyeMid

        if (planarMagnitude(reference) < EPSILON || planarMagnitude(nose) < EPSILON) {
            return Double.NaN
        }

        val referenceAngle = atan2(reference.z, reference.y)
        val noseAngle = atan2(nose.z, nose.y)
        var diffDegrees = Math.toDegrees(noseAngle - referenceAngle)

        // Normalize to (-180, 180].
        while (diffDegrees <= -180.0) diffDegrees += 360.0
        while (diffDegrees > 180.0) diffDegrees -= 360.0

        return diffDegrees
    }

    private fun planarMagnitude(p: Point3D): Double =
        Math.hypot(p.y, p.z)
}
