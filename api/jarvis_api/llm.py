"""LLM providers for Ask Jarvis, behind a small interface so the provider and model
are swappable by env vars (LLM_PROVIDER, LLM_MODEL).

Every failure becomes an LLMError with a stable code, so the API can answer with a
clear error instead of hanging or leaking provider details.
"""

from __future__ import annotations

import logging
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


class LLMProvider(Protocol):
    model: str

    def complete(self, system: str, user: str, max_tokens: int) -> LLMReply: ...


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

    def complete(self, system: str, user: str, max_tokens: int) -> LLMReply:
        a = self._anthropic
        try:
            resp: Any = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"effort": "low"},  # short factual answers over small context
            )
        except a.APITimeoutError as exc:  # subclass of APIConnectionError: catch first
            raise LLMError("timeout") from exc
        except a.RateLimitError as exc:
            raise LLMError("rate_limited") from exc
        except (a.AuthenticationError, a.PermissionDeniedError, a.NotFoundError) as exc:
            log.error("LLM misconfigured: %s", type(exc).__name__)
            raise LLMError("misconfigured", type(exc).__name__) from exc
        except a.APIStatusError as exc:
            raise LLMError("unavailable", f"status {exc.status_code}") from exc
        except a.APIConnectionError as exc:
            raise LLMError("unavailable", "connection") from exc

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
