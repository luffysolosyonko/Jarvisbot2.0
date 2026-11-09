from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration, from env vars (and api/.env for local runs)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "local"
    log_level: str = "info"
    cors_origins: str = "http://localhost:8081"  # comma-separated; the Expo web dev server
    trust_proxy_headers: bool = False  # True behind Cloud Run to read X-Forwarded-For
    max_body_bytes: int = 32_768

    database_url: str = "sqlite:///./jarvis.db"

    firebase_project_id: str = ""
    # Path to a service account key, outside git. Needed locally to mint demo tokens.
    google_application_credentials: str = ""

    # Demo account: a fixed Firebase UID. Empty disables "Try the demo".
    demo_uid: str = ""
    demo_token_per_min: int = 5
    demo_token_per_day: int = 50

    rate_limit_parse_per_min: int = 60
    rate_limit_ask_per_min: int = 10

    llm_provider: str = "anthropic"
    llm_model: str = "claude-haiku-5-5"
    anthropic_api_key: str = Field(default="", repr=False)
    llm_timeout_s: float = 15.0
    ask_daily_token_cap: int = 50_000
    ask_demo_daily_token_cap: int = 10_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
