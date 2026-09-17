package com.alertguard.detection

import com.alertguard.detection.geometry.Point3D

/**
 * The 6 landmarks around a single eye, in the classic EAR-paper ordering
 * (Soukupová & Čech, 2016), adapted to whichever 6 of MediaPipe's 468
 * landmarks correspond to that eye's outer/inner corners and upper/lower
 * lids:
 *
 * ```
 *      p2    p3
 *   p1          p4
 *      p6    p5
 * ```
 *
 * - [p1] outer corner, [p4] inner corner (the horizontal axis of the eye)
 * - [p2], [p3] upper eyelid points
 * - [p5], [p6] lower eyelid points (mirrored under p3/p2 respectively)
 *
 * Only these 6 of the eye's ~16 MediaPipe landmarks are needed for EAR; the
 * caller (the real MediaPipe integration, out of scope for this module) is
 * responsible for picking the 6 MediaPipe landmark indices that best match
 * this layout and mapping them into this type.
 */
data class EyeLandmarks(
    val p1: Point3D,
    val p2: Point3D,
    val p3: Point3D,
    val p4: Point3D,
    val p5: Point3D,
    val p6: Point3D
)

/**
 * The 8 landmarks around the mouth, in the analogous MAR ordering:
 *
 * ```
 *      p2   p3   p4
 *   p1                p5
 *      p8   p7   p6
 * ```
 *
 * - [p1] left mouth corner, [p5] right mouth corner (horizontal axis)
 * - [p2], [p3], [p4] top lip points (left to right)
 * - [p6], [p7], [p8] bottom lip points, mirrored so that (p2,p8), (p3,p7),
 *   (p4,p6) are the three vertical pairs the MAR formula sums.
 */
data class MouthLandmarks(
    val p1: Point3D,
    val p2: Point3D,
    val p3: Point3D,
    val p4: Point3D,
    val p5: Point3D,
    val p6: Point3D,
    val p7: Point3D,
    val p8: Point3D
)

/**
 * The subset of MediaPipe Face Mesh's 468 landmarks this engine actually
 * needs, per AI/ML PRD Section 4: 6 points per eye for EAR, 8 mouth points
 * for MAR, and nose tip / eye corners / chin for a simplified head-pitch
 * estimate. We deliberately do NOT model all 468 landmarks — the real
 * MediaPipe adapter (built later, in the Android app) picks these specific
 * points out of the full landmark list and constructs this type.
 *
 * [leftEyeOuterCorner] and [rightEyeOuterCorner] are kept as separate fields
 * (rather than reusing [leftEye]/[rightEye] corner points) so the head-pitch
 * calculation stays decoupled from the exact EAR eye-landmark convention —
 * matching the AI/ML PRD's "nose tip, eye corners, chin" phrasing literally.
 */
data class FaceLandmarks(
    val leftEye: EyeLandmarks,
    val rightEye: EyeLandmarks,
    val mouth: MouthLandmarks,
    val noseTip: Point3D,
    val chin: Point3D,
    val leftEyeOuterCorner: Point3D,
    val rightEyeOuterCorner: Point3D
)
