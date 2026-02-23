# Paris ↔ Istanbul Flight Finder

Personal web app for finding optimal direct weekend flights.

## Setup

1. Sign up at https://developers.amadeus.com (free test tier)
2. Create `.env` from `.env.example` and fill in your credentials:
   ```
   AMADEUS_API_KEY=your_key
   AMADEUS_API_SECRET=your_secret
   AMADEUS_HOSTNAME=test
   ```
3. Install dependencies:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
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
- Time window filters: very early morning / after 4pm outbound; Sunday evening / early Monday return
- Price slider + sort per column
- Card and table view toggle
- Best price highlighted per column

## Switch to production

Change `AMADEUS_HOSTNAME=production` in `.env` after testing.
