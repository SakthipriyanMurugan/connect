import React from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, PhoneCall, Radio, ShieldCheck } from 'lucide-react';

interface OutgoingCallScreenProps {
  targetName: string;
  targetConnectId?: string;
  targetAvatar?: string;
  callType: 'voice' | 'audio' | 'video' | 'group';
  timeoutCountdown: number;
  isMuted: boolean;
  isVideoOn: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onCancelCall: () => void;
}

export const OutgoingCallScreen: React.FC<OutgoingCallScreenProps> = ({
  targetName,
  targetConnectId,
  targetAvatar,
  callType,
  timeoutCountdown,
  isMuted,
  isVideoOn,
  onToggleMute,
  onToggleVideo,
  onCancelCall,
}) => {
  const initials = (targetName || 'User').slice(0, 2).toUpperCase();

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 sm:p-10 bg-gradient-to-b from-[#090d24] via-[#0e163d] to-[#070a1e] text-white overflow-hidden select-none animate-in fade-in duration-300">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-tr from-blue-600/20 via-indigo-600/20 to-sky-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Badge */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-2 mt-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-semibold shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Vertex WhatsApp-Style Calling</span>
        </div>
      </div>

      {/* Center Avatar & Pulsing Radar Rings */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        <div className="relative mb-8">
          {/* Pulsing concentric wave ripples */}
          <div className="absolute -inset-10 rounded-full border border-blue-400/20 animate-ping opacity-50 pointer-events-none" />
          <div className="absolute -inset-6 rounded-full border border-blue-400/40 animate-pulse pointer-events-none" />
          <div className="absolute -inset-2 rounded-full border-2 border-blue-400/60 pointer-events-none" />

          {/* Large Avatar */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center text-white text-4xl sm:text-5xl font-black shadow-2xl ring-4 ring-white/10">
            {initials}
          </div>
        </div>

        {/* Ringing Status Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold mb-3 shadow-sm animate-pulse">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
          <span>RINGING...</span>
        </div>

        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1 text-center">
          {targetName}
        </h3>
        {targetConnectId && (
          <p className="text-sm font-semibold text-blue-400 mb-2">
            @{targetConnectId}
          </p>
        )}

        <p className="text-xs text-slate-300 max-w-xs text-center leading-relaxed">
          Waiting for teammate to answer. WhatsApp dial tone active...
        </p>
        <span className="text-[11px] font-mono text-slate-400 mt-2">
          Auto-missed call in {timeoutCountdown}s
        </span>
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 flex items-center justify-center gap-4 mb-4">
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg ${
            isMuted ? 'bg-rose-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Cancel Call (Big Red Button) */}
        <button
          type="button"
          onClick={onCancelCall}
          title="Cancel call"
          className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition-transform active:scale-90 hover:scale-105 cursor-pointer"
        >
          <PhoneOff className="w-7 h-7" />
        </button>

        {/* Video Toggle (if video call) */}
        {callType !== 'voice' && callType !== 'audio' && (
          <button
            type="button"
            onClick={onToggleVideo}
            title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg ${
              !isVideoOn ? 'bg-rose-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
            }`}
          >
            {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
        )}
      </div>
    </div>
  );
};
