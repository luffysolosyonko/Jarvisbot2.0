"""LLM providers for Ask Jarvis, behind a small interface so the provider and model
are swappable by env vars (LLM_PROVIDER, LLM_MODEL).

Every failure becomes an LLMError with a stable code, so the API can answer with a
clear error instead of hanging or leaking provider details.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal, Protocol

from jarvis_api.config import Settings
from jarvis_core.ai import Usage, usage_from

if TYPE_CHECKING:
    import anthropic

log = logging.getLogger("jarvis.llm")

LLMErrorCode = Literal["timeout", "unavailable", "rate_limited", "refused", "misconfigured"]


class LLMError(Exception):
    def __init__(self, code: LLMErrorCode, detail: str = "", usage: Usage | None = None) -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.usage = usage or Usage(0, 0)


@dataclass(frozen=True)
class LLMReply:
    text: str
    usage: Usage
    model: str


# A streamed answer: text pieces as they arrive, then the finished reply.
StreamEvent = tuple[Literal["delta"], str] | tuple[Literal["done"], LLMReply]


class LLMProvider(Protocol):
    model: str

    def complete(self, system: str, user: str, max_tokens: int) -> LLMReply: ...

    def stream(self, system: str, user: str, max_tokens: int) -> Iterator[StreamEvent]: ...


class AnthropicProvider:
    """Claude via the official SDK. One attempt, bounded by `timeout_s`: the app shows
    a retry button rather than the API silently retrying."""

    def __init__(self, api_key: str, model: str, timeout_s: float = 15.0) -> None:
        import anthropic

        self.model = model
        self._anthropic = anthropic
        self._client: anthropic.Anthropic = anthropic.Anthropic(
            api_key=api_key, timeout=timeout_s, max_retries=0
        )

    def _request(self, system: str, user: str, max_tokens: int) -> dict[str, Any]:
        return {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": {"effort": "low"},  # short factual answers over small context
        }

    def _error(self, exc: Exception) -> LLMError:
        a = self._anthropic
        if isinstance(exc, a.APITimeoutError):  # subclass of APIConnectionError: check first
            return LLMError("timeout")
        if isinstance(exc, a.RateLimitError):
            return LLMError("rate_limited")
        if isinstance(exc, (a.AuthenticationError, a.PermissionDeniedError, a.NotFoundError)):
            log.error("LLM misconfigured: %s", type(exc).__name__)
            return LLMError("misconfigured", type(exc).__name__)
        if isinstance(exc, a.APIStatusError):
            return LLMError("unavailable", f"status {exc.status_code}")
        return LLMError("unavailable", "connection")

    def complete(self, system: str, user: str, max_tokens: int) -> LLMReply:
        try:
            resp: Any = self._client.messages.create(**self._request(system, user, max_tokens))
        except self._anthropic.APIError as exc:
            raise self._error(exc) from exc
        return self._reply(resp)

    def stream(self, system: str, user: str, max_tokens: int) -> Iterator[StreamEvent]:
        """Text pieces as Claude writes them, then the finished reply. The client
        timeout bounds each wait, so a stalled answer still ends in a clear error."""
        try:
            with self._client.messages.stream(**self._request(system, user, max_tokens)) as s:
                for text in s.text_stream:
                    if text:
                        yield ("delta", text)
                resp: Any = s.get_final_message()
        except self._anthropic.APIError as exc:
            raise self._error(exc) from exc
        yield ("done", self._reply(resp))

    def _reply(self, resp: Any) -> LLMReply:
        usage = usage_from(getattr(resp, "usage", None))
        if getattr(resp, "stop_reason", None) == "refusal":
            raise LLMError("refused", usage=usage)
        text = "".join(
            b.text for b in getattr(resp, "content", []) if getattr(b, "type", "") == "text"
        ).strip()
        if not text:
            raise LLMError("unavailable", "empty answer", usage=usage)
        return LLMReply(text, usage, self.model)


def make_provider(settings: Settings) -> LLMProvider | None:
    """The configured provider, or None if Ask Jarvis isn't set up."""
    if settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            return None
        return AnthropicProvider(
            settings.anthropic_api_key, settings.llm_model, settings.llm_timeout_s
        )
    log.warning("unknown LLM_PROVIDER %r; Ask Jarvis disabled", settings.llm_provider)
    return None
