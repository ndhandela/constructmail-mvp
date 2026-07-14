import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"

HEADERS = {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
}


def _parse_json(text: str):
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    try:
        return json.loads(cleaned)
    except Exception:
        return None


async def _call_claude(system: str, user_message: str, model: str = "claude-sonnet-4-6", max_tokens: int = 800, temperature: float = None):
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_message}],
    }
    if temperature is not None:
        payload["temperature"] = temperature
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(CLAUDE_API_URL, headers=HEADERS, json=payload)
        response.raise_for_status()
        return response.json()["content"][0]["text"]


async def summarize_email_thread(email_text: str) -> dict:
    system = """You are a construction project communication specialist. Analyze the email thread and extract key information. You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no preamble).

Return this exact structure:
{
  "summary": "A concise 2-3 sentence summary of the main topic and outcome",
  "decisions": ["Decision 1", "Decision 2"],
  "open_items": ["Unresolved item 1", "Unresolved item 2"],
  "key_people": ["Person 1", "Person 2"],
  "needs_reply": true or false,
  "suggested_reply": "A grounded draft reply, or null"
}

For needs_reply/suggested_reply:
- Set needs_reply to true only if the thread contains an open question, RFI, change order, or action item that is clearly waiting on a response from the recipient.
- If needs_reply is true, write suggested_reply as a professional email reply body (no subject line, no greeting boilerplate beyond a simple greeting/sign-off) that directly addresses the open item(s), referencing who is waiting on what per the thread.
- Only reference facts, dates, and commitments that actually appear in the thread. Never invent commitments, dates, or approvals that aren't already stated.
- If needs_reply is false, set suggested_reply to null."""
    content = await _call_claude(system, f"Analyze this email thread:\n\n{email_text}", max_tokens=1200, temperature=0.2)
    parsed = _parse_json(content)
    if not parsed:
        raise ValueError("Invalid JSON response from Claude")
    return parsed


async def extract_action_items(email_text: str) -> list:
    system = """You are a construction project manager. Extract all action items from the email or text. You MUST respond with ONLY a valid JSON array (no markdown, no code blocks, no preamble).

Return this exact structure:
[
  { "action": "Clear description of the task", "assigned_to": "Person name or null", "due_date": "Date in YYYY-MM-DD format or null" }
]"""
    content = await _call_claude(system, f"Extract ALL action items from this text:\n\n{email_text}")
    parsed = _parse_json(content)
    if not isinstance(parsed, list):
        raise ValueError("Expected array response from Claude")
    return parsed


async def detect_signals(email_text: str) -> dict:
    system = """You are a construction document analyzer. Scan the text for critical signals in construction projects. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this structure:
{
  "signals": [
    { "type": "RFI", "confidence": 0.95, "excerpt": "Exact phrase from text" }
  ]
}

Signal types: RFI, ChangeOrder, Submittal, ScheduleImpact, Claim, Delay, SafetyIssue"""
    try:
        content = await _call_claude(system, f"Detect construction signals in this email:\n\n{email_text}", max_tokens=600)
        parsed = _parse_json(content)
        if not parsed or not isinstance(parsed.get("signals"), list):
            return {"signals": []}
        return parsed
    except Exception:
        return {"signals": []}


async def process_meeting_notes(notes_text: str) -> dict:
    system = """You are a construction meeting transcriber. Parse meeting notes into structured format. You MUST respond with ONLY valid JSON (no markdown, no code blocks, no preamble).

Return this structure:
{
  "attendees": ["Name1", "Name2"],
  "decisions": ["Decision made 1"],
  "action_items": [
    { "action": "Task description", "owner": "Person name or null", "due_date": "Date or null" }
  ],
  "open_issues": ["Issue 1"],
  "summary": "Brief summary of meeting"
}"""
    content = await _call_claude(system, f"Parse these meeting notes:\n\n{notes_text}", max_tokens=1000)
    parsed = _parse_json(content)
    if not parsed:
        raise ValueError("Invalid JSON response from Claude")
    return parsed
