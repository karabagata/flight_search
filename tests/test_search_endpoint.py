# tests/test_search_endpoint.py
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
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
