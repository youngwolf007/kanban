import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A client backed by its own throwaway database, seeded by the app's lifespan."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def signed_in(client):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return client


@pytest.fixture
def board_id(signed_in):
    """A fresh board, seeded with the demo content, owned by the signed-in user."""
    response = signed_in.post("/api/boards", json={})
    assert response.status_code == 201
    return response.json()["id"]
