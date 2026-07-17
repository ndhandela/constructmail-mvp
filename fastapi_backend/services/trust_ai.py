"""
Claude calls for POMAR Trust — classification of raw WhatsApp/email chunks
into extractions, QPR synthesis, and buyer-notice drafting. Reuses
services/ai_helpers.py's _call_claude/_parse_json (same ANTHROPIC_API_KEY,
same httpx Messages API pattern) rather than standing up a second client.
"""

from services.ai_helpers import _call_claude, _parse_json

MODEL = "claude-sonnet-4-6"


async def classify_extractions(thread_text: str) -> list[dict]:
    system = """You are a compliance assistant for an Indian residential real-estate developer subject to RERA (Real Estate Regulatory Authority) disclosure rules. Read this raw site-update thread (WhatsApp export or email) and extract meaningful excerpts. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this exact structure:
{
  "extractions": [
    {
      "type": "progress_update" | "milestone" | "photo_reference" | "change_trigger",
      "summary": "One or two sentence plain-language summary of what this excerpt says",
      "excerpt": "The exact source text this was drawn from, trimmed to at most 500 characters",
      "confidence": 0.0-1.0,
      "sub_type": "timeline_shift" | "layout_change" | "amenity_change" | null,
      "severity": "high" | "low" | null
    }
  ]
}

Rules:
- progress_update: routine construction status (e.g. "slab work on 4th floor done", "plastering started in tower B").
- milestone: a significant completion event (e.g. "foundation complete", "occupancy certificate applied for").
- photo_reference: a message that references or shares a site photo/video as evidence of progress.
- change_trigger: anything indicating a change to the project layout, unit amenities, or possession/handover timeline versus what was previously disclosed to buyers. For these ONLY, also set sub_type and severity:
  - sub_type: "timeline_shift" for possession/handover date changes, "layout_change" for unit/floor plan changes, "amenity_change" for changes to promised amenities/specs.
  - severity: "high" if it likely requires proactive RERA buyer disclosure (any timeline/possession slip, any layout change), "low" for minor spec/amenity substitutions unlikely to need formal disclosure.
- For every other type, set sub_type and severity to null.
- Only extract from what's actually in the text — never invent dates, percentages, or commitments not present.
- Skip small talk, logistics, and anything with no compliance or progress relevance."""
    content = await _call_claude(system, f"Classify this thread:\n\n{thread_text}", model=MODEL, max_tokens=2000, temperature=0.1)
    parsed = _parse_json(content)
    if not parsed or not isinstance(parsed.get("extractions"), list):
        return []
    return parsed["extractions"]


async def synthesize_tg_qpr(project: dict, extractions: list[dict], financials: dict) -> dict:
    """TG-RERA's QPR is not one document — it's three separate professionally
    certified forms (Architect's Form-1, Engineer's Form-2, CA's Form-3), each
    signed by a different licensed professional directly on the TG-RERA
    portal. This produces pre-fill DRAFT content for all three in one call;
    POMAR Trust never submits anything or claims these are certified.

    Only called when services/state_rera_profiles.get_state_profile(state)
    .implemented is True — TG is the only such state today. A future state's
    synthesis function belongs here too, named synthesize_<state>_qpr."""
    system = """You are a RERA compliance assistant preparing DRAFT pre-fill content for a Telangana RERA (TG-RERA) Quarterly Progress Report, which is three separate professionally-certified forms — not one document. You are producing reference material for the licensed professionals who will review, correct, and certify each form themselves. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this exact structure:
{
  "form1_architect_draft": {
    "buildings": [
      { "name": "Tower A", "completion_pct": 0-100, "as_of_date": "YYYY-MM-DD", "supporting_notes": ["short extracted milestone/progress notes relevant to this building"] }
    ],
    "overall_completion_pct": 0-100
  },
  "form2_engineer_draft": {
    "milestone_log": [
      { "date": "YYYY-MM-DD", "description": "the extracted progress note, lightly paraphrased for clarity only", "source": "as given in the input" }
    ],
    "note": "This is a compiled reference log of site-reported progress, not a quality or quantity assessment. The certifying engineer should independently verify and assess before signing Form-2."
  },
  "form3_ca_draft": {
    "financial_progress_pct": 0-100 or null,
    "escrow_data_provided": true or false,
    "escrow_narrative": "plain-language escrow status, or an explicit statement that no financial data was provided",
    "withdrawal_vs_completion_note": "brief note on whether financial data aligns with physical progress — only if both are actually available, otherwise null"
  }
}

Hard rules:
- Group physical-progress extractions by building/tower/wing name as mentioned in the source text (e.g. "Tower A", "Tower B"). If no distinct building is named anywhere, use a single entry named "Overall".
- form1_architect_draft: only reference facts present in the extractions. Never invent a completion percentage not supported by the input — if genuinely inestimable, use your closest defensible estimate from what IS stated and note the uncertainty in supporting_notes rather than fabricating precision.
- form2_engineer_draft is the strictest section: you MUST NOT assess, characterize, rate, or draw any conclusion about construction quality, workmanship, or quantity of work done. Do not use words like "good", "satisfactory", "adequate", "poor", "on track", "delayed", "acceptable quality", or any other qualitative judgment. Only compile and lightly paraphrase (for clarity, not interpretation) the raw progress/milestone extractions into a dated log, preserving the date and source you were given for each one exactly. The "note" field must always be included verbatim as specified above.
- form3_ca_draft: if no financial data was provided in the input, set escrow_data_provided to false, financial_progress_pct to null, and escrow_narrative must explicitly say no financial data was provided — never fabricate a number. Only set withdrawal_vs_completion_note if both financial and physical data are actually available; otherwise null.
- Every date must come from the input data given to you — never invent a date."""
    extraction_lines = "\n".join(
        f"- date={e.get('created_at')} source={e.get('upload_type', 'upload')} #{e.get('upload_id')} "
        f"[{e.get('extraction_type', e.get('type'))}] {e.get('content_summary', e.get('summary'))}"
        for e in extractions
    )
    user_message = (
        f"Project: {project.get('project_name')} (RERA #{project.get('rera_registration_number') or 'unregistered'}, "
        f"{project.get('unit_count') or 'unknown'} units)\n\n"
        f"Manually entered financial data: {financials}\n\n"
        f"Extractions this quarter (date, source, type, content):\n{extraction_lines or '(none)'}"
    )
    content = await _call_claude(system, user_message, model=MODEL, max_tokens=2500, temperature=0.2)
    parsed = _parse_json(content)
    if not parsed:
        raise ValueError("Invalid JSON response from Claude")
    return parsed


async def draft_buyer_notice(alert: dict, extraction: dict) -> str:
    system = """You are drafting a plain-language buyer disclosure notice for an Indian residential real-estate project, on behalf of the developer, disclosing a change to layout, amenities, or possession timeline as required under RERA. Write ONLY the notice body text (no JSON, no subject line, no signature block) — a few short paragraphs a homebuyer with no legal background can understand. State clearly what changed, and avoid legal jargon. Only state facts present in the input; never invent a new date, reason, or compensation commitment not given to you."""
    user_message = (
        f"Alert type: {alert.get('alert_type')} (severity: {alert.get('severity')})\n"
        f"Alert description: {alert.get('description')}\n"
        f"Source excerpt this was detected from: {extraction.get('source_excerpt') if extraction else 'N/A'}"
    )
    return await _call_claude(system, user_message, model=MODEL, max_tokens=600, temperature=0.3)
