"""Give the demo account an email and password, so it signs in like any other account.

The demo account is the Firebase user whose UID is DEMO_UID; its data is keyed by
that UID, so it stays attached. This sets the user's email and password (creating the
user if needed). Nothing is stored: pass --password, or one is generated and printed
once.

    docker compose exec api python -m jarvis_api.demo_login --email demo@example.com
"""

from __future__ import annotations

import argparse
import secrets
import string

from jarvis_api.config import get_settings
from jarvis_api.firebase import FirebaseAuth

ALPHABET = string.ascii_letters + string.digits


def generate_password(length: int = 16) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", help="at least 8 characters; generated if left out")
    args = parser.parse_args(argv)

    settings = get_settings()
    if not settings.demo_uid:
        raise SystemExit("DEMO_UID is not set")
    password = args.password or generate_password()
    if len(password) < 8:
        raise SystemExit("the password needs at least 8 characters")
    firebase = FirebaseAuth(settings.firebase_project_id, settings.google_application_credentials)
    created = firebase.set_email_login(settings.demo_uid, args.email, password)
    print(f"{'Created' if created else 'Updated'} the demo login for {settings.demo_uid}:")
    print(f"  email:    {args.email}")
    print(f"  password: {password}" if not args.password else "  password: (as given)")


if __name__ == "__main__":
    main()
