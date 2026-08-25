import copy

import pytest

from app.db import create_user, get_board, save_board
from app.models import (
    DEFAULT_BOARD,
    MAX_CARDS,
    MAX_COLUMNS,
    MAX_DETAILS_LENGTH,
    MAX_TITLE_LENGTH,
)


def a_board() -> dict:
    return copy.deepcopy(DEFAULT_BOARD)


def a_small_board() -> dict:
    return {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
            {"id": "col-b", "title": "B", "cardIds": []},
        ],
        "cards": {"card-1": {"id": "card-1", "title": "One", "details": "Details"}},
    }


class TestReading:
    def test_requires_a_signed_in_user(self, client):
        assert client.get("/api/board").status_code == 401

    def test_seeds_the_demo_board_on_the_first_read(self, signed_in):
        response = signed_in.get("/api/board")
        assert response.status_code == 200

        board = response.json()
        assert [column["id"] for column in board["columns"]] == [
            "col-backlog",
            "col-discovery",
            "col-progress",
            "col-review",
            "col-done",
        ]
        assert len(board["cards"]) == 8

    def test_the_seeded_board_is_written_to_the_database(self, signed_in):
        assert get_board(1) is None
        signed_in.get("/api/board")
        assert get_board(1) is not None

    def test_reading_twice_does_not_reseed(self, signed_in):
        first = signed_in.get("/api/board").json()
        first["columns"][0]["cardIds"] = []
        first["cards"].pop("card-1")
        first["cards"].pop("card-2")
        assert signed_in.put("/api/board", json=first).status_code == 200

        second = signed_in.get("/api/board").json()
        assert len(second["cards"]) == 6


class TestWriting:
    def test_requires_a_signed_in_user(self, client):
        assert client.put("/api/board", json=a_small_board()).status_code == 401

    def test_a_change_is_returned_by_the_next_read(self, signed_in):
        board = a_board()
        board["cards"]["card-1"]["title"] = "Edited title"
        board["cards"]["card-1"]["details"] = "Edited details"

        assert signed_in.put("/api/board", json=board).status_code == 200

        stored = signed_in.get("/api/board").json()
        assert stored["cards"]["card-1"]["title"] == "Edited title"
        assert stored["cards"]["card-1"]["details"] == "Edited details"

    def test_a_move_is_persisted(self, signed_in):
        board = a_board()
        board["columns"][0]["cardIds"].remove("card-1")
        board["columns"][3]["cardIds"].append("card-1")

        assert signed_in.put("/api/board", json=board).status_code == 200

        stored = signed_in.get("/api/board").json()
        assert "card-1" not in stored["columns"][0]["cardIds"]
        assert "card-1" in stored["columns"][3]["cardIds"]

    def test_a_column_rename_is_persisted(self, signed_in):
        board = a_board()
        board["columns"][0]["title"] = "Renamed"

        signed_in.put("/api/board", json=board)

        assert signed_in.get("/api/board").json()["columns"][0]["title"] == "Renamed"

    def test_replacing_the_board_wholesale_works(self, signed_in):
        assert signed_in.put("/api/board", json=a_small_board()).status_code == 200

        stored = signed_in.get("/api/board").json()
        assert len(stored["columns"]) == 2
        assert len(stored["cards"]) == 1

    def test_the_response_echoes_what_was_stored(self, signed_in):
        response = signed_in.put("/api/board", json=a_small_board())
        assert response.json() == signed_in.get("/api/board").json()


