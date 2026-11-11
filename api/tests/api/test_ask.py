"""Ask Jarvis with a mocked provider: no network, no API key."""

from __future__ import annotations

import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from jarvis_api.config import Settings
from jarvis_api.llm import AnthropicProvider, LLMError, LLMReply, StreamEvent, make_provider
from jarvis_api.main import create_app
from jarvis_api.models import AiUsage, AskMessage
from jarvis_api.ratelimit import RateLimiter
from jarvis_api.routes.ask import MAX_ANSWER_TOKENS
from jarvis_core.ai import Usage

from .conftest import DEMO_UID, FakeClock, FakeVerifier, auth
from .test_auth_and_errors import assert_error


class FakeProvider:
    model = "fake-model"

    def __init__(self, reply: str = "Your bench is trending up.", error: LLMError | None = None):
        self.reply, self.error = reply, error
        self.calls: list[dict[str, Any]] = []

    def complete(self, system: str, user: str, max_tokens: int) -> LLMReply:
        self.calls.append({"system": system, "user": user, "max_tokens": max_tokens})
        if self.error:
            raise self.error
        return LLMReply(self.reply, Usage(1200, 80), self.model)

    def stream(self, system: str, user: str, max_tokens: int) -> Iterator[StreamEvent]:
        self.calls.append({"system": system, "user": user, "max_tokens": max_tokens})
        words = self.reply.split(" ")
        for i, w in enumerate(words):
            if self.error and i == 2:  # fail partway through
                raise self.error
            yield ("delta", w if i == 0 else " " + w)
        if self.error:
            raise self.error
        yield ("done", LLMReply(self.reply, Usage(1200, 80), self.model))


def make_client(
    settings: Settings, engine: Engine, provider: Any, clock: FakeClock | None = None
) -> TestClient:
    app = create_app(
        settings,
        engine=engine,
        verifier=FakeVerifier(),
        limiter=RateLimiter(clock or FakeClock()),
        llm=provider,
    )
    return TestClient(app)


