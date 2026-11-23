import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  MessageSquare, 
  Users, 
  Phone, 
  Sparkles, 
  FolderGit2, 
  Settings, 
  CircleDot,
  Radio,
  Archive,
  User
} from 'lucide-react';

export type NavPage = 'messages' | 'meetings' | 'intelligence' | 'teams' | 'files' | 'analytics' | 'settings';

interface SidebarProps {
  currentPage: NavPage;
  onPageChange: (page: NavPage) => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, unreadCount = 3 }) => {
  const { user } = useAuth();

  const topDockItems = [
    { id: 'messages' as NavPage, label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'meetings' as NavPage, label: 'Calls', icon: Phone },
    { id: 'teams' as NavPage, label: 'Communities', icon: Users },
    { id: 'intelligence' as NavPage, label: 'Meta AI', icon: Sparkles, isAi: true },
  ];

  return (
    <aside className="hidden md:flex w-[64px] shrink-0 h-screen bg-[#202c33] text-[#aebac1] flex-col items-center justify-between py-3 border-r border-[#222d34] z-30 select-none">
      {/* Top Section: WhatsApp Dock Navigation Icons */}
      <div className="flex flex-col items-center gap-2 w-full">
        {topDockItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <div key={item.id} className="relative group flex items-center justify-center w-full">
              <button
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-[#374248] text-[#00a884]'
                    : 'text-[#aebac1] hover:bg-[#2a3942] hover:text-[#d1d7db]'
                }`}
                title={item.label}
              >
                {item.isAi ? (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#a855f7] via-[#ec4899] to-[#3b82f6] flex items-center justify-center text-white">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <Icon className="w-5 h-5" />
                )}

                {/* WhatsApp Style Unread Badge */}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-[#25d366] text-[#111b21] font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-md">
                    {item.badge}
                  </span>
                ) : null}
              </button>

              {/* Tooltip on right */}
              <div className="absolute left-16 px-2.5 py-1 bg-[#111b21] text-white text-[11px] font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/10">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section: Archived, Settings, User Avatar */}
      <div className="flex flex-col items-center gap-2.5 w-full pb-2">
        {/* Settings button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            type="button"
            onClick={() => onPageChange('settings')}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
              currentPage === 'settings'
                ? 'bg-[#374248] text-[#00a884]'
                : 'text-[#aebac1] hover:bg-[#2a3942] hover:text-[#d1d7db]'
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="absolute left-16 px-2.5 py-1 bg-[#111b21] text-white text-[11px] font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/10">
            Settings
          </div>
        </div>

        {/* Profile Avatar */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            type="button"
            onClick={() => onPageChange('settings')}
            className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#128c7e] via-[#25d366] to-[#00a884] flex items-center justify-center text-[#111b21] font-bold text-xs ring-2 ring-transparent hover:ring-[#25d366] transition-all cursor-pointer shadow-md"
            title={user?.name || 'Profile'}
          >
            {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4 text-[#111b21]" />}
          </button>
          <div className="absolute left-16 px-2.5 py-1 bg-[#111b21] text-white text-[11px] font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/10">
            {user?.name || 'Profile'} (@{user?.connect_id})
          </div>
        </div>
      </div>
    </aside>
  );
};

export const MobileBottomNav: React.FC<SidebarProps> = ({ currentPage, onPageChange, unreadCount = 3 }) => {
  const mobileNavItems = [
    { id: 'messages' as NavPage, label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'meetings' as NavPage, label: 'Calls', icon: Phone },
    { id: 'teams' as NavPage, label: 'Communities', icon: Users },
    { id: 'intelligence' as NavPage, label: 'Meta AI', icon: Sparkles },
    { id: 'settings' as NavPage, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#202c33] border-t border-[#222d34] flex items-center justify-around px-2 py-1.5 shadow-2xl">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPageChange(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative cursor-pointer ${
              isActive
                ? 'text-[#00a884] scale-105'
                : 'text-[#8696a0] hover:text-[#d1d7db]'
            }`}
          >
            <div className={`p-1 rounded-xl ${isActive ? 'bg-[#374248]' : ''}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
            {item.badge ? (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-[#25d366] text-[#111b21] text-[9px] font-bold flex items-center justify-center shadow-sm">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};
