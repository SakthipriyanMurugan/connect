import React from 'react';
import { Users, Video, MessageSquare, PhoneCall } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff] tracking-tight">
          Workspace Analytics & Health
        </h1>
        <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
          Live operational metrics, active concurrency, call quality trends, and AI evaluation rates.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Messages this session', val: '0', change: 'Live', icon: MessageSquare },
          { label: 'Meetings completed', val: '0', change: 'Live', icon: Video },
          { label: 'Calls reviewed with consent', val: '0', change: 'Live', icon: PhoneCall },
          { label: 'Active members online', val: '1', change: 'You', icon: Users },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="glass-panel p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#6f7899] dark:text-[#aeb8dc]">{item.label}</span>
                <Icon className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff]">{item.val}</div>
              <span className="text-[10px] font-bold text-[#138b77] bg-[#dffaf2] dark:bg-[#138b77]/20 px-2 py-0.5 rounded-full inline-block mt-2">
                {item.change}
              </span>
            </div>
          );
        })}
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] mb-2">
          Call Quality Score Distribution
        </h3>
        <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mb-4">
          Scores aggregated across opted-in customer calls for quality improvement and coaching.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10">
            <span className="text-xs font-semibold text-[#6f7899] dark:text-[#aeb8dc]">Average Team Score</span>
            <div className="text-3xl font-black text-[#12a878] mt-1">--</div>
            <span className="text-[10px] text-[#6f7899]">Awaiting first reviewed call</span>
          </div>
          <div className="p-4 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10">
            <span className="text-xs font-semibold text-[#6f7899] dark:text-[#aeb8dc]">Speech Recognition Pipeline</span>
            <div className="text-3xl font-black text-[var(--accent)] mt-1">Ready</div>
            <span className="text-[10px] text-[#6f7899]">Tamil & English Code-switching STT</span>
          </div>
          <div className="p-4 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10">
            <span className="text-xs font-semibold text-[#6f7899] dark:text-[#aeb8dc]">Supervisor QA Review Enforcement</span>
            <div className="text-3xl font-black text-[#7a7cff] mt-1">100%</div>
            <span className="text-[10px] text-[#6f7899]">Mandatory human approval before scoring</span>
          </div>
        </div>
      </div>
    </div>
  );
};
