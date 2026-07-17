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


async def synthesize_qpr(project: dict, extractions: list[dict], financials: dict) -> dict:
    system = """You are a RERA compliance assistant preparing a draft Quarterly Progress Report (QPR) for a Telangana RERA (TG-RERA) registered residential project. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this exact structure:
{
  "physical_progress_pct": 0-100,
  "financial_progress_pct": 0-100,
  "escrow_status": "One or two sentence plain-language escrow compliance status",
  "milestone_summary": ["Milestone 1", "Milestone 2"],
  "narrative_summary": "A short narrative paragraph summarizing the quarter's progress, suitable for a RERA filing, grounded only in the extractions and financial data provided"
}

Only reference facts that appear in the provided extractions or financial data — never invent progress percentages or milestones not supported by the input. If physical/financial progress can't be reasonably estimated from the input, use the closest defensible estimate and say so in the narrative rather than fabricating precision."""
    user_message = (
        f"Project: {project.get('project_name')} (RERA #{project.get('rera_registration_number') or 'unregistered'}, "
        f"{project.get('unit_count') or 'unknown'} units)\n\n"
        f"Manually entered financial data: {financials}\n\n"
        f"Extractions this quarter:\n" + "\n".join(
            f"- [{e.get('extraction_type', e.get('type'))}] {e.get('content_summary', e.get('summary'))}" for e in extractions
        )
    )
    content = await _call_claude(system, user_message, model=MODEL, max_tokens=1200, temperature=0.2)
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
