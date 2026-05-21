-- ============================================================
-- Full WhatsApp group management
--
-- Tracks WhatsApp groups (waba_groups) and their members
-- (group_members) so the UI can create, list, and manage groups.
-- ============================================================

-- Groups managed through the WhatsApp Business API
CREATE TABLE IF NOT EXISTS waba_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  waba_group_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  invite_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, waba_group_id)
);

-- Members of each group
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_group_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  name TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, waba_group_id, phone)
);

-- Row-level security
ALTER TABLE waba_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own groups
CREATE POLICY "users own their waba_groups"
  ON waba_groups
  USING (user_id = auth.uid());

CREATE POLICY "users own their group_members"
  ON group_members
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE waba_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE group_members;
