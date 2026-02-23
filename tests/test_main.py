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
