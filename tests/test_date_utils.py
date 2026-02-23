from datetime import date
from date_utils import get_fridays_in_range, get_return_dates, get_fridays_next_n_weeks

def test_get_fridays_in_range():
    fridays = get_fridays_in_range(date(2026, 3, 1), date(2026, 3, 31))
    assert all(d.weekday() == 4 for d in fridays)  # 4 = Friday
    assert len(fridays) == 4

def test_get_fridays_next_n_weeks():
    fridays = get_fridays_next_n_weeks(4, from_date=date(2026, 3, 2))
    assert len(fridays) == 4
    assert all(d.weekday() == 4 for d in fridays)

def test_get_return_dates_sunday_and_monday():
    friday = date(2026, 3, 6)  # a Friday
    returns = get_return_dates(friday)
    assert date(2026, 3, 8) in returns   # Sunday
    assert date(2026, 3, 9) in returns   # Monday

def test_get_return_dates_sunday_only():
    friday = date(2026, 3, 6)
    returns = get_return_dates(friday, include_monday=False)
    assert date(2026, 3, 8) in returns
    assert date(2026, 3, 9) not in returns
