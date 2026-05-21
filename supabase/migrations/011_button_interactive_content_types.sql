-- ============================================================
-- Add button_reply and interactive_reply to messages content_type
-- ============================================================

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'document', 'audio', 'video', 'location',
    'template', 'button_reply', 'interactive_reply'
  ));
