import os
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional
from amadeus import Client, ResponseError
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

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
        except ResponseError as e:
            errors = getattr(e.response, 'result', {}).get('errors', [{}])
            code = errors[0].get('code', '?') if errors else '?'
            detail = errors[0].get('detail', str(e)) if errors else str(e)
            logger.warning("Amadeus %s→%s %s: [%s] %s", origin, destination, depart_date, code, detail)
            return []

    def search_outbound(self, depart_date: date) -> List[FlightOffer]:
        """Search all Paris -> Istanbul pairs for a given date."""
        results = []
        for origin in PARIS_AIRPORTS:
            for dest in ISTANBUL_AIRPORTS:
                results.extend(self._search_one_pair(origin, dest, depart_date))
        return results

    def search_return(self, return_date: date) -> List[FlightOffer]:
        """Search all Istanbul -> Paris pairs for a given date."""
        results = []
        for origin in ISTANBUL_AIRPORTS:
            for dest in PARIS_AIRPORTS:
                results.extend(self._search_one_pair(origin, dest, return_date))
        return results
