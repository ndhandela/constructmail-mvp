"""
POMAR Trust — TG-RERA QPR draft PDF export.

Mirrors routers/clash.py's /agenda-pdf reportlab convention (raw canvas
drawing into an io.BytesIO buffer, not platypus/SimpleDocTemplate).

Every page produced here is explicitly a pre-fill DRAFT for the licensed
professional to review, correct, and certify themselves — never a
certified filing, and never something POMAR submits anywhere. That's
enforced structurally: every form starts with a bright warning banner and
ends with a blank signature block (Name / License-Registration Number /
Signature / Date) that is never pre-filled or simulated.

# TODO: a future "mark as submitted by professional" metadata field could
# attach to trust_qpr_drafts (e.g. per-form signed_at/signed_by columns) once
# there's a real workflow for professionals to record that they've certified
# and filed a form on the TG-RERA portal. Out of scope for now — see the
# module docstring in routers/trust_qpr.py for why POMAR never files anything
# itself.
"""

import io

from fastapi import HTTPException

DRAFT_WARNING = "DRAFT — FOR PROFESSIONAL REVIEW ONLY. NOT A CERTIFIED FILING."

FORM_TITLES = {
    1: ("Form-1 — Architect's Certificate (Draft)", "form1_architect_draft", "Architect"),
    2: ("Form-2 — Engineer's Certificate Reference Log (Draft)", "form2_engineer_draft", "Engineer"),
    3: ("Form-3 — Chartered Accountant's Certificate (Draft)", "form3_ca_draft", "Chartered Accountant"),
}


def _pdf_safe(text: str) -> str:
    """Helvetica (reportlab's base Type-1 font, used throughout this module)
    has no ₹ glyph — it silently renders as a black box rather than raising,
    so this has to be caught here rather than by trusting the font. Financial
    narratives from Claude commonly use ₹, so this is a real, likely case,
    not a hypothetical one."""
    return (text or "").replace("₹", "Rs. ")


def _wrap_text(c, text: str, font: str, size: int, max_width: float) -> list[str]:
    """Simple greedy word-wrap using reportlab's own stringWidth — this
    codebase has no existing text-wrap helper (clash.py's agenda PDF just
    truncates single-line strings), but form narratives here are too long
    for that to read sensibly."""
    words = _pdf_safe(text).split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if c.stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _draw_wrapped(c, text, x, y, max_width, width, height, font="Helvetica", size=9, leading=13):
    """Draws word-wrapped text starting at (x, y), paginating via c.showPage()
    when it runs off the bottom margin (same 80pt bottom margin convention as
    routers/clash.py's agenda PDF), and returns the y position after the text."""
    from reportlab.lib.colors import HexColor

    for line in _wrap_text(c, text, font, size, max_width):
        if y < 80:
            c.showPage()
            y = height - 60
            c.setFillColor(HexColor("#0E1B2C"))
        c.setFont(font, size)
        c.drawString(x, y, line)
        y -= leading
    return y


def _draw_header(c, width, height, title):
    from reportlab.lib.colors import HexColor

    c.setFillColor(HexColor("#0E1B2C"))
    c.rect(0, height - 80, width, 80, fill=1, stroke=0)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, height - 32, "POMAR Trust")
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 50, title)
    c.setFont("Helvetica", 8)
    c.drawString(50, height - 65, "Telangana RERA (TG-RERA) Quarterly Progress Report")


def _draw_warning_banner(c, width, y):
    from reportlab.lib.colors import HexColor

    c.setFillColor(HexColor("#B23A2F"))
    c.rect(40, y - 22, width - 80, 26, fill=1, stroke=0)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(width / 2, y - 15, DRAFT_WARNING)
    return y - 40


