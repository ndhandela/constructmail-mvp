"""
Upload parsing for POMAR Trust — turns a raw WhatsApp .txt export or an .eml /
pasted email thread into plain chunked text ready for services/trust_ai.py's
Claude classification call. No AI here, just format normalization.
"""

import re
from email import message_from_bytes, message_from_string
from email.message import Message

# Matches both common WhatsApp export line styles:
#   Android: "3/14/24, 9:41 AM - Ravi Kumar: Slab work on 4th floor complete"
#   iOS:     "[14/03/24, 09:41:03] Ravi Kumar: Slab work on 4th floor complete"
_WHATSAPP_LINE = re.compile(
    r"^(?:\[)?(?P<date>\d{1,2}/\d{1,2}/\d{2,4}),?\s+(?P<time>\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp][Mm])?)\]?\s*[-–]?\s*"
    r"(?P<sender>[^:]{1,80}):\s(?P<message>.*)$"
)

_SYSTEM_MESSAGE_MARKERS = (
    "Messages and calls are end-to-end encrypted",
    "created group",
    "added you",
    "changed the subject",
    "changed this group's icon",
    "Missed voice call",
    "Missed video call",
)

CHUNK_SIZE = 150  # messages per Claude call — keeps each request well within context


def parse_whatsapp_export(text: str) -> list[dict]:
    """Returns a list of {date, time, sender, message} dicts in export order.
    Lines without a timestamp/sender prefix are treated as a continuation of
    the previous message (WhatsApp wraps multi-line messages this way)."""
    messages = []
    for raw_line in text.splitlines():
        line = raw_line.strip("﻿").rstrip()
        if not line:
            continue
        match = _WHATSAPP_LINE.match(line)
        if match:
            message = match.group("message").strip()
            if any(marker in message for marker in _SYSTEM_MESSAGE_MARKERS):
                continue
            messages.append({
                "date": match.group("date"),
                "time": match.group("time"),
                "sender": match.group("sender").strip(),
                "message": message,
            })
        elif messages:
            messages[-1]["message"] += "\n" + line
    return messages


def chunk_whatsapp_messages(messages: list[dict], chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Formats parsed messages back into "[date time] sender: message" text
    blocks, batched so each Claude call stays within a reasonable context size."""
    chunks = []
    for i in range(0, len(messages), chunk_size):
        batch = messages[i:i + chunk_size]
        chunks.append("\n".join(
            f"[{m['date']} {m['time']}] {m['sender']}: {m['message']}" for m in batch
        ))
    return chunks


def _extract_eml_body(msg: Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    payload = msg.get_payload(decode=True)
    return payload.decode(charset, errors="replace") if payload else ""


def parse_email_thread(raw: bytes, is_eml: bool) -> str:
    """Returns plain thread text: the .eml body (subject/from/date header plus
    text/plain part), or a passthrough decode for pasted plain text."""
    if not is_eml:
        return raw.decode("utf-8", errors="replace")

    msg = message_from_bytes(raw)
    header = f"Subject: {msg.get('Subject', '')}\nFrom: {msg.get('From', '')}\nDate: {msg.get('Date', '')}\n\n"
    return header + _extract_eml_body(msg)


def chunk_text(text: str, max_chars: int = 12000) -> list[str]:
    """Generic char-based chunking for email thread text (no per-message
    structure to split on the way WhatsApp export has)."""
    if len(text) <= max_chars:
        return [text]
    return [text[i:i + max_chars] for i in range(0, len(text), max_chars)]
