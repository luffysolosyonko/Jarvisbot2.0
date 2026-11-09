"""jarvis_core stays a pure engine: no web, database, Discord, Sheets or alcohol code."""

from __future__ import annotations

import re
from pathlib import Path

import jarvis_core

FORBIDDEN = re.compile(
    r"^\s*(?:import|from)\s+(discord|gspread|pandas|numpy|sqlalchemy|fastapi|anthropic"
    r"|firebase_admin|jarvis_api|alcohol|bac|sheets)\b",
    re.M,
)


def test_core_has_no_service_imports() -> None:
    root = Path(jarvis_core.__file__).parent
    for path in root.glob("*.py"):
        src = path.read_text(encoding="utf-8")
        assert not FORBIDDEN.search(src), path.name
        assert "drink" not in src.lower(), path.name
