"""Re-derive sets and weigh-ins from raw log text after PARSER_VERSION changes.

python -m jarvis_api.rebuild          # only days with outdated logs
python -m jarvis_api.rebuild --all    # every log
"""

from __future__ import annotations

import argparse

from sqlalchemy import select

from jarvis_api.config import Settings
from jarvis_api.db import make_engine, make_sessionmaker
from jarvis_api.models import User
from jarvis_api.services.logs import rebuild
from jarvis_core.parser import PARSER_VERSION


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rebuild parsed rows from raw logs.")
    parser.add_argument("--all", action="store_true", help="re-parse every log")
    args = parser.parse_args(argv)
    engine = make_engine(Settings().database_url)
    total = 0
    with make_sessionmaker(engine)() as db:
        for user in db.scalars(select(User)).all():
            total += rebuild(db, user, only_outdated=not args.all)
    print(f"Re-parsed {total} logs with parser v{PARSER_VERSION}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
