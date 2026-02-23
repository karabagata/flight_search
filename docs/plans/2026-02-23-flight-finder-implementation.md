# Paris ↔ Istanbul Flight Finder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal web app to find optimal direct round-trip flights between Paris (CDG/ORY) and Istanbul (IST/SAW) with flexible date modes and client-side filtering.

**Architecture:** FastAPI backend exposes a single `POST /api/search` endpoint; Amadeus Python SDK handles all flight data; vanilla JS frontend fetches once and filters/sorts entirely in-browser.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, amadeus (Python SDK), python-dotenv, asyncio; HTML/CSS/JS (no build tools)

---

## Task 1: Project scaffold

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `tests/__init__.py`

**Step 1: Create `requirements.txt`**

```
fastapi==0.110.0
uvicorn[standard]==0.29.0
amadeus==8.1.0
python-dotenv==1.0.1
pytest==8.1.0
pytest-asyncio==0.23.6
httpx==0.27.0
```

**Step 2: Create `.env.example`**

```
AMADEUS_API_KEY=your_api_key_here
AMADEUS_API_SECRET=your_api_secret_here
AMADEUS_HOSTNAME=test
```

**Step 3: Create `.gitignore`**

```
.env
__pycache__/
*.pyc
.pytest_cache/
.venv/
```

**Step 4: Create empty `tests/__init__.py`**

```python
```

**Step 5: Install dependencies**

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Step 6: Commit**

```bash
git add requirements.txt .env.example .gitignore tests/__init__.py
git commit -m "feat: project scaffold and dependencies"
```

---

## Task 2: Date utilities

**Files:**
- Create: `date_utils.py`
- Create: `tests/test_date_utils.py`

**Step 1: Write the failing tests**

```python
# tests/test_date_utils.py
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
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_date_utils.py -v
```
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Implement `date_utils.py`**

```python
from datetime import date, timedelta
from typing import List

def get_fridays_in_range(start: date, end: date) -> List[date]:
    """Return all Fridays between start and end (inclusive)."""
    fridays = []
    current = start
    while current <= end:
        if current.weekday() == 4:  # Friday
            fridays.append(current)
        current += timedelta(days=1)
    return fridays

def get_fridays_next_n_weeks(n: int, from_date: date = None) -> List[date]:
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
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_date_utils.py -v
```
Expected: 4 PASSED

**Step 5: Commit**

```bash
git add date_utils.py tests/test_date_utils.py
git commit -m "feat: date utilities for Friday/weekend generation"
```

---

## Task 3: Amadeus client wrapper

**Files:**
- Create: `amadeus_client.py`
- Create: `tests/test_amadeus_client.py`

**Step 1: Write failing tests (using mocks — no real API calls in tests)**

```python
# tests/test_amadeus_client.py
from unittest.mock import MagicMock, patch
from datetime import date
from amadeus_client import FlightSearchClient, FlightOffer

def make_mock_offer(price="150.00", origin="CDG", destination="IST",
                    dep_time="2026-03-06T06:00:00", arr_time="2026-03-06T09:30:00"):
    return {
        "price": {"grandTotal": price, "currency": "EUR"},
        "itineraries": [{
            "segments": [{
                "departure": {"iataCode": origin, "at": dep_time},
                "arrival": {"iataCode": destination, "at": arr_time},
                "carrierCode": "TK",
                "number": "1827",
                "aircraft": {"code": "738"},
                "duration": "PT3H30M"
            }]
        }]
    }

def test_parse_offer():
    raw = make_mock_offer()
    offer = FlightOffer.from_raw(raw)
    assert offer.price == 150.0
    assert offer.origin == "CDG"
    assert offer.destination == "IST"
    assert offer.carrier == "TK"
    assert offer.duration == "PT3H30M"

def test_search_returns_list(monkeypatch):
    client = FlightSearchClient.__new__(FlightSearchClient)
    mock_amadeus = MagicMock()
    mock_amadeus.shopping.flight_offers_search.get.return_value = MagicMock(
        data=[make_mock_offer()]
    )
    client.amadeus = mock_amadeus

    results = client._search_one_pair("CDG", "IST", date(2026, 3, 6))
    assert len(results) == 1
    assert results[0].price == 150.0
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_amadeus_client.py -v
```
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Implement `amadeus_client.py`**

