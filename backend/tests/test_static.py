from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_serves_exported_frontend():
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Kanban Studio" in response.text


def test_root_serves_the_built_assets():
    index = client.get("/").text
    asset = next(part for part in index.split('"') if part.startswith("/_next/"))
    response = client.get(asset)
    assert response.status_code == 200
