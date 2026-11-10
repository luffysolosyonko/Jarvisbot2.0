"""Fuzz: random and hostile shorthand never crashes the parser or the API, and what
is parsed always fits the limits the database relies on. Seeded, so runs repeat."""

from __future__ import annotations

import random
from datetime import date, timedelta

from fastapi.testclient import TestClient

from jarvis_api.services import fixes
from jarvis_core import analysis
from jarvis_core.names import canonical_names
from jarvis_core.parser import parse_log

from .conftest import auth

ATOMS = [
    "8x",
    "12x1f",
    "2xf",
    "x",
    "f",
    "^",
    "?",
    "uw",
    "bw",
    "bar",
    "barbell",
    "each hand",
    "or",
    "160lb",
    "70kg",
    "70/80kg",
    "20-25lb",
    "60 or 50kg",
    "135",
    "0",
    "-5",
    "1e9",
    "999999999999",
    "bench",
    "squat",
    "db",
    "rdl",
    "(note)",
    "(",
    ")",
    "yesterday",
    "w",
    "weight",
    "182.4",
    "83.9kg",
    "182 4",
    "2",
    "2x1x1xf",
    "5x 155lb 2x1x1xf",
    "3x8",
    "@",
    "=",
    "%",
    "_",
    "\\",
    "'",
    '"',
    ";",
    "--",
    "<b>",
    "🏋️",
    "é",
    "中文",
    "\t",
    "  ",
    "\n",
    "\n\n",
    "\r\n",
    "http://x.y",
    ".",
    "..",
    ",",
    "/",
    "-",
    "8x99999999f",
    "8x123456789012f",
    "200x",
    "201x",
    "000x",
    "8X",
    "LB",
    "KGS",
    "1.5.5",
    "1..5",
]


def rand_text(rng: random.Random) -> str:
    return " ".join(rng.choice(ATOMS) for _ in range(rng.randint(1, 9)))[:1900]


def test_fuzz_core_never_raises_and_respects_limits() -> None:
    rng = random.Random(7)  # noqa: S311
    for _ in range(1500):
        text = rand_text(rng)
        for kind in ("workout", "weight", None):
            p = parse_log(text, kind=kind)  # type: ignore[arg-type]
            for s in p.sets:
                assert 1 <= s.reps <= 200, text
                assert s.weight_lb is None or 0 <= s.weight_lb <= 1500, (text, s.weight_lb)
                assert s.exercise is None or len(s.exercise) <= 120, text
                assert s.weight_text is None or len(s.weight_text) <= 60, text
                assert s.flag is None or len(s.flag) <= 8, (text, s.flag)
                assert 0 <= s.failed_reps <= 200, (text, s.failed_reps)
                assert 0 <= s.good_reps <= 200, text
            if p.weigh_in:
                assert 1 <= p.weigh_in.weight_lb <= 1000, text
                assert p.weigh_in.note is None or len(p.weigh_in.note) <= 200
            for w in p.warnings:
                fixes.suggest(w, text.splitlines(), p.kind, ["bench", "squat"])


def test_fuzz_names_and_analysis_degenerate_inputs() -> None:
    rng = random.Random(3)  # noqa: S311
    words = [
        "a",
        "ab",
        "abc",
        "bench",
        "press",
        "presses",
        "inc",
        "incline",
        "oa",
        "one",
        "arm",
        "",
        "s",
    ]
    for _ in range(300):
        counts = {
            " ".join(rng.choice(words) for _ in range(rng.randint(1, 4))).strip()
            or "x": rng.randint(1, 9)
            for _ in range(rng.randint(1, 12))
        }
        aliases = {
            rng.choice(words) or "q": rng.choice(words) or "z" for _ in range(rng.randint(0, 4))
        }
        canonical_names(counts, aliases)
    d = date(2026, 1, 1)
    assert analysis.project([]) is None
    assert analysis.project([(d, 100.0)]) is None
    assert analysis.project([(d, 100.0), (d, 101.0), (d, 102.0)]) is None  # all one day
    p = analysis.project([(d + timedelta(days=i), 100.0) for i in range(5)])
    assert p is not None and p.slope_per_day == 0
    pts = [analysis.WeightPoint(d + timedelta(days=i), 180.0, None) for i in range(12)]
    assert analysis.weight_projection(pts) is not None
    assert analysis.moving_average([]) == []


def test_fuzz_api_never_500s(client: TestClient) -> None:
    rng = random.Random(11)  # noqa: S311
    h = auth("alice")
    ids: list[int] = []
    for i in range(250):
        text = rand_text(rng)
        mode = rng.choice(["workout", "weight", None])
        body = {"text": text} | ({"mode": mode} if mode else {})
        r = client.post("/api/v1/parse", headers=h, json=body)
        assert r.status_code in (200, 422, 429), (text, r.status_code, r.text[:200])
        if i % 3 == 0:
            r = client.post("/api/v1/logs", headers=h, json=body)
            assert r.status_code in (201, 422), (text, r.status_code, r.text[:200])
            if r.status_code == 201:
                ids.append(r.json()["id"])
        if ids and i % 7 == 0:
            lid = rng.choice(ids)
            r = client.patch(f"/api/v1/logs/{lid}", headers=h, json={"text": rand_text(rng)})
            assert r.status_code in (200, 422), (r.status_code, r.text[:200])
        if ids and i % 31 == 0:
            lid = ids.pop(rng.randrange(len(ids)))
            assert client.delete(f"/api/v1/logs/{lid}", headers=h).status_code == 204
    for path in [
        "/logs",
        "/today",
        "/dashboard",
        "/exercises",
        "/stats?days=30",
        "/calendar?month=2026-11",
        "/weight/forecast",
        "/aliases/matches",
        "/export/all.csv",
        "/export/sets.csv",
        "/export/weighins.csv",
        "/me/data",
        "/usage",
        "/ask/history",
    ]:
        r = client.get(f"/api/v1{path}", headers=h)
        assert r.status_code == 200, (path, r.status_code, r.text[:300])
    names = [e["exercise"] for e in client.get("/api/v1/exercises", headers=h).json()["exercises"]]
    for n in names[:60]:
        r = client.get(f"/api/v1/exercises/{n}", headers=h)
        assert r.status_code in (200, 404), (n, r.status_code, r.text[:200])
        r = client.get(f"/api/v1/exercises/{n}/forecast?target=300", headers=h)
        assert r.status_code in (200, 404, 422), (n, r.status_code, r.text[:200])