```python
import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional
from amadeus import Client, ResponseError
from dotenv import load_dotenv

load_dotenv()

PARIS_AIRPORTS = ["CDG", "ORY"]
ISTANBUL_AIRPORTS = ["IST", "SAW"]

@dataclass
class FlightOffer:
    origin: str
    destination: str
    departure_at: datetime
    arrival_at: datetime
    carrier: str
    flight_number: str
    duration: str
    price: float
    currency: str = "EUR"

    @classmethod
    def from_raw(cls, raw: dict) -> "FlightOffer":
        seg = raw["itineraries"][0]["segments"][0]
        return cls(
            origin=seg["departure"]["iataCode"],
            destination=seg["arrival"]["iataCode"],
            departure_at=datetime.fromisoformat(seg["departure"]["at"]),
            arrival_at=datetime.fromisoformat(seg["arrival"]["at"]),
            carrier=seg["carrierCode"],
            flight_number=seg["number"],
            duration=seg["duration"],
            price=float(raw["price"]["grandTotal"]),
            currency=raw["price"]["currency"],
        )

    def to_dict(self) -> dict:
        return {
            "origin": self.origin,
            "destination": self.destination,
            "departure_at": self.departure_at.isoformat(),
            "arrival_at": self.arrival_at.isoformat(),
            "carrier": self.carrier,
            "flight_number": self.flight_number,
            "duration": self.duration,
            "price": self.price,
            "currency": self.currency,
        }


class FlightSearchClient:
    def __init__(self):
        api_key = os.getenv("AMADEUS_API_KEY")
        api_secret = os.getenv("AMADEUS_API_SECRET")
        hostname = os.getenv("AMADEUS_HOSTNAME", "test")
        if not api_key or not api_secret:
            raise RuntimeError(
                "Missing AMADEUS_API_KEY or AMADEUS_API_SECRET in .env"
            )
        self.amadeus = Client(
            client_id=api_key,
            client_secret=api_secret,
            hostname=hostname,
        )

    def _search_one_pair(
        self, origin: str, destination: str, depart_date: date
    ) -> List[FlightOffer]:
        try:
            response = self.amadeus.shopping.flight_offers_search.get(
                originLocationCode=origin,
                destinationLocationCode=destination,
                departureDate=depart_date.isoformat(),
                adults=1,
                nonStop=True,
                travelClass="ECONOMY",
                currencyCode="EUR",
                max=10,
            )
            return [FlightOffer.from_raw(r) for r in response.data]
        except ResponseError:
            return []

    def search_outbound(self, depart_date: date) -> List[FlightOffer]:
        """Search all Paris → Istanbul pairs for a given date."""
        results = []
        for origin in PARIS_AIRPORTS:
            for dest in ISTANBUL_AIRPORTS:
                results.extend(self._search_one_pair(origin, dest, depart_date))
        return results

    def search_return(self, return_date: date) -> List[FlightOffer]:
        """Search all Istanbul → Paris pairs for a given date."""
        results = []
        for origin in ISTANBUL_AIRPORTS:
            for dest in PARIS_AIRPORTS:
                results.extend(self._search_one_pair(origin, dest, return_date))
        return results
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_amadeus_client.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add amadeus_client.py tests/test_amadeus_client.py
git commit -m "feat: Amadeus client wrapper with FlightOffer dataclass"
```

---

## Task 4: FastAPI app + static file serving

**Files:**
- Create: `main.py`
- Create: `static/index.html` (placeholder)
- Create: `tests/test_main.py`

**Step 1: Write failing test**

