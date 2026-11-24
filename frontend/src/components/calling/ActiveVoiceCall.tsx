import React from 'react';
import { ShieldCheck, Radio, UserPlus } from 'lucide-react';
import { CallControls } from './CallControls';

interface ActiveVoiceCallProps {
  partnerName: string;
  partnerConnectId?: string;
  partnerAvatar?: string;
  durationSeconds: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onSelectSpeaker?: (deviceId: string) => void;
  onHangup: () => void;
  onInviteTeammate?: () => void;
}

export const ActiveVoiceCall: React.FC<ActiveVoiceCallProps> = ({
  partnerName,
  partnerConnectId,
  partnerAvatar,
  durationSeconds,
  isMuted,
  onToggleMute,
  onSelectSpeaker,
  onHangup,
  onInviteTeammate,
}) => {
  const formatTime = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const initials = (partnerName || 'User').slice(0, 2).toUpperCase();

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 sm:p-10 bg-gradient-to-b from-[#090d24] via-[#0d1438] to-[#080b1e] text-white overflow-hidden select-none">
      {/* Background ambient lighting aura */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 via-blue-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Information */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-2 mt-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>End-to-End Encrypted Voice</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight pt-2">
          {partnerName}
        </h2>
        {partnerConnectId && (
          <p className="text-xs sm:text-sm font-semibold text-blue-400">
            @{partnerConnectId}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1 font-mono text-sm text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{formatTime(durationSeconds)}</span>
        </div>
      </div>

      {/* Center Avatar & Animated Audio Waveform */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        <div className="relative mb-6">
          {/* Pulsing audio rings */}
          <div className="absolute -inset-6 rounded-full border border-emerald-400/30 animate-ping opacity-40 pointer-events-none" />
          <div className="absolute -inset-3 rounded-full border-2 border-emerald-400/50 animate-pulse pointer-events-none" />

          {/* Large Avatar */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white text-4xl sm:text-5xl font-black shadow-2xl ring-4 ring-white/10">
            {initials}
          </div>
        </div>

        {/* WhatsApp-style Animated Audio Waveform Bars */}
        <div className="flex items-center gap-1.5 h-10 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          {[40, 70, 95, 60, 85, 100, 75, 50, 90, 65, 45, 80, 100, 70, 50].map((h, i) => (
            <span
              key={i}
              style={{
                height: isMuted ? '4px' : `${h}%`,
                animationDelay: `${(i % 5) * 0.15}s`,
              }}
              className={`w-1 rounded-full transition-all duration-300 ${
                isMuted
                  ? 'bg-slate-500'
                  : 'bg-emerald-400 animate-pulse'
              }`}
            />
          ))}
        </div>

        <span className="text-[11px] text-slate-400 mt-2 font-medium flex items-center gap-1.5">
          <Radio className="w-3 h-3 text-emerald-400" />
          {isMuted ? 'Your microphone is muted' : 'Studio Master HD Voice (Opus 48kHz)'}
        </span>
      </div>

      {/* Floating Bottom Controls */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-3 mb-2">
        {onInviteTeammate && (
          <button
            type="button"
            onClick={onInviteTeammate}
            className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border border-white/10 shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Participant to Call</span>
          </button>
        )}

        <CallControls
          isMuted={isMuted}
          isVideoOn={false}
          isScreenSharing={false}
          callType="voice"
          onToggleMute={onToggleMute}
          onToggleVideo={() => {}}
          onToggleScreenShare={() => {}}
          onSelectSpeaker={onSelectSpeaker}
          onHangup={onHangup}
        />
      </div>
    </div>
  );
};
