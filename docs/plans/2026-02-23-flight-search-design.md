# Paris ↔ Istanbul Flight Finder — Design Doc
**Date:** 2026-02-23
**Status:** Approved

---

## Overview

A personal web app for finding optimal direct round-trip flights between Paris (CDG/ORY) and Istanbul (IST/SAW). Built for weekend trip planning: depart Friday, return Sunday evening or early Monday.

---

## Architecture

**Stack:** FastAPI (Python) backend + vanilla JS/HTML/CSS frontend
**Pattern:** REST API — backend handles Amadeus calls, frontend handles filtering/rendering

### Project Structure

```
flights/
├── main.py              # FastAPI app + API routes
├── amadeus_client.py    # Amadeus SDK wrapper (search logic)
├── .env                 # AMADEUS_API_KEY + AMADEUS_API_SECRET (never committed)
├── requirements.txt
└── static/
    ├── index.html       # Single page app
    ├── style.css
    └── app.js           # Fetch + filter + render logic
```

### Data Flow

1. User sets search params in browser → JS calls `POST /api/search`
2. FastAPI reads `.env` credentials → calls Amadeus Flight Offers Search API
3. Results returned as JSON → JS filters/sorts in-browser
4. No database — results are ephemeral per search

---

## Amadeus API Integration

- **SDK:** `amadeus` Python package (not raw HTTP)
- **Endpoint:** `GET /v2/shopping/flight-offers`
- **Auth:** OAuth2 — SDK handles token refresh automatically
- **Key parameters:**
  - `nonStop=true` — direct flights only, always
  - `adults=1`
  - `travelClass=ECONOMY`
  - `currencyCode=EUR`

### Airport Pairs Searched

Every search covers all combinations:
- Origins: CDG, ORY
- Destinations: IST, SAW
- Total: up to 4 origin-destination pairs per date

### Async Batching

For "Weekends" and "Window" date modes, one API call is made per Friday in range, executed in parallel via `asyncio`. Results are merged and returned together.

### In-Memory Caching

Results cached per search session — filter/sort changes are purely client-side and do not trigger new API calls.

---

## Fixed Constraints (Hardcoded)

| Parameter | Value |
|-----------|-------|
| Route | Paris (CDG/ORY) ↔ Istanbul (IST/SAW) |
| Trip type | Round trip |
| Stops | Direct only (nonStop=true) |
| Passengers | 1 adult |
| Cabin | Economy |

---

## Search Parameters (User-Configurable)

### Date Modes

| Mode | Description |
|------|-------------|
| **Specific Date** | Pick exact outbound Friday + return Sunday/Monday |
| **Weekends** | Pick a month range — app finds all Fridays automatically |
| **Fixed Window** | Enter "next N weeks" — app generates all Fridays in range |

### Time Windows

**Outbound (Friday):**
- "Very early morning": 00:00–09:00
- "After 4pm": 16:00–23:59
- Both (default)

**Return:**
- "Sunday evening": 18:00–23:59
- "Very early Monday": 00:00–06:00
- Both (default)

---

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  ✈ Paris ↔ Istanbul Flight Finder               │
├─────────────────────────────────────────────────┤
│  DATE MODE: [Specific Date] [Weekends] [Window] │
│                                                  │
│  Outbound Friday:  [date picker / range]         │
│  Return:           [Sunday eve] [Early Monday]   │
│  Depart window:    [Early morning] [After 4pm]   │
│                                                  │
│  [Search Flights]                                │
├─────────────────────────────────────────────────┤
│  OUTBOUND FLIGHTS          RETURN FLIGHTS        │
│  Price: [====●========]    Price: [===●=========]│
│  Sort: [Cheapest ▼]        Sort: [Cheapest ▼]   │
│  View: [Cards] [Table]     View: [Cards] [Table] │
├─────────────────────────────────────────────────┤
│  [Results — two columns side by side]            │
│  Outbound results  │  Return results             │
└─────────────────────────────────────────────────┘
```

**UX decisions:**
- Two-column layout: outbound left, return right
- Filters appear only after results load
- "Best Combo" banner highlights cheapest outbound + cheapest return pair
- Color-coded time windows: early morning = blue, evening = orange
- Mobile: columns stack vertically
- Card/Table toggle per column independently

**Card shows:** airline, departure time, arrival time, duration, price
**Table shows:** same info in dense sortable rows

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Rate limit exceeded | Friendly message + retry suggestion |
| No flights found for a date | "No direct flights found" per date row |
| Missing `.env` credentials | Clear startup error pointing to setup |
| Amadeus API error | Display error code + message from SDK |

---

## Setup (First Run)

1. Sign up at developers.amadeus.com → get API key + secret (free test tier)
2. Create `.env` with `AMADEUS_API_KEY` and `AMADEUS_API_SECRET`
3. `pip install -r requirements.txt`
4. `uvicorn main:app --reload`
5. Open `http://localhost:8000`
6. Switch to Amadeus production credentials when ready

---

## Out of Scope

- User accounts / saved searches
- Price alerts / notifications
- Multi-passenger booking
- Booking / redirect to airline
- Any route other than Paris ↔ Istanbul