```python
# tests/test_main.py
from httpx import AsyncClient, ASGITransport
import pytest

@pytest.mark.asyncio
async def test_root_serves_html():
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_main.py::test_root_serves_html -v
```
Expected: FAIL

**Step 3: Create placeholder `static/index.html`**

```html
<!DOCTYPE html>
<html><head><title>Flight Finder</title></head>
<body><h1>Flight Finder</h1></body>
</html>
```

**Step 4: Implement `main.py`**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI(title="Paris-Istanbul Flight Finder")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")
```

**Step 5: Run test to verify it passes**

```bash
pytest tests/test_main.py::test_root_serves_html -v
```
Expected: PASSED

**Step 6: Verify server starts**

```bash
uvicorn main:app --reload
```
Open `http://localhost:8000` — should see "Flight Finder" heading.

**Step 7: Commit**

```bash
git add main.py static/index.html tests/test_main.py
git commit -m "feat: FastAPI app with static file serving"
```

---

## Task 5: Search API endpoint

**Files:**
- Modify: `main.py`
- Create: `tests/test_search_endpoint.py`

**Step 1: Write failing test**

```python
# tests/test_search_endpoint.py
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
from datetime import datetime
import pytest

MOCK_OFFER = {
    "origin": "CDG", "destination": "IST",
    "departure_at": "2026-03-06T06:00:00",
    "arrival_at": "2026-03-06T09:30:00",
    "carrier": "TK", "flight_number": "1827",
    "duration": "PT3H30M", "price": 120.0, "currency": "EUR"
}

@pytest.mark.asyncio
async def test_search_returns_outbound_and_return():
    from main import app
    mock_client = MagicMock()
    mock_client.search_outbound.return_value = [MagicMock(to_dict=lambda: MOCK_OFFER)]
    mock_client.search_return.return_value = [MagicMock(to_dict=lambda: MOCK_OFFER)]

    with patch("main.flight_client", mock_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/search", json={
                "outbound_date": "2026-03-06",
                "return_dates": ["2026-03-08"]
            })

    assert response.status_code == 200
    data = response.json()
    assert "outbound" in data
    assert "returns" in data
    assert len(data["outbound"]) == 1

@pytest.mark.asyncio
async def test_search_missing_date_returns_422():
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/search", json={})
    assert response.status_code == 422
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_search_endpoint.py -v
```
Expected: FAIL

**Step 3: Add search endpoint to `main.py`**

Add these imports and code to `main.py`:

```python
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
from datetime import date
import asyncio
from amadeus_client import FlightSearchClient

app = FastAPI(title="Paris-Istanbul Flight Finder")
app.mount("/static", StaticFiles(directory="static"), name="static")

try:
    flight_client = FlightSearchClient()
except RuntimeError as e:
    flight_client = None
    print(f"WARNING: {e}")

class SearchRequest(BaseModel):
    outbound_date: date
    return_dates: List[date]

@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.post("/api/search")
async def search_flights(req: SearchRequest):
    if flight_client is None:
        raise HTTPException(status_code=503, detail="Amadeus credentials not configured. Add AMADEUS_API_KEY and AMADEUS_API_SECRET to .env")

    loop = asyncio.get_event_loop()

    outbound_task = loop.run_in_executor(None, flight_client.search_outbound, req.outbound_date)
    return_tasks = [
        loop.run_in_executor(None, flight_client.search_return, d)
        for d in req.return_dates
    ]

    outbound_results, *return_results_nested = await asyncio.gather(outbound_task, *return_tasks)
    return_results = [offer for sublist in return_results_nested for offer in sublist]

    return {
        "outbound": [o.to_dict() for o in outbound_results],
        "returns": [r.to_dict() for r in return_results],
    }
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_search_endpoint.py -v
```
Expected: 2 PASSED

**Step 5: Commit**

```bash
git add main.py tests/test_search_endpoint.py
git commit -m "feat: POST /api/search endpoint with async batching"
```

---

## Task 6: Full HTML page structure

**Files:**
- Modify: `static/index.html`

