from fastapi.testclient import TestClient

from jarvis_api.config import Settings
from jarvis_api.main import create_app


def test_default_allows_expo_web_dev_server() -> None:
    settings = Settings(_env_file=None, database_url="sqlite://")  # type: ignore[call-arg]
    assert settings.cors_origin_list == ["http://localhost:8081"]


def test_preflight_from_web_app_is_allowed(client: TestClient) -> None:
    response = client.options(
        "/api/v1/me",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"


def test_other_origins_get_no_cors_headers(client: TestClient) -> None:
    response = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_can_be_turned_off() -> None:
    settings = Settings(_env_file=None, database_url="sqlite://", cors_origins="")  # type: ignore[call-arg]
    client = TestClient(create_app(settings))
    response = client.get("/healthz", headers={"Origin": "http://localhost:8081"})
    assert "access-control-allow-origin" not in response.headers
