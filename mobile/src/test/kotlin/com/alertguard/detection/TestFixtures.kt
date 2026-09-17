package com.alertguard.detection

import com.alertguard.detection.geometry.Point3D

/**
 * Hand-calculable landmark fixtures shared across the test suite.
 *
 * The eye/mouth "square" fixtures are built so the EAR/MAR formulas reduce
 * to simple, exact ratios you can verify by hand — see each factory's doc
 * for the arithmetic.
 */
object TestFixtures {

    /**
     * A symmetric "open eye" shape where the two vertical eyelid gaps are
     * each exactly 0.3 and the horizontal corner-to-corner distance is
     * exactly 1.0:
     * ```
     * EAR = (0.3 + 0.3) / (2 * 1.0) = 0.3
     * ```
     */
    fun openEye(offsetX: Double = 0.0): EyeLandmarks = EyeLandmarks(
        p1 = Point3D(offsetX + 0.0, 0.0),
        p2 = Point3D(offsetX + 0.3, 0.15),
        p3 = Point3D(offsetX + 0.7, 0.15),
        p4 = Point3D(offsetX + 1.0, 0.0),
        p5 = Point3D(offsetX + 0.7, -0.15),
        p6 = Point3D(offsetX + 0.3, -0.15)
    )

    /**
     * A near-closed eye: vertical gaps shrink to 0.02 each, horizontal
     * corner distance stays 1.0:
     * ```
     * EAR = (0.02 + 0.02) / (2 * 1.0) = 0.02
     * ```
     */
    fun closedEye(offsetX: Double = 0.0): EyeLandmarks = EyeLandmarks(
        p1 = Point3D(offsetX + 0.0, 0.0),
        p2 = Point3D(offsetX + 0.3, 0.01),
        p3 = Point3D(offsetX + 0.7, 0.01),
        p4 = Point3D(offsetX + 1.0, 0.0),
        p5 = Point3D(offsetX + 0.7, -0.01),
        p6 = Point3D(offsetX + 0.3, -0.01)
    )

    /** Degenerate eye: p1 and p4 coincide, so the EAR horizontal distance is 0. */
    fun degenerateEye(): EyeLandmarks = EyeLandmarks(
        p1 = Point3D(1.0, 1.0),
        p2 = Point3D(1.2, 1.3),
        p3 = Point3D(1.4, 1.3),
        p4 = Point3D(1.0, 1.0),
        p5 = Point3D(1.4, 0.7),
        p6 = Point3D(1.2, 0.7)
    )

    /**
     * A resting-mouth shape where each of the three vertical lip gaps is
     * exactly 0.1 and the horizontal corner distance is exactly 1.0:
     * ```
     * MAR = (0.1 + 0.1 + 0.1) / (2 * 1.0) = 0.15
     * ```
     */
    fun restingMouth(): MouthLandmarks = MouthLandmarks(
        p1 = Point3D(0.0, 0.0),
        p2 = Point3D(0.25, 0.05),
        p3 = Point3D(0.5, 0.05),
        p4 = Point3D(0.75, 0.05),
        p5 = Point3D(1.0, 0.0),
        p6 = Point3D(0.75, -0.05),
        p7 = Point3D(0.5, -0.05),
        p8 = Point3D(0.25, -0.05)
    )

    /**
     * A wide-open "yawn" mouth: each vertical gap is 0.4, horizontal
     * distance stays 1.0:
     * ```
     * MAR = (0.4 + 0.4 + 0.4) / (2 * 1.0) = 0.6
     * ```
     */
    fun yawnMouth(): MouthLandmarks = MouthLandmarks(
        p1 = Point3D(0.0, 0.0),
        p2 = Point3D(0.25, 0.2),
        p3 = Point3D(0.5, 0.2),
        p4 = Point3D(0.75, 0.2),
        p5 = Point3D(1.0, 0.0),
        p6 = Point3D(0.75, -0.2),
        p7 = Point3D(0.5, -0.2),
        p8 = Point3D(0.25, -0.2)
    )

    /** Degenerate mouth: p1 and p5 coincide, so the MAR horizontal distance is 0. */
    fun degenerateMouth(): MouthLandmarks = MouthLandmarks(
        p1 = Point3D(2.0, 2.0),
        p2 = Point3D(2.1, 2.3),
        p3 = Point3D(2.2, 2.3),
        p4 = Point3D(2.3, 2.3),
        p5 = Point3D(2.0, 2.0),
        p6 = Point3D(2.3, 1.7),
        p7 = Point3D(2.2, 1.7),
        p8 = Point3D(2.1, 1.7)
    )

