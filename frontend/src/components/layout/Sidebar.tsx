import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  MessageSquare, 
  Users, 
  Phone, 
  Sparkles, 
  FolderOpen,
  BarChart3,
  Settings, 
  User
} from 'lucide-react';

export type NavPage = 'messages' | 'meetings' | 'intelligence' | 'teams' | 'files' | 'analytics' | 'settings';

interface SidebarProps {
  currentPage: NavPage;
  onPageChange: (page: NavPage) => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, unreadCount = 0 }) => {
  const { user } = useAuth();

  const topDockItems = [
    { id: 'messages' as NavPage, label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'meetings' as NavPage, label: 'Calls', icon: Phone },
    { id: 'teams' as NavPage, label: 'Teams & Groups', icon: Users },
    { id: 'files' as NavPage, label: 'Files', icon: FolderOpen },
    { id: 'intelligence' as NavPage, label: 'Vertex AI', icon: Sparkles, isAi: true },
    { id: 'analytics' as NavPage, label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <aside className="hidden md:flex w-[68px] shrink-0 h-screen bg-white text-slate-500 flex-col items-center justify-between py-4 border-r border-slate-200/80 z-30 select-none shadow-xs">
      {/* Top Section: Vertex Brand Logo & Navigation Icons */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Sleek Vertex Blue Logo Mark */}
        <button 
          type="button"
          aria-label="Vertex Connect - Go to Chats"
          onClick={() => onPageChange('messages')}
          className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-md shadow-blue-500/25 cursor-pointer hover:scale-105 transition-transform mb-2 border-none"
          title="Vertex Connect"
        >
          V
        </button>

        {topDockItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <div key={item.id} className="relative group flex items-center justify-center w-full">
              <button
                type="button"
                aria-label={item.label}
                onClick={() => onPageChange(item.id)}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-bold'
                    : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                }`}
                title={item.label}
              >
                {item.isAi ? (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isActive ? 'text-white' : 'text-blue-600'}`}>
                    <Sparkles className="w-4.5 h-4.5" />
                  </div>
                ) : (
                  <Icon className="w-5 h-5" />
                )}

                {/* Unread Pill Badge */}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm">
                    {item.badge}
                  </span>
                ) : null}
              </button>

              {/* Tooltip on right */}
              <div className="absolute left-16 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section: Settings & User Profile Avatar */}
      <div className="flex flex-col items-center gap-3 w-full pb-1">
        {/* Settings button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            type="button"
            aria-label="Settings"
            onClick={() => onPageChange('settings')}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
              currentPage === 'settings'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-bold'
                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600'
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="absolute left-16 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Settings
          </div>
        </div>

        {/* Profile Avatar */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            type="button"
            aria-label={`Profile: ${user?.name || 'User'} (@${user?.connect_id || ''})`}
            onClick={() => onPageChange('settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-slate-100 hover:ring-blue-500 transition-all cursor-pointer shadow-sm"
            title={user?.name || 'Profile'}
          >
            {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-4.5 h-4.5 text-white" />}
          </button>
          <div className="absolute left-16 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            {user?.name || 'Profile'} (@{user?.connect_id})
          </div>
        </div>
      </div>
    </aside>
  );
};

export const MobileBottomNav: React.FC<SidebarProps> = ({ currentPage, onPageChange, unreadCount = 0 }) => {
  const mobileNavItems = [
    { id: 'messages' as NavPage, label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'meetings' as NavPage, label: 'Calls', icon: Phone },
    { id: 'teams' as NavPage, label: 'Teams', icon: Users },
    { id: 'intelligence' as NavPage, label: 'AI', icon: Sparkles },
    { id: 'settings' as NavPage, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex items-center justify-around px-2 py-1.5 shadow-xl" aria-label="Mobile Navigation">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            onClick={() => onPageChange(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative cursor-pointer ${
              isActive
                ? 'text-blue-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1.5 rounded-xl ${isActive ? 'bg-blue-50' : ''}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight">{item.label}</span>
            {item.badge ? (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};
