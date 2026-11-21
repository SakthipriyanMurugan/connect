import React, { useState } from 'react';
import { 
  Video, 
  Plus, 
  Clock, 
  Users, 
  Play, 
  Copy, 
  Check, 
  ShieldCheck,
  Sparkles,
  CalendarDays
} from 'lucide-react';

interface MeetingsPageProps {
  onStartCall: (title: string, roomName?: string) => void;
  onShowToast: (msg: string) => void;
}

interface MeetingItem {
  id: string;
  title: string;
  time: string;
  host: string;
  participants: number;
  link: string;
  isLive: boolean;
  aiNotesEnabled: boolean;
}

export const MeetingsPage: React.FC<MeetingsPageProps> = ({ onStartCall, onShowToast }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');

  // Clean initial state (empty until user schedules)
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);

  const handleCopyLink = (id: string, link: string) => {
    navigator.clipboard?.writeText(link);
    setCopiedId(id);
    onShowToast('Meeting link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast('Please enter a meeting title.');
      return;
    }

    const newMeeting: MeetingItem = {
      id: 'm-' + Date.now(),
      title: newTitle.trim(),
      time: newTime || 'Upcoming',
      host: 'You',
      participants: 1,
      link: `vertex.connect/meet/${newTitle.toLowerCase().replace(/\s+/g, '-')}`,
      isLive: false,
      aiNotesEnabled: true,
    };

    setMeetings([newMeeting, ...meetings]);
    setShowScheduleModal(false);
    setNewTitle('');
    setNewTime('');
    onShowToast(`Meeting "${newMeeting.title}" scheduled successfully!`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#182044] dark:text-[#f1f3ff] tracking-tight">
            Video Meetings & Rooms
          </h1>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
            Low-latency audio/video powered by WebRTC + LiveKit SFU.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onStartCall('Instant Room (LiveKit)', 'room-instant-' + Date.now())}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 active:scale-95 shadow-md shadow-[#718bff]/30 transition-all cursor-pointer flex items-center gap-2"
          >
            <Video className="w-4 h-4" />
            <span>Start Instant Call</span>
          </button>

          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--accent)] bg-white/80 dark:bg-white/10 hover:bg-white border border-[#cbd5ff] dark:border-white/10 transition-all cursor-pointer flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Meetings List or Clean Empty State */}
      {meetings.length === 0 ? (
        <div className="glass-panel p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-[#718bff]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <CalendarDays className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
            No scheduled meetings
          </h3>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] max-w-sm mb-5">
            Schedule a group video session or start an instant WebRTC room right now.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onStartCall('Instant Room (LiveKit)', 'room-instant-' + Date.now())}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] shadow-md"
            >
              Start Instant Call
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#182044] dark:text-[#f1f3ff] bg-black/5 dark:bg-white/10"
            >
              Schedule New
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="glass-panel p-5 flex flex-col justify-between border border-white/60 dark:border-white/10 shadow-sm hover:shadow-lg transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#eeeaff] dark:bg-[#7956e9]/20 text-[#7956e9] dark:text-[#cbb5ff] flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] leading-snug">
                        {m.title}
                      </h3>
                      <span className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc]">
                        Hosted by {m.host}
                      </span>
                    </div>
                  </div>

                  {m.isLive ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#e7f8f1] dark:bg-[#12a878]/20 text-[#12a878] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#12a878]" />
                      LIVE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-black/5 dark:bg-white/10 text-[#6f7899] dark:text-[#aeb8dc]">
                      Upcoming
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-[#6f7899] dark:text-[#aeb8dc] my-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#8ff5ff]" />
                    <span>{m.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-[#b69aff]" />
                    <span>{m.participants} participants registered</span>
                  </div>
                  {m.aiNotesEnabled && (
                    <div className="flex items-center gap-2 text-[#138b77] dark:text-[#8df0d4]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Meeting Notes Enabled</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyLink(m.id, m.link)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#40516c] dark:text-[#cbd4ff] bg-black/5 dark:bg-white/5 hover:bg-black/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedId === m.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#12a878]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Invite Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onStartCall(m.title, 'room-' + m.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm bg-gradient-to-r from-[#718bff] to-[#9b83f7] text-white hover:brightness-110 shadow-[#718bff]/30"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Join Room</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071a36]/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl glass-panel p-6 shadow-2xl border border-white/40 dark:border-white/10 bg-white/95 dark:bg-[#151c3b]/95">
            <h2 className="text-lg font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
              Schedule Team Meeting
            </h2>
            <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mb-4">
              Create a WebRTC meeting room with automated AI intelligence notes.
            </p>

            <form onSubmit={handleCreateMeeting} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Sprint Planning Sync"
                  autoFocus
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Date & Time
                </label>
                <input
                  type="text"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  placeholder="e.g. Tomorrow · 11:00 AM"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#eaf3ff] dark:bg-[#172d4b]/40 border border-[#cbd5ff]/40 text-xs text-[#2876ed] dark:text-[#8ff5ff] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>LiveKit SFU adaptive bitrate and participant consent notice will be shown on join.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#46517f] dark:text-[#cbd4ff] bg-black/5 dark:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 shadow-md"
                >
                  Create Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