**Step 1: Replace placeholder with full HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Paris ↔ Istanbul Flights</title>
  <link rel="stylesheet" href="/static/style.css" />
</head>
<body>
  <header>
    <h1>✈ Paris ↔ Istanbul</h1>
    <p class="subtitle">Direct flights only · Economy · 1 adult</p>
  </header>

  <main>
    <!-- Search Form -->
    <section id="search-section">
      <div class="mode-tabs">
        <button class="mode-btn active" data-mode="specific">Specific Date</button>
        <button class="mode-btn" data-mode="weekends">Weekends</button>
        <button class="mode-btn" data-mode="window">Next N Weeks</button>
      </div>

      <div id="mode-specific" class="mode-panel">
        <label>Outbound Friday <input type="date" id="specific-outbound" /></label>
        <div class="return-toggles">
          <span>Return:</span>
          <label><input type="checkbox" id="ret-sunday" checked /> Sunday evening</label>
          <label><input type="checkbox" id="ret-monday" checked /> Very early Monday</label>
        </div>
      </div>

      <div id="mode-weekends" class="mode-panel hidden">
        <label>From <input type="date" id="weekends-start" /></label>
        <label>To <input type="date" id="weekends-end" /></label>
      </div>

      <div id="mode-window" class="mode-panel hidden">
        <label>Next <input type="number" id="window-weeks" value="4" min="1" max="52" /> weeks</label>
      </div>

      <div class="time-toggles">
        <span>Depart on Friday:</span>
        <label><input type="checkbox" id="dep-early" checked /> Very early (00–09h)</label>
        <label><input type="checkbox" id="dep-afternoon" checked /> After 4pm (16–24h)</label>
      </div>

      <button id="search-btn">Search Flights</button>
      <div id="search-error" class="error hidden"></div>
    </section>

    <!-- Results -->
    <section id="results-section" class="hidden">
      <div class="results-columns">

        <!-- Outbound column -->
        <div class="result-col" id="outbound-col">
          <h2>Outbound (Paris → Istanbul)</h2>
          <div class="col-controls">
            <label>Max price: <span id="out-price-val">any</span>
              <input type="range" id="out-price-slider" min="0" max="1000" value="1000" />
            </label>
            <label>Sort:
              <select id="out-sort">
                <option value="price-asc">Cheapest first</option>
                <option value="price-desc">Most expensive first</option>
                <option value="time-asc">Earliest departure</option>
              </select>
            </label>
            <div class="view-toggle">
              <button class="view-btn active" data-col="out" data-view="cards">Cards</button>
              <button class="view-btn" data-col="out" data-view="table">Table</button>
            </div>
          </div>
          <div id="out-best" class="best-combo hidden"></div>
          <div id="out-results"></div>
        </div>

        <!-- Return column -->
        <div class="result-col" id="return-col">
          <h2>Return (Istanbul → Paris)</h2>
          <div class="col-controls">
            <label>Max price: <span id="ret-price-val">any</span>
              <input type="range" id="ret-price-slider" min="0" max="1000" value="1000" />
            </label>
            <label>Sort:
              <select id="ret-sort">
                <option value="price-asc">Cheapest first</option>
                <option value="price-desc">Most expensive first</option>
                <option value="time-asc">Earliest departure</option>
              </select>
            </label>
            <div class="view-toggle">
              <button class="view-btn active" data-col="ret" data-view="cards">Cards</button>
              <button class="view-btn" data-col="ret" data-view="table">Table</button>
            </div>
          </div>
          <div id="ret-best" class="best-combo hidden"></div>
          <div id="ret-results"></div>
        </div>

      </div>
    </section>
  </main>

  <script src="/static/app.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add static/index.html
git commit -m "feat: full HTML structure for flight finder UI"
```

---

## Task 7: CSS styling

**Files:**
- Create: `static/style.css`

**Step 1: Write `style.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  min-height: 100vh;
  padding: 1.5rem;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

