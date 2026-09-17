package com.alertguard.detection.geometry

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class Point3DTest {

    @Test
    fun `distanceTo computes 3D Euclidean distance`() {
        val a = Point3D(0.0, 0.0, 0.0)
        val b = Point3D(3.0, 4.0, 0.0)
        assertEquals(5.0, a.distanceTo(b), 1e-9)
    }

    @Test
    fun `distanceTo accounts for the z axis`() {
        val a = Point3D(0.0, 0.0, 0.0)
        val b = Point3D(1.0, 2.0, 2.0)
        assertEquals(3.0, a.distanceTo(b), 1e-9)
    }

    @Test
    fun `distanceTo is zero for identical points`() {
        val a = Point3D(1.5, -2.5, 0.75)
        assertEquals(0.0, a.distanceTo(a), 1e-9)
    }

    @Test
    fun `default z is zero`() {
        val p = Point3D(1.0, 2.0)
        assertEquals(0.0, p.z, 1e-9)
    }

    @Test
    fun `minus subtracts componentwise`() {
        val a = Point3D(5.0, 3.0, 1.0)
        val b = Point3D(2.0, 1.0, 0.5)
        val result = a - b
        assertEquals(Point3D(3.0, 2.0, 0.5), result)
    }

    @Test
    fun `midpoint computes the componentwise average`() {
        val a = Point3D(0.0, 0.0, 0.0)
        val b = Point3D(2.0, 4.0, 6.0)
        val mid = Point3D.midpoint(a, b)
        assertEquals(Point3D(1.0, 2.0, 3.0), mid)
    }
}
