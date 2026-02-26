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


def test_search_serializes_nonstop_as_lowercase_boolean_string():
    client = FlightSearchClient.__new__(FlightSearchClient)
    mock_amadeus = MagicMock()
    mock_amadeus.shopping.flight_offers_search.get.return_value = MagicMock(data=[])
    client.amadeus = mock_amadeus

    client._search_one_pair("CDG", "IST", date(2026, 3, 6))

    kwargs = mock_amadeus.shopping.flight_offers_search.get.call_args.kwargs
    assert kwargs["nonStop"] == "true"
