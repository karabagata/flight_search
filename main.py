import logging
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
from datetime import date
import asyncio
from amadeus_client import FlightSearchClient

logging.basicConfig(level=logging.WARNING, format="%(levelname)s [%(name)s] %(message)s")

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
