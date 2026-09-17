package com.alertguard.detection

/**
 * A fixed-capacity circular buffer of `Double` samples, used to hold the
 * recent EAR / MAR / head-pitch history the detection state machine
 * evaluates over (AI/ML PRD Section 4: "rolling window... target 2-3 seconds
 * at the chosen frame rate, not evaluated frame-by-frame").
 *
 * [capacity] is expressed in frames/samples, not seconds — the caller (this
 * module's [DetectionEngine], or ultimately the real CameraX/MediaPipe
 * pipeline) is responsible for choosing `capacity = targetSeconds * fps` for
 * whatever frame rate it's actually sustaining. See README for the default
 * window-size rationale.
 *
 * Once full, pushing a new sample evicts the oldest one (true circular/
 * ring-buffer eviction — this is what "rolling" window means here).
 */
class RollingWindow(val capacity: Int) {

    init {
        require(capacity > 0) { "RollingWindow capacity must be positive, was $capacity" }
    }

    private val buffer = ArrayDeque<Double>(capacity)

    /** Number of samples currently held (0..[capacity]). */
    val size: Int
        get() = buffer.size

    /** True once [size] == [capacity], i.e. the window has enough history to be trusted. */
    val isFull: Boolean
        get() = buffer.size == capacity

    /** Push a new sample; evicts the oldest sample once the buffer is at [capacity]. */
    fun push(value: Double) {
        if (buffer.size == capacity) {
            buffer.removeFirst()
        }
        buffer.addLast(value)
    }

    /** Discards all samples, returning the window to empty. */
    fun clear() {
        buffer.clear()
    }

    /** A snapshot list of the currently held samples, oldest first. */
    fun values(): List<Double> = buffer.toList()

    /** Arithmetic mean of the held samples, or [Double.NaN] if empty. */
    fun average(): Double {
        if (buffer.isEmpty()) return Double.NaN
        return buffer.sum() / buffer.size
    }

    /** Minimum of the held samples, or [Double.NaN] if empty. */
    fun min(): Double = buffer.minOrNull() ?: Double.NaN

    /** Maximum of the held samples, or [Double.NaN] if empty. */
    fun max(): Double = buffer.maxOrNull() ?: Double.NaN

    /**
     * Fraction (0.0..1.0) of the held samples strictly below [threshold].
     * Returns 0.0 for an empty window (nothing to be "below" anything yet).
     */
    fun proportionBelow(threshold: Double): Double {
        if (buffer.isEmpty()) return 0.0
        return buffer.count { it < threshold }.toDouble() / buffer.size
    }

    /**
     * Fraction (0.0..1.0) of the held samples strictly above [threshold].
     * Returns 0.0 for an empty window.
     */
    fun proportionAbove(threshold: Double): Double {
        if (buffer.isEmpty()) return 0.0
        return buffer.count { it > threshold }.toDouble() / buffer.size
    }

    /**
     * A simple trend indicator: the average of the second half of the window
     * minus the average of the first half. Positive means the signal is
     * rising over the window, negative means falling. Returns 0.0 if there
     * are fewer than 2 samples (no trend can be established).
     *
     * This directly serves the PRD's "rising yawn rate" / "slow downward
     * [pitch] drift" language (Section 4-5): a rolling average alone can't
     * distinguish "steady at an elevated level" from "climbing", but this
     * split-half comparison can.
     */
    fun trend(): Double {
        if (buffer.size < 2) return 0.0
        val snapshot = buffer.toList()
        val mid = snapshot.size / 2
        val firstHalf = snapshot.subList(0, mid)
        val secondHalf = snapshot.subList(snapshot.size - mid, snapshot.size)
        val firstAvg = firstHalf.sum() / firstHalf.size
        val secondAvg = secondHalf.sum() / secondHalf.size
        return secondAvg - firstAvg
    }
}
