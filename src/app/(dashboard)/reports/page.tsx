"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3,
  MessageSquare,
  Users,
  MailOpen,
  Phone,
  Loader2,
  TrendingUp,
  Activity,
  Inbox,
  Send,
  Target,
  Radio,
  Zap,
} from "lucide-react";
import { StatsCard } from "@/components/reports/stats-card";
import { SimpleBarChart } from "@/components/reports/simple-bar-chart";
import { StatusDonut } from "@/components/reports/status-donut";
import { ProgressBar } from "@/components/reports/progress-bar";
import { Card } from "@/components/ui/card";
import type {
  OverviewReport,
  ConversationVolumePoint,
  ConversationByStatus,
  AgentWorkload,
  MessageByType,
  MessageVolumePoint,
  ContactGrowthPoint,
  BroadcastPerformance,
} from "@/lib/reports/types";
import {
  loadOverview,
  loadConversationVolume,
  loadConversationsByStatus,
  loadAgentWorkload,
  loadMessagesByType,
  loadMessageVolume,
  loadContactGrowth,
  loadBroadcastPerformance,
  loadTodayStats,
} from "@/lib/reports/queries";

type ReportTab = "overview" | "conversations" | "messages" | "contacts" | "agents" | "broadcasts";
const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

const TAB_LABELS: Record<ReportTab, string> = {
  overview: "Overview",
  conversations: "Conversations",
  messages: "Messages",
  contacts: "Contacts",
  agents: "Agents",
  broadcasts: "Broadcasts",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#8b5cf6",
  pending: "#f59e0b",
  closed: "#64748b",
};

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("overview");
  const [range, setRange] = useState<RangeDays>(30);

  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [today, setToday] = useState<{ newConversations: number; newContacts: number; newMessages: number } | null>(null);
  const [convVolume, setConvVolume] = useState<ConversationVolumePoint[]>([]);
  const [convByStatus, setConvByStatus] = useState<ConversationByStatus[]>([]);
  const [agentWorkload, setAgentWorkload] = useState<AgentWorkload[]>([]);
  const [msgByType, setMsgByType] = useState<MessageByType[]>([]);
  const [msgVolume, setMsgVolume] = useState<MessageVolumePoint[]>([]);
  const [contactGrowth, setContactGrowth] = useState<ContactGrowthPoint[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const db = createClient();

    await Promise.all([
      loadOverview(db).then(setOverview).catch(() => {}),
      loadTodayStats(db).then(setToday).catch(() => {}),
      loadConversationVolume(db, 30).then(setConvVolume).catch(() => {}),
      loadConversationsByStatus(db).then(setConvByStatus).catch(() => {}),
      loadAgentWorkload(db).then(setAgentWorkload).catch(() => {}),
      loadMessagesByType(db).then(setMsgByType).catch(() => {}),
      loadMessageVolume(db, 30).then(setMsgVolume).catch(() => {}),
      loadContactGrowth(db, 30).then(setContactGrowth).catch(() => {}),
      loadBroadcastPerformance(db).then(setBroadcasts).catch(() => {}),
    ]);

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRangeChange = useCallback(async (r: RangeDays) => {
    setRange(r);
    const db = createClient();
    const [vol, msg, contacts] = await Promise.all([
      loadConversationVolume(db, r),
      loadMessageVolume(db, r),
      loadContactGrowth(db, r),
    ]);
    setConvVolume(vol);
    setMsgVolume(msg);
    setContactGrowth(contacts);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const totalMsgVol = msgVolume.reduce((s, d) => s + d.incoming + d.outgoing, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Analytics and insights from your WhatsApp CRM data
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
        {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-violet-500/10 text-violet-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* =============== OVERVIEW =============== */}
      {tab === "overview" && (
        <div className="space-y-6">
          {today && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatsCard title="New Today" value={today.newConversations} icon={Inbox} subtitle="Conversations" />
              <StatsCard title="New Today" value={today.newContacts} icon={Users} subtitle="Contacts" />
              <StatsCard title="New Today" value={today.newMessages} icon={MessageSquare} subtitle="Messages" />
            </div>
          )}
          {overview && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                <StatsCard title="Total Conversations" value={overview.totalConversations} icon={MessageSquare} />
                <StatsCard title="Total Contacts" value={overview.totalContacts} icon={Users} />
                <StatsCard title="Total Messages" value={overview.totalMessages} icon={Send} />
                <StatsCard title="Total Deals" value={overview.totalDeals} icon={Target} />
                <StatsCard title="Broadcasts" value={overview.totalBroadcasts} icon={Radio} />
                <StatsCard title="Active Automations" value={overview.activeAutomations} icon={Zap} />
                <StatsCard title="Groups" value={overview.totalGroups} icon={BarChart3} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Conversation volume chart */}
                <Card className="border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-3 text-sm font-medium text-white">Conversation Volume (30 days)</h3>
                  {convVolume.length > 0 ? (
                    <SimpleBarChart
                      data={convVolume.map((d) => ({ label: d.day.slice(5), value: d.count }))}
                      color="#8b5cf6"
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-500">No data</p>
                  )}
                </Card>

                {/* Conversations by status */}
                <Card className="border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-3 text-sm font-medium text-white">Conversations by Status</h3>
                  {convByStatus.length > 0 ? (
                    <StatusDonut
                      data={convByStatus.map((d) => ({
                        label: d.status.charAt(0).toUpperCase() + d.status.slice(1),
                        value: d.count,
                        color: STATUS_COLORS[d.status] ?? "#64748b",
                      }))}
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-500">No data</p>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* =============== CONVERSATIONS =============== */}
      {tab === "conversations" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Range</span>
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRangeChange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  range === r ? "bg-violet-500/10 text-violet-400" : "text-slate-400 hover:text-white"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">New Conversations</h3>
              {convVolume.length > 0 ? (
                <SimpleBarChart
                  data={convVolume.map((d) => ({ label: d.day.slice(5), value: d.count }))}
                  color="#8b5cf6"
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No data</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Total: {convVolume.reduce((s, d) => s + d.count, 0)}
              </p>
            </Card>

            <Card className="border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">By Status</h3>
              {convByStatus.length > 0 ? (
                <div className="space-y-3">
                  {convByStatus.map((d) => {
                    const total = convByStatus.reduce((s, x) => s + x.count, 0);
                    return (
                      <ProgressBar
                        key={d.status}
                        label={d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                        value={d.count}
                        max={total}
                        color={STATUS_COLORS[d.status] ?? "#64748b"}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No data</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* =============== MESSAGES =============== */}
      {tab === "messages" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Range</span>
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRangeChange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  range === r ? "bg-violet-500/10 text-violet-400" : "text-slate-400 hover:text-white"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">Daily Volume</h3>
              {msgVolume.length > 0 ? (
                <SimpleBarChart
                  data={msgVolume.map((d) => ({
                    label: d.day.slice(5),
                    value: d.incoming + d.outgoing,
                  }))}
                  color="#8b5cf6"
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No data</p>
              )}
              <div className="mt-2 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Incoming: {msgVolume.reduce((s, d) => s + d.incoming, 0)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-500" /> Outgoing: {msgVolume.reduce((s, d) => s + d.outgoing, 0)}
                </span>
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">By Content Type</h3>
              {msgByType.length > 0 ? (
                <div className="space-y-3">
                  {msgByType.map((d) => (
                    <ProgressBar
                      key={d.contentType}
                      label={d.contentType.charAt(0).toUpperCase() + d.contentType.slice(1).replace(/_/g, " ")}
                      value={d.count}
                      max={msgByType.reduce((s, x) => s + x.count, 0)}
                      color="#8b5cf6"
                    />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No data</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* =============== CONTACTS =============== */}
      {tab === "contacts" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Range</span>
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRangeChange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  range === r ? "bg-violet-500/10 text-violet-400" : "text-slate-400 hover:text-white"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          <Card className="border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-medium text-white">New Contacts</h3>
            {contactGrowth.length > 0 ? (
              <SimpleBarChart
                data={contactGrowth.map((d) => ({ label: d.day.slice(5), value: d.count }))}
                color="#3b82f6"
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No data</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Total new: {contactGrowth.reduce((s, d) => s + d.count, 0)}
            </p>
          </Card>
        </div>
      )}

      {/* =============== AGENTS =============== */}
      {tab === "agents" && (
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-medium text-white">Agent Workload</h3>
            {agentWorkload.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 pr-4 font-medium">Agent</th>
                      <th className="pb-2 pr-4 font-medium">Assigned</th>
                      <th className="pb-2 font-medium">Messages Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentWorkload.map((a) => (
                      <tr key={a.agentName} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-2 pr-4 text-slate-200">{a.agentName}</td>
                        <td className="py-2 pr-4 text-slate-400">{a.assignedConversations}</td>
                        <td className="py-2 text-slate-400">{a.messagesSent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No agent data</p>
            )}
          </Card>
        </div>
      )}

      {/* =============== BROADCASTS =============== */}
      {tab === "broadcasts" && (
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 text-sm font-medium text-white">Broadcast Performance</h3>
            {broadcasts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 pr-3 font-medium">Name</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium">Sent</th>
                      <th className="pb-2 pr-3 font-medium">Delivered</th>
                      <th className="pb-2 pr-3 font-medium">Read</th>
                      <th className="pb-2 pr-3 font-medium">Replied</th>
                      <th className="pb-2 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadcasts.map((b) => (
                      <tr key={b.id} className="border-b border-slate-800/50 last:border-0">
                        <td className="max-w-[160px] truncate py-2 pr-3 font-medium text-slate-200">
                          {b.name}
                        </td>
                        <td className="py-2 pr-3 text-slate-400">{b.status}</td>
                        <td className="py-2 pr-3 text-slate-400">{b.sentCount}</td>
                        <td className="py-2 pr-3 text-slate-400">{b.deliveredCount}</td>
                        <td className="py-2 pr-3 text-slate-400">{b.readCount}</td>
                        <td className="py-2 pr-3 text-slate-400">{b.repliedCount}</td>
                        <td className="py-2 text-red-400">{b.failedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No broadcast data</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
