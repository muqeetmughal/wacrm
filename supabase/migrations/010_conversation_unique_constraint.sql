-- ============================================================
-- Deduplicate conversations & add unique constraint
--
-- Multiple conversations for the same (user_id, contact_id) can
-- exist due to race conditions in the webhook handler. This
-- migration merges them (messages go to the oldest conversation),
-- then prevents future duplicates with a unique constraint.
-- ============================================================

-- Step 1: Merge duplicate conversations — move messages to the
-- oldest conversation for each (user_id, contact_id) pair.
WITH duplicates AS (
  SELECT
    user_id,
    contact_id,
    array_agg(id ORDER BY created_at) AS conv_ids,
    (array_agg(id ORDER BY created_at))[1] AS keep_id
  FROM conversations
  GROUP BY user_id, contact_id
  HAVING COUNT(*) > 1
)
UPDATE messages m
SET conversation_id = d.keep_id
FROM duplicates d
WHERE m.conversation_id = ANY (d.conv_ids[2:])
  AND m.conversation_id <> d.keep_id;

-- Step 2: Also update message_reactions that reference duplicate
-- conversations.
WITH duplicates AS (
  SELECT
    user_id,
    contact_id,
    array_agg(id ORDER BY created_at) AS conv_ids,
    (array_agg(id ORDER BY created_at))[1] AS keep_id
  FROM conversations
  GROUP BY user_id, contact_id
  HAVING COUNT(*) > 1
)
UPDATE message_reactions r
SET conversation_id = d.keep_id
FROM duplicates d
WHERE r.conversation_id = ANY (d.conv_ids[2:])
  AND r.conversation_id <> d.keep_id;

-- Step 3: Update deals referencing duplicate conversations to point
-- to the kept conversation (deals FK has no CASCADE, so the DELETE
-- would fail if we skip this).
WITH duplicates AS (
  SELECT
    user_id,
    contact_id,
    array_agg(id ORDER BY created_at) AS conv_ids,
    (array_agg(id ORDER BY created_at))[1] AS keep_id
  FROM conversations
  GROUP BY user_id, contact_id
  HAVING COUNT(*) > 1
)
UPDATE deals d
SET conversation_id = dup.keep_id
FROM duplicates dup
WHERE d.conversation_id = ANY (dup.conv_ids[2:])
  AND d.conversation_id <> dup.keep_id;

-- Step 4: Delete duplicate conversations (now that nothing references them).
WITH duplicates AS (
  SELECT
    user_id,
    contact_id,
    array_agg(id ORDER BY created_at) AS conv_ids,
    (array_agg(id ORDER BY created_at))[1] AS keep_id
  FROM conversations
  GROUP BY user_id, contact_id
  HAVING COUNT(*) > 1
)
DELETE FROM conversations c
USING duplicates d
WHERE c.id = ANY (d.conv_ids[2:])
  AND c.id <> d.keep_id;

-- Step 5: Add the unique constraint to prevent future duplicates.
ALTER TABLE conversations
  ADD CONSTRAINT conversations_user_contact_unique
  UNIQUE (user_id, contact_id);