header h1 { font-size: 2rem; color: #60a5fa; }
header .subtitle { color: #94a3b8; margin-top: .3rem; }

/* Search section */
#search-section {
  max-width: 700px;
  margin: 0 auto 2rem;
  background: #1e2130;
  border-radius: 12px;
  padding: 1.5rem;
}

.mode-tabs { display: flex; gap: .5rem; margin-bottom: 1.2rem; }

.mode-btn {
  padding: .4rem 1rem;
  border-radius: 6px;
  border: 1px solid #334155;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: .9rem;
}
.mode-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }

.mode-panel { margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: .8rem; align-items: center; }
.mode-panel label { display: flex; align-items: center; gap: .4rem; color: #cbd5e1; font-size: .9rem; }
.mode-panel input[type="date"],
.mode-panel input[type="number"] {
  background: #0f1117;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 6px;
  padding: .3rem .6rem;
}

.return-toggles, .time-toggles {
  display: flex; flex-wrap: wrap; gap: .8rem; align-items: center;
  margin-bottom: 1rem; color: #94a3b8; font-size: .9rem;
}
.return-toggles label, .time-toggles label {
  display: flex; align-items: center; gap: .3rem; color: #cbd5e1;
}

#search-btn {
  width: 100%;
  padding: .75rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: .5rem;
}
#search-btn:hover { background: #1d4ed8; }
#search-btn:disabled { background: #334155; cursor: not-allowed; }

