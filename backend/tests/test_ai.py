import json
import os
from unittest.mock import MagicMock, patch

import pytest
from openai import APIError

from app.ai import (
    BASE_URL,
    MODEL,
    TIMEOUT_SECONDS,
    AIError,
    ask,
)

QUESTION = [{"role": "user", "content": "What is 2+2?"}]

# Cards go to the model as an array, not as the stored id-keyed map. A map would have to
# be typed as `additionalProperties: CARD_SCHEMA`, which cannot say that the key must equal
# the card's own id, so the model picks an arbitrary key. The server rebuilds the map from
# this array.
CARD_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "details": {"type": "string"},
    },
    "required": ["id", "title", "details"],
    "additionalProperties": False,
}
CARDS_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "cards",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"cards": {"type": "array", "items": CARD_SCHEMA}},
            "required": ["cards"],
            "additionalProperties": False,
        },
    },
}


@pytest.fixture
def openai_class(monkeypatch):
    """Replaces the OpenAI class in app.ai, with a key present so client() gets that far."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.ai.OpenAI") as mock:
        completion = mock.return_value.chat.completions.create.return_value
        completion.choices[0].message.content = "4"
        yield mock


class TestTheRequest:
    def test_returns_the_reply_text(self, openai_class):
        assert ask(QUESTION) == "4"

    def test_points_at_openrouter_with_the_key_and_a_timeout(self, openai_class):
        ask(QUESTION)
        openai_class.assert_called_once_with(
            base_url=BASE_URL,
            api_key="test-key",
            timeout=TIMEOUT_SECONDS,
            max_retries=0,
        )

    def test_sends_the_model_and_the_messages(self, openai_class):
        ask(QUESTION)
        _, kwargs = openai_class.return_value.chat.completions.create.call_args
        assert kwargs["model"] == MODEL
        assert kwargs["messages"] == QUESTION

    def test_excludes_the_provider_that_ignores_response_format(self, openai_class):
        ask(QUESTION)
        _, kwargs = openai_class.return_value.chat.completions.create.call_args
        assert kwargs["extra_body"] == {"provider": {"ignore": ["DeepInfra", "SiliconFlow"]}}

    def test_sends_a_response_format_when_one_is_given(self, openai_class):
        schema = {"type": "json_schema", "json_schema": {"name": "reply"}}
        ask(QUESTION, response_format=schema)
        _, kwargs = openai_class.return_value.chat.completions.create.call_args
        assert kwargs["response_format"] == schema

    def test_an_empty_reply_becomes_an_empty_string(self, openai_class):
        openai_class.return_value.chat.completions.create.return_value.choices[
            0
        ].message.content = None
        assert ask(QUESTION) == ""


class TestFailures:
    def test_a_missing_key_is_reported_clearly(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        with pytest.raises(AIError, match="OPENROUTER_API_KEY is not set"):
            ask(QUESTION)

    def test_no_choices_at_all_becomes_an_ai_error(self, openai_class):
        """An IndexError here would escape every handler the chat route has."""
        openai_class.return_value.chat.completions.create.return_value.choices = []
        with pytest.raises(AIError, match="returned no answer"):
            ask(QUESTION)

    def test_an_upstream_failure_becomes_an_ai_error(self, openai_class):
        openai_class.return_value.chat.completions.create.side_effect = APIError(
            "upstream exploded", MagicMock(), body=None
        )
        with pytest.raises(AIError) as raised:
            ask(QUESTION)
        assert "The AI service is unavailable" in str(raised.value)
        assert "upstream exploded" in str(raised.value)


@pytest.mark.live
@pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY is not set"
)
class TestLive:
    """Hits the real OpenRouter API. Deselected by default; run with -m live."""

    def test_the_model_can_answer_two_plus_two(self):
        answer = ask(
            [{"role": "user", "content": "What is 2+2? Answer with the number."}]
        )
        assert "4" in answer

    def test_the_model_honours_a_strict_json_schema(self):
        """Cards are sent this way, so prove the routed provider honours it."""
        answer = ask(
            [
                {
                    "role": "user",
                    "content": "Return one card: id card-9, title Test, details Some details.",
                }
            ],
            response_format=CARDS_SCHEMA,
        )
        cards = json.loads(answer)["cards"]
        assert len(cards) == 1
        assert cards[0]["id"] == "card-9"
        assert cards[0]["title"] == "Test"
        assert set(cards[0]) == {"id", "title", "details"}
