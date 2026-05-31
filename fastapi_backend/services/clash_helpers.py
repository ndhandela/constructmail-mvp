import json
import anthropic

client = anthropic.Anthropic()


async def analyze_clash_report(summary: dict, top_clashes: list, test_name: str) -> str:
    prompt = f"""You are a BIM coordination specialist helping a General Contractor understand a Navisworks clash report.

Clash Test: {test_name}
Summary:
- Total clashes: {summary.get('total')}
- New: {summary.get('New')} | Active: {summary.get('Active')} | Reviewed: {summary.get('Reviewed')} | Approved: {summary.get('Approved')} | Resolved: {summary.get('Resolved')}
- Clash type: {summary.get('type')} | Tolerance: {summary.get('tolerance')}

Top clashes by severity:
{chr(10).join(f"{i+1}. {c}" for i, c in enumerate(top_clashes))}

Please provide:
1. A 2-3 sentence executive summary of the report status
2. The top 2-3 risks that need immediate attention
3. Which clashes are likely to trigger RFIs or change orders
4. A recommended priority action for the project team today

Keep your response concise and actionable — this will be read by a GC project manager."""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text if message.content else "No analysis generated."


async def draft_clash_rfi(
    clash_name: str, status: str, distance: str, item1: dict, item2: dict,
    clash_point: str, discipline: str, priority: str
) -> dict:
    prompt = f"""You are a BIM coordination specialist helping a General Contractor draft a formal RFI.

Clash Details:
- Clash Name: {clash_name}
- Status: {status}
- Discipline: {discipline}
- Priority: {priority}
- Penetration Distance: {distance}
- Element 1: {item1.get('itemName')} (ID: {item1.get('elementId')}) on {item1.get('layer')}
- Element 2: {item2.get('itemName')} (ID: {item2.get('elementId')}) on {item2.get('layer')}
- Clash Point: {clash_point}

Write two things:

1. DESCRIPTION (3-4 sentences): A professional RFI description a GC would send to the design team.
2. SUGGESTED ACTION (2-3 sentences): A clear recommended action for the design team or responsible subcontractor.

Respond ONLY in this exact JSON format with no markdown or extra text:
{{"description":"...","suggestedAction":"..."}}"""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text if message.content else "{}"
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception:
        return {"description": raw, "suggestedAction": ""}
