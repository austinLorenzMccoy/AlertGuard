package com.alertguard.detection

import com.alertguard.detection.geometry.Point3D
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Nested

class FeatureExtractionTest {

    private val tolerance = 1e-9

    @Nested
    @DisplayName("computeEAR")
    inner class EarTests {

        @Test
        fun `open eye on both sides gives EAR of exactly 0-3`() {
            val face = TestFixtures.neutralFace()
            assertEquals(0.3, FeatureExtraction.computeEAR(face), tolerance)
        }

        @Test
        fun `closed eyes give EAR of exactly 0-02`() {
            val face = TestFixtures.eyesClosedFace()
            assertEquals(0.02, FeatureExtraction.computeEAR(face), tolerance)
        }

        @Test
        fun `single-eye EAR matches the hand-calculated ratio`() {
            assertEquals(0.3, FeatureExtraction.eyeAspectRatio(TestFixtures.openEye()), tolerance)
        }

        @Test
        fun `degenerate single eye (zero-width) returns NaN`() {
            assertTrue(FeatureExtraction.eyeAspectRatio(TestFixtures.degenerateEye()).isNaN())
        }

        @Test
        fun `both eyes degenerate makes computeEAR NaN`() {
            val face = TestFixtures.neutralFace().copy(
                leftEye = TestFixtures.degenerateEye(),
                rightEye = TestFixtures.degenerateEye()
            )
            assertTrue(FeatureExtraction.computeEAR(face).isNaN())
        }

        @Test
        fun `one degenerate eye falls back to the other eye's EAR`() {
            val face = TestFixtures.neutralFace().copy(
                leftEye = TestFixtures.degenerateEye(),
                rightEye = TestFixtures.openEye(offsetX = 2.0)
            )
            assertEquals(0.3, FeatureExtraction.computeEAR(face), tolerance)

            val face2 = TestFixtures.neutralFace().copy(
                leftEye = TestFixtures.openEye(offsetX = -2.0),
                rightEye = TestFixtures.degenerateEye()
            )
            assertEquals(0.3, FeatureExtraction.computeEAR(face2), tolerance)
        }
    }

    @Nested
    @DisplayName("computeMAR")
    inner class MarTests {

        @Test
        fun `resting mouth gives MAR of exactly 0-15`() {
            val face = TestFixtures.neutralFace()
            assertEquals(0.15, FeatureExtraction.computeMAR(face), tolerance)
        }

        @Test
        fun `yawning mouth gives MAR of exactly 0-6`() {
            val face = TestFixtures.yawningFace()
            assertEquals(0.6, FeatureExtraction.computeMAR(face), tolerance)
        }

        @Test
        fun `degenerate mouth (zero-width) returns NaN`() {
            val face = TestFixtures.neutralFace().copy(mouth = TestFixtures.degenerateMouth())
            assertTrue(FeatureExtraction.computeMAR(face).isNaN())
        }
    }

    @Nested
    @DisplayName("computeHeadPitch")
    inner class HeadPitchTests {

        @Test
        fun `neutral face gives head pitch of exactly 0 degrees`() {
            val face = TestFixtures.neutralFace()
            assertEquals(0.0, FeatureExtraction.computeHeadPitch(face), tolerance)
        }

        @Test
        fun `nose displaced forward by its own downward offset gives 45 degrees`() {
            val face = TestFixtures.headDownFace()
            assertEquals(45.0, FeatureExtraction.computeHeadPitch(face), 1e-6)
        }

        @Test
        fun `nose displaced backward gives a negative pitch angle`() {
            // Symmetric case to the 45-degree forward nod: nose displaced away
            // from the camera instead of toward it.
            val face = TestFixtures.neutralFace().copy(noseTip = Point3D(0.0, -1.0, 1.0))
            assertEquals(-45.0, FeatureExtraction.computeHeadPitch(face), 1e-6)
        }

        @Test
        fun `raw angle difference over 180 degrees wraps via the second normalization step`() {
            // referenceAngle = atan2(-1,-1) = -135 degrees, noseAngle = atan2(1,-1) = 135 degrees.
            // Raw diff = 135 - (-135) = 270, which is > 180 and must wrap to -90 (270 - 360).
            val face = TestFixtures.neutralFace().copy(
                chin = Point3D(0.0, -1.0, -1.0),
                noseTip = Point3D(0.0, -1.0, 1.0)
            )
            assertEquals(-90.0, FeatureExtraction.computeHeadPitch(face), 1e-6)
        }

        @Test
        fun `degenerate reference vector (chin coincides with eye line) returns NaN`() {
            val face = TestFixtures.neutralFace().copy(
                chin = Point3D(5.0, 0.0, 0.0) // same y,z as eyeMid, only x differs
            )
            assertTrue(FeatureExtraction.computeHeadPitch(face).isNaN())
        }

        @Test
        fun `degenerate nose vector (nose tip coincides with eye line) returns NaN`() {
            val face = TestFixtures.neutralFace().copy(
                noseTip = Point3D(5.0, 0.0, 0.0) // same y,z as eyeMid, only x differs
            )
            assertTrue(FeatureExtraction.computeHeadPitch(face).isNaN())
        }
    }
}
