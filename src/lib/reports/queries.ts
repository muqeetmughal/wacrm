import type { SupabaseClient } from '@supabase/supabase-js'
import { daysAgoStart, lastNDayKeys, localDayKey, startOfLocalDay } from '@/lib/dashboard/date-utils'
import type {
  OverviewReport,
  ConversationVolumePoint,
  ConversationByStatus,
  AgentWorkload,
  MessageByType,
  MessageVolumePoint,
  ContactGrowthPoint,
  BroadcastPerformance,
} from './types'

type DB = SupabaseClient

export async function loadOverview(db: DB): Promise<OverviewReport> {
  const [
    conversations,
    contacts,
    messages,
    deals,
    broadcasts,
    automations,
    groups,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('messages').select('id', { count: 'exact', head: true }),
    db.from('deals').select('id', { count: 'exact', head: true }),
    db.from('broadcasts').select('id', { count: 'exact', head: true }),
    db.from('automations').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('waba_groups').select('id', { count: 'exact', head: true }),
  ])

  return {
    totalConversations: conversations.count ?? 0,
    totalContacts: contacts.count ?? 0,
    totalMessages: messages.count ?? 0,
    totalDeals: deals.count ?? 0,
    totalBroadcasts: broadcasts.count ?? 0,
    activeAutomations: automations.count ?? 0,
    totalGroups: groups.count ?? 0,
  }
}

export async function loadConversationVolume(
  db: DB,
  rangeDays: number,
): Promise<ConversationVolumePoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data } = await db
    .from('conversations')
    .select('created_at')
    .gte('created_at', start)
    .order('created_at', { ascending: true })

  const keys = lastNDayKeys(rangeDays)
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, 0)
  for (const row of (data ?? []) as { created_at: string }[]) {
    const key = localDayKey(row.created_at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }))
}

export async function loadConversationsByStatus(db: DB): Promise<ConversationByStatus[]> {
  const { data } = await db.from('conversations').select('status')
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { status: string }[]) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }))
}

export async function loadAgentWorkload(db: DB): Promise<AgentWorkload[]> {
  const { data: profiles } = await db
    .from('profiles')
    .select('user_id, full_name')
    .not('user_id', 'is', null)

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? 'Unknown']))

  const [convResult, msgResult] = await Promise.all([
    db.from('conversations').select('assigned_agent_id'),
    db.from('messages').select('sender_id').eq('sender_type', 'agent'),
  ])

  const assignments = new Map<string, number>()
  for (const row of (convResult.data ?? []) as { assigned_agent_id: string | null }[]) {
    if (row.assigned_agent_id) {
      assignments.set(row.assigned_agent_id, (assignments.get(row.assigned_agent_id) ?? 0) + 1)
    }
  }

  const sent = new Map<string, number>()
  for (const row of (msgResult.data ?? []) as { sender_id: string | null }[]) {
    if (row.sender_id) {
      sent.set(row.sender_id, (sent.get(row.sender_id) ?? 0) + 1)
    }
  }

  const allIds = new Set([...assignments.keys(), ...sent.keys()])
  return Array.from(allIds).map((id) => ({
    agentName: profileMap.get(id) ?? 'Unknown',
    assignedConversations: assignments.get(id) ?? 0,
    messagesSent: sent.get(id) ?? 0,
  }))
}

export async function loadMessagesByType(db: DB): Promise<MessageByType[]> {
  const { data } = await db.from('messages').select('content_type')
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { content_type: string }[]) {
    counts.set(row.content_type, (counts.get(row.content_type) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([contentType, count]) => ({ contentType, count }))
}

export async function loadMessageVolume(
  db: DB,
  rangeDays: number,
): Promise<MessageVolumePoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

export async function loadContactGrowth(
  db: DB,
  rangeDays: number,
): Promise<ContactGrowthPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data } = await db
    .from('contacts')
    .select('created_at')
    .gte('created_at', start)
    .order('created_at', { ascending: true })

  const keys = lastNDayKeys(rangeDays)
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, 0)
  for (const row of (data ?? []) as { created_at: string }[]) {
    const key = localDayKey(row.created_at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }))
}

export async function loadBroadcastPerformance(db: DB): Promise<BroadcastPerformance[]> {
  const { data } = await db
    .from('broadcasts')
    .select('id, name, status, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count')
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    status: r.status as string,
    totalRecipients: (r.total_recipients as number) ?? 0,
    sentCount: (r.sent_count as number) ?? 0,
    deliveredCount: (r.delivered_count as number) ?? 0,
    readCount: (r.read_count as number) ?? 0,
    repliedCount: (r.replied_count as number) ?? 0,
    failedCount: (r.failed_count as number) ?? 0,
  }))
}

export async function loadTodayStats(db: DB) {
  const todayStart = startOfLocalDay().toISOString()

  const [newConversations, newContacts, newMessages] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
  ])

  return {
    newConversations: newConversations.count ?? 0,
    newContacts: newContacts.count ?? 0,
    newMessages: newMessages.count ?? 0,
  }
}
