"""Outlying weigh-ins are flagged, left out of the stats, and can be confirmed or fixed."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

from jarvis_api.services.weighins import WeighRow, flag_weighins
from jarvis_core.parser import parse_weigh_in

from .conftest import auth
from .test_auth_and_errors import assert_error

API = "/api/v1"
T0 = datetime(2026, 11, 1, 7, tzinfo=UTC)


def row(i: int, day: int, w: float, confirmed: bool = False) -> WeighRow:
    return WeighRow(i, date(2026, 11, day), T0 + timedelta(days=day), w, confirmed)


def test_flags_readings_far_from_the_7_day_average() -> None:
    flags = flag_weighins([row(1, 1, 155.0), row(2, 2, 156.0), row(3, 3, 176.4), row(4, 4, 155.4)])
    assert [flags[i].flagged for i in (1, 2, 3, 4)] == [False, False, True, False]
    assert flags[3].avg_7d == 155.5
    # the flagged reading doesn't move the average for the next one
    assert flags[4].avg_7d == 155.5


def test_confirmed_outliers_count_again() -> None:
    flags = flag_weighins([row(1, 1, 155.0), row(2, 2, 176.4, confirmed=True), row(3, 3, 170.0)])
    assert not flags[2].flagged and not flags[3].flagged


def test_nothing_to_compare_with_means_no_flag() -> None:
    assert not flag_weighins([row(1, 1, 80.0)])[1].flagged
    assert not flag_weighins([row(1, 1, 155.0), row(2, 20, 176.0)])[2].flagged  # 19 days apart


def test_parser_records_the_typed_number_and_assumed_unit() -> None:
    w = parse_weigh_in("80")
    assert w is not None and w.typed == 80 and w.typed_unit == "kg" and w.unit_assumed
    w2 = parse_weigh_in("80lb")
    assert w2 is not None and w2.typed_unit == "lb" and not w2.unit_assumed and w2.weight_lb == 80


def post(client: TestClient, text: str) -> dict:  # type: ignore[type-arg]
    r = client.post(f"{API}/logs", headers=auth("alice"), json={"text": text, "mode": "weight"})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


def test_flagged_weigh_in_is_left_out_until_kept(client: TestClient) -> None:
    h = auth("alice")
    post(client, "155")
    post(client, "156")
    odd = post(client, "80")  # read as 80 kg = 176.4 lb
    w = odd["weigh_in"]
    assert w["flagged"] and w["unit_assumed"] and w["typed"] == 80 and w["typed_unit"] == "kg"
    assert w["weight_lb"] == 176.4 and w["avg_7d"] == 156.0  # one reading per day: the latest

    dash = client.get(f"{API}/dashboard", headers=h).json()["weight"]
    assert [p["value"] for p in dash["flagged"]] == [176.4]
    assert 176.4 not in [p["value"] for p in dash["points"]]

    kept = client.post(f"{API}/logs/{odd['id']}/confirm", headers=h)
    assert kept.status_code == 200 and not kept.json()["weigh_in"]["flagged"]
    assert kept.json()["weigh_in"]["confirmed"]
    dash = client.get(f"{API}/dashboard", headers=h).json()["weight"]
    assert dash["flagged"] == [] and 176.4 in [p["value"] for p in dash["points"]]


def test_it_was_lb_rewrites_and_confirms(client: TestClient) -> None:
    h = auth("alice")
    post(client, "155")
    odd = post(client, "80")
    r = client.patch(
        f"{API}/logs/{odd['id']}", headers=h, json={"text": "80lb", "confirm_weight": True}
    )
    assert r.status_code == 200, r.text
    w = r.json()["weigh_in"]
    assert w["weight_lb"] == 80 and w["confirmed"] and not w["flagged"]


def test_preview_warns_before_saving(client: TestClient) -> None:
    post(client, "155")
    body = client.post(
        f"{API}/parse", headers=auth("alice"), json={"text": "80", "mode": "weight"}
    ).json()
    assert body["weigh_in"]["flagged"] and body["weigh_in"]["avg_7d"] == 155.0


def test_confirm_needs_a_weigh_in_you_own(client: TestClient) -> None:
    odd = post(client, "155")
    assert_error(
        client.post(f"{API}/logs/{odd['id']}/confirm", headers=auth("bob")), 404, "not_found"
    )
