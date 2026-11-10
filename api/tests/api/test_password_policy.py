"""The Firebase password policy we set: 12+ characters with upper, lower, a number and
a symbol; enforced; no forced upgrade."""

from __future__ import annotations

from jarvis_api.password_policy import MIN_LENGTH, policy_body


def test_policy_enforces_twelve_characters_without_locking_out_old_passwords() -> None:
    cfg = policy_body()["passwordPolicyConfig"]
    assert MIN_LENGTH == 12
    assert cfg["passwordPolicyEnforcementState"] == "ENFORCE"
    assert cfg["forceUpgradeOnSignin"] is False
    options = cfg["passwordPolicyVersions"][0]["customStrengthOptions"]
    assert options["minPasswordLength"] == 12
    for kind in ("Uppercase", "Lowercase", "Numeric", "NonAlphanumeric"):
        assert options[f"contains{kind}Character"] is True
