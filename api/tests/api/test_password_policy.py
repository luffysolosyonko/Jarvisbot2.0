"""The Firebase password policy we set: 12+ characters, enforced, no forced upgrade."""

from __future__ import annotations

from jarvis_api.password_policy import MIN_LENGTH, policy_body


def test_policy_enforces_twelve_characters_without_locking_out_old_passwords() -> None:
    cfg = policy_body()["passwordPolicyConfig"]
    assert MIN_LENGTH == 12
    assert cfg["passwordPolicyEnforcementState"] == "ENFORCE"
    assert cfg["forceUpgradeOnSignin"] is False
    assert cfg["passwordPolicyVersions"][0]["customStrengthOptions"]["minPasswordLength"] == 12
