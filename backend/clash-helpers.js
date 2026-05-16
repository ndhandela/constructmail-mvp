const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

async function analyzeClashReport({ summary, topClashes, testName }) {
  const prompt = `You are a BIM coordination specialist helping a General Contractor understand a Navisworks clash report.

Clash Test: ${testName}
Summary:
- Total clashes: ${summary.total}
- New: ${summary.New} | Active: ${summary.Active} | Reviewed: ${summary.Reviewed} | Approved: ${summary.Approved} | Resolved: ${summary.Resolved}
- Clash type: ${summary.type} | Tolerance: ${summary.tolerance}

Top clashes by severity:
${topClashes.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Please provide:
1. A 2-3 sentence executive summary of the report status
2. The top 2-3 risks that need immediate attention
3. Which clashes are likely to trigger RFIs or change orders
4. A recommended priority action for the project team today

Keep your response concise and actionable — this will be read by a GC project manager.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0]?.text || 'No analysis generated.';
}

async function draftClashRFI({ clashName, status, distance, item1, item2, clashPoint, discipline, priority }) {
  const prompt = `You are a BIM coordination specialist helping a General Contractor draft a formal RFI.

Clash Details:
- Clash Name: ${clashName}
- Status: ${status}
- Discipline: ${discipline}
- Priority: ${priority}
- Penetration Distance: ${distance}
- Element 1: ${item1.itemName} (ID: ${item1.elementId}) on ${item1.layer}
- Element 2: ${item2.itemName} (ID: ${item2.elementId}) on ${item2.layer}
- Clash Point: ${clashPoint}

Write two things:

1. DESCRIPTION (3-4 sentences): A professional RFI description a GC would send to the design team. Include what elements are clashing, where, how severe the penetration is, and why it needs resolution before construction proceeds.

2. SUGGESTED ACTION (2-3 sentences): A clear recommended action for the design team or responsible subcontractor. Include who should respond, what they need to provide, and urgency based on priority level.

Respond ONLY in this exact JSON format with no markdown or extra text:
{"description":"...","suggestedAction":"..."}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0]?.text || '{}';
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return { description: raw, suggestedAction: '' };
  }
}

module.exports = { analyzeClashReport, draftClashRFI };
