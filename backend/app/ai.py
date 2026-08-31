import os

from openai import APIError, OpenAI

BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "openai/gpt-oss-120b"
TIMEOUT_SECONDS = 30.0

# OpenRouter picks a provider per request, and two of them break the contract every time.
# Pinned four runs each: DeepInfra ignores response_format and answers in prose, and
# SiliconFlow always returns board=null, so it never applies a change the user asked for.
# `require_parameters` excludes neither, because both claim support, so name them here.
# CoreWeave, AkashML and Mancer 2 were 4 of 4 correct.
PROVIDER_ROUTING = {"ignore": ["DeepInfra", "SiliconFlow"]}


class AIError(RuntimeError):
    """An AI call that could not be completed. The message is safe to show a user."""


def client() -> OpenAI:
    """The OpenRouter client.

    The key is read at call time, not at import, so the app boots and the tests run
    without one. Only a route that actually calls the AI needs it.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AIError("OPENROUTER_API_KEY is not set")
    # max_retries=0 because the caller retries where it can judge the answer. Leaving the
    # SDK's default of 2 would multiply with that retry: six upstream calls at 30s each,
    # and a chat request that hangs for minutes before failing.
    return OpenAI(
        base_url=BASE_URL,
        api_key=api_key,
        timeout=TIMEOUT_SECONDS,
        max_retries=0,
    )


def ask(messages: list[dict], response_format: dict | None = None) -> str:
    """Send a chat completion and return the reply text.

    `response_format` carries the Structured Outputs schema; without it the
    model answers in plain text. Any upstream failure becomes an AIError.
    """
    extra = {"response_format": response_format} if response_format else {}
    try:
        completion = client().chat.completions.create(
            model=MODEL,
            messages=messages,
            extra_body={"provider": PROVIDER_ROUTING},
            **extra,
        )
    except APIError as error:
        raise AIError(f"The AI service is unavailable: {error}") from error

    # Providers vary on what they return, and one that answers with no choices at all
    # would otherwise raise IndexError past every handler the caller has.
    if not completion.choices:
        raise AIError("The AI service is unavailable: it returned no answer")
    return completion.choices[0].message.content or ""
