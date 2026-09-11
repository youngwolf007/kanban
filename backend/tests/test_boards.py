import copy

import pytest

from app.db import create_user, get_board
from app.models import (
    DEFAULT_BOARD,
    MAX_BOARD_NAME_LENGTH,
    MAX_CARDS,
    MAX_COLUMNS,
    MAX_DETAILS_LENGTH,
    MAX_LABEL_LENGTH,
    MAX_LABELS,
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


class TestListing:
    def test_requires_a_signed_in_user(self, client):
        assert client.get("/api/boards").status_code == 401

    def test_a_new_user_has_no_boards(self, signed_in):
        assert signed_in.get("/api/boards").json() == []

    def test_created_boards_are_listed(self, signed_in, board_id):
        response = signed_in.get("/api/boards")
        assert response.status_code == 200
        boards = response.json()
        assert len(boards) == 1
        assert boards[0]["id"] == board_id
        assert boards[0]["name"] == "New board"
        assert "updatedAt" in boards[0]

    def test_most_recently_updated_board_is_listed_first(self, signed_in):
        first = signed_in.post("/api/boards", json={"name": "First"}).json()["id"]
        second = signed_in.post("/api/boards", json={"name": "Second"}).json()["id"]

        signed_in.put(f"/api/boards/{first}", json=a_board())

        ids = [board["id"] for board in signed_in.get("/api/boards").json()]
        assert ids == [first, second]


class TestCreating:
    def test_requires_a_signed_in_user(self, client):
        assert client.post("/api/boards", json={}).status_code == 401

    def test_defaults_to_a_generic_name(self, signed_in):
        response = signed_in.post("/api/boards", json={})
        assert response.status_code == 201
        assert response.json()["name"] == "New board"

    def test_accepts_a_given_name(self, signed_in):
        response = signed_in.post("/api/boards", json={"name": "Marketing"})
        assert response.json()["name"] == "Marketing"

    def test_is_seeded_with_the_demo_board(self, signed_in, board_id):
        stored = signed_in.get(f"/api/boards/{board_id}").json()
        assert len(stored["cards"]) == 8
        assert len(stored["columns"]) == 5

    def test_a_blank_name_is_rejected(self, signed_in):
        assert signed_in.post("/api/boards", json={"name": "  "}).status_code == 422

    def test_an_over_long_name_is_rejected(self, signed_in):
        response = signed_in.post(
            "/api/boards", json={"name": "x" * (MAX_BOARD_NAME_LENGTH + 1)}
        )
        assert response.status_code == 422

    def test_each_board_gets_its_own_row(self, signed_in):
        signed_in.post("/api/boards", json={})
        signed_in.post("/api/boards", json={})
        assert len(signed_in.get("/api/boards").json()) == 2


class TestReading:
    def test_requires_a_signed_in_user(self, client):
        assert client.get("/api/boards/1").status_code == 401

    def test_an_unknown_board_is_a_404(self, signed_in):
        assert signed_in.get("/api/boards/999").status_code == 404

    def test_reading_returns_the_seeded_content(self, signed_in, board_id):
        response = signed_in.get(f"/api/boards/{board_id}")
        assert response.status_code == 200
        board = response.json()
        assert [column["id"] for column in board["columns"]] == [
            "col-backlog",
            "col-discovery",
            "col-progress",
            "col-review",
            "col-done",
        ]


class TestWriting:
    def test_requires_a_signed_in_user(self, client):
        assert client.put("/api/boards/1", json=a_small_board()).status_code == 401

    def test_an_unknown_board_is_a_404(self, signed_in):
        response = signed_in.put("/api/boards/999", json=a_small_board())
        assert response.status_code == 404

    def test_a_change_is_returned_by_the_next_read(self, signed_in, board_id):
        board = a_board()
        board["cards"]["card-1"]["title"] = "Edited title"
        board["cards"]["card-1"]["details"] = "Edited details"

        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 200

        stored = signed_in.get(f"/api/boards/{board_id}").json()
        assert stored["cards"]["card-1"]["title"] == "Edited title"
        assert stored["cards"]["card-1"]["details"] == "Edited details"

    def test_a_move_is_persisted(self, signed_in, board_id):
        board = a_board()
        board["columns"][0]["cardIds"].remove("card-1")
        board["columns"][3]["cardIds"].append("card-1")

        signed_in.put(f"/api/boards/{board_id}", json=board)

        stored = signed_in.get(f"/api/boards/{board_id}").json()
        assert "card-1" not in stored["columns"][0]["cardIds"]
        assert "card-1" in stored["columns"][3]["cardIds"]

    def test_replacing_the_board_wholesale_works(self, signed_in, board_id):
        assert (
            signed_in.put(f"/api/boards/{board_id}", json=a_small_board()).status_code
            == 200
        )

        stored = signed_in.get(f"/api/boards/{board_id}").json()
        assert len(stored["columns"]) == 2
        assert len(stored["cards"]) == 1

    def test_the_response_echoes_what_was_stored(self, signed_in, board_id):
        response = signed_in.put(f"/api/boards/{board_id}", json=a_small_board())
        assert response.json() == signed_in.get(f"/api/boards/{board_id}").json()


class TestValidation:
    """One test per invariant in docs/DATABASE.md, plus malformed input."""

    def test_a_malformed_body_is_rejected(self, signed_in, board_id):
        response = signed_in.put(f"/api/boards/{board_id}", json={"nonsense": True})
        assert response.status_code == 422

    def test_a_non_object_body_is_rejected(self, signed_in, board_id):
        assert signed_in.put(f"/api/boards/{board_id}", json=[1, 2, 3]).status_code == 422

    def test_invariant_1_cardids_must_reference_real_cards(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][0]["cardIds"].append("card-missing")
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_2_a_card_cannot_be_in_two_columns(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][1]["cardIds"].append("card-1")
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_2_a_card_cannot_be_orphaned(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][0]["cardIds"] = []
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_3_a_card_id_must_match_its_key(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["id"] = "something-else"
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_4_column_ids_must_be_unique(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][1]["id"] = "col-a"
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_5_a_card_title_cannot_be_blank(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["title"] = "   "
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_invariant_5_a_column_title_cannot_be_blank(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][0]["title"] = ""
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_empty_details_are_allowed(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["details"] = ""
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 200

    def test_an_empty_column_is_allowed(self, signed_in, board_id):
        response = signed_in.put(f"/api/boards/{board_id}", json=a_small_board())
        assert response.status_code == 200

    def test_a_board_with_too_many_cards_is_rejected(self, signed_in, board_id):
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
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_a_board_with_too_many_columns_is_rejected(self, signed_in, board_id):
        board = {
            "columns": [
                {"id": f"col-{n}", "title": "A", "cardIds": []}
                for n in range(MAX_COLUMNS + 1)
            ],
            "cards": {},
        }
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_an_over_long_card_title_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["title"] = "x" * (MAX_TITLE_LENGTH + 1)
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_an_over_long_column_title_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["columns"][0]["title"] = "x" * (MAX_TITLE_LENGTH + 1)
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_over_long_details_are_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["details"] = "x" * (MAX_DETAILS_LENGTH + 1)
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_priority_defaults_to_null(self, signed_in, board_id):
        response = signed_in.put(f"/api/boards/{board_id}", json=a_small_board())
        assert response.json()["cards"]["card-1"]["priority"] is None

    def test_an_invalid_priority_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["priority"] = "urgent"
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_a_valid_priority_is_accepted(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["priority"] = "high"
        response = signed_in.put(f"/api/boards/{board_id}", json=board)
        assert response.status_code == 200
        assert response.json()["cards"]["card-1"]["priority"] == "high"

    def test_a_non_iso_due_date_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["dueDate"] = "09/25/2026"
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_a_valid_due_date_is_accepted(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["dueDate"] = "2026-09-25"
        response = signed_in.put(f"/api/boards/{board_id}", json=board)
        assert response.status_code == 200
        assert response.json()["cards"]["card-1"]["dueDate"] == "2026-09-25"

    def test_a_blank_label_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["labels"] = ["ok", "  "]
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_an_over_long_label_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["labels"] = ["x" * (MAX_LABEL_LENGTH + 1)]
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_too_many_labels_is_rejected(self, signed_in, board_id):
        board = a_small_board()
        board["cards"]["card-1"]["labels"] = [f"l{n}" for n in range(MAX_LABELS + 1)]
        assert signed_in.put(f"/api/boards/{board_id}", json=board).status_code == 422

    def test_a_rejected_board_is_not_persisted(self, signed_in, board_id):
        stored = signed_in.put(f"/api/boards/{board_id}", json=a_small_board()).json()
        broken = a_small_board()
        broken["columns"][0]["cardIds"].append("card-missing")

        assert signed_in.put(f"/api/boards/{board_id}", json=broken).status_code == 422
        assert signed_in.get(f"/api/boards/{board_id}").json() == stored


class TestRenaming:
    def test_requires_a_signed_in_user(self, client):
        response = client.patch("/api/boards/1", json={"name": "New name"})
        assert response.status_code == 401

    def test_an_unknown_board_is_a_404(self, signed_in):
        response = signed_in.patch("/api/boards/999", json={"name": "New name"})
        assert response.status_code == 404

    def test_the_name_is_updated(self, signed_in, board_id):
        response = signed_in.patch(f"/api/boards/{board_id}", json={"name": "Roadmap"})
        assert response.status_code == 200
        assert response.json()["name"] == "Roadmap"

        boards = signed_in.get("/api/boards").json()
        assert boards[0]["name"] == "Roadmap"

    def test_a_blank_name_is_rejected(self, signed_in, board_id):
        response = signed_in.patch(f"/api/boards/{board_id}", json={"name": "  "})
        assert response.status_code == 422

    def test_renaming_does_not_touch_the_board_content(self, signed_in, board_id):
        signed_in.patch(f"/api/boards/{board_id}", json={"name": "Roadmap"})
        assert len(signed_in.get(f"/api/boards/{board_id}").json()["cards"]) == 8


class TestDeleting:
    def test_requires_a_signed_in_user(self, client):
        assert client.delete("/api/boards/1").status_code == 401

    def test_an_unknown_board_is_a_404(self, signed_in):
        assert signed_in.delete("/api/boards/999").status_code == 404

    def test_a_deleted_board_is_gone(self, signed_in, board_id):
        assert signed_in.delete(f"/api/boards/{board_id}").status_code == 204
        assert signed_in.get(f"/api/boards/{board_id}").status_code == 404
        assert signed_in.get("/api/boards").json() == []

    def test_deleting_one_board_leaves_others_alone(self, signed_in, board_id):
        other = signed_in.post("/api/boards", json={"name": "Other"}).json()["id"]

        signed_in.delete(f"/api/boards/{board_id}")

        remaining = signed_in.get("/api/boards").json()
        assert [board["id"] for board in remaining] == [other]


class TestIsolation:
    def test_a_new_user_does_not_see_another_users_boards(self, signed_in, board_id, client):
        create_user("second", "secret")
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "second", "password": "secret"})

        assert client.get("/api/boards").json() == []

    def test_one_user_cannot_read_another_users_board(self, signed_in, board_id, client):
        create_user("second", "secret")
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "second", "password": "secret"})

        assert client.get(f"/api/boards/{board_id}").status_code == 404

    def test_one_user_cannot_write_another_users_board(self, signed_in, board_id, client):
        create_user("second", "secret")
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "second", "password": "secret"})

        response = client.put(f"/api/boards/{board_id}", json=a_small_board())
        assert response.status_code == 404
        assert len(get_board(board_id, 1)["cards"]) == 8

    def test_one_user_cannot_delete_another_users_board(self, signed_in, board_id, client):
        create_user("second", "secret")
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json={"username": "second", "password": "secret"})

        assert client.delete(f"/api/boards/{board_id}").status_code == 404
        assert get_board(board_id, 1) is not None


class TestPersistence:
    def test_the_database_file_is_created(self, signed_in, tmp_path):
        signed_in.post("/api/boards", json={})
        assert (tmp_path / "test.db").exists()

    def test_a_board_survives_a_restart(self, signed_in, board_id, tmp_path, monkeypatch):
        board = a_board()
        board["cards"]["card-1"]["title"] = "Survives"
        signed_in.put(f"/api/boards/{board_id}", json=board)

        # A fresh app instance against the same file, as after a container restart.
        from fastapi.testclient import TestClient

        from app.main import app

        monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
        with TestClient(app) as restarted:
            restarted.post(
                "/api/auth/login", json={"username": "user", "password": "password"}
            )
            stored = restarted.get(f"/api/boards/{board_id}").json()

        assert stored["cards"]["card-1"]["title"] == "Survives"

    def test_a_user_can_have_many_board_rows(self, signed_in):
        signed_in.post("/api/boards", json={})
        signed_in.post("/api/boards", json={})

        from app.db import connect

        with connect() as connection:
            count = connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
        assert count == 2


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