.error { color: #f87171; margin-top: .8rem; font-size: .9rem; }

/* Results */
#results-section { max-width: 1200px; margin: 0 auto; }

.results-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
@media (max-width: 768px) { .results-columns { grid-template-columns: 1fr; } }

.result-col {
  background: #1e2130;
  border-radius: 12px;
  padding: 1.2rem;
}
.result-col h2 { font-size: 1rem; color: #93c5fd; margin-bottom: 1rem; }

.col-controls { display: flex; flex-direction: column; gap: .6rem; margin-bottom: 1rem; }
.col-controls label { font-size: .85rem; color: #94a3b8; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.col-controls input[type="range"] { flex: 1; accent-color: #2563eb; }
.col-controls select {
  background: #0f1117; border: 1px solid #334155; color: #e2e8f0;
  border-radius: 6px; padding: .2rem .5rem; font-size: .85rem;
}

.view-toggle { display: flex; gap: .3rem; }
.view-btn {
  padding: .25rem .7rem; border-radius: 5px; border: 1px solid #334155;
  background: transparent; color: #94a3b8; cursor: pointer; font-size: .8rem;
}
.view-btn.active { background: #1d4ed8; color: white; border-color: #1d4ed8; }

.best-combo {
  background: #14532d;
  border: 1px solid #16a34a;
  border-radius: 8px;
  padding: .6rem .9rem;
  font-size: .85rem;
  color: #86efac;
  margin-bottom: .8rem;
}

/* Flight card */
.flight-card {
  background: #0f1117;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: .9rem 1rem;
  margin-bottom: .6rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: .5rem;
}
.flight-card.early { border-left: 3px solid #60a5fa; }
.flight-card.evening { border-left: 3px solid #fb923c; }

.flight-card .times { font-size: 1.1rem; font-weight: 600; }
.flight-card .route { font-size: .8rem; color: #64748b; }
.flight-card .info { font-size: .8rem; color: #94a3b8; }
.flight-card .price { font-size: 1.2rem; font-weight: 700; color: #34d399; white-space: nowrap; }

/* Table */
.flight-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.flight-table th { text-align: left; padding: .4rem .5rem; color: #64748b; border-bottom: 1px solid #1e293b; }
.flight-table td { padding: .5rem; border-bottom: 1px solid #1a2035; }
.flight-table tr:hover td { background: #1e2130; }
.price-cell { color: #34d399; font-weight: 600; }
.early-row { border-left: 2px solid #60a5fa; }
.evening-row { border-left: 2px solid #fb923c; }

.hidden { display: none !important; }
.loading { text-align: center; color: #64748b; padding: 2rem; }
.no-results { text-align: center; color: #64748b; padding: 1.5rem; font-size: .9rem; }
```

**Step 2: Commit**

```bash
git add static/style.css
git commit -m "feat: dark theme CSS styling"
```

---

## Task 8: Frontend JavaScript — search form logic

**Files:**
- Create: `static/app.js`

**Step 1: Write `app.js` — date mode + search**

```javascript
// static/app.js

// ── State ──────────────────────────────────────────────────────
let outboundFlights = [];
let returnFlights = [];
let currentMode = 'specific';

// ── Date helpers ───────────────────────────────────────────────
function getFridaysInRange(start, end) {
  const fridays = [];
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === 5) fridays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return fridays;
}

function getFridaysNextNWeeks(n) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + n * 7);
  return getFridaysInRange(today, end);
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function getReturnDates(friday) {
  const dates = [];
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  const monday = new Date(friday);
  monday.setDate(friday.getDate() + 3);
  if (document.getElementById('ret-sunday').checked) dates.push(formatDate(sunday));
  if (document.getElementById('ret-monday').checked) dates.push(formatDate(monday));
  return dates;
}

// ── Mode tab switching ─────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.mode-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`mode-${currentMode}`).classList.remove('hidden');
  });
});

// ── Build search requests from current mode ────────────────────
function buildSearchRequests() {
  if (currentMode === 'specific') {
    const outDate = document.getElementById('specific-outbound').value;
    if (!outDate) throw new Error('Please pick an outbound Friday.');
    const friday = new Date(outDate);
    const returnDates = getReturnDates(friday);
    if (!returnDates.length) throw new Error('Select at least one return day.');
    return [{ outbound_date: outDate, return_dates: returnDates }];
  }

  if (currentMode === 'weekends') {
    const start = new Date(document.getElementById('weekends-start').value);
    const end = new Date(document.getElementById('weekends-end').value);
    if (!start || !end || start > end) throw new Error('Pick a valid date range.');
    const fridays = getFridaysInRange(start, end);
    if (!fridays.length) throw new Error('No Fridays found in that range.');
    return fridays.map(f => ({
      outbound_date: formatDate(f),
      return_dates: getReturnDates(f),
    }));
  }

  if (currentMode === 'window') {
    const n = parseInt(document.getElementById('window-weeks').value, 10);
    const fridays = getFridaysNextNWeeks(n);
    if (!fridays.length) throw new Error('No Fridays found.');
    return fridays.map(f => ({
      outbound_date: formatDate(f),
      return_dates: getReturnDates(f),
    }));
  }
}

// ── Search ─────────────────────────────────────────────────────
async function search() {
  const btn = document.getElementById('search-btn');
  const errEl = document.getElementById('search-error');
  errEl.classList.add('hidden');

  let requests;
  try { requests = buildSearchRequests(); }
  catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  btn.textContent = 'Searching…';

  try {
    const results = await Promise.all(
      requests.map(r =>
        fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        }).then(res => res.json())
      )
    );

    outboundFlights = results.flatMap(r => r.outbound || []);
    returnFlights = results.flatMap(r => r.returns || []);

    initFilters();
    renderAll();
    document.getElementById('results-section').classList.remove('hidden');
  } catch (e) {
    errEl.textContent = 'Search failed: ' + e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Flights';
  }
}

document.getElementById('search-btn').addEventListener('click', search);
```

**Step 2: Commit**

```bash
git add static/app.js
git commit -m "feat: JS search form logic and date mode handling"
```

---

## Task 9: Frontend JavaScript — filters, rendering, view toggle

**Files:**
- Modify: `static/app.js` (append to existing file)

**Step 1: Append filter + render logic to `app.js`**

```javascript
// ── Time window classification ─────────────────────────────────
function getTimeWindow(isoString) {
  const hour = new Date(isoString).getHours();
  if (hour >= 0 && hour < 9) return 'early';
  if (hour >= 16) return 'evening';
  return 'other';
}

function timeLabel(w) {
  return w === 'early' ? '🌙 Early' : w === 'evening' ? '🌆 Evening' : '';
}

// ── Filter application ─────────────────────────────────────────
function applyFilters(flights, col) {
  const maxPrice = parseFloat(document.getElementById(`${col}-price-slider`).value);
  const sort = document.getElementById(`${col}-sort`).value;

  const depEarly = document.getElementById('dep-early').checked;
  const depAfternoon = document.getElementById('dep-afternoon').checked;

  let filtered = flights.filter(f => {
    if (f.price > maxPrice) return false;
    const w = getTimeWindow(f.departure_at);
    if (col === 'out') {
      if (!depEarly && w === 'early') return false;
      if (!depAfternoon && w === 'evening') return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'time-asc') return new Date(a.departure_at) - new Date(b.departure_at);
    return 0;
  });

  return filtered;
}

// ── Duration formatting ────────────────────────────────────────
function formatDuration(iso) {
  return iso.replace('PT', '').replace('H', 'h ').replace('M', 'm');
}

// ── Card render ────────────────────────────────────────────────
function renderCards(flights, containerId) {
  const el = document.getElementById(containerId);
  if (!flights.length) { el.innerHTML = '<p class="no-results">No flights match your filters.</p>'; return; }
  el.innerHTML = flights.map(f => {
    const dep = new Date(f.departure_at);
    const arr = new Date(f.arrival_at);
    const w = getTimeWindow(f.departure_at);
    const fmt = t => t.toTimeString().slice(0,5);
    return `<div class="flight-card ${w}">
      <div>
        <div class="times">${fmt(dep)} → ${fmt(arr)}</div>
        <div class="route">${f.origin} → ${f.destination}</div>
        <div class="info">${f.carrier}${f.flight_number} · ${formatDuration(f.duration)} ${timeLabel(w)}</div>
      </div>
      <div class="price">€${f.price.toFixed(0)}</div>
    </div>`;
  }).join('');
}

// ── Table render ───────────────────────────────────────────────
function renderTable(flights, containerId) {
  const el = document.getElementById(containerId);
  if (!flights.length) { el.innerHTML = '<p class="no-results">No flights match your filters.</p>'; return; }
  const rows = flights.map(f => {
    const dep = new Date(f.departure_at);
    const arr = new Date(f.arrival_at);
    const w = getTimeWindow(f.departure_at);
    const fmt = t => t.toTimeString().slice(0,5);
    const dateStr = dep.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
    return `<tr class="${w}-row">
      <td>${dateStr}</td>
      <td>${fmt(dep)}</td>
      <td>${fmt(arr)}</td>
      <td>${f.origin}→${f.destination}</td>
      <td>${f.carrier}${f.flight_number}</td>
      <td>${formatDuration(f.duration)}</td>
      <td class="price-cell">€${f.price.toFixed(0)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="flight-table">
    <thead><tr><th>Date</th><th>Dep</th><th>Arr</th><th>Route</th><th>Flight</th><th>Duration</th><th>Price</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Render dispatcher ──────────────────────────────────────────
let outView = 'cards';
let retView = 'cards';

function renderCol(flights, col, view, resultsId, bestId) {
  const best = flights.reduce((min, f) => f.price < (min?.price ?? Infinity) ? f : min, null);
  const bestEl = document.getElementById(bestId);
  if (best) {
    bestEl.textContent = `Best: €${best.price.toFixed(0)} · ${best.carrier}${best.flight_number} · ${new Date(best.departure_at).toTimeString().slice(0,5)} (${best.origin}→${best.destination})`;
    bestEl.classList.remove('hidden');
  } else {
    bestEl.classList.add('hidden');
  }
  if (view === 'cards') renderCards(flights, resultsId);
  else renderTable(flights, resultsId);
}

function renderAll() {
  const outFiltered = applyFilters(outboundFlights, 'out');
  const retFiltered = applyFilters(returnFlights, 'ret');
  renderCol(outFiltered, 'out', outView, 'out-results', 'out-best');
  renderCol(retFiltered, 'ret', retView, 'ret-results', 'ret-best');
}

// ── Init sliders from actual data ──────────────────────────────
function initFilters() {
  const outMax = Math.ceil(Math.max(...outboundFlights.map(f => f.price), 100));
  const retMax = Math.ceil(Math.max(...returnFlights.map(f => f.price), 100));
  const outSlider = document.getElementById('out-price-slider');
  const retSlider = document.getElementById('ret-price-slider');
  outSlider.max = outMax; outSlider.value = outMax;
  retSlider.max = retMax; retSlider.value = retMax;
  document.getElementById('out-price-val').textContent = `€${outMax}`;
  document.getElementById('ret-price-val').textContent = `€${retMax}`;
}

// ── Event listeners for filters ────────────────────────────────
document.getElementById('out-price-slider').addEventListener('input', e => {
  document.getElementById('out-price-val').textContent = `€${e.target.value}`;
  renderAll();
});
document.getElementById('ret-price-slider').addEventListener('input', e => {
  document.getElementById('ret-price-val').textContent = `€${e.target.value}`;
  renderAll();
});
document.getElementById('out-sort').addEventListener('change', renderAll);
document.getElementById('ret-sort').addEventListener('change', renderAll);
document.getElementById('dep-early').addEventListener('change', renderAll);
document.getElementById('dep-afternoon').addEventListener('change', renderAll);

// ── View toggle ────────────────────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    const view = btn.dataset.view;
    btn.closest('.view-toggle').querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (col === 'out') outView = view;
    else retView = view;
    renderAll();
  });
});
```

**Step 2: Commit**

```bash
git add static/app.js
git commit -m "feat: filter, sort, card/table rendering in frontend JS"
```

---

## Task 10: End-to-end smoke test + README

**Files:**
- Create: `README.md`

**Step 1: Manual smoke test**

1. Sign up at https://developers.amadeus.com — create a test app, copy API key + secret
2. Copy `.env.example` to `.env` and fill in credentials
3. Run:
   ```bash
   source .venv/bin/activate
   uvicorn main:app --reload
   ```
4. Open `http://localhost:8000`
5. Select "Specific Date" mode, pick an upcoming Friday
6. Click "Search Flights"
7. Verify outbound and return columns populate
8. Test price slider — cards should disappear above threshold
9. Test sort — order should change
10. Test card/table toggle — layout should switch
11. Test "Weekends" mode with a 2-week range — should show multiple Fridays' results

**Step 2: Run all backend tests**

```bash
pytest -v
```
Expected: all PASSED

**Step 3: Write `README.md`**

```markdown
# Paris ↔ Istanbul Flight Finder

Personal web app for finding optimal direct weekend flights.

## Setup

1. Sign up at https://developers.amadeus.com (free test tier)
2. Create `.env` from `.env.example` and add your credentials
3. Install dependencies:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. Start the server:
   ```bash
   uvicorn main:app --reload
   ```
5. Open http://localhost:8000

## Features

- Direct flights only, Paris (CDG/ORY) ↔ Istanbul (IST/SAW)
- Three date modes: specific Friday, weekends in a range, next N weeks
- Time window filters: very early morning / after 4pm outbound, Sunday evening / early Monday return
- Price slider + sort per column
- Card and table view toggle
- Best price highlighted per column

## Switch to production

Change `AMADEUS_HOSTNAME=production` in `.env` after testing.
```

**Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Project scaffold, deps, .gitignore |
| 2 | Date utilities (Fridays, return dates) |
| 3 | Amadeus client wrapper + FlightOffer dataclass |
| 4 | FastAPI app + static file serving |
| 5 | POST /api/search endpoint with async batching |
| 6 | Full HTML page structure |
| 7 | Dark theme CSS |
| 8 | JS search form + date mode logic |
| 9 | JS filters, sorting, card/table rendering |
| 10 | Smoke test + README |
