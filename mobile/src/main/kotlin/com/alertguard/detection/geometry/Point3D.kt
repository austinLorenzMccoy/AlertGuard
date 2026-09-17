package com.alertguard.detection.geometry

import kotlin.math.sqrt

/**
 * A single facial landmark point.
 *
 * MediaPipe Face Mesh emits normalized `(x, y, z)` coordinates per landmark
 * (x/y normalized to image width/height, z roughly proportional to depth
 * relative to the head center, smaller/more negative = closer to the camera).
 * We model only that flat `(x, y, z)` shape here — nothing MediaPipe-specific
 * leaks into this type, so it is trivial to construct from a real MediaPipe
 * `NormalizedLandmark` at the integration seam (see README "Integration plan").
 *
 * [z] defaults to `0.0` so callers who only have 2D landmarks (e.g. hand-built
 * test fixtures, or a 2D-only landmark source) can construct points without
 * fuss; EAR/MAR distance math then degrades gracefully to a 2D Euclidean
 * distance.
 */
data class Point3D(
    val x: Double,
    val y: Double,
    val z: Double = 0.0
) {
    /** Euclidean distance to [other] in full 3D. */
    fun distanceTo(other: Point3D): Double {
        val dx = x - other.x
        val dy = y - other.y
        val dz = z - other.z
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    operator fun minus(other: Point3D): Point3D =
        Point3D(x - other.x, y - other.y, z - other.z)

    companion object {
        /** Componentwise midpoint of two points. */
        fun midpoint(a: Point3D, b: Point3D): Point3D =
            Point3D((a.x + b.x) / 2.0, (a.y + b.y) / 2.0, (a.z + b.z) / 2.0)
    }
}
