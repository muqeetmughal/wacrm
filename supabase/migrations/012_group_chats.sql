-- ============================================================
-- Group chat support
--
-- Adds columns to support receiving WhatsApp group messages:
--   - conversations.group_id / group_subject for group chats
--   - messages.sender_name for showing who sent each message
-- ============================================================

-- Conversations: add group fields, make contact_id nullable
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_subject TEXT;
ALTER TABLE conversations ALTER COLUMN contact_id DROP NOT NULL;

-- Replace the old unique constraint with partial unique indexes
-- so (user_id, contact_id) and (user_id, group_id) are each unique
-- without conflicting when the other is null.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_contact_unique;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_contact_unique
  ON conversations(user_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_group_unique
  ON conversations(user_id, group_id) WHERE group_id IS NOT NULL;

-- Messages: track the sender's display name for group chats
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
