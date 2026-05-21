"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Copy, ExternalLink, Loader2, Trash2, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import type { WabaGroup, GroupMember } from "@/types";

interface GroupWithCount extends WabaGroup {
  member_count: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/groups");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch groups");
      setGroups(data.groups ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const toggleExpand = async (groupId: string, wabaGroupId: string) => {
    if (expandedId === groupId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(groupId);

    if (!members[groupId]) {
      setMembersLoading((prev) => ({ ...prev, [groupId]: true }));
      const supabase = createClient();
      const { data } = await supabase
        .from("group_members")
        .select("*, contact:contacts(*)")
        .eq("waba_group_id", wabaGroupId);
      setMembers((prev) => ({ ...prev, [groupId]: data ?? [] }));
      setMembersLoading((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  const handleRemoveMember = async (wabaGroupId: string, memberPhone: string) => {
    try {
      const res = await fetch(`/api/whatsapp/groups/${encodeURIComponent(wabaGroupId)}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: memberPhone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      toast.success("Member removed");
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleDeleteGroup = async (wabaGroupId: string) => {
    if (!confirm("Delete this group from WhatsApp? This cannot be undone.")) return;
    setDeleting(wabaGroupId);
    try {
      const res = await fetch(`/api/whatsapp/groups/${encodeURIComponent(wabaGroupId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete group");
      }
      toast.success("Group deleted");
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete group");
    } finally {
      setDeleting(null);
    }
  };

  const copyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Groups</h1>
          <p className="mt-1 text-sm text-slate-400">
            Create and manage WhatsApp groups
          </p>
        </div>
        <CreateGroupDialog onCreated={fetchGroups} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-slate-300">No groups yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create your first WhatsApp group to get started
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="border-slate-800 bg-slate-900"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(group.id, group.waba_group_id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(group.id, group.waba_group_id); }}
                className="flex w-full cursor-pointer items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/10">
                    <Users className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{group.subject}</h3>
                    <p className="text-xs text-slate-400">
                      {group.member_count} member{group.member_count !== 1 ? "s" : ""}
                      {group.description && ` · ${group.description}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {group.invite_link && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyInviteLink(group.invite_link!)}
                      title="Copy invite link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  {group.invite_link && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(group.invite_link, "_blank")}
                      title="Open invite link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteGroup(group.waba_group_id)}
                    disabled={deleting === group.waba_group_id}
                    className="text-red-400 hover:text-red-300"
                    title="Delete group"
                  >
                    {deleting === group.waba_group_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded members list */}
              {expandedId === group.id && (
                <div className="border-t border-slate-800 px-4 py-3">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Members
                  </h4>
                  {membersLoading[group.id] ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {members[group.id]?.length === 0 && (
                        <p className="text-sm text-slate-500">No members synced yet</p>
                      )}
                      {members[group.id]?.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-md bg-slate-800/50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                              {(member.name || member.phone).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm text-slate-200">
                                {member.name || "Unknown"}
                              </p>
                              <p className="text-xs text-slate-500">{member.phone}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(group.waba_group_id, member.phone)}
                            className="text-slate-400 hover:text-red-400"
                            title="Remove member"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
