package com.alertguard.detection

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RollingWindowTest {

    @Test
    fun `capacity is exposed as-constructed`() {
        val window = RollingWindow(7)
        assertEquals(7, window.capacity)
    }

    @Test
    fun `capacity must be positive`() {
        assertThrows(IllegalArgumentException::class.java) { RollingWindow(0) }
        assertThrows(IllegalArgumentException::class.java) { RollingWindow(-1) }
    }

    @Test
    fun `empty window reports size zero and not full`() {
        val window = RollingWindow(3)
        assertEquals(0, window.size)
        assertFalse(window.isFull)
        assertTrue(window.values().isEmpty())
    }

    @Test
    fun `empty window average is NaN`() {
        val window = RollingWindow(3)
        assertTrue(window.average().isNaN())
    }

    @Test
    fun `empty window min and max are NaN`() {
        val window = RollingWindow(3)
        assertTrue(window.min().isNaN())
        assertTrue(window.max().isNaN())
    }

    @Test
    fun `empty window proportions are zero`() {
        val window = RollingWindow(3)
        assertEquals(0.0, window.proportionBelow(1.0), 1e-9)
        assertEquals(0.0, window.proportionAbove(0.0), 1e-9)
    }

    @Test
    fun `empty window trend is zero`() {
        val window = RollingWindow(3)
        assertEquals(0.0, window.trend(), 1e-9)
    }

    @Test
    fun `partially full window tracks size and is not full`() {
        val window = RollingWindow(3)
        window.push(1.0)
        window.push(2.0)
        assertEquals(2, window.size)
        assertFalse(window.isFull)
        assertEquals(listOf(1.0, 2.0), window.values())
    }

    @Test
    fun `single sample trend is zero (not enough history)`() {
        val window = RollingWindow(3)
        window.push(5.0)
        assertEquals(0.0, window.trend(), 1e-9)
    }

    @Test
    fun `full window reports isFull true and correct average`() {
        val window = RollingWindow(3)
        window.push(1.0)
        window.push(2.0)
        window.push(3.0)
        assertTrue(window.isFull)
        assertEquals(3, window.size)
        assertEquals(2.0, window.average(), 1e-9)
    }

    @Test
    fun `pushing beyond capacity evicts the oldest sample`() {
        val window = RollingWindow(3)
        window.push(1.0)
        window.push(2.0)
        window.push(3.0)
        window.push(4.0) // evicts 1.0
        assertEquals(3, window.size)
        assertTrue(window.isFull)
        assertEquals(listOf(2.0, 3.0, 4.0), window.values())
        assertEquals(3.0, window.average(), 1e-9)
    }

    @Test
    fun `min and max reflect current contents after eviction`() {
        val window = RollingWindow(2)
        window.push(10.0)
        window.push(1.0)
        window.push(5.0) // evicts 10.0 -> contents are [1.0, 5.0]
        assertEquals(1.0, window.min(), 1e-9)
        assertEquals(5.0, window.max(), 1e-9)
    }

    @Test
    fun `proportionBelow and proportionAbove use strict comparison at the boundary`() {
        val window = RollingWindow(4)
        window.push(1.0)
        window.push(2.0)
        window.push(3.0)
        window.push(4.0)

        // Exactly-at-threshold values do not count as "below" or "above".
        assertEquals(0.25, window.proportionBelow(2.0), 1e-9) // only 1.0 < 2.0
        assertEquals(0.5, window.proportionAbove(2.0), 1e-9)  // 3.0 and 4.0 > 2.0

        // Threshold below every value: nothing is below it.
        assertEquals(0.0, window.proportionBelow(0.5), 1e-9)
        // Threshold above every value: everything is below it.
        assertEquals(1.0, window.proportionBelow(10.0), 1e-9)
    }

    @Test
    fun `trend is positive when the window is rising`() {
        val window = RollingWindow(4)
        window.push(1.0)
        window.push(1.0)
        window.push(5.0)
        window.push(5.0)
        // first half avg = 1.0, second half avg = 5.0
        assertEquals(4.0, window.trend(), 1e-9)
    }

    @Test
    fun `trend is negative when the window is falling`() {
        val window = RollingWindow(4)
        window.push(5.0)
        window.push(5.0)
        window.push(1.0)
        window.push(1.0)
        assertEquals(-4.0, window.trend(), 1e-9)
    }

    @Test
    fun `clear empties the window`() {
        val window = RollingWindow(2)
        window.push(1.0)
        window.push(2.0)
        window.clear()
        assertEquals(0, window.size)
        assertFalse(window.isFull)
        assertTrue(window.average().isNaN())
    }
}
