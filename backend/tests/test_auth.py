import pytest

from app.db import (
    DEFAULT_USERNAME,
    connect,
    create_user,
    get_user_by_username,
    hash_password,
    init_db,
    verify_password,
)


def test_login_with_correct_credentials_sets_a_cookie(client):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies


def test_login_with_wrong_password_is_rejected(client):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_with_unknown_user_is_rejected(client):
    response = client.post(
        "/api/auth/login", json={"username": "nobody", "password": "password"}
    )
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_requires_both_fields(client):
    assert client.post("/api/auth/login", json={"username": "user"}).status_code == 422


def test_me_is_unauthorised_when_signed_out(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_the_username_when_signed_in(signed_in):
    response = signed_in.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_the_session(signed_in):
    assert signed_in.post("/api/auth/logout").status_code == 200
    assert signed_in.get("/api/auth/me").status_code == 401


def test_session_cookie_is_http_only(client):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_the_session_survives_across_requests(signed_in):
    for _ in range(3):
        assert signed_in.get("/api/auth/me").status_code == 200


def test_a_session_for_a_missing_user_is_rejected(signed_in, tmp_path, monkeypatch):
    # Point at an empty database, as if the file had been deleted and recreated.
    monkeypatch.setenv("DB_PATH", str(tmp_path / "other.db"))
    init_db()
    with connect() as connection:
        connection.execute("DELETE FROM users")

    assert signed_in.get("/api/auth/me").status_code == 401


def test_health_stays_public(client):
    assert client.get("/api/health").status_code == 200


class TestPasswordHashing:
    def test_the_seeded_password_is_not_stored_in_plain_text(self, client):
        user = get_user_by_username(DEFAULT_USERNAME)
        assert user["password_hash"] != "password"
        assert "password" not in user["password_hash"]

    def test_a_hash_verifies_its_own_password(self):
        stored = hash_password("hunter2")
        assert verify_password("hunter2", stored)
        assert not verify_password("hunter3", stored)

    def test_the_same_password_hashes_differently_each_time(self):
        assert hash_password("same") != hash_password("same")

    def test_a_malformed_hash_does_not_verify(self):
        """A row without the salt separator is a failed sign in, not a 500."""
        assert not verify_password("hunter2", "no-separator-here")
        assert not verify_password("hunter2", "")


class TestSeeding:
    def test_the_default_user_is_created(self, client):
        assert get_user_by_username(DEFAULT_USERNAME) is not None

    def test_the_database_file_is_created(self, client, tmp_path):
        assert (tmp_path / "test.db").exists()

    def test_seeding_twice_does_not_duplicate_the_user(self, client):
        init_db()
        init_db()
        with connect() as connection:
            count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        assert count == 1

    def test_usernames_are_unique(self, client):
        with pytest.raises(Exception):
            create_user(DEFAULT_USERNAME, "another")

    def test_the_database_supports_more_than_one_user(self, client):
        create_user("second", "secret")
        assert get_user_by_username("second") is not None
        assert get_user_by_username(DEFAULT_USERNAME) is not None