def _draw_signature_block(c, width, height, y, role_label):
    """Always blank — never pre-filled or simulated, per spec. If this lands
    too close to the bottom margin, it starts on a fresh page instead of
    being cut off."""
    from reportlab.lib.colors import HexColor

    if y < 160:
        c.showPage()
        y = height - 60

    c.setFillColor(HexColor("#0E1B2C"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, f"Certifying {role_label} — Signature Block")
    y -= 10
    c.setStrokeColor(HexColor("#E7E0D3"))
    c.line(50, y, width - 50, y)
    y -= 25

    fields = ["Name", "License / Registration Number", "Signature", "Date"]
    for field in fields:
        c.setFillColor(HexColor("#5B6572"))
        c.setFont("Helvetica", 9)
        c.drawString(50, y, f"{field}:")
        c.setStrokeColor(HexColor("#0E1B2C"))
        c.line(220, y - 2, width - 50, y - 2)
        y -= 30
    return y


def _draw_footer(c, width):
    from reportlab.lib.colors import HexColor

    c.setFillColor(HexColor("#5B6572"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(width / 2, 20, "POMAR Trust · TechDen Solutions · pomar.ai — pre-fill draft, not a certified filing")


def _build_form1(c, width, height, project, form_data, y):
    from reportlab.lib.colors import HexColor

    c.setFillColor(HexColor("#0E1B2C"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, f"Overall physical completion: {form_data.get('overall_completion_pct', '—')}%")
    y -= 25

    for building in form_data.get("buildings", []):
        if y < 120:
            c.showPage()
            y = height - 60
        c.setFillColor(HexColor("#0E1B2C"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, y, _pdf_safe(f"{building.get('name', 'Building')} — {building.get('completion_pct', '—')}% complete"))
        y -= 14
        c.setFillColor(HexColor("#5B6572"))
        c.setFont("Helvetica", 8)
        c.drawString(50, y, _pdf_safe(f"As of {building.get('as_of_date', 'unspecified date')}"))
        y -= 16
        for note in building.get("supporting_notes", []):
            y = _draw_wrapped(c, f"• {note}", 60, y, width - 110, width, height, size=8, leading=11)
        y -= 10
    return y


def _build_form2(c, width, height, project, form_data, y):
    from reportlab.lib.colors import HexColor

    y = _draw_wrapped(
        c, form_data.get("note", ""), 50, y, width - 100, width, height,
        font="Helvetica-Oblique", size=8, leading=11,
    )
    y -= 15

    c.setFillColor(HexColor("#0E1B2C"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(50, y, "DATE")
    c.drawString(140, y, "SITE-REPORTED PROGRESS (compiled reference log)")
    y -= 14
    c.setStrokeColor(HexColor("#E7E0D3"))
    c.line(50, y, width - 50, y)
    y -= 14

    for entry in form_data.get("milestone_log", []):
        if y < 90:
            c.showPage()
            y = height - 60
        c.setFillColor(HexColor("#5B6572"))
        c.setFont("Helvetica", 8)
        c.drawString(50, y, _pdf_safe(str(entry.get("date", "—"))))
        y = _draw_wrapped(c, entry.get("description", ""), 140, y, width - 190, width, height, size=8, leading=11)
        c.setFillColor(HexColor("#5B6572"))
        c.setFont("Helvetica-Oblique", 7)
        c.drawString(140, y, _pdf_safe(f"source: {entry.get('source', 'upload')}"))
        y -= 16
    return y


def _build_form3(c, width, height, project, form_data, y):
    from reportlab.lib.colors import HexColor

    c.setFillColor(HexColor("#0E1B2C"))
    c.setFont("Helvetica-Bold", 11)
    financial_pct = form_data.get("financial_progress_pct")
    c.drawString(50, y, f"Financial progress: {financial_pct if financial_pct is not None else 'not available'}%")
    y -= 20
    c.setFont("Helvetica", 9)
    c.drawString(50, y, f"Financial data provided: {'Yes' if form_data.get('escrow_data_provided') else 'No'}")
    y -= 20

    c.setFont("Helvetica-Bold", 9)
    c.drawString(50, y, "Escrow status")
    y -= 14
    y = _draw_wrapped(c, form_data.get("escrow_narrative", ""), 50, y, width - 100, width, height, size=9)
    y -= 10

    note = form_data.get("withdrawal_vs_completion_note")
    if note:
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y, "Withdrawal vs. completion")
        y -= 14
        y = _draw_wrapped(c, note, 50, y, width - 100, width, height, size=9)
    return y


_BUILDERS = {1: _build_form1, 2: _build_form2, 3: _build_form3}


def build_form_pdf(form_number: int, project: dict, draft_json: dict) -> io.BytesIO:
    if form_number not in FORM_TITLES:
        raise HTTPException(400, "form must be 1, 2, or 3")

    title, section_key, role_label = FORM_TITLES[form_number]
    form_data = draft_json.get(section_key)
    if form_data is None:
        raise HTTPException(404, f"This draft has no {section_key.replace('_', ' ')} — regenerate the QPR draft first.")

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    _draw_header(c, width, height, title)
    y = height - 105
    y = _draw_warning_banner(c, width, y)

    from reportlab.lib.colors import HexColor
    c.setFillColor(HexColor("#0E1B2C"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, project.get("project_name", "Project"))
    y -= 14
    c.setFillColor(HexColor("#5B6572"))
    c.setFont("Helvetica", 8)
    c.drawString(50, y, f"TG-RERA {project.get('rera_registration_number') or 'unregistered'}")
    y -= 25

    y = _BUILDERS[form_number](c, width, height, project, form_data, y)
    y -= 20
    _draw_signature_block(c, width, height, y, role_label)
    _draw_footer(c, width)

    c.save()
    buf.seek(0)
    return buf
