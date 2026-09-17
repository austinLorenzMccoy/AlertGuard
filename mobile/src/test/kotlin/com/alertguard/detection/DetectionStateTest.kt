package com.alertguard.detection

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DetectionStateTest {

    @Test
    fun `initial state is NORMAL with NONE event and zero confidence`() {
        val state = DetectionState.initial()
        assertEquals(Severity.NORMAL, state.severity)
        assertEquals(EventType.NONE, state.lastEventType)
        assertEquals(0.0, state.confidenceLevel, 1e-9)
        assertEquals(0L, state.timestampMs)
    }

    @Test
    fun `initial state accepts a custom timestamp`() {
        val state = DetectionState.initial(timestampMs = 42L)
        assertEquals(42L, state.timestampMs)
    }

    @Test
    fun `confidenceFor is monotonic across severities from 0-0 to 1-0`() {
        assertEquals(0.0, DetectionState.confidenceFor(Severity.NORMAL), 1e-9)
        assertEquals(1.0 / 3.0, DetectionState.confidenceFor(Severity.SOFT), 1e-9)
        assertEquals(2.0 / 3.0, DetectionState.confidenceFor(Severity.VIBRATION), 1e-9)
        assertEquals(1.0, DetectionState.confidenceFor(Severity.CRITICAL), 1e-9)
    }
}
