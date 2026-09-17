import pytest

from alertguard_ml.window import FeatureSample, RollingWindow


def mk(t, ear=0.30, mar=0.1, pitch=0.0, eyes_visible=True):
    return FeatureSample(timestamp=t, ear=ear, mar=mar, pitch=pitch, eyes_visible=eyes_visible)


def test_maxlen_must_be_positive():
    with pytest.raises(ValueError):
        RollingWindow(maxlen=0)


def test_maxlen_negative_raises():
    with pytest.raises(ValueError):
        RollingWindow(maxlen=-1)


def test_maxlen_property():
    w = RollingWindow(maxlen=5)
    assert w.maxlen == 5


def test_empty_window_state():
    w = RollingWindow(maxlen=3)
    assert len(w) == 0
    assert w.is_empty is True
    assert w.is_full is False
    assert w.samples() == ()


def test_empty_window_duration_is_zero():
    w = RollingWindow(maxlen=3)
    assert w.duration() == 0.0


def test_empty_window_mean_is_none():
    w = RollingWindow(maxlen=3)
    assert w.mean(lambda s: s.ear) is None


def test_empty_window_trailing_run_duration_is_zero():
    w = RollingWindow(maxlen=3)
    assert w.trailing_run_duration(lambda s: True) == 0.0


def test_empty_window_all_match_is_vacuously_true():
    w = RollingWindow(maxlen=3)
    assert w.all_match(lambda s: False) is True


def test_partial_window_not_full():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0))
    w.add(mk(0.1))
    assert len(w) == 2
    assert w.is_full is False
    assert w.is_empty is False


def test_partial_window_duration():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0))
    w.add(mk(0.3))
    assert w.duration() == pytest.approx(0.3)


def test_single_sample_duration_is_zero():
    w = RollingWindow(maxlen=5)
    w.add(mk(1.0))
    assert w.duration() == 0.0


def test_full_window():
    w = RollingWindow(maxlen=3)
    for t in (0.0, 0.1, 0.2):
        w.add(mk(t))
    assert w.is_full is True
    assert len(w) == 3


def test_overflow_drops_oldest():
    w = RollingWindow(maxlen=3)
    for t in (0.0, 0.1, 0.2, 0.3):
        w.add(mk(t))
    assert len(w) == 3
    timestamps = [s.timestamp for s in w.samples()]
    assert timestamps == [0.1, 0.2, 0.3]


def test_samples_returns_oldest_first_tuple():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0))
    w.add(mk(0.1))
    assert isinstance(w.samples(), tuple)
    assert [s.timestamp for s in w.samples()] == [0.0, 0.1]


def test_clear_empties_window():
    w = RollingWindow(maxlen=3)
    w.add(mk(0.0))
    w.clear()
    assert w.is_empty is True
    assert len(w) == 0


def test_mean_averages_non_none_values():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, mar=0.2))
    w.add(mk(0.1, mar=0.4))
    w.add(mk(0.2, mar=0.6))
    assert w.mean(lambda s: s.mar) == pytest.approx(0.4)


def test_mean_skips_none_values():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=None))
    w.add(mk(0.1, ear=0.30))
    w.add(mk(0.2, ear=0.50))
    assert w.mean(lambda s: s.ear) == pytest.approx(0.40)


def test_mean_all_none_returns_none():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=None))
    w.add(mk(0.1, ear=None))
    assert w.mean(lambda s: s.ear) is None


def test_trailing_run_duration_zero_when_newest_fails_predicate():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=0.10))
    w.add(mk(0.1, ear=0.30))  # newest does not satisfy ear < 0.2
    assert w.trailing_run_duration(lambda s: s.ear is not None and s.ear < 0.2) == 0.0


def test_trailing_run_duration_single_sample_run_is_zero():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=0.30))
    w.add(mk(0.1, ear=0.10))  # only this one satisfies
    assert w.trailing_run_duration(lambda s: s.ear is not None and s.ear < 0.2) == 0.0


def test_trailing_run_duration_multi_sample_run():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=0.10))
    w.add(mk(0.1, ear=0.10))
    w.add(mk(0.2, ear=0.10))
    assert w.trailing_run_duration(lambda s: s.ear is not None and s.ear < 0.2) == pytest.approx(0.2)


def test_trailing_run_duration_stops_at_first_break_going_backward():
    w = RollingWindow(maxlen=5)
    w.add(mk(0.0, ear=0.10))  # breaks the run (excluded)
    w.add(mk(0.1, ear=0.30))  # breaks the run
    w.add(mk(0.2, ear=0.10))
    w.add(mk(0.3, ear=0.10))
    # trailing run only covers t=0.2..0.3, span 0.1, even though an earlier
    # sample at t=0.0 also satisfied the predicate.
    assert w.trailing_run_duration(lambda s: s.ear is not None and s.ear < 0.2) == pytest.approx(0.1)


def test_trailing_run_duration_full_window_all_matching():
    w = RollingWindow(maxlen=4)
    for t in (0.0, 0.1, 0.2, 0.3):
        w.add(mk(t, ear=0.05))
    assert w.trailing_run_duration(lambda s: s.ear is not None and s.ear < 0.2) == pytest.approx(0.3)


def test_all_match_true_when_all_satisfy():
    w = RollingWindow(maxlen=3)
    for t in (0.0, 0.1, 0.2):
        w.add(mk(t, ear=0.30))
    assert w.all_match(lambda s: s.ear is not None and s.ear > 0.2) is True


def test_all_match_false_when_one_fails():
    w = RollingWindow(maxlen=3)
    w.add(mk(0.0, ear=0.30))
    w.add(mk(0.1, ear=0.10))
    assert w.all_match(lambda s: s.ear is not None and s.ear > 0.2) is False
