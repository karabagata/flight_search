# AGENTS.md

Instructions for AI coding agents (Codex, Copilot, etc.) working in this repository.

## What This Project Does

Personal flight search tool: Paris ↔ Istanbul, direct flights only, weekend trips (Friday departure, Sunday evening or early Monday return). FastAPI backend + vanilla JS frontend.

## Before You Write Any Code

1. Read `CLAUDE.md` for full project context, constraints, and design decisions
2. Run existing tests to confirm baseline: `source .venv/bin/activate && pytest -v`
3. All 9 tests must still pass after your changes

## File Responsibilities

| File | Purpose | Touch for |
|------|---------|-----------|
| `main.py` | FastAPI routes | New endpoints, request/response shape changes |
| `amadeus_client.py` | Amadeus API wrapper | API call changes, new search parameters |
| `date_utils.py` | Date math only | Friday/return date logic |
| `static/app.js` | All frontend logic | UI behavior, filtering, rendering |
| `static/index.html` | HTML structure | New UI controls |
| `static/style.css` | Dark theme styles | Visual changes |

## Hard Rules

- **Never remove `nonStop=True`** from the Amadeus API call
- **Never expose credentials** to the frontend (no JS env vars, no inline keys)
- **Never add a database** — data is ephemeral per search session by design
- **Never add a framework** (React, Vue, etc.) to the frontend without explicit user request
- **Never change the route** — Paris/Istanbul airports are hardcoded by design
- **Always keep `time.sleep(CALL_DELAY)`** in `_search_one_pair` to avoid rate limiting
- **Always run `pytest -v`** before considering a task done

## TDD Workflow

This project follows TDD. For any backend change:
1. Write a failing test first
2. Run it to confirm it fails
3. Implement the minimal code to make it pass
4. Run all tests to confirm nothing broke
5. Commit

## API Shape

### POST /api/search

Request:
```json
{
  "outbound_date": "2026-03-06",
  "return_dates": ["2026-03-08", "2026-03-09"]
}
```

Response:
```json
{
  "outbound": [FlightOffer, ...],
  "returns": [FlightOffer, ...]
}
```

FlightOffer fields: `origin`, `destination`, `departure_at` (ISO), `arrival_at` (ISO), `carrier`, `flight_number`, `duration` (ISO 8601 duration), `price` (float), `currency`

## Common Gotchas

- `getHours()` in JS uses **local timezone** — if you add timezone handling, be consistent between frontend and backend
- `38189` from Amadeus = no data for that route/date (normal in test sandbox, not a bug)
- `38194` from Amadeus = rate limit — the retry logic in `_search_one_pair` handles this automatically
- The `mode-panel` divs in `index.html` use `.hidden` class to show/hide — don't use `display:none` inline
- `renderAll()` in `app.js` must be called after any filter state change — it re-renders both columns