def test_answer_with_tokens_and_usage_logged(
    settings: Settings, engine: Engine, db: Session
) -> None:
    provider = FakeProvider()
    client = make_client(settings, engine, provider)
    h = auth("alice")
    client.post("/api/v1/logs", headers=h, json={"text": "8x 165lb bench"})
    r = client.post("/api/v1/ask", headers=h, json={"question": "Is my bench going up?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] == "Your bench is trending up."
    assert (body["input_tokens"], body["output_tokens"]) == (1200, 80)
    assert (
        body["tokens_used_today"] == 1280
        and body["daily_token_cap"] == settings.ask_daily_token_cap
    )
    assert body["topics"] == ["workouts"]

    [usage] = db.scalars(select(AiUsage)).all()
    assert (usage.input_tokens, usage.output_tokens, usage.model, usage.topics) == (
        1200,
        80,
        "fake-model",
        "workouts",
    )

    call = provider.calls[0]
    assert "bench" in call["user"] and "Question: Is my bench going up?" in call["user"]
    assert "answer in lb" in call["system"]
    assert "concise and straight to the point" in call["system"]
    # a backstop far below the old 4000; the short length comes from the instructions
    assert call["max_tokens"] == MAX_ANSWER_TOKENS <= 1024


def test_only_the_callers_data_is_sent(settings: Settings, engine: Engine) -> None:
    provider = FakeProvider()
    client = make_client(settings, engine, provider)
    client.post("/api/v1/logs", headers=auth("alice"), json={"text": "8x 405lb secret squat"})
    client.post("/api/v1/logs", headers=auth("bob"), json={"text": "8x 95lb curl"})
    client.post("/api/v1/ask", headers=auth("bob"), json={"question": "how am I doing overall?"})
    sent = provider.calls[0]["user"]
    assert "curl" in sent and "secret squat" not in sent and "405" not in sent


def test_not_configured(settings: Settings, engine: Engine) -> None:
    client = make_client(settings, engine, None)
    r = client.post("/api/v1/ask", headers=auth("alice"), json={"question": "how am I doing?"})
    assert_error(r, 503, "ai_not_configured")


@pytest.mark.parametrize(
    ("code", "status", "api_code"),
    [
        ("timeout", 504, "ai_timeout"),
        ("unavailable", 502, "ai_unavailable"),
        ("rate_limited", 503, "ai_busy"),
        ("misconfigured", 503, "ai_not_configured"),
        ("refused", 422, "ai_refused"),
    ],
)
def test_provider_failures_are_clear_errors(
    settings: Settings, engine: Engine, code: Any, status: int, api_code: str
) -> None:
    client = make_client(settings, engine, FakeProvider(error=LLMError(code)))
    r = client.post("/api/v1/ask", headers=auth("alice"), json={"question": "how am I doing?"})
    assert_error(r, status, api_code)


def test_daily_cap_and_lower_demo_cap(settings: Settings, engine: Engine) -> None:
    s = settings.model_copy(update={"ask_daily_token_cap": 2000, "ask_demo_daily_token_cap": 1000})
    client = make_client(s, engine, FakeProvider())
    q = {"question": "how am I doing?"}

    # regular user: 1280 + 1280 > 2000, so the third question is refused
    assert client.post("/api/v1/ask", headers=auth("alice"), json=q).status_code == 200
    second = client.post("/api/v1/ask", headers=auth("alice"), json=q)
    assert second.status_code == 200 and second.json()["tokens_used_today"] == 2560
    assert_error(
        client.post("/api/v1/ask", headers=auth("alice"), json=q), 429, "daily_cap_reached"
    )

    # demo user: lower cap, refused after one answer
    first = client.post("/api/v1/ask", headers=auth(DEMO_UID), json=q)
    assert first.status_code == 200 and first.json()["daily_token_cap"] == 1000
    assert_error(
        client.post("/api/v1/ask", headers=auth(DEMO_UID), json=q), 429, "daily_cap_reached"
    )


def test_rate_limit_and_validation(settings: Settings, engine: Engine) -> None:
    client = make_client(settings, engine, FakeProvider())
    h = auth("alice")
    for _ in range(settings.rate_limit_ask_per_min):
        assert (
            client.post("/api/v1/ask", headers=h, json={"question": "how am I doing?"}).status_code
            == 200
        )
    assert_error(
        client.post("/api/v1/ask", headers=h, json={"question": "how am I doing?"}),
        429,
        "rate_limited",
    )
    assert_error(
        client.post("/api/v1/ask", headers=h, json={"question": "x" * 501}), 422, "invalid_request"
    )
    assert_error(
        client.post("/api/v1/ask", headers=h, json={"question": ""}), 422, "invalid_request"
    )


# --- the Claude provider, with the SDK call stubbed --------------------------
def provider_with(monkeypatch: pytest.MonkeyPatch, result: Any) -> AnthropicProvider:
    p = AnthropicProvider("sk-test", "claude-haiku-5-5", timeout_s=15)

    def create(**kwargs: Any) -> Any:
        create.kwargs = kwargs  # type: ignore[attr-defined]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(p._client.messages, "create", create)
    p.create = create  # type: ignore[attr-defined]
    return p


def response(text: str = "Up 6 lb.", stop: str = "end_turn") -> Any:
    usage = SimpleNamespace(
        input_tokens=900,
        output_tokens=40,
        cache_read_input_tokens=100,
        cache_creation_input_tokens=0,
    )
    blocks = [
        SimpleNamespace(type="thinking", thinking=""),
        SimpleNamespace(type="text", text=text),
    ]
    return SimpleNamespace(content=blocks, usage=usage, stop_reason=stop)


def test_claude_provider_request_and_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    p = provider_with(monkeypatch, response())
    reply = p.complete("sys", "question", 4000)
    assert (
        reply.text == "Up 6 lb."
        and reply.usage == Usage(1000, 40)
        and reply.model == "claude-haiku-5-5"
    )
    kw = p.create.kwargs  # type: ignore[attr-defined]
    assert kw["model"] == "claude-haiku-5-5" and kw["system"] == "sys" and kw["max_tokens"] == 4000
    assert kw["messages"] == [{"role": "user", "content": "question"}]
    assert p._client.timeout == 15 and p._client.max_retries == 0


def test_claude_provider_refusal_and_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(LLMError) as e:
        provider_with(monkeypatch, response(stop="refusal")).complete("s", "u", 10)
    assert e.value.code == "refused" and e.value.usage.total == 1040
    with pytest.raises(LLMError) as e:
        provider_with(monkeypatch, response(text="  ")).complete("s", "u", 10)
    assert e.value.code == "unavailable"


REQ = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def status_error(cls: type[anthropic.APIStatusError], status: int) -> anthropic.APIStatusError:
    return cls("boom", response=httpx2.Response(status, request=REQ), body=None)


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (anthropic.APITimeoutError(request=REQ), "timeout"),
        (anthropic.APIConnectionError(request=REQ), "unavailable"),
        (status_error(anthropic.RateLimitError, 429), "rate_limited"),
        (status_error(anthropic.AuthenticationError, 401), "misconfigured"),
        (status_error(anthropic.NotFoundError, 404), "misconfigured"),
        (status_error(anthropic.InternalServerError, 500), "unavailable"),
    ],
)
def test_claude_provider_maps_sdk_errors(
    monkeypatch: pytest.MonkeyPatch, exc: Exception, code: str
) -> None:
    with pytest.raises(LLMError) as e:
        provider_with(monkeypatch, exc).complete("s", "u", 10)
    assert e.value.code == code


def test_make_provider_from_settings(settings: Settings) -> None:
    assert make_provider(settings) is None  # no key
    p = make_provider(
        settings.model_copy(
            update={"anthropic_api_key": "sk-test", "llm_model": "claude-haiku-5-5"}
        )
    )
    assert isinstance(p, AnthropicProvider) and p.model == "claude-haiku-5-5"
    assert (
        make_provider(
            settings.model_copy(update={"llm_provider": "other", "anthropic_api_key": "k"})
        )
        is None
    )


