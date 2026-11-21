import React from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  ListTodo, 
  PieChart, 
  Download, 
  X, 
  ShieldCheck, 
  Clock, 
  Users,
  Award
} from 'lucide-react';
import type { MeetingIntelligenceReport } from '../../types';

interface MeetingIntelligenceModalProps {
  report: MeetingIntelligenceReport;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const MeetingIntelligenceModal: React.FC<MeetingIntelligenceModalProps> = ({
  report,
  onClose,
  onShowToast,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const handleDownload = () => {
    const mdContent = `
# VERTEX CONNECT — AI Call Intelligence Report
**Meeting Title:** ${report.title}
**Room:** ${report.room_name}
**Date:** ${new Date(report.created_at).toLocaleString()}
**Duration:** ${formatTime(report.duration_seconds)}
**Sentiment Score:** ${report.sentiment_score}% (${report.sentiment_label})

---

### Executive Summary
${report.executive_summary}

---

### Key Decisions Made
${report.key_decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

---

### Action Items & Deliverables
${report.action_items.map((a, i) => `- [ ] **[${a.priority.toUpperCase()}]** ${a.task} (Assignee: @${a.assignee})`).join('\n')}

---

### Talk-Time Distribution
${report.talk_time_breakdown.map((t) => `- **${t.name}**: ${t.percentage}%`).join('\n')}

*Generated automatically by Vertex AI Call Intelligence Engine.*
`.trim();

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vertex_Intelligence_${report.room_name}.md`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Intelligence report downloaded successfully!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] rounded-3xl bg-[#0e1333]/95 border border-white/20 text-white shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#718bff] to-[#d6a2ff] flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                AI Call Scorecard & Meeting Intelligence
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#12a878]/20 text-[#8df0d4] font-semibold border border-[#12a878]/40 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Auto-Generated
                </span>
              </h3>
              <p className="text-[11px] text-[#aeb8dc] m-0">
                {report.title} • {formatTime(report.duration_seconds)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/10 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-[#cbd4ff]">
          {/* Top Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Sentiment Score */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#8898b3] block">Sentiment Score</span>
                <b className="text-xl font-black text-white">{report.sentiment_score}%</b>
                <span className="text-[10px] text-[#8df0d4] block font-semibold">{report.sentiment_label}</span>
              </div>
              <div className="w-12 h-12 rounded-full border-4 border-[#12a878] flex items-center justify-center font-bold text-white text-xs bg-[#12a878]/10">
                <Award className="w-5 h-5 text-[#8df0d4]" />
              </div>
            </div>

            {/* Duration */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#8898b3] block">Call Duration</span>
                <b className="text-xl font-black text-white">{formatTime(report.duration_seconds)}</b>
                <span className="text-[10px] text-[#aeb8dc] block">HD WebRTC Track</span>
              </div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-[var(--accent)]" />
              </div>
            </div>

            {/* Talk-Time Share */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] uppercase font-bold text-[#8898b3] block mb-1">Talk-Time Ratio</span>
              <div className="space-y-1.5 pt-1">
                {report.talk_time_breakdown.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <span className="truncate max-w-[120px] font-medium text-white">{t.name}</span>
                    <span className="font-bold text-[var(--accent)]">{t.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <h4 className="text-xs uppercase font-bold text-white flex items-center gap-1.5 tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              Executive AI Summary
            </h4>
            <p className="leading-relaxed text-[#c6ceef] m-0 text-xs">
              {report.executive_summary}
            </p>
          </div>

          {/* Key Decisions */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <h4 className="text-xs uppercase font-bold text-white flex items-center gap-1.5 tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#12a878]" />
              Key Decisions & Agreements
            </h4>
            <ul className="space-y-1.5 pl-0 list-none m-0">
              {report.key_decisions.map((decision, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#c6ceef]">
                  <span className="w-4 h-4 rounded-full bg-[#12a878]/20 text-[#8df0d4] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Items Checklist */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
            <h4 className="text-xs uppercase font-bold text-white flex items-center gap-1.5 tracking-wider">
              <ListTodo className="w-3.5 h-3.5 text-[#e5a83b]" />
              Action Items & Assigned Deliverables
            </h4>
            <div className="space-y-2">
              {report.action_items.map((item, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      defaultChecked={false}
                      className="rounded accent-[var(--accent)] cursor-pointer"
                    />
                    <span className="text-xs font-medium text-white">{item.task}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        item.priority === 'high'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : item.priority === 'medium'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {item.priority}
                    </span>
                    <span className="text-[10px] text-[#aeb8dc] font-semibold">
                      @{item.assignee}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-[11px] text-[#8898b3]">
            Saved automatically to Vertex Meeting Intelligence store.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 shadow-md cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
