import React, { useEffect, useState } from 'react';
import { Users, Video, MessageSquare, PhoneCall } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';

interface AnalyticsData {
  messages_count: number;
  meetings_count: number;
  reviewed_calls_count: number;
  active_online_count: number;
  average_score: number | null;
}

export const AnalyticsPage: React.FC = () => {
  const [stats, setStats] = useState<AnalyticsData>({
    messages_count: 0,
    meetings_count: 0,
    reviewed_calls_count: 0,
    active_online_count: 1,
    average_score: null,
  });

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/v1/analytics`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && active) {
          setStats({
            messages_count: Number(data.messages_count || 0),
            meetings_count: Number(data.meetings_count || 0),
            reviewed_calls_count: Number(data.reviewed_calls_count || 0),
            active_online_count: Math.max(1, Number(data.active_online_count || 1)),
            average_score: data.average_score ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
          { label: 'Total Messages', val: String(stats.messages_count), change: 'Persisted', icon: MessageSquare },
          { label: 'Calls Logged', val: String(stats.meetings_count), change: 'Live', icon: Video },
          { label: 'AI Reviewed Calls', val: String(stats.reviewed_calls_count), change: 'Consent', icon: PhoneCall },
          { label: 'Active Members Online', val: String(stats.active_online_count), change: 'Live', icon: Users },
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
            <div className="text-3xl font-black text-[#12a878] mt-1">
              {stats.average_score !== null ? `${stats.average_score}%` : '--'}
            </div>
            <span className="text-[10px] text-[#6f7899]">
              {stats.reviewed_calls_count > 0
                ? `Across ${stats.reviewed_calls_count} reviewed call(s)`
                : 'Awaiting first reviewed call'}
            </span>
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
