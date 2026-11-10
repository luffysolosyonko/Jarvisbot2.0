"""Set Firebase Auth's password policy: new passwords need 12+ characters.

Firebase then refuses shorter passwords at sign-up and password change, even when
someone calls Firebase directly instead of using the app. Existing passwords keep
working (no forced upgrade at sign-in). Firebase can't check a list of common
passwords; the app does that before it ever sends one.

    docker compose exec api python -m jarvis_api.password_policy          # show it
    docker compose exec api python -m jarvis_api.password_policy --apply  # set it
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from jarvis_api.config import get_settings

MIN_LENGTH = 12
SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
API = "https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config"


def policy_body(min_length: int = MIN_LENGTH) -> dict[str, Any]:
    return {
        "passwordPolicyConfig": {
            "passwordPolicyEnforcementState": "ENFORCE",
            "forceUpgradeOnSignin": False,
            "passwordPolicyVersions": [
                {
                    "customStrengthOptions": {
                        "minPasswordLength": min_length,
                        "maxPasswordLength": 4096,
                    }
                }
            ],
        }
    }


def _session() -> Any:
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    settings = get_settings()
    creds = service_account.Credentials.from_service_account_file(  # type: ignore[no-untyped-call]
        settings.google_application_credentials, scopes=SCOPES
    )
    return AuthorizedSession(creds)  # type: ignore[no-untyped-call]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="set the policy (default: show it)")
    args = parser.parse_args(argv)

    settings = get_settings()
    if not settings.firebase_project_id or not settings.google_application_credentials:
        raise SystemExit("FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS must be set")
    url = API.format(project=settings.firebase_project_id)
    session = _session()
    if args.apply:
        resp = session.patch(url, params={"updateMask": "passwordPolicyConfig"}, json=policy_body())
    else:
        resp = session.get(url)
    if resp.status_code >= 400:
        raise SystemExit(f"Firebase said {resp.status_code}: {resp.text[:500]}")
    print(json.dumps(resp.json().get("passwordPolicyConfig", {}), indent=2))


if __name__ == "__main__":
    main()
