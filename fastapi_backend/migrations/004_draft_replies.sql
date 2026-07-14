-- Migration: 004_draft_replies.sql
-- Adds draft_replies table for POMAR Mail draft-then-review-then-send replies (Gmail + Outlook)
--
-- Deviation from original spec: uses user_id INT REFERENCES users(id) instead of
-- client_id UUID REFERENCES clients(id). clients.id is a SERIAL (INT) in this schema,
-- and a clients row only exists once a user (admin/owner role) fills out company info —
-- most users won't have one. Gmail/Outlook OAuth connections, procore_tokens, and
-- connect_queue are all keyed off users.id, so draft_replies follows that pattern.

CREATE TABLE IF NOT EXISTS draft_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id),
  source_email_id VARCHAR NOT NULL,
  provider VARCHAR NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  thread_id VARCHAR NOT NULL,
  ai_generated_body TEXT NOT NULL,
  edited_body TEXT,
  status VARCHAR NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'sent', 'discarded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_message_id VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_draft_replies_user_status ON draft_replies(user_id, status);

-- Track whether each account has re-consented under the new send scopes
-- (gmail.send / Mail.Send). Existing connected accounts default to false so the
-- frontend can show a "reconnect for reply access" banner until they reconnect.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_send_scope_granted BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_send_scope_granted BOOLEAN DEFAULT false;
