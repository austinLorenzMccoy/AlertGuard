"""Rolling-window circular buffer over per-frame feature samples.

PRD Section 4: "all three features are computed over a sliding window
(target: 2-3 seconds at the chosen frame rate), not evaluated frame-by-frame.
This is ... the single most important design decision for false-positive
control." Section 5 further requires that state-machine escalation be based
on *sustained* signal, not a single bad frame.

This module is deliberately policy-free: it knows nothing about EAR/MAR/
pitch thresholds. It provides a fixed-capacity circular buffer of
:class:`FeatureSample` plus a small set of generic, predicate-based query
helpers (mean of a field, trailing-run duration matching a predicate, window
"fullness"). ``state_machine.py`` supplies the thresholds and policy on top
of these primitives.

Sizing: choose ``maxlen`` for the target window duration at your capture
frame rate, e.g. 15 fps * 2.5s ~= 38 samples. The buffer itself is
sample-count-based (matching a circular buffer's natural shape); duration is
derived from the timestamps of whatever samples are currently in the buffer
via :meth:`RollingWindow.duration`.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import fmean
from typing import Callable, Optional, Sequence, Tuple


@dataclass(frozen=True)
class FeatureSample:
    """One frame's worth of extracted features, plus its capture timestamp.

    ``ear`` is ``Optional`` because ``features.compute_ear`` returns ``None``
    when eyes are not visible (see ``features.py`` / ``landmarks.py``) —
    that ``None`` must propagate here rather than being coerced to a number.
    """

    timestamp: float
    ear: Optional[float]
    mar: float
    pitch: float
    eyes_visible: bool


class RollingWindow:
    """Fixed-capacity circular buffer of :class:`FeatureSample`."""

    def __init__(self, maxlen: int):
        if maxlen <= 0:
            raise ValueError("maxlen must be a positive integer")
        self._maxlen = maxlen
        self._buffer: deque[FeatureSample] = deque(maxlen=maxlen)

    @property
    def maxlen(self) -> int:
        return self._maxlen

    def add(self, sample: FeatureSample) -> None:
        self._buffer.append(sample)

    def clear(self) -> None:
        self._buffer.clear()

    def __len__(self) -> int:
        return len(self._buffer)

    @property
    def is_empty(self) -> bool:
        return len(self._buffer) == 0

    @property
    def is_full(self) -> bool:
        return len(self._buffer) == self._maxlen

    def samples(self) -> Tuple[FeatureSample, ...]:
        """All samples currently held, oldest first."""
        return tuple(self._buffer)

    def duration(self) -> float:
        """Time span (seconds) covered by the samples currently held.

        0.0 for an empty or single-sample window.
        """
        if len(self._buffer) < 2:
            return 0.0
        return self._buffer[-1].timestamp - self._buffer[0].timestamp

    def mean(self, getter: Callable[[FeatureSample], Optional[float]]) -> Optional[float]:
        """Mean of ``getter(sample)`` over all samples where it is not None.

        Returns ``None`` if the window is empty or every sample's value is
        ``None`` (e.g. ``getter`` extracts EAR and no eyes were visible in
        the entire window).
        """
        values = [v for s in self._buffer if (v := getter(s)) is not None]
        if not values:
            return None
        return fmean(values)

    def trailing_run_duration(
        self, predicate: Callable[[FeatureSample], bool]
    ) -> float:
        """Time span of the trailing run of samples satisfying ``predicate``.

        Walks backward from the newest sample. If the newest sample does not
        satisfy ``predicate``, returns 0.0 (there is no current trailing
        run). Otherwise, extends the run backward while the predicate keeps
        holding, and returns the timestamp span from the oldest to the
        newest sample in that run. A run of exactly one sample has a span of
        0.0 (no *sustained* duration yet) — this is intentional: sustained
        thresholds are duration-based, and a single frame can never satisfy
        a positive sustain-duration requirement, by design.
        """
        if self.is_empty:
            return 0.0
        ordered: Sequence[FeatureSample] = tuple(self._buffer)
        if not predicate(ordered[-1]):
            return 0.0
        newest_ts = ordered[-1].timestamp
        oldest_ts = newest_ts
        for sample in reversed(ordered[:-1]):
            if not predicate(sample):
                break
            oldest_ts = sample.timestamp
        return newest_ts - oldest_ts

    def all_match(self, predicate: Callable[[FeatureSample], bool]) -> bool:
        """True if every sample currently held satisfies ``predicate``.

        Vacuously ``True`` for an empty window (no samples violate it) —
        callers that need "a full, clean window" should also check
        ``is_full``.
        """
        return all(predicate(s) for s in self._buffer)
