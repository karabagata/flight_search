# CLAUDE.md

Instructions for Claude Code when working in this repository.

## Project

Personal web app for finding optimal direct round-trip flights between Paris (CDG/ORY) and Istanbul (IST/SAW). Built for Friday-departure / Sunday-or-Monday-return weekend trip planning.

## Stack

- **Backend:** Python 3.11+, FastAPI, uvicorn, `amadeus` Python SDK, `python-dotenv`
- **Frontend:** Vanilla JS + HTML + CSS (no build tools, no framework)
- **Tests:** pytest + pytest-asyncio + httpx
- **Venv:** `.venv/` — always activate before running Python: `source .venv/bin/activate`

## Project Structure

```
main.py              # FastAPI app — GET / and POST /api/search
amadeus_client.py    # Amadeus SDK wrapper — FlightOffer dataclass + FlightSearchClient
date_utils.py        # Pure date helpers — Friday generation, return date logic
static/
  index.html         # Single-page UI
  style.css          # Dark theme
  app.js             # All frontend logic: search, filters, card/table rendering
tests/
  test_amadeus_client.py
  test_date_utils.py
  test_main.py
  test_search_endpoint.py
docs/plans/          # Design doc and implementation plan (history)
```

## Fixed Constraints (Never Change Without User Approval)

- Route: Paris (CDG, ORY) ↔ Istanbul (IST, SAW) only
- Direct flights only (`nonStop=True`)
- 1 adult, Economy, EUR
- Amadeus SDK used for all API calls — no raw HTTP

## Running Locally

```bash
source .venv/bin/activate
uvicorn main:app --reload
# → http://localhost:8000
```

## Running Tests

```bash
source .venv/bin/activate
pytest -v
```

All 9 tests must pass before committing.

## Environment

Credentials live in `.env` (gitignored). Copy `.env.example` to `.env` and fill in:
```
AMADEUS_API_KEY=...
AMADEUS_API_SECRET=...
AMADEUS_HOSTNAME=test   # or: production
```

## Key Design Decisions

- **Credentials server-side only** — never exposed to the browser
- **Fetch once, filter client-side** — POST /api/search returns all data; JS handles filtering/sorting without re-fetching
- **Rate limiting** — 120ms delay between each Amadeus API call; auto-retry once on 38194 rate-limit error
- **Time windows:**
  - Outbound Friday: "very early" = 00–08h, "afternoon" = 16h+, mid-day always rejected
  - Return Sunday: evening only (18h+)
  - Return Monday: very early only (00–05h)
- **38189 errors** from Amadeus are silently skipped (means no data for that route/date in sandbox)

## When Modifying amadeus_client.py

The Amadeus SDK call in `_search_one_pair` must always include:
- `nonStop=True`
- `adults=1`
- `travelClass="ECONOMY"`
- `currencyCode="EUR"`
- The 120ms `time.sleep(CALL_DELAY)` must stay at the top of the method

## When Modifying app.js

- `outboundFlights` and `returnFlights` are the single source of truth in browser state
- `renderAll()` is the only render entry point — always call it after any state change
- `applyFilters(flights, col)` where `col` is `"out"` or `"ret"` — returns filtered+sorted array
- Do not add new API calls to the frontend; all data comes from the single POST /api/search

## Switching to Production Amadeus

Change `.env`:
```
AMADEUS_HOSTNAME=production
AMADEUS_API_KEY=<production key>
AMADEUS_API_SECRET=<production secret>
```
No code changes needed.
