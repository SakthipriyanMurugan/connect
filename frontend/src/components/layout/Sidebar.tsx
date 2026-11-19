import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  MessageSquare, 
  Users, 
  Video, 
  Sparkles, 
  FolderGit2, 
  BarChart3, 
  Settings, 
  ChevronDown, 
  ShieldCheck 
} from 'lucide-react';

export type NavPage = 'messages' | 'meetings' | 'intelligence' | 'teams' | 'files' | 'analytics' | 'settings';

interface SidebarProps {
  currentPage: NavPage;
  onPageChange: (page: NavPage) => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, unreadCount = 0 }) => {
  const { workspace } = useAuth();

  const navItems = [
    { id: 'messages' as NavPage, label: 'Messages', icon: MessageSquare, badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'meetings' as NavPage, label: 'Meetings', icon: Video },
    { id: 'intelligence' as NavPage, label: 'Call Intelligence', icon: Sparkles, tag: 'AI' },
    { id: 'teams' as NavPage, label: 'Teams', icon: Users },
    { id: 'files' as NavPage, label: 'Files', icon: FolderGit2 },
    { id: 'analytics' as NavPage, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as NavPage, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[250px] shrink-0 min-h-screen bg-gradient-to-b from-[#111638]/95 via-[#1a2455]/90 to-[#25245c]/90 text-[#dbe8ff] p-5 flex flex-col gap-5 border-r border-white/20 shadow-2xl backdrop-blur-2xl z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pt-1 pb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#8ff5ff] via-[#8298ff] to-[#d6a0ff] flex items-center justify-center text-[#171d4c] text-2xl font-black shadow-lg shadow-[#8b9bff]/40">
          V
        </div>
        <div>
          <span className="font-extrabold tracking-widest text-sm text-white block leading-tight">VERTEX</span>
          <span className="font-extrabold tracking-widest text-sm text-[#8ff5ff] block leading-tight">CONNECT</span>
        </div>
      </div>

      {/* Workspace Switcher */}
      <button 
        type="button"
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-semibold backdrop-blur-md transition-all text-left"
      >
        <span className="truncate">{workspace?.name || 'Workspace'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[#8ff5ff] shrink-0" />
      </button>

      {/* Navigation */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-[#879aff]/40 to-[#c9a8ff]/20 text-white border border-[#c5d2ff]/40 shadow-lg translate-x-1'
                  : 'text-[#c8d6eb] hover:bg-white/10 hover:text-white border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#8ff5ff]' : 'text-[#a3b3cc] group-hover:text-white'}`} />
              <span className="nav-btn-text flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span className="nav-btn-text bg-[#f04454] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {item.badge}
                </span>
              ) : null}
              {item.tag ? (
                <span className="nav-btn-text bg-gradient-to-r from-[#8ff5ff] to-[#a9a0ff] text-[#111638] text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm">
                  {item.tag}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Bottom Status Card */}
      <div className="mt-auto pt-3 border-t border-white/10 flex flex-col gap-3">
        <div className="rounded-2xl p-3.5 bg-gradient-to-br from-white/10 to-[#b7c4ff]/10 border border-white/20 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-1 text-xs font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-[#8ff5ff]" />
            <span>Secure Communication</span>
          </div>
          <p className="text-[#aebfda] text-[11px] leading-relaxed m-0">
            Encrypted WebRTC & Live AI Intelligence.
          </p>
        </div>

        <div className="text-[10px] text-[#93a8c8] px-1 leading-normal">
          JM Vertex Technologies · v1.0
        </div>
      </div>
    </aside>
  );
};