class TestValidation:
    """One test per invariant in docs/DATABASE.md, plus malformed input."""

    def test_a_malformed_body_is_rejected(self, signed_in):
        assert signed_in.put("/api/board", json={"nonsense": True}).status_code == 422

    def test_a_non_object_body_is_rejected(self, signed_in):
        assert signed_in.put("/api/board", json=[1, 2, 3]).status_code == 422

    def test_invariant_1_cardids_must_reference_real_cards(self, signed_in):
        board = a_small_board()
        board["columns"][0]["cardIds"].append("card-missing")
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_2_a_card_cannot_be_in_two_columns(self, signed_in):
        board = a_small_board()
        board["columns"][1]["cardIds"].append("card-1")
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_2_a_card_cannot_be_orphaned(self, signed_in):
        board = a_small_board()
        board["columns"][0]["cardIds"] = []
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_3_a_card_id_must_match_its_key(self, signed_in):
        board = a_small_board()
        board["cards"]["card-1"]["id"] = "something-else"
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_4_column_ids_must_be_unique(self, signed_in):
        board = a_small_board()
        board["columns"][1]["id"] = "col-a"
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_5_a_card_title_cannot_be_blank(self, signed_in):
        board = a_small_board()
        board["cards"]["card-1"]["title"] = "   "
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_invariant_5_a_column_title_cannot_be_blank(self, signed_in):
        board = a_small_board()
        board["columns"][0]["title"] = ""
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_empty_details_are_allowed(self, signed_in):
        board = a_small_board()
        board["cards"]["card-1"]["details"] = ""
        assert signed_in.put("/api/board", json=board).status_code == 200

    def test_an_empty_column_is_allowed(self, signed_in):
        assert signed_in.put("/api/board", json=a_small_board()).status_code == 200

    def test_a_board_with_too_many_cards_is_rejected(self, signed_in):
        board = {
            "columns": [
                {
                    "id": "col-a",
                    "title": "A",
                    "cardIds": [f"card-{n}" for n in range(MAX_CARDS + 1)],
                }
            ],
            "cards": {
                f"card-{n}": {"id": f"card-{n}", "title": "One", "details": ""}
                for n in range(MAX_CARDS + 1)
            },
        }
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_a_board_with_too_many_columns_is_rejected(self, signed_in):
        board = {
            "columns": [
                {"id": f"col-{n}", "title": "A", "cardIds": []}
                for n in range(MAX_COLUMNS + 1)
            ],
            "cards": {},
        }
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_an_over_long_card_title_is_rejected(self, signed_in):
        board = a_small_board()
        board["cards"]["card-1"]["title"] = "x" * (MAX_TITLE_LENGTH + 1)
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_an_over_long_column_title_is_rejected(self, signed_in):
        board = a_small_board()
        board["columns"][0]["title"] = "x" * (MAX_TITLE_LENGTH + 1)
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_over_long_details_are_rejected(self, signed_in):
        board = a_small_board()
        board["cards"]["card-1"]["details"] = "x" * (MAX_DETAILS_LENGTH + 1)
        assert signed_in.put("/api/board", json=board).status_code == 422

    def test_a_rejected_board_is_not_persisted(self, signed_in):
        signed_in.put("/api/board", json=a_small_board())
        broken = a_small_board()
        broken["columns"][0]["cardIds"].append("card-missing")

        assert signed_in.put("/api/board", json=broken).status_code == 422
        assert signed_in.get("/api/board").json() == a_small_board()


class TestIsolation:
    def test_each_user_gets_their_own_board(self, signed_in, client):
        signed_in.put("/api/board", json=a_small_board())

        create_user("second", "secret")
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "second", "password": "secret"})

        second = client.get("/api/board").json()
        assert len(second["cards"]) == 8

    def test_one_user_cannot_see_another_users_changes(self, signed_in, client):
        second_id = create_user("second", "secret")
        save_board(second_id, a_small_board())

        assert len(signed_in.get("/api/board").json()["cards"]) == 8
        assert len(get_board(second_id)["cards"]) == 1


class TestPersistence:
    def test_the_database_file_is_created(self, signed_in, tmp_path):
        signed_in.get("/api/board")
        assert (tmp_path / "test.db").exists()

    def test_the_board_survives_a_restart(self, signed_in, tmp_path, monkeypatch):
        board = a_board()
        board["cards"]["card-1"]["title"] = "Survives"
        signed_in.put("/api/board", json=board)

        # A fresh app instance against the same file, as after a container restart.
        from fastapi.testclient import TestClient

        from app.main import app

        monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
        with TestClient(app) as restarted:
            restarted.post(
                "/api/auth/login", json={"username": "user", "password": "password"}
            )
            stored = restarted.get("/api/board").json()

        assert stored["cards"]["card-1"]["title"] == "Survives"

    def test_only_one_board_row_exists_per_user(self, signed_in):
        from app.db import connect

        signed_in.get("/api/board")
        signed_in.put("/api/board", json=a_small_board())
        signed_in.put("/api/board", json=a_board())

        with connect() as connection:
            count = connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
        assert count == 1


class TestModels:
    def test_the_default_board_is_valid(self):
        from app.models import BoardData

        BoardData.model_validate(DEFAULT_BOARD)

    def test_the_default_board_matches_the_frontend_seed(self):
        # Eight cards across five columns, as in frontend/src/lib/kanban.ts.
        placed = [
            card_id
            for column in DEFAULT_BOARD["columns"]
            for card_id in column["cardIds"]
        ]
        assert sorted(placed) == sorted(DEFAULT_BOARD["cards"])

    def test_an_invalid_board_raises(self):
        from pydantic import ValidationError

        from app.models import BoardData

        broken = a_small_board()
        broken["cards"] = {}
        with pytest.raises(ValidationError):
            BoardData.model_validate(broken)