def test_questions_are_saved_and_stay_in_the_history(settings: Settings, engine: Engine) -> None:
    client = make_client(settings, engine, FakeProvider("Bench is up 10 lb."))
    h = auth("alice")
    r = client.post("/api/v1/ask", headers=h, json={"question": "Is my bench going up?"})
    assert r.status_code == 200, r.text
    assert r.json()["id"] > 0 and r.json()["question"] == "Is my bench going up?"
    client.post("/api/v1/ask", headers=h, json={"question": "How is my squat?"})

    history = client.get("/api/v1/ask/history", headers=h).json()["messages"]
    assert [(m["question"], m["answer"]) for m in history] == [
        ("Is my bench going up?", "Bench is up 10 lb."),
        ("How is my squat?", "Bench is up 10 lb."),
    ]
    assert history[0]["input_tokens"] == 1200 and history[0]["output_tokens"] == 80
    assert client.get("/api/v1/ask/history", headers=auth("bob")).json()["messages"] == []

    # answers can't be hidden any more: the old endpoint is gone
    assert client.post("/api/v1/ask/history/clear", headers=h).status_code in (404, 405)
    assert len(client.get("/api/v1/ask/history", headers=h).json()["messages"]) == 2


def test_failed_questions_are_not_saved(settings: Settings, engine: Engine, db: Session) -> None:
    client = make_client(settings, engine, FakeProvider(error=LLMError("timeout")))
    r = client.post(
        "/api/v1/ask", headers=auth("alice"), json={"question": "Is my bench going up?"}
    )
    assert r.status_code == 504
    assert db.scalars(select(AskMessage)).all() == []


def sse_events(text: str) -> list[tuple[str, object]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_stream_sends_the_answer_in_pieces_then_saves_it(
    settings: Settings, engine: Engine, db: Session
) -> None:
    client = make_client(settings, engine, FakeProvider("Bench is up 10 lb this month."))
    h = auth("alice")
    r = client.post("/api/v1/ask/stream", headers=h, json={"question": "Is my bench going up?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = sse_events(r.text)
    deltas = [v for k, v in events if k == "delta"]
    assert len(deltas) > 3 and "".join(str(d) for d in deltas) == "Bench is up 10 lb this month."
    kind, done = events[-1]
    assert kind == "done" and isinstance(done, dict)
    assert done["answer"] == "Bench is up 10 lb this month." and done["id"] > 0
    history = client.get("/api/v1/ask/history", headers=h).json()["messages"]
    assert [m["answer"] for m in history] == ["Bench is up 10 lb this month."]
    assert db.scalar(select(AiUsage).where(AiUsage.input_tokens == 1200)) is not None


def test_stream_failure_partway_is_a_clear_error_and_saves_nothing(
    settings: Settings, engine: Engine
) -> None:
    client = make_client(settings, engine, FakeProvider(error=LLMError("timeout")))
    h = auth("alice")
    r = client.post("/api/v1/ask/stream", headers=h, json={"question": "Is my bench going up?"})
    events = sse_events(r.text)
    assert [k for k, _ in events[:2]] == ["delta", "delta"]
    assert events[-1] == ("error", {"code": "ai_timeout", "message": ERRORS_TIMEOUT})
    assert client.get("/api/v1/ask/history", headers=h).json()["messages"] == []


def test_stream_refusals_before_any_text_are_json_errors(
    settings: Settings, engine: Engine
) -> None:
    r = make_client(settings, engine, None).post(
        "/api/v1/ask/stream", headers=auth("alice"), json={"question": "how am I doing?"}
    )
    assert_error(r, 503, "ai_not_configured")


ERRORS_TIMEOUT = "Jarvis took too long to answer. Try again."


def test_claude_provider_streams_text_then_the_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    p = AnthropicProvider("sk-test", "claude-haiku-5-5", timeout_s=15)
    calls: dict[str, Any] = {}

    class FakeStream:
        text_stream = iter(["Up ", "6 ", "lb."])

        def __enter__(self) -> FakeStream:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def get_final_message(self) -> Any:
            return response("Up 6 lb.")

    def stream(**kwargs: Any) -> FakeStream:
        calls.update(kwargs)
        return FakeStream()

    monkeypatch.setattr(p._client.messages, "stream", stream)
    events = list(p.stream("sys", "question", 4000))
    assert events[:3] == [("delta", "Up "), ("delta", "6 "), ("delta", "lb.")]
    kind, reply = events[-1]
    assert kind == "done" and isinstance(reply, LLMReply) and reply.text == "Up 6 lb."
    assert calls["model"] == "claude-haiku-5-5" and calls["max_tokens"] == 4000


def test_claude_provider_stream_errors_are_clear(monkeypatch: pytest.MonkeyPatch) -> None:
    p = AnthropicProvider("sk-test", "claude-haiku-5-5", timeout_s=15)
    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")

    def stream(**kwargs: Any) -> Any:
        raise anthropic.APITimeoutError(request=req)

    monkeypatch.setattr(p._client.messages, "stream", stream)
    with pytest.raises(LLMError) as err:
        list(p.stream("sys", "q", 10))
    assert err.value.code == "timeout"
