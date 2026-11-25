import React, { useState, useEffect } from 'react';
import { Users, Plus, Shield, UsersRound, Video, UserPlus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

interface TeamsPageProps {
  onStartCall?: (title: string, roomName?: string) => void;
  onShowToast: (msg: string) => void;
}

interface TeamMember {
  user_id: string;
  name: string;
  connect_id: string;
  role: string;
}

interface TeamItem {
  id: string;
  name: string;
  members: number;
  desc: string;
  activeCalls: number;
  owner_id?: string;
  member_list?: TeamMember[];
}

export const TeamsPage: React.FC<TeamsPageProps> = ({ onStartCall, onShowToast }) => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [managingTeam, setManagingTeam] = useState<TeamItem | null>(null);
  const [inviteConnectId, setInviteConnectId] = useState('');
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false);

  const loadTeams = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/teams?user_id=${encodeURIComponent(user?.id || '')}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTeams(data);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch teams', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, [user?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    const name = teamName.trim();
    const desc = teamDesc.trim() || 'Team workspace';
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: desc,
          owner_id: user?.id || '',
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setTeams((prev) => [created, ...prev]);
        setShowModal(false);
        setTeamName('');
        setTeamDesc('');
        onShowToast(`Team "${name}" created successfully!`);
        return;
      }
    } catch {}

    setTeams((prev) => [
      {
        id: 't-' + Date.now(),
        name,
        members: 1,
        desc,
        activeCalls: 0,
        owner_id: user?.id,
        member_list: user ? [{ user_id: user.id, name: user.name, connect_id: user.connect_id, role: 'owner' }] : [],
      },
      ...prev,
    ]);
    setShowModal(false);
    setTeamName('');
    setTeamDesc('');
    onShowToast(`Team "${name}" created!`);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingTeam || !inviteConnectId.trim()) return;
    setIsUpdatingMembers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/teams/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: managingTeam.id,
          connect_id: inviteConnectId.trim().replace(/^@/, ''),
          action: 'add',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onShowToast(data.detail || 'Could not add member');
      } else {
        const updatedTeam: TeamItem = {
          ...managingTeam,
          member_list: data.member_list || managingTeam.member_list,
          members: data.members ?? (data.member_list?.length || managingTeam.members),
        };
        setManagingTeam(updatedTeam);
        setTeams((prev) => prev.map((t) => (t.id === updatedTeam.id ? updatedTeam : t)));
        setInviteConnectId('');
        onShowToast('Member added to team!');
      }
    } catch {
      onShowToast('Failed to update team membership');
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!managingTeam) return;
    setIsUpdatingMembers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/teams/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: managingTeam.id,
          user_id: memberId,
          action: 'remove',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const updatedTeam: TeamItem = {
          ...managingTeam,
          member_list: data.member_list || [],
          members: data.members ?? 1,
        };
        setManagingTeam(updatedTeam);
        setTeams((prev) => prev.map((t) => (t.id === updatedTeam.id ? updatedTeam : t)));
        onShowToast('Member removed from team');
      }
    } catch {
      onShowToast('Failed to remove member');
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff] tracking-tight">
            Teams & Departments
          </h1>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
            Organize users into isolated workspaces with role-based communication permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Team</span>
        </button>
      </div>

      {isLoading ? (
        <div className="glass-panel p-12 text-center text-xs text-[#6f7899] dark:text-[#aeb8dc]">
          Loading teams...
        </div>
      ) : teams.length === 0 ? (
        <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-[#718bff]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <UsersRound className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
            No teams created yet
          </h3>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] max-w-sm mb-5">
            Create departments or project groups to isolate channels, permissions, and calls.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] shadow-md"
          >
            Create First Team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((t) => (
            <div key={t.id} className="glass-panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#eaf3ff] dark:bg-[#2876ed]/20 text-[#2876ed] dark:text-[#8ff5ff] flex items-center justify-center font-bold text-xs">
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff]">{t.name}</h3>
                      <span className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc] flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {t.members} members
                      </span>
                    </div>
                  </div>
                  {t.activeCalls > 0 && (
                    <span className="text-[10px] font-bold text-[#12a878] bg-[#e7f8f1] dark:bg-[#12a878]/20 px-2 py-0.5 rounded-full">
                      {t.activeCalls} Active Call
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] my-3">{t.desc}</p>
              </div>

              <div className="pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-xs gap-2">
                <span className="text-[#138b77] flex items-center gap-1 font-semibold text-[11px]">
                  <Shield className="w-3.5 h-3.5" />
                  Tenant Isolated
                </span>
                <div className="flex items-center gap-3">
                  {onStartCall && (
                    <button
                      type="button"
                      onClick={() => onStartCall(`${t.name} Room`, `team-${t.id}`)}
                      className="text-[#12a878] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Start Call</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setManagingTeam(t)}
                    className="text-[var(--accent)] font-bold hover:underline cursor-pointer"
                  >
                    Manage Members →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {managingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071a36]/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 shadow-2xl bg-white/95 dark:bg-[#151c3b]/95 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#182044] dark:text-[#f1f3ff]">
                  Manage {managingTeam.name}
                </h2>
                <p className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc]">
                  Add or remove members by Connect ID
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingTeam(null)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[#6f7899] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="flex items-center gap-2">
              <input
                type="text"
                value={inviteConnectId}
                onChange={(e) => setInviteConnectId(e.target.value)}
                placeholder="Enter @connect_id..."
                className="flex-1 px-3 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={isUpdatingMembers}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-1 disabled:opacity-60 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto divide-y divide-black/5 dark:divide-white/10">
              {(managingTeam.member_list || []).length === 0 ? (
                <div className="py-4 text-center text-xs text-[#6f7899]">
                  Only owner currently in this team.
                </div>
              ) : (
                (managingTeam.member_list || []).map((m) => (
                  <div key={m.user_id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#182044] dark:text-[#eef1ff] truncate">{m.name}</div>
                      <div className="text-[10px] text-[#6f7899]">
                        @{m.connect_id || 'member'} · {m.role}
                      </div>
                    </div>
                    {m.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={isUpdatingMembers}
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071a36]/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 shadow-2xl bg-white/95 dark:bg-[#151c3b]/95">
            <h2 className="text-lg font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">Create Team</h2>
            <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mb-4">
              Enter details for the new department or project group.
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Engineering"
                  autoFocus
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">Description</label>
                <input
                  type="text"
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  placeholder="Purpose of this group..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#46517f] dark:text-[#cbd4ff] bg-black/5 dark:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7]"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
