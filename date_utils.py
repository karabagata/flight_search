from datetime import date, timedelta
from typing import List, Optional

def get_fridays_in_range(start: date, end: date) -> List[date]:
    """Return all Fridays between start and end (inclusive)."""
    fridays = []
    current = start
    while current <= end:
        if current.weekday() == 4:  # Friday
            fridays.append(current)
        current += timedelta(days=1)
    return fridays

def get_fridays_next_n_weeks(n: int, from_date: Optional[date] = None) -> List[date]:
    """Return all Fridays in the next N weeks from from_date."""
    if from_date is None:
        from_date = date.today()
    end = from_date + timedelta(weeks=n)
    return get_fridays_in_range(from_date, end)

def get_return_dates(friday: date, include_sunday: bool = True, include_monday: bool = True) -> List[date]:
    """Return Sunday and/or Monday after a given Friday."""
    results = []
    if include_sunday:
        results.append(friday + timedelta(days=2))  # Sunday
    if include_monday:
        results.append(friday + timedelta(days=3))  # Monday
    return results