    /** A fully neutral, "normal" face: open eyes, resting mouth, level head pitch (0 degrees). */
    fun neutralFace(): FaceLandmarks = FaceLandmarks(
        leftEye = openEye(offsetX = -2.0),
        rightEye = openEye(offsetX = 2.0),
        mouth = restingMouth(),
        noseTip = Point3D(0.0, -1.0, 0.0),
        chin = Point3D(0.0, -2.0, 0.0),
        leftEyeOuterCorner = Point3D(-1.0, 0.0, 0.0),
        rightEyeOuterCorner = Point3D(1.0, 0.0, 0.0)
    )

    /** Both eyes closed, mouth resting, head pitch neutral: a pure "eyes closed" frame. */
    fun eyesClosedFace(): FaceLandmarks = neutralFace().copy(
        leftEye = closedEye(offsetX = -2.0),
        rightEye = closedEye(offsetX = 2.0)
    )

    /** Eyes open, mouth yawning, head pitch neutral: a pure "yawning" frame. */
    fun yawningFace(): FaceLandmarks = neutralFace().copy(
        mouth = yawnMouth()
    )

    /**
     * Eyes open, resting mouth, head pitched forward/down by 45 degrees
     * (see [FeatureExtractionTest] for the hand-derivation of that 45).
     */
    fun headDownFace(): FaceLandmarks = neutralFace().copy(
        noseTip = Point3D(0.0, -1.0, -1.0)
    )

    /** Eyes closed AND head pitched down together: the combined-signal critical trigger. */
    fun eyesClosedAndHeadDownFace(): FaceLandmarks = eyesClosedFace().copy(
        noseTip = Point3D(0.0, -1.0, -1.0)
    )

    /**
     * An eye shape parameterized to produce an EXACT target EAR value: since
     * the horizontal corner distance is fixed at 1.0 and both vertical gaps
     * are set equal, `EAR = (gap + gap) / (2 * 1.0) = gap`, so `gap` is set
     * directly to [targetEar].
     */
    fun eyeWithEAR(targetEar: Double, offsetX: Double = 0.0): EyeLandmarks {
        val halfGap = targetEar / 2.0
        return EyeLandmarks(
            p1 = Point3D(offsetX + 0.0, 0.0),
            p2 = Point3D(offsetX + 0.3, halfGap),
            p3 = Point3D(offsetX + 0.7, halfGap),
            p4 = Point3D(offsetX + 1.0, 0.0),
            p5 = Point3D(offsetX + 0.7, -halfGap),
            p6 = Point3D(offsetX + 0.3, -halfGap)
        )
    }

    /**
     * A mouth shape parameterized to produce an EXACT target MAR value: with
     * horizontal corner distance fixed at 1.0 and all three vertical gaps
     * equal to `g`, `MAR = 3g / 2`, so `g = 2 * targetMar / 3` and each
     * point's offset from center is `g / 2 = targetMar / 3`.
     */
    fun mouthWithMAR(targetMar: Double): MouthLandmarks {
        val h = targetMar / 3.0
        return MouthLandmarks(
            p1 = Point3D(0.0, 0.0),
            p2 = Point3D(0.25, h),
            p3 = Point3D(0.5, h),
            p4 = Point3D(0.75, h),
            p5 = Point3D(1.0, 0.0),
            p6 = Point3D(0.75, -h),
            p7 = Point3D(0.5, -h),
            p8 = Point3D(0.25, -h)
        )
    }

    /** A neutral-face variant with both eyes tuned to an exact EAR value. */
    fun faceWithEar(ear: Double): FaceLandmarks = neutralFace().copy(
        leftEye = eyeWithEAR(ear, offsetX = -2.0),
        rightEye = eyeWithEAR(ear, offsetX = 2.0)
    )

    /** A neutral-face variant with the mouth tuned to an exact MAR value. */
    fun faceWithMar(mar: Double): FaceLandmarks = neutralFace().copy(
        mouth = mouthWithMAR(mar)
    )

    /** Both an exact EAR value AND a pitched-down (45 degree) head, together. */
    fun faceWithEarAndHeadDown(ear: Double): FaceLandmarks = faceWithEar(ear).copy(
        noseTip = Point3D(0.0, -1.0, -1.0)
    )
}
