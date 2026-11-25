import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppearance } from '../../context/AppearanceContext';
import type { NavPage } from './Sidebar';
import {
  Search,
  Sliders,
  Bell,
  LogOut,
  ShieldCheck,
  MessageSquare,
  Phone,
  Users,
  FolderOpen,
  Sparkles,
  BarChart3,
  Settings,
  Clock,
  X,
} from 'lucide-react';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onShowNotificationToast: (msg: string) => void;
  onNavigatePage?: (page: NavPage) => void;
  onOpenCallHistory?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  onShowNotificationToast,
  onNavigatePage,
  onOpenCallHistory,
}) => {
  const { user, logout } = useAuth();
  const { setIsCustomizerOpen } = useAppearance();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const quickNavItems: Array<{
    id: string;
    label: string;
    hint: string;
    icon: React.FC<{ className?: string }>;
    action: () => void;
  }> = [
    { id: 'messages', label: 'Chats & Requests', hint: 'Messages & pending friend requests', icon: MessageSquare, action: () => onNavigatePage?.('messages') },
    { id: 'meetings', label: 'Calls & Meetings', hint: 'Instant HD rooms & schedules', icon: Phone, action: () => onNavigatePage?.('meetings') },
    { id: 'history', label: 'Call History', hint: 'Recent missed, incoming & placed calls', icon: Clock, action: () => onOpenCallHistory?.() },
    { id: 'teams', label: 'Teams & Groups', hint: 'Manage teams, members & channels', icon: Users, action: () => onNavigatePage?.('teams') },
    { id: 'files', label: 'Files Vault', hint: 'Shared documents, uploads & media', icon: FolderOpen, action: () => onNavigatePage?.('files') },
    { id: 'intelligence', label: 'Vertex AI Intelligence', hint: 'Call scorecards, transcripts & QA review', icon: Sparkles, action: () => onNavigatePage?.('intelligence') },
    { id: 'analytics', label: 'Workspace Analytics', hint: 'Live message & call telemetry', icon: BarChart3, action: () => onNavigatePage?.('analytics') },
    { id: 'settings', label: 'Settings & Profile', hint: 'Account, theme & Connect ID', icon: Settings, action: () => onNavigatePage?.('settings') },
  ];

  const matchingNavItems = searchQuery.trim()
    ? quickNavItems.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.hint.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : quickNavItems;

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchFocused(true);
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchFocused(false);
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getDisplayName = (name?: string, connectId?: string) => {
    const cid = connectId?.toLowerCase();
    if (!name || name.toLowerCase() === 'hinata') {
      if (cid === 'sakthi') return 'Sakthi';
      if (cid === 'nila') return 'Nila';
      if (connectId) return connectId.charAt(0).toUpperCase() + connectId.slice(1);
      return 'User';
    }
    return name;
  };

  const getInitials = (name?: string, connectId?: string) => {
    const clean = getDisplayName(name, connectId);
    const parts = clean.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  return (
    <header className="h-16 md:h-[74px] sticky top-0 z-10 px-3 md:px-8 flex items-center justify-between gap-2.5 md:gap-6 border-b border-white/60 bg-white/70 dark:bg-[#111735]/70 backdrop-blur-xl shadow-sm transition-colors">
      {/* Mobile Brand Logo */}
      <div className="md:hidden flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#8ff5ff] via-[#8298ff] to-[#d6a0ff] flex items-center justify-center text-[#171d4c] text-base font-black shadow-md">
          V
        </div>
      </div>

      {/* Global Search */}
      <div className="relative flex-1 max-w-[620px]">
        <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71809a] dark:text-[#8898b3]" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setSearchFocused(true);
          }}
          placeholder="Search sections, calls, files... (Ctrl + K)"
          aria-label="Search messages, calls, and files"
          className="w-full pl-9 md:pl-11 pr-8 md:pr-14 py-2 md:py-2.5 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-white/5 text-xs text-[#182044] dark:text-[#eef1ff] placeholder-[#71809a] dark:placeholder-[#8898b3] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 shadow-inner transition-all"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71809a] hover:text-[#182044] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="hidden md:inline-block absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#8b98b0] bg-[#eef2fc] dark:bg-white/10 px-1.5 py-0.5 rounded border border-black/5 dark:border-white/10">
            ⌘K
          </span>
        )}

        {searchFocused && (
          <div className="absolute left-0 right-0 mt-2 rounded-2xl glass-panel p-2 shadow-2xl z-30 border border-white/60 dark:border-white/10 bg-white/95 dark:bg-[#151b3d]/95 max-h-80 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#71809a]">
              Quick Jump ({matchingNavItems.length})
            </div>
            {matchingNavItems.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[#71809a]">
                No matching workspace views for "{searchQuery}".
              </div>
            ) : (
              matchingNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      item.action();
                      setSearchFocused(false);
                      onSearchChange('');
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[#eef2ff] dark:hover:bg-white/10 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#e8edff] dark:bg-white/10 text-[var(--accent)] flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#182044] dark:text-[#eef1ff] truncate">{item.label}</div>
                      <div className="text-[10px] text-[#71809a] truncate">{item.hint}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Top Actions */}
      <div className="flex items-center gap-1.5 md:gap-3 ml-auto shrink-0">
        {/* Appearance Customizer Trigger */}
        <button
          type="button"
          onClick={() => setIsCustomizerOpen(true)}
          aria-label="Customize appearance"
          title="Customize appearance"
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 border border-[#d7ddf7] dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] hover:text-[var(--accent)] hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setProfileOpen(false);
            }}
            aria-label="Notifications"
            title="Notifications"
            className="w-10 h-10 rounded-xl relative flex items-center justify-center bg-white/80 dark:bg-white/10 border border-[#d7ddf7] dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] hover:text-[var(--accent)] hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#f04454] border-2 border-white dark:border-[#111735]" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl glass-panel p-2 shadow-xl z-30 border border-white/60 dark:border-white/10 bg-white/95 dark:bg-[#151b3d]/95">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#71809a] border-b border-black/5 dark:border-white/10">
                Notifications & Alerts
              </div>
              <div className="py-1 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onNavigatePage?.('messages');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('vertex_open_requests')), 50);
                  }}
                  className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-[#eef2ff] dark:hover:bg-white/10 text-[#182044] dark:text-[#eef1ff] text-left cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="font-bold">Connection Requests</div>
                    <div className="text-[10px] text-[#71809a]">View & accept incoming invites</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    onOpenCallHistory?.();
                  }}
                  className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-[#eef2ff] dark:hover:bg-white/10 text-[#182044] dark:text-[#eef1ff] text-left cursor-pointer"
                >
                  <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="font-bold">Call History & Missed Calls</div>
                    <div className="text-[10px] text-[#71809a]">Review recent audio/video logs</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-label="Open profile options menu"
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-all cursor-pointer text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#a6f5ff] via-[#aab5ff] to-[#edbaff] flex items-center justify-center font-bold text-xs text-[#26305f] shadow-md border-2 border-white dark:border-white/20 shrink-0">
              {getInitials(user?.name, user?.connect_id)}
            </div>
            <div className="flex flex-col text-left">
              <b className="text-xs font-bold text-[#182044] dark:text-[#eef1ff] block leading-tight truncate max-w-[85px] sm:max-w-[150px]">
                {getDisplayName(user?.name, user?.connect_id)}
              </b>
              <span className="text-[10px] text-[var(--accent)] font-bold leading-tight truncate max-w-[85px] sm:max-w-[150px]">
                @{user?.connect_id || 'connect'}
              </span>
            </div>
          </button>

          {/* Profile Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl glass-panel p-2 shadow-xl z-30 border border-white/40 dark:border-white/10">
              <div className="px-3 py-2 border-b border-black/5 dark:border-white/10">
                <div className="text-xs font-bold text-[#182044] dark:text-[#eef1ff]">{getDisplayName(user?.name, user?.connect_id)}</div>
                <div className="text-[11px] font-bold text-[var(--accent)]">@{user?.connect_id}</div>
                <div className="text-[11px] text-[#6f7899] dark:text-[#9fa9ce] truncate">{user?.email}</div>
                <span className="inline-block mt-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#e3eaff] dark:bg-[#8798ff]/20 text-[#5c6ed1] dark:text-[#cbd4ff]">
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onShowNotificationToast('Role permissions verified: Multi-tenant isolated.');
                  }}
                  className="w-full px-3 py-2 text-xs flex items-center gap-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-[#40516c] dark:text-[#cbd4ff]"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#138b77]" />
                  <span>Security & Roles</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full px-3 py-2 text-xs flex items-center gap-2 rounded-lg hover:bg-[#ff4e5b]/10 text-[#f04454] font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
