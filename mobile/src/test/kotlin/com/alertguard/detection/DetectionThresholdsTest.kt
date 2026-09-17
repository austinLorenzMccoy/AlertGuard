package com.alertguard.detection

import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class DetectionThresholdsTest {

    @Test
    fun `default thresholds construct without error`() {
        DetectionThresholds()
    }

    @Test
    fun `windowSize must be positive`() {
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(windowSize = 0)
        }
    }

    @Test
    fun `earCriticalThreshold must not exceed earVibrationThreshold`() {
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(earVibrationThreshold = 0.10, earCriticalThreshold = 0.20)
        }
    }

    @Test
    fun `earCriticalThreshold equal to earVibrationThreshold is allowed`() {
        DetectionThresholds(earVibrationThreshold = 0.20, earCriticalThreshold = 0.20)
    }

    @Test
    fun `earSustainedRatio must be within 0 to 1`() {
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(earSustainedRatio = 1.5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(earSustainedRatio = -0.1)
        }
    }

    @Test
    fun `marSustainedRatio must be within 0 to 1`() {
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(marSustainedRatio = 1.5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(marSustainedRatio = -0.1)
        }
    }

    @Test
    fun `pitchSustainedRatio must be within 0 to 1`() {
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(pitchSustainedRatio = 1.5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            DetectionThresholds(pitchSustainedRatio = -0.1)
        }
    }
}
