export interface OverviewReport {
  totalConversations: number
  totalContacts: number
  totalMessages: number
  totalDeals: number
  totalBroadcasts: number
  activeAutomations: number
  totalGroups: number
}

export interface ConversationVolumePoint {
  day: string
  count: number
}

export interface ConversationByStatus {
  status: string
  count: number
}

export interface AgentWorkload {
  agentName: string
  assignedConversations: number
  messagesSent: number
}

export interface MessageByType {
  contentType: string
  count: number
}

export interface MessageVolumePoint {
  day: string
  incoming: number
  outgoing: number
}

export interface ContactGrowthPoint {
  day: string
  count: number
}

export interface BroadcastPerformance {
  id: string
  name: string
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
}

export interface TimeSeriesPoint {
  label: string
  value: number
}
