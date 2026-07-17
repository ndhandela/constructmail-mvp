"""
POMAR Trust — per-state RERA filing requirements registry.

Plain config, not a database table: which forms a given state's QPR is
broken into, and whether POMAR Trust has real generation logic for it yet.
TG is the only state with generation implemented today (see
services/trust_ai.py's synthesize_tg_qpr) — every other entry is a stub so
the state dropdown has real options now, with new states switched to
implemented=True as generation logic for them ships, without any schema
change. trust_projects.rera_state's CHECK constraint (db.py) just needs its
IN (...) list kept in sync with these keys, since Postgres can't reference
a Python dict directly.
"""

from fastapi import HTTPException

STATE_RERA_PROFILES = {
    "TG": {
        "label": "Telangana",
        "implemented": True,
        "forms": ["form1_architect", "form2_engineer", "form3_ca"],
    },
    "TN": {"label": "Tamil Nadu", "implemented": False, "forms": []},
    "KA": {"label": "Karnataka", "implemented": False, "forms": []},
    "MH": {"label": "Maharashtra", "implemented": False, "forms": []},
    "AP": {"label": "Andhra Pradesh", "implemented": False, "forms": []},
    "GJ": {"label": "Gujarat", "implemented": False, "forms": []},
    "UP": {"label": "Uttar Pradesh", "implemented": False, "forms": []},
    "DL": {"label": "Delhi (NCT)", "implemented": False, "forms": []},
    # Add more states as stubs (implemented: False) as needed — this list
    # doesn't need to be exhaustive, just non-empty so the dropdown has
    # reasonable initial options.
}


def get_state_profile(state_code: str) -> dict:
    """Raises a clear 400 for an unrecognized code rather than letting a
    KeyError bubble up as an opaque 500 — this is user-facing input (the
    project-creation state dropdown), not an internal invariant."""
    profile = STATE_RERA_PROFILES.get(state_code)
    if profile is None:
        raise HTTPException(400, f"'{state_code}' isn't a recognized RERA state code.")
    return profile
