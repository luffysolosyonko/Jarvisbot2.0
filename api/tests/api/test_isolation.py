"""User A's data is never visible to, or changeable by, user B."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import auth
from .test_auth_and_errors import assert_error


def test_user_b_cannot_read_or_touch_user_a_data(client: TestClient) -> None:
    a, b = auth("alice"), auth("bob")
    for i in range(5):
        client.post("/api/v1/logs", headers=a, json={"text": f"8x {150 + i}lb incline bench"})
    client.post("/api/v1/logs", headers=a, json={"text": "171.6"})
    alias = client.post(
        "/api/v1/aliases", headers=a, json={"short": "inc", "full": "incline"}
    ).json()

    # A sees their data
    assert len(client.get("/api/v1/logs", headers=a).json()["logs"]) == 6
    assert client.get("/api/v1/exercises/incline bench", headers=a).status_code == 200

    # B sees none of it
    assert client.get("/api/v1/logs", headers=b).json()["logs"] == []
    assert client.get("/api/v1/exercises", headers=b).json()["exercises"] == []
    assert_error(client.get("/api/v1/exercises/incline bench", headers=b), 404, "not_found")
    assert_error(
        client.get("/api/v1/exercises/incline bench/forecast", headers=b), 404, "not_found"
    )
    dash = client.get("/api/v1/dashboard", headers=b).json()
    assert dash["week"]["sets"] == 0 and dash["weight"]["points"] == [] and dash["top_lifts"] == []
    assert client.get("/api/v1/weight/forecast", headers=b).json()["weigh_ins"] == 0
    assert client.get("/api/v1/aliases", headers=b).json()["aliases"] == []

    # A's names and context don't leak into B's preview
    preview = client.post("/api/v1/parse", headers=b, json={"text": "8x 100lb inc bench\n2"}).json()
    assert preview["sets"][0]["matched_exercise"] == "inc bench"

    # B can't delete A's alias, and B's own alias with the same short name is separate
    assert_error(client.delete(f"/api/v1/aliases/{alias['id']}", headers=b), 404, "not_found")
    assert (
        client.post(
            "/api/v1/aliases", headers=b, json={"short": "inc", "full": "inclined"}
        ).status_code
        == 201
    )
    assert len(client.get("/api/v1/aliases", headers=a).json()["aliases"]) == 1
