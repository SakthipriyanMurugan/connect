import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppearance } from '../../context/AppearanceContext';
import { Search, Sliders, Bell, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onShowNotificationToast: (msg: string) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  onShowNotificationToast,
}) => {
  const { user, logout } = useAuth();
  const { setIsCustomizerOpen } = useAppearance();
  const [profileOpen, setProfileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getInitials = (name?: string) => {
    if (!name) return 'VC';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search... (Ctrl + K)"
          className="w-full pl-9 md:pl-11 pr-8 md:pr-14 py-2 md:py-2.5 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-white/5 text-xs text-[#182044] dark:text-[#eef1ff] placeholder-[#71809a] dark:placeholder-[#8898b3] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 shadow-inner transition-all"
        />
        <span className="hidden md:inline-block absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#8b98b0] bg-[#eef2fc] dark:bg-white/10 px-1.5 py-0.5 rounded border border-black/5 dark:border-white/10">
          ⌘K
        </span>
      </div>

      {/* Top Actions */}
      <div className="flex items-center gap-1.5 md:gap-3 ml-auto shrink-0">
        {/* Appearance Customizer Trigger */}
        <button
          type="button"
          onClick={() => setIsCustomizerOpen(true)}
          title="Customize appearance"
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 border border-[#d7ddf7] dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] hover:text-[var(--accent)] hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={() => onShowNotificationToast("You're all caught up! No unread system alerts.")}
          title="Notifications"
          className="w-10 h-10 rounded-xl relative flex items-center justify-center bg-white/80 dark:bg-white/10 border border-[#d7ddf7] dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] hover:text-[var(--accent)] hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#f04454] border-2 border-white dark:border-[#111735]" />
        </button>

        {/* User Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-all cursor-pointer text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#a6f5ff] via-[#aab5ff] to-[#edbaff] flex items-center justify-center font-bold text-xs text-[#26305f] shadow-md border-2 border-white dark:border-white/20">
              {getInitials(user?.name)}
            </div>
            <div className="hidden sm:block">
              <b className="text-xs font-bold text-[#182044] dark:text-[#eef1ff] block leading-tight">
                {user?.name || 'Sakthi'}
              </b>
              <small className="text-[10px] text-[#6f7899] dark:text-[#9fa9ce] block capitalize">
                {user?.role?.replace('_', ' ') || 'Supervisor'}
              </small>
            </div>
          </button>

          {/* Profile Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl glass-panel p-2 shadow-xl z-30 border border-white/40 dark:border-white/10">
              <div className="px-3 py-2 border-b border-black/5 dark:border-white/10">
                <div className="text-xs font-bold text-[#182044] dark:text-[#eef1ff]">{user?.name}</div>
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
